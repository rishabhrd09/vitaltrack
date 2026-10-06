"""Synthetic inputs only. Provider calls are mocked; no recordings leave this test."""

import asyncio
import base64
import io
import json
import math
import struct
import wave

import httpx
import pytest
from pydantic import SecretStr, ValidationError
from sqlalchemy import func, select

from app.api.v1 import ai
from app.core.config import settings
from app.models.ai import AIConsent, AIUsage
from app.schemas.ai import CONSENT_VERSION, CONSENT_SCOPES, Intent
from app.services import ai_guard, ai_provider
from tests.conftest import TestSession, register_and_auth, test_engine


@pytest.mark.parametrize(
    "provider,scope", [("groq", "groq_audio"), ("sarvam", "sarvam_audio")]
)
async def test_audio_consent_does_not_follow_text_consent(
    client, monkeypatch, provider, scope
):
    _, headers = await register_and_auth(client)
    monkeypatch.setattr(settings, "AI_SARVAM_ENABLED", True)
    monkeypatch.setattr(settings, "AI_SARVAM_DATA_CONTROLS_REVIEWED", True)
    monkeypatch.setattr(settings, "SARVAM_API_KEY", SecretStr("synthetic-sarvam-key"))
    await client.put(
        "/api/v1/ai/consent",
        headers=headers,
        json={"version": CONSENT_VERSION, "accepted": True, "scopes": ["groq_text"]},
    )

    async def forbidden(*args):
        raise AssertionError("Unconsented audio must never leave the backend")

    monkeypatch.setattr(ai_provider, "transcribe", forbidden)
    monkeypatch.setattr(ai_provider, "sarvam_transcribe", forbidden)
    response = await client.post(
        "/api/v1/ai/transcribe",
        headers=headers,
        data={"provider": provider},
        files={"file": ("test.wav", wav(), "audio/wav")},
    )
    assert response.status_code == 403
    async with TestSession() as db:
        assert await db.scalar(select(func.count()).select_from(AIUsage)) == 0


async def test_new_consent_is_explicit_not_broad(client):
    _, headers = await register_and_auth(client)
    for value in (
        {"version": CONSENT_VERSION, "accepted": True},
        {"version": CONSENT_VERSION, "accepted": True, "scopes": ["everything"]},
        {"version": "voice-2026-09-24", "accepted": True},
    ):
        assert (
            await client.put("/api/v1/ai/consent", headers=headers, json=value)
        ).status_code == 422


async def test_sarvam_is_independent_of_groq_and_accounted(client, monkeypatch):
    _, headers = await register_and_auth(client)
    monkeypatch.setattr(settings, "GROQ_API_KEY", SecretStr(""))
    monkeypatch.setattr(settings, "AI_DATA_CONTROLS_REVIEWED", False)
    monkeypatch.setattr(settings, "AI_SARVAM_ENABLED", True)
    monkeypatch.setattr(settings, "AI_SARVAM_DATA_CONTROLS_REVIEWED", True)
    monkeypatch.setattr(settings, "SARVAM_API_KEY", SecretStr("synthetic-sarvam-key"))
    await client.put(
        "/api/v1/ai/consent",
        headers=headers,
        json={"version": CONSENT_VERSION, "accepted": True, "scopes": ["sarvam_audio"]},
    )
    available = (await client.get("/api/v1/ai/capabilities", headers=headers)).json()
    assert available["transcription_providers"] == ["sarvam"]
    assert available["interpret"] is False

    async def transcribe(content):
        assert content.startswith(b"RIFF")
        assert test_engine.pool.checkedout() == 0
        return "How many synthetic gloves are left?"

    monkeypatch.setattr(ai_provider, "sarvam_transcribe", transcribe)
    response = await client.post(
        "/api/v1/ai/transcribe",
        headers=headers,
        data={"provider": "sarvam"},
        files={"file": ("test.wav", wav(), "audio/wav")},
    )
    assert response.status_code == 200
    assert response.json()["requires_confirmation"] is True
    async with TestSession() as db:
        row = (await db.scalars(select(AIUsage))).one()
        assert row.provider == "sarvam" and row.status == "complete"
        assert row.reserved_microusd == settings.AI_SARVAM_TRANSCRIBE_RESERVE_MICROUSD


