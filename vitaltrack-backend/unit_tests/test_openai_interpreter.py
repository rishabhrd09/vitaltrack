"""Synthetic OpenAI transport/plan contracts; no network, database or live key."""

import asyncio
import copy
import json
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException
from pydantic import SecretStr

from app.services import openai_interpreter as adapter

REAL_CLIENT = httpx.AsyncClient
KEY = SecretStr("synthetic-openai-test-key")
QUESTION = "Show low-stock items with quantity less than 3"


def group(**values):
    return {
        "item_queries": [],
        "stock": ["low"],
        "quantity": [{"op": "lt", "value": 3}],
        "critical": None,
        "category": None,
        "supplier": None,
        "brand": None,
        "missing_supplier": False,
        **values,
    }


def plan(**values):
    return {
        "version": 3,
        "intent": "inventory_query",
        "selection": {
            "scope": "inventory",
            "any_of": [group()],
            "exclude": [],
            "sort": "none",
        },
        "draft": None,
        "clarify_reason": None,
        **values,
    }


def response(value=None, **values):
    return {
        "status": "completed",
        "model": adapter.PINNED_MODEL,
        "error": None,
        "incomplete_details": None,
        "output": [
            {
                "type": "message",
                "role": "assistant",
                "status": "completed",
                "content": [
                    {
                        "type": "output_text",
                        "text": json.dumps(value if value is not None else plan()),
                        "annotations": [],
                    }
                ],
            }
        ],
        "usage": {"input_tokens": 1200, "output_tokens": 230},
        **values,
    }


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    # Independent from changes the coordinating task makes to Settings.
    monkeypatch.setattr(
        adapter,
        "settings",
        SimpleNamespace(
            OPENAI_INTENT_MODEL=adapter.PINNED_MODEL,
            AI_TIMEOUT_SECONDS=2,
        ),
    )


