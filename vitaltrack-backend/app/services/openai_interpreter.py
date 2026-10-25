"""Personal-key, text-only OpenAI interpretation into the existing bounded plan.

This adapter has no database, filesystem, subprocess or tool access. It sends
only the reviewed question and a context-presence flag to a fixed API endpoint.
No redirect, proxy environment, automatic retry or alternate credential is used.
"""

import asyncio
import json

import httpx
from fastapi import HTTPException
from pydantic import SecretStr, ValidationError

from app.core.config import settings
from app.schemas.ai import Plan
from app.services.ai_provider import SYSTEM_V3, ground_plan, portable_schema

PINNED_MODEL = "gpt-5.4-mini-2026-03-17"
ALLOWED_MODELS = frozenset({PINNED_MODEL, "gpt-5.4-mini"})
MAX_OUTPUT_TOKENS = 3072
MAX_RESPONSE_BYTES = 131_072
MAX_ERROR_BYTES = 16_384
RESPONSES_URL = "https://api.openai.com/v1/responses"
MODELS_URL = "https://api.openai.com/v1/models/"


def _error(status: int, detail: str, code: str, retry_after: str | None = None):
    headers = {"X-AI-Error": code, "Cache-Control": "no-store"}
    if retry_after:
        headers["Retry-After"] = retry_after
    return HTTPException(status, detail, headers=headers)


def configured_model() -> str:
    """Only reviewed text models can be selected; never accept a URL or tool name."""
    model = settings.OPENAI_INTENT_MODEL
    if model not in ALLOWED_MODELS:
        raise _error(
            503,
            "OpenAI understanding is not configured with a supported model. Use on-phone understanding or contact support.",
            "openai_unavailable",
        )
    return model


def _reject_constant(value):
    raise ValueError("Non-finite JSON value")


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Repeated JSON field")
        result[key] = value
    return result


def _json(raw):
    return json.loads(
        raw, parse_constant=_reject_constant, object_pairs_hook=_unique_object
    )


def provider_failure(status: int, body: bytes) -> HTTPException:
    """Classify status/known codes only. Provider messages never reach logs or UI."""
    try:
        parsed = _json(body)
        error = parsed.get("error") if isinstance(parsed, dict) else None
        code = error.get("code") if isinstance(error, dict) else None
    except (ValueError, TypeError, UnicodeError, RecursionError):
        code = None
    if status in (401, 403):
        # A provider rejection must not look like an expired CareKosh session.
        return _error(
            409,
            "OpenAI rejected your personal key or its model permissions. Check or replace the key in Voice setup. No other key was used.",
            "openai_key_invalid",
        )
    if status == 404:
        return _error(
            409,
            "The configured OpenAI model is unavailable to your key. Check its project permissions in Voice setup. No other model or key was used.",
            "openai_model_unavailable",
        )
    if status == 429 and code in {
        "insufficient_quota",
        "billing_hard_limit_reached",
        "billing_not_active",
    }:
        return _error(
            402,
            "Your OpenAI account has no available API credits or has reached its billing limit. Check OpenAI billing. CareKosh did not use another account.",
            "openai_quota",
        )
    if status == 429:
        return _error(
            429,
            "OpenAI is rate limited. Try again later or choose on-phone understanding. No automatic retry or alternate key was used.",
            "openai_rate_limited",
            "30",
        )
    if status in (400, 413, 422):
        return _error(
            502,
            "OpenAI could not accept this understanding request. Rephrase or choose on-phone understanding. No automatic retry was made.",
            "openai_request_rejected",
        )
    return _error(
        502,
        "OpenAI understanding is temporarily unavailable. Try again later or choose on-phone understanding. No other key was used.",
        "openai_unavailable",
    )


async def _request(method: str, url: str, api_key: SecretStr, *, body=None) -> bytes:
    if not isinstance(api_key, SecretStr):
        raise _error(
            409,
            "Add your personal OpenAI API key in Voice setup.",
            "openai_key_invalid",
        )
    key = api_key.get_secret_value()
    if not 8 <= len(key) <= 512 or any(not 33 <= ord(char) <= 126 for char in key):
        raise _error(
            409,
            "Add a valid personal OpenAI API key in Voice setup.",
            "openai_key_invalid",
        )
    try:
        async with asyncio.timeout(settings.AI_TIMEOUT_SECONDS):
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(settings.AI_TIMEOUT_SECONDS, connect=5),
                follow_redirects=False,
                trust_env=False,
            ) as client:
                async with client.stream(
                    method,
                    url,
                    headers={
                        "Authorization": f"Bearer {key}",
                        "Accept": "application/json",
                    },
                    **({"json": body} if body is not None else {}),
                ) as response:
                    limit = (
                        MAX_RESPONSE_BYTES
                        if response.status_code == 200
                        else MAX_ERROR_BYTES
                    )
                    raw = bytearray()
                    async for chunk in response.aiter_bytes():
                        raw.extend(chunk)
                        if len(raw) > limit:
                            if response.status_code != 200:
                                break
                            raise _error(
                                502,
                                "OpenAI returned an oversized response. Nothing was run or saved.",
                                "openai_invalid_response",
                            )
                    if response.status_code != 200:
                        raise provider_failure(
                            response.status_code, bytes(raw[:MAX_ERROR_BYTES])
                        )
                    if (
                        not response.headers.get("Content-Type", "")
                        .lower()
                        .split(";", 1)[0]
                        .strip()
                        == "application/json"
                    ):
                        raise _error(
                            502,
                            "OpenAI returned an unexpected response. Nothing was run or saved.",
                            "openai_invalid_response",
                        )
                    return bytes(raw)
    except (httpx.HTTPError, TimeoutError):
        raise _error(
            504,
            "OpenAI understanding timed out. No automatic retry was made. Edit the question or choose on-phone understanding.",
            "openai_timeout",
        ) from None