@pytest.mark.parametrize("provider", ["sarvam", "kokoro"])
async def test_speech_requires_its_own_scope(client, monkeypatch, provider):
    _, headers = await register_and_auth(client)
    for key, value in {
        "AI_SPEECH_ENABLED": True,
        "AI_SARVAM_ENABLED": True,
        "AI_SARVAM_DATA_CONTROLS_REVIEWED": True,
        "SARVAM_API_KEY": SecretStr("test"),
        "AI_KOKORO_ENABLED": True,
        "AI_KOKORO_RIGHTS_APPROVED": True,
        "KOKORO_SERVICE_URL": "https://speech.example.invalid",
        "KOKORO_SERVICE_TOKEN": SecretStr("test"),
    }.items():
        monkeypatch.setattr(settings, key, value)
    await client.put(
        "/api/v1/ai/consent",
        headers=headers,
        json={"version": CONSENT_VERSION, "accepted": True, "scopes": ["sarvam_audio"]},
    )

    async def forbidden(*args):
        raise AssertionError("Speech consent must be checked first")

    monkeypatch.setattr(ai_provider, "selected_speech", forbidden)
    response = await client.post(
        "/api/v1/ai/speak",
        headers=headers,
        json={"text": "Synthetic stock", "provider": provider},
    )
    assert response.status_code == 403


async def test_sarvam_rest_contract_and_kokoro_speech(monkeypatch):
    called = []

    async def call(url, headers, **kwargs):
        called.append((url, headers, kwargs))
        if url.endswith("/speech-to-text"):
            return b'{"transcript":"How many synthetic gloves are left?"}'
        if url.endswith("/text-to-speech"):
            return json.dumps({"audios": [base64.b64encode(wav()).decode()]}).encode()
        return wav()

    monkeypatch.setattr(ai_provider, "bounded_call", call)
    assert "gloves" in await ai_provider.sarvam_transcribe(wav())
    assert called[-1][2]["data"] == {
        "model": "saaras:v4",
        "language_code": "en-IN",
        "mode": "transcribe",
    }
    assert "api-subscription-key" in called[-1][1]
    assert "keyterms" not in called[-1][2]["data"]
    assert (await ai_provider.selected_speech("Synthetic 18 pairs", "sarvam"))[
        :4
    ] == b"RIFF"
    body = called[-1][2]["json"]
    assert (
        body["model"] == "bulbul:v3"
        and body["language_code"] == "en-IN"
        and body["output_audio_codec"] == "wav"
    )
    monkeypatch.setattr(
        settings, "KOKORO_SERVICE_URL", "https://speech.example.invalid"
    )
    assert (await ai_provider.selected_speech("Synthetic 18 pairs", "kokoro"))[
        :4
    ] == b"RIFF"
    assert called[-1][0] == "https://speech.example.invalid/synthesize"
    assert called[-1][2]["json"] == {"text": "Synthetic 18 pairs"}


@pytest.mark.parametrize(
    "body",
    [b"{}", b"null", b'{"audios":[]}', b'{"audios":["bad!"]}', b'{"audios":["YWJj"]}'],
)
async def test_invalid_sarvam_speech_has_no_fallback(monkeypatch, body):
    calls = []

    async def call(url, *args, **kwargs):
        calls.append(url)
        return body

    monkeypatch.setattr(ai_provider, "bounded_call", call)
    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        await ai_provider.selected_speech("Synthetic", "sarvam")
    assert calls == ["https://api.sarvam.ai/text-to-speech"]


async def test_model_cannot_invent_an_item_name(monkeypatch):
    async def call(*args, **kwargs):
        return json.dumps(
            {
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"content": json.dumps(INTENT)},
                    }
                ]
            }
        ).encode()

    monkeypatch.setattr(ai_provider, "bounded_call", call)
    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        await ai_provider.interpret("How many masks are left?", False)


INTENT = dict(
    intent="read_item",
    item_query="Synthetic gloves",
    reference="named",
    fields=["quantity", "supplier"],
)