def transport(monkeypatch, payload=None, *, status=200, content=None, headers=None):
    requests, options = [], []

    async def handler(request):
        requests.append(request)
        if content is not None:
            return httpx.Response(
                status,
                content=content,
                headers=headers or {"Content-Type": "application/json"},
            )
        return httpx.Response(
            status, json=payload if payload is not None else response(), headers=headers
        )

    def client(**kwargs):
        options.append(kwargs)
        return REAL_CLIENT(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(adapter.httpx, "AsyncClient", client)
    return requests, options


def assert_strict_schema(node):
    if isinstance(node, dict):
        if node.get("type") == "object":
            assert node["additionalProperties"] is False
            assert set(node["required"]) == set(node["properties"])
        for child in node.values():
            assert_strict_schema(child)
    elif isinstance(node, list):
        for child in node:
            assert_strict_schema(child)


async def test_responses_payload_is_one_shot_private_text_only_and_strict(monkeypatch):
    requests, options = transport(monkeypatch)
    result, usage = await adapter.interpret(QUESTION, False, KEY)
    assert result.model_dump() == plan()
    assert usage == {"prompt_tokens": 1200, "completion_tokens": 230}
    assert len(requests) == 1
    request = requests[0]
    assert request.method == "POST" and str(request.url) == adapter.RESPONSES_URL
    assert request.headers["Authorization"] == "Bearer synthetic-openai-test-key"
    body = json.loads(request.content)
    assert body["model"] == adapter.PINNED_MODEL
    assert body["store"] is False and body["background"] is False
    assert body["stream"] is False and body["service_tier"] == "default"
    assert body["tools"] == [] and body["tool_choice"] == "none"
    assert body["max_output_tokens"] == 3072
    assert body["reasoning"] == {"effort": "low"}
    assert body["input"] == [
        {
            "role": "user",
            "content": json.dumps({"question": QUESTION, "has_previous_item": False}),
        }
    ]
    assert "inventory" not in json.loads(body["input"][0]["content"])
    assert "api_key" not in body and "previous_response_id" not in body
    assert body["text"]["format"]["type"] == "json_schema"
    assert body["text"]["format"]["strict"] is True
    assert_strict_schema(body["text"]["format"]["schema"])
    assert options[0]["follow_redirects"] is False
    assert options[0]["trust_env"] is False
    assert options[0]["timeout"].connect == 5


async def test_model_check_is_metadata_only_and_keeps_response_minimal(monkeypatch):
    requests, _ = transport(
        monkeypatch,
        {"id": adapter.PINNED_MODEL, "owned_by": "system", "internal": "do not relay"},
    )
    assert await adapter.check_model(KEY) == {
        "available": True,
        "model": adapter.PINNED_MODEL,
    }
    assert len(requests) == 1
    assert requests[0].method == "GET"
    assert str(requests[0].url) == adapter.MODELS_URL + adapter.PINNED_MODEL
    assert requests[0].content == b""


def test_fifty_thousand_microusd_reservation_covers_fixed_request_bound():
    # This includes a maximally escaped 600-codepoint question and all 3,072
    # output tokens at the documented standard-tier rate, without cache savings.
    assert 0 < adapter.max_request_reserve_microusd() <= 50_000


@pytest.mark.parametrize(
    "model",
    [
        "https://evil.test/model",
        "../other",
        "gpt-6-astra",
        "",
        "gpt-5.4-mini\r\nX-Evil: 1",
    ],
)
async def test_unreviewed_models_never_start_a_provider_request(monkeypatch, model):
    requests, options = transport(monkeypatch)
    adapter.settings.OPENAI_INTENT_MODEL = model
    with pytest.raises(HTTPException) as failure:
        await adapter.interpret(QUESTION, False, KEY)
    assert failure.value.status_code == 503
    assert not requests and not options


@pytest.mark.parametrize(
    "key",
    [
        None,
        "raw-not-secretstr",
        SecretStr(""),
        SecretStr("short"),
        SecretStr("x" * 513),
        SecretStr("bad\r\nAuthorization: bad"),
        SecretStr("spaces not allowed"),
    ],
)
async def test_invalid_keys_fail_locally_without_echo(monkeypatch, key):
    requests, options = transport(monkeypatch)
    with pytest.raises(HTTPException) as failure:
        await adapter.interpret(QUESTION, False, key)
    assert failure.value.status_code == 409
    assert failure.value.headers["X-AI-Error"] == "openai_key_invalid"
    assert not requests and not options


@pytest.mark.parametrize(
    "question,context",
    [
        ("", False),
        (" " * 10, False),
        ("x" * 601, False),
        (None, False),
        (QUESTION, "false"),
        (QUESTION, 1),
    ],
)
async def test_bounded_question_contract_is_enforced_before_network(
    monkeypatch, question, context
):
    requests, _ = transport(monkeypatch)
    with pytest.raises(HTTPException) as failure:
        await adapter.interpret(question, context, KEY)
    assert failure.value.status_code == 422
    assert not requests


@pytest.mark.parametrize(
    "status,code,expected,reason",
    [
        (401, "invalid_api_key", 409, "openai_key_invalid"),
        (403, "permission_denied", 409, "openai_key_invalid"),
        (404, "model_not_found", 409, "openai_model_unavailable"),
        (429, "insufficient_quota", 402, "openai_quota"),
        (429, "billing_hard_limit_reached", 402, "openai_quota"),
        (429, "rate_limit_exceeded", 429, "openai_rate_limited"),
        (400, "bad_request", 502, "openai_request_rejected"),
        (413, "too_large", 502, "openai_request_rejected"),
        (422, "bad_schema", 502, "openai_request_rejected"),
        (500, "internal_error", 502, "openai_unavailable"),
        (307, "redirect", 502, "openai_unavailable"),
    ],
)
async def test_provider_failures_are_safe_and_never_retry_or_switch_key(
    monkeypatch, caplog, status, code, expected, reason
):
    marker = "malicious-provider-body-" + KEY.get_secret_value()
    requests, _ = transport(
        monkeypatch,
        {"error": {"code": code, "message": marker}},
        status=status,
        headers={"Location": "https://evil.test/steal"},
    )
    with pytest.raises(HTTPException) as failure:
        await adapter.interpret(QUESTION, False, KEY)
    error = failure.value
    assert error.status_code == expected and error.status_code != 401
    assert error.headers["X-AI-Error"] == reason != "busy"
    assert marker not in str(error.detail) and KEY.get_secret_value() not in str(
        error.detail
    )
    assert marker not in caplog.text and KEY.get_secret_value() not in caplog.text
    assert len(requests) == 1
    if expected == 429:
        assert error.headers["Retry-After"] == "30"


@pytest.mark.parametrize(
    "patch",
    [
        {"status": "incomplete"},
        {"status": "failed"},
        {"error": {"message": "do not relay"}},
        {"incomplete_details": {"reason": "max_output_tokens"}},
        {"model": "unknown"},
        {"output": []},
        {"output": [None]},
        {
            "output": [
                {"type": "function_call", "name": "save_order", "arguments": "{}"}
            ]
        },
        {"output": [{"type": "web_search_call"}]},
        {
            "output": [
                {
                    "type": "message",
                    "role": "user",
                    "status": "completed",
                    "content": [],
                }
            ]
        },
        {
            "output": [
                {
                    "type": "message",
                    "role": "assistant",
                    "status": "completed",
                    "content": [{"type": "refusal", "refusal": "do not relay"}],
                }
            ]
        },
        {"usage": None},
        {"usage": {"input_tokens": True, "output_tokens": 10}},
        {"usage": {"input_tokens": -1, "output_tokens": 10}},
        {"usage": {"input_tokens": "100", "output_tokens": 10}},
        {"usage": {"input_tokens": 100, "output_tokens": 3073}},
        {"usage": {"input_tokens": 0, "output_tokens": 0}},
        {"usage": {"output_tokens": 10}},
    ],
)
async def test_unsafe_response_envelopes_never_produce_a_plan(monkeypatch, patch):
    requests, _ = transport(monkeypatch, response(**patch))
    with pytest.raises(HTTPException) as failure:
        await adapter.interpret(QUESTION, False, KEY)
    assert failure.value.status_code == 502
    assert failure.value.headers["X-AI-Error"] == "openai_invalid_response"
    assert len(requests) == 1


async def test_exactly_one_text_message_is_required(monkeypatch):
    payload = response()
    payload["output"].append(copy.deepcopy(payload["output"][0]))
    transport(monkeypatch, payload)
    with pytest.raises(HTTPException):
        await adapter.interpret(QUESTION, False, KEY)


async def test_reasoning_item_can_coexist_but_is_not_returned(monkeypatch):
    payload = response()
    payload["output"].insert(0, {"type": "reasoning", "id": "synthetic", "summary": []})
    transport(monkeypatch, payload)
    result, counts = await adapter.interpret(QUESTION, False, KEY)
    assert result.model_dump() == plan() and "reasoning" not in counts


@pytest.mark.parametrize(
    "value",
    [
        plan(
            selection={
                "scope": "inventory",
                "any_of": [group(quantity=[])],
                "exclude": [],
                "sort": "none",
            }
        ),
        plan(
            selection={
                "scope": "inventory",
                "any_of": [group(item_queries=["Invented item"])],
                "exclude": [],
                "sort": "none",
            }
        ),
        plan(
            selection={
                "scope": "inventory",
                "any_of": [group(quantity=[{"op": "lt", "value": 5}])],
                "exclude": [],
                "sort": "none",
            }
        ),
        plan(
            selection={
                "scope": "inventory",
                "any_of": [group(stock=["out"])],
                "exclude": [],
                "sort": "none",
            }
        ),
        plan(execute="rm -rf data"),
    ],
)
async def test_schema_and_semantic_grounding_reject_model_inventions(
    monkeypatch, value
):
    transport(monkeypatch, response(value))
    with pytest.raises(HTTPException) as failure:
        await adapter.interpret(QUESTION, False, KEY)
    assert failure.value.status_code == 502


@pytest.mark.parametrize(
    "text", ["```json\n{}\n```", '{"version":3,"version":3}', '{"version":NaN}', "null"]
)
async def test_embedded_plan_must_be_unambiguous_json(monkeypatch, text):
    payload = response()
    payload["output"][0]["content"][0]["text"] = text
    transport(monkeypatch, payload)
    with pytest.raises(HTTPException):
        await adapter.interpret(QUESTION, False, KEY)


@pytest.mark.parametrize(
    "raw", [b'{"status":"completed","status":"failed"}', b'{"usage":NaN}', b"not json"]
)
async def test_top_level_response_rejects_duplicates_and_nonfinite_values(
    monkeypatch, raw
):
    transport(monkeypatch, content=raw)
    with pytest.raises(HTTPException):
        await adapter.interpret(QUESTION, False, KEY)


@pytest.mark.parametrize("stage", ["envelope", "plan", "model", "error"])
async def test_deep_json_is_a_sanitized_failure(monkeypatch, stage):
    deep = "[" * 15_000 + "0" + "]" * 15_000
    if stage == "error":
        failure = adapter.provider_failure(500, deep.encode())
        assert failure.status_code == 502
        assert "Recursion" not in failure.detail
        return
    if stage == "plan":
        payload = response()
        payload["output"][0]["content"][0]["text"] = deep
        transport(monkeypatch, payload)
    else:
        transport(monkeypatch, content=deep.encode())
    with pytest.raises(HTTPException) as failure:
        if stage == "model":
            await adapter.check_model(KEY)
        else:
            await adapter.interpret(QUESTION, False, KEY)
    assert failure.value.status_code == 502
    assert failure.value.headers["X-AI-Error"] == "openai_invalid_response"
    assert "Recursion" not in failure.value.detail


async def test_html_and_oversized_success_are_rejected(monkeypatch):
    for raw, headers in [
        (b"<html>challenge</html>", {"Content-Type": "text/html"}),
        (b"x" * (adapter.MAX_RESPONSE_BYTES + 1), {"Content-Type": "application/json"}),
    ]:
        requests, _ = transport(monkeypatch, content=raw, headers=headers)
        with pytest.raises(HTTPException) as failure:
            await adapter.interpret(QUESTION, False, KEY)
        assert failure.value.status_code == 502
        assert len(requests) == 1


async def test_malformed_model_metadata_does_not_claim_availability(monkeypatch):
    transport(monkeypatch, {"id": "gpt-other"})
    with pytest.raises(HTTPException) as failure:
        await adapter.check_model(KEY)
    assert failure.value.status_code == 502


async def test_total_timeout_is_bounded_and_does_not_retry(monkeypatch):
    calls = []
    adapter.settings.AI_TIMEOUT_SECONDS = 0.01

    async def delayed(request):
        calls.append(request)
        await asyncio.sleep(0.1)
        return httpx.Response(200, json=response())

    monkeypatch.setattr(
        adapter.httpx,
        "AsyncClient",
        lambda **kwargs: REAL_CLIENT(transport=httpx.MockTransport(delayed), **kwargs),
    )
    with pytest.raises(HTTPException) as failure:
        await adapter.interpret(QUESTION, False, KEY)
    assert failure.value.status_code == 504
    assert failure.value.headers["X-AI-Error"] == "openai_timeout"
    assert len(calls) == 1


async def test_cancellation_stops_transport_without_an_alternate_request(monkeypatch):
    calls, started = [], asyncio.Event()

    async def pending(request):
        calls.append(request)
        started.set()
        await asyncio.Event().wait()

    monkeypatch.setattr(
        adapter.httpx,
        "AsyncClient",
        lambda **kwargs: REAL_CLIENT(transport=httpx.MockTransport(pending), **kwargs),
    )
    task = asyncio.create_task(adapter.interpret(QUESTION, False, KEY))
    await started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert len(calls) == 1