async def check_model(api_key: SecretStr) -> dict:
    """Explicit metadata-only key/model check; no inference, question or inventory."""
    model = configured_model()
    raw = await _request("GET", MODELS_URL + model, api_key)
    try:
        result = _json(raw)
        if not isinstance(result, dict) or result.get("id") != model:
            raise ValueError()
    except (ValueError, TypeError, UnicodeError, RecursionError):
        raise _error(
            502,
            "OpenAI model access could not be verified. Recheck Voice setup.",
            "openai_invalid_response",
        ) from None
    return {"model": model, "available": True}


def _request_body(question: str, has_previous: bool, model: str) -> dict:
    return {
        "model": model,
        "store": False,
        "background": False,
        "stream": False,
        "service_tier": "default",
        "reasoning": {"effort": "low"},
        "max_output_tokens": MAX_OUTPUT_TOKENS,
        "tools": [],
        "tool_choice": "none",
        "instructions": SYSTEM_V3,
        "input": [
            {
                "role": "user",
                "content": json.dumps(
                    {"question": question, "has_previous_item": has_previous}
                ),
            }
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "carekosh_inventory_plan",
                "strict": True,
                "schema": portable_schema(Plan.model_json_schema()),
            }
        },
    }


def _input_token_upper_bound(body: dict) -> int:
    # Every BPE token consumes at least one input byte. Counting the entire JSON
    # request (including escaping, schema and framing keys) overcounts content;
    # another 4,096 tokens covers fixed message/schema protocol framing.
    return len(json.dumps(body, ensure_ascii=True).encode("utf-8")) + 4096


def max_request_reserve_microusd() -> int:
    """Conservative standard-tier price bound, not a provider billing promise.

    GPT-5.4 mini standard rates checked 25 October 2026: input 0.75 USD and
    output 4.50 USD per million tokens. Reasoning tokens are included in output.
    Only the fixed default-tier endpoint is used; no tools or regional rates.
    """
    worst = _request_body("\U0010ffff" * 600, True, configured_model())
    return (
        _input_token_upper_bound(worst) * 750 + MAX_OUTPUT_TOKENS * 4500 + 999
    ) // 1000


async def interpret(question: str, has_previous: bool, api_key: SecretStr):
    """Return a schema/meaning-checked v3 plan, never provider-generated facts."""
    if (
        not isinstance(question, str)
        or not question.strip()
        or len(question) > 600
        or type(has_previous) is not bool
    ):
        raise _error(
            422,
            "Use a reviewed question of up to 600 characters.",
            "openai_request_rejected",
        )
    model = configured_model()
    body = _request_body(question, has_previous, model)
    raw = await _request("POST", RESPONSES_URL, api_key, body=body)
    try:
        result = _json(raw)
        if (
            not isinstance(result, dict)
            or result.get("status") != "completed"
            or result.get("error") is not None
            or result.get("incomplete_details") is not None
        ):
            raise ValueError()
        if result.get("model") not in ALLOWED_MODELS or (
            model == PINNED_MODEL and result["model"] != PINNED_MODEL
        ):
            raise ValueError()
        output = result["output"]
        if not isinstance(output, list) or not 1 <= len(output) <= 8:
            raise ValueError()
        messages = []
        for item in output:
            if not isinstance(item, dict):
                raise ValueError()
            if item.get("type") == "message":
                messages.append(item)
            elif item.get("type") != "reasoning":
                # Refuse every function, hosted tool, command and unknown item.
                raise ValueError()
        if len(messages) != 1:
            raise ValueError()
        message = messages[0]
        if message.get("role") != "assistant" or message.get("status") != "completed":
            raise ValueError()
        content = message["content"]
        if not isinstance(content, list) or len(content) != 1:
            raise ValueError()
        text = content[0]
        if (
            not isinstance(text, dict)
            or text.get("type") != "output_text"
            or not isinstance(text.get("text"), str)
        ):
            raise ValueError()
        # json.loads rejects markdown/code fences and duplicate fields; Plan
        # rejects unknown properties and ground_plan checks every stated filter.
        plan = Plan.model_validate(_json(text["text"]))
        ground_plan(plan, question, has_previous)
        usage = result["usage"]
        if not isinstance(usage, dict):
            raise ValueError()
        counts = {}
        for source, target, maximum in (
            ("input_tokens", "prompt_tokens", _input_token_upper_bound(body)),
            ("output_tokens", "completion_tokens", MAX_OUTPUT_TOKENS),
        ):
            count = usage[source]
            if type(count) is not int or not 0 <= count <= maximum:
                raise ValueError()
            counts[target] = count
        if not sum(counts.values()):
            raise ValueError()
        return plan, counts
    except (
        ValueError,
        KeyError,
        IndexError,
        TypeError,
        UnicodeError,
        RecursionError,
        ValidationError,
    ):
        raise _error(
            502,
            "Could not safely understand this question with OpenAI. Nothing was run or saved. Rephrase or use a basic command.",
            "openai_invalid_response",
        ) from None