@pytest.fixture(autouse=True)
def isolated_ai(monkeypatch):
    monkeypatch.setattr(ai, "AsyncSessionLocal", TestSession)
    monkeypatch.setattr(ai_guard, "AsyncSessionLocal", TestSession)
    for name, value in dict(
        AI_ENABLED=True,
        AI_DATA_CONTROLS_REVIEWED=True,
        AI_TRANSCRIBE_ENABLED=True,
        GROQ_API_KEY=SecretStr("synthetic-test-key"),
        AI_USER_DAILY_REQUESTS=50,
        AI_GLOBAL_DAILY_REQUESTS=500,
        AI_GLOBAL_CONCURRENCY=4,
    ).items():
        monkeypatch.setattr(settings, name, value)


async def consented(client, name="Voice Tester"):
    account, headers = await register_and_auth(client, name=name)
    response = await client.put(
        "/api/v1/ai/consent",
        headers=headers,
        json={
            "version": CONSENT_VERSION,
            "accepted": True,
            "scopes": sorted(CONSENT_SCOPES),
        },
    )
    assert response.status_code == 200
    return account, headers


def wav(seconds=1, silent=False):
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16000)
        # Synthetic tone, not a person's recording; use silence only in rejection tests.
        audio.writeframes(
            b"".join(
                struct.pack(
                    "<h",
                    (
                        0
                        if silent
                        else int(1000 * math.sin(2 * math.pi * 440 * n / 16000))
                    ),
                )
                for n in range(int(seconds * 16000))
            )
        )
    return output.getvalue()


async def test_disabled_and_unauthenticated_never_call_provider(client, monkeypatch):
    async def forbidden(*args):
        raise AssertionError("provider must not run")

    monkeypatch.setattr(ai_provider, "interpret", forbidden)
    assert (
        await client.post("/api/v1/ai/interpret", json={"question": "summary"})
    ).status_code == 401
    _, headers = await consented(client)
    monkeypatch.setattr(settings, "AI_ENABLED", False)
    assert (
        await client.post(
            "/api/v1/ai/interpret", headers=headers, json={"question": "summary"}
        )
    ).status_code == 503


async def test_consent_is_account_scoped_and_revocable(client, monkeypatch):
    _, a = await consented(client, "Account A")
    _, b = await register_and_auth(client, name="Account B")
    assert (await client.get("/api/v1/ai/capabilities", headers=b)).json()[
        "consented"
    ] is False
    assert (
        await client.post(
            "/api/v1/ai/interpret", headers=b, json={"question": "summary"}
        )
    ).status_code == 403
    await client.put(
        "/api/v1/ai/consent",
        headers=a,
        json={"version": CONSENT_VERSION, "accepted": False},
    )
    assert (
        await client.post(
            "/api/v1/ai/interpret", headers=a, json={"question": "summary"}
        )
    ).status_code == 403


async def test_intent_only_and_database_released_before_inference(client, monkeypatch):
    _, headers = await consented(client)

    async def interpret(question, previous):
        assert test_engine.pool.checkedout() == 0
        return Intent(**INTENT), {"prompt_tokens": 12, "completion_tokens": 20}

    monkeypatch.setattr(ai_provider, "interpret", interpret)
    result = await client.post(
        "/api/v1/ai/interpret",
        headers=headers,
        json={"question": "Synthetic gloves quantity and supplier"},
    )
    assert result.status_code == 200, result.text
    assert result.json() == INTENT
    async with TestSession() as db:
        row = (await db.scalars(select(AIUsage))).one()
        assert row.status == "complete"
        assert row.input_tokens == 12
        assert not hasattr(row, "question")


async def test_atomic_daily_reservation_and_failed_calls_still_count(
    client, monkeypatch
):
    account, _ = await consented(client)
    monkeypatch.setattr(settings, "AI_USER_DAILY_REQUESTS", 1)
    user = account["user"]["id"]
    results = await asyncio.gather(
        ai_guard.reserve(user, "interpret"),
        ai_guard.reserve(user, "interpret"),
        return_exceptions=True,
    )
    assert len([r for r in results if isinstance(r, str)]) == 1
    assert len([r for r in results if getattr(r, "status_code", None) == 429]) == 1
    ticket = next(r for r in results if isinstance(r, str))
    await ai_guard.settle(ticket, False)
    with pytest.raises(Exception) as error:
        await ai_guard.reserve(user, "interpret")
    assert error.value.status_code == 429


async def test_upload_bounded_before_parsing_and_no_client_duration_trust(
    client, monkeypatch
):
    _, headers = await consented(client)
    called = []

    async def transcribe(content, extension):
        called.append(extension)
        return "quantity of Synthetic gloves"

    monkeypatch.setattr(ai_provider, "transcribe", transcribe)
    response = await client.post(
        "/api/v1/ai/transcribe",
        headers=headers,
        files={"file": ("voice.wav", wav(), "audio/wav")},
    )
    assert response.status_code == 200
    assert response.json()["requires_confirmation"] is True
    assert response.headers["cache-control"] == "no-store"
    async with TestSession() as db:
        assert await db.scalar(select(AIUsage.audio_seconds)) == 10
    assert (
        await client.post(
            "/api/v1/ai/transcribe", headers=headers, content=b"x" * 900001
        )
    ).status_code == 413
    assert (
        await client.post(
            "/api/v1/ai/transcribe",
            headers=headers,
            files={"file": ("voice.m4a", b"not audio", "audio/mp4")},
        )
    ).status_code == 422
    assert called == ["wav"]


async def test_provider_failure_settles_and_no_silent_voice_fallback(
    client, monkeypatch
):
    _, headers = await consented(client)

    async def failure(*args):
        raise httpx.ConnectError("synthetic")

    monkeypatch.setattr(ai_provider, "interpret", failure)
    # Adapter failures are tested below. Here use its normal safe public error.
    from fastapi import HTTPException

    async def safe_failure(*args):
        raise HTTPException(504, "Provider timeout")

    monkeypatch.setattr(ai_provider, "interpret", safe_failure)
    assert (
        await client.post(
            "/api/v1/ai/interpret", headers=headers, json={"question": "summary"}
        )
    ).status_code == 504
    async with TestSession() as db:
        assert await db.scalar(select(AIUsage.status)) == "failed"
    monkeypatch.setattr(settings, "AI_SPEECH_ENABLED", True)
    monkeypatch.setattr(settings, "AI_ALBA_RIGHTS_APPROVED", False)
    assert (
        await client.post(
            "/api/v1/ai/speak", headers=headers, json={"text": "Synthetic summary"}
        )
    ).status_code == 503


@pytest.mark.parametrize(
    "patch",
    [
        {"intent": "update_stock"},
        {"quantity": 77},
        {"fields": ["url"]},
        {"reference": "previous"},
        {"item_query": ""},
        {"fields": []},
    ],
)
def test_rejects_invalid_or_executable_intents(patch):
    with pytest.raises(ValidationError):
        Intent.model_validate({**INTENT, **patch})


async def test_provider_strict_schema_and_untrusted_output(monkeypatch):
    captured = {}

    async def call(url, headers, **kwargs):
        captured.update(kwargs["json"])
        return json.dumps(
            {
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"content": json.dumps(INTENT)},
                    }
                ]
            }
        ).encode()

    monkeypatch.setattr(ai_provider, "bounded_call", call)
    result, _ = await ai_provider.interpret("Synthetic gloves", False)
    assert result.item_query == "Synthetic gloves"
    assert captured["response_format"]["json_schema"]["strict"] is True
    assert captured["include_reasoning"] is False

    async def wrong(*args, **kwargs):
        return b'{"choices":[{"finish_reason":"stop","message":{"content":"{\\"intent\\":\\"delete_stock\\"}"}}]}'

    monkeypatch.setattr(ai_provider, "bounded_call", wrong)
    with pytest.raises(Exception) as error:
        await ai_provider.interpret("delete", False)
    assert error.value.status_code == 502


async def test_rejects_silence_and_overlong_audio(monkeypatch):
    async def silence(*args, **kwargs):
        return json.dumps(
            {"text": "Thank you for watching", "segments": [{"no_speech_prob": 0.99}]}
        ).encode()

    monkeypatch.setattr(ai_provider, "bounded_call", silence)
    with pytest.raises(Exception) as error:
        await ai_provider.transcribe(wav(), "wav")
    assert error.value.status_code == 422
    with pytest.raises(Exception):
        ai_provider.audio_info(wav(31))


async def test_account_deletion_cascades_ai_metadata(client):
    account, headers = await consented(client)
    from app.models.user import User

    async with TestSession.begin() as db:
        user = await db.get(User, account["user"]["id"])
        await db.delete(user)
    async with TestSession() as db:
        assert await db.scalar(select(func.count()).select_from(AIConsent)) == 0


async def test_global_budget_is_atomic_across_accounts(client, monkeypatch):
    a, _ = await consented(client, "Budget A")
    b, _ = await consented(client, "Budget B")
    monkeypatch.setattr(
        settings,
        "AI_GLOBAL_DAILY_BUDGET_MICROUSD",
        settings.AI_INTERPRET_RESERVE_MICROUSD,
    )
    results = await asyncio.gather(
        ai_guard.reserve(a["user"]["id"], "interpret"),
        ai_guard.reserve(b["user"]["id"], "interpret"),
        return_exceptions=True,
    )
    assert len([r for r in results if isinstance(r, str)]) == 1
    assert len([r for r in results if getattr(r, "status_code", None) == 429]) == 1


async def test_decoder_handles_real_seekable_m4a_and_limits_pcm(tmp_path):
    import shutil

    if not shutil.which("ffmpeg"):
        pytest.skip(
            "ffmpeg is installed in the production image; install locally for decoder test"
        )
    target = tmp_path / "synthetic.m4a"
    process = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=1",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "aac",
        str(target),
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    assert await process.wait() == 0
    content = target.read_bytes()
    extension, _ = ai_provider.audio_info(content)
    result, duration = await ai_provider.normalize_audio(content, extension)
    assert result[:4] == b"RIFF"
    assert 0.9 <= duration <= 1.1
    with pytest.raises(Exception) as error:
        await ai_provider.normalize_audio(wav(31), "wav")
    assert error.value.status_code == 422


def transcript_body(text="How many gloves are left?"):
    return {
        "text": text,
        "segments": [
            {
                "text": text,
                "no_speech_prob": 0.01,
                "avg_logprob": -0.2,
                "compression_ratio": 1.1,
            }
        ],
    }


@pytest.mark.parametrize(
    "body",
    [
        [],
        None,
        {"text": 123},
        {"text": "summary", "segments": [None]},
        {"text": "summary", "segments": [{"text": "summary"}]},
        {**transcript_body(), "text": "Different unverified words"},
        transcript_body("Thanks for watching!"),
    ],
)
async def test_malformed_transcripts_fail_closed(monkeypatch, body):
    async def response(*args, **kwargs):
        return json.dumps(body).encode()

    monkeypatch.setattr(ai_provider, "bounded_call", response)
    with pytest.raises(Exception) as error:
        await ai_provider.transcribe(wav(), "wav")
    assert error.value.status_code == 422


@pytest.mark.parametrize(
    "key,value",
    [
        ("no_speech_prob", float("nan")),
        ("avg_logprob", float("inf")),
        ("compression_ratio", "1.0"),
        ("no_speech_prob", True),
        ("no_speech_prob", -1),
        ("avg_logprob", 3),
        ("compression_ratio", -1),
        ("no_speech_prob", 0.8),
        ("avg_logprob", -1.2),
        ("compression_ratio", 3),
    ],
)
def test_transcript_metrics_are_required_finite_and_in_range(key, value):
    body = transcript_body()
    body["segments"][0][key] = value
    with pytest.raises(ValueError):
        ai_provider.checked_transcript(body)


def test_never_drops_negation_or_bad_words_from_transcript():
    body = transcript_body("Do not show low stock")
    body["segments"] = [
        {**body["segments"][0], "text": "Do not", "avg_logprob": -2},
        {**body["segments"][0], "text": "show low stock"},
    ]
    with pytest.raises(ValueError):
        ai_provider.checked_transcript(body)


def test_empty_trailing_pause_does_not_discard_good_speech():
    body = transcript_body()
    body["segments"].append({"text": "", "no_speech_prob": 0.99})
    assert ai_provider.checked_transcript(body) == body["text"]


async def test_muted_recording_is_rejected_before_provider_upload(client, monkeypatch):
    _, headers = await consented(client)

    async def forbidden(*args):
        raise AssertionError("Muted audio must not reach Groq")

    monkeypatch.setattr(ai_provider, "transcribe", forbidden)
    result = await client.post(
        "/api/v1/ai/transcribe",
        headers=headers,
        files={"file": ("silent.wav", wav(silent=True), "audio/wav")},
    )
    assert result.status_code == 422
    assert "microphone" in result.json()["detail"]
    async with TestSession() as db:
        assert await db.scalar(select(AIUsage.status)) == "failed"


@pytest.mark.parametrize(
    "usage", [[], "bad", {"prompt_tokens": "12"}, {"completion_tokens": float("nan")}]
)
async def test_malformed_usage_cannot_break_settlement(monkeypatch, usage):
    async def response(*args, **kwargs):
        return json.dumps(
            {
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"content": json.dumps(INTENT)},
                    }
                ],
                "usage": usage,
            }
        ).encode()

    monkeypatch.setattr(ai_provider, "bounded_call", response)
    with pytest.raises(Exception) as error:
        await ai_provider.interpret("summary", False)
    assert error.value.status_code == 502


async def test_settlement_failure_does_not_replace_a_successful_answer(client, monkeypatch):
    _, headers = await consented(client)

    async def interpret(question, previous):
        return Intent(**INTENT), {"prompt_tokens": 3, "completion_tokens": 4}

    def unavailable_update(*args, **kwargs):
        raise RuntimeError("synthetic database outage during settlement")

    monkeypatch.setattr(ai_provider, "interpret", interpret)
    monkeypatch.setattr(ai_guard, "update", unavailable_update)
    result = await client.post(
        "/api/v1/ai/interpret",
        headers=headers,
        json={"question": "Synthetic gloves quantity and supplier"},
    )
    assert result.status_code == 200, result.text
    assert result.json() == INTENT
    async with TestSession() as db:
        # Left reserved: it still counts against today's limits and expires as in-flight.
        assert await db.scalar(select(AIUsage.status)) == "reserved"


async def test_cloud_voice_off_writes_nothing(client, monkeypatch):
    """Offline-only release: with AI disabled, voice endpoints refuse before any write."""
    _, headers = await register_and_auth(client, name="Offline Only")
    monkeypatch.setattr(settings, "AI_ENABLED", False)

    async def forbidden(*args, **kwargs):
        raise AssertionError("no provider may run while cloud voice is off")

    for name in ("interpret", "transcribe", "sarvam_transcribe", "speak", "selected_speech", "bounded_call"):
        monkeypatch.setattr(ai_provider, name, forbidden)

    granted = await client.put(
        "/api/v1/ai/consent",
        headers=headers,
        json={"version": CONSENT_VERSION, "accepted": True, "scopes": ["groq_text"]},
    )
    assert granted.status_code == 503
    assert (await client.get("/api/v1/ai/capabilities", headers=headers)).json()["consented"] is False
    assert (await client.post("/api/v1/ai/interpret", headers=headers, json={"question": "summary"})).status_code == 503
    assert (
        await client.post("/api/v1/ai/transcribe", headers=headers, files={"file": ("q.wav", wav(), "audio/wav")})
    ).status_code == 503
    assert (await client.post("/api/v1/ai/speak", headers=headers, json={"text": "Synthetic"})).status_code == 503
    async with TestSession() as db:
        assert await db.scalar(select(func.count()).select_from(AIConsent)) == 0
        assert await db.scalar(select(func.count()).select_from(AIUsage)) == 0

    # Withdrawing consent is always allowed (a privacy action, not cloud use).
    revoked = await client.put(
        "/api/v1/ai/consent", headers=headers, json={"version": CONSENT_VERSION, "accepted": False}
    )
    assert revoked.status_code == 200
