"""Sarvam narration through the real bounded HTTP adapter. Only the network is mocked; keys are synthetic."""
import base64
import io
import json
import logging
import math
import struct
import wave

import httpx
import pytest
from fastapi import HTTPException
from pydantic import SecretStr
from sqlalchemy import func, select

from app.core.config import settings
from app.models import AIUsage, Item, Order
from app.services import ai_provider, sarvam_credentials
from tests.conftest import TestSession, create_category, create_item, register_and_auth


@pytest.fixture(autouse=True)
def sarvam_settings(monkeypatch):
    for key, value in {"AI_ENABLED": True, "AI_SPEECH_ENABLED": True, "AI_SARVAM_ENABLED": True, "AI_SARVAM_DATA_CONTROLS_REVIEWED": True,
                       "AI_SARVAM_BYOK_ENABLED": True, "SARVAM_API_KEY": SecretStr("synthetic-application-key"), "SARVAM_TTS_MODEL": "bulbul:v3",
                       "SARVAM_SPEAKER": "", "AI_CREDENTIAL_ENCRYPTION_KEY": SecretStr("Qq4yE6uQ8vV3m0zTqJb3VqXQe8m6vRr4WlYkJ8m2c1U=")}.items():
        monkeypatch.setattr(settings, key, value)


def tone(seconds: float, rate: int = 24000) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(b"".join(struct.pack("<h", int(8000 * math.sin(i / 8))) for i in range(int(seconds * rate))))
    return out.getvalue()


REAL_CLIENT = httpx.AsyncClient


def network(monkeypatch, reply):
    calls = []
    real = REAL_CLIENT

    def handler(request):
        calls.append({"url": str(request.url), "key": request.headers.get("api-subscription-key"), "body": json.loads(request.content)})
        return reply(request)
    monkeypatch.setattr(ai_provider.httpx, "AsyncClient", lambda **kwargs: real(transport=httpx.MockTransport(handler), **kwargs))
    return calls


def sarvam_error(status, code):
    return lambda request: httpx.Response(status, json={"error": {"code": code, "message": "synthetic", "request_id": "req_123"}})


@pytest.mark.asyncio
@pytest.mark.parametrize("personal,status,code,expected,phrase", [
    (True, 403, "invalid_api_key_error", 409, "Sarvam rejected your personal Sarvam key"),
    (False, 403, "invalid_api_key_error", 503, "Sarvam rejected the CareKosh Sarvam account"),
    (True, 402, "", 402, "no credits left for your personal Sarvam key"),
    (False, 429, "insufficient_quota_error", 402, "no credits left for the CareKosh Sarvam account"),
    (True, 429, "rate_limit_exceeded_error", 429, "Sarvam is busy"),
    (False, 503, "rate_limit_exceeded_error", 429, "Sarvam is busy"),
    (False, 422, "invalid_request_error", 502, "did not accept the speech request"),
    (False, 500, "internal_server_error", 502, "Voice provider is unavailable"),
])
async def test_provider_errors_are_specific_logged_without_secrets_and_never_retried(monkeypatch, caplog, personal, status, code, expected, phrase):
    calls = network(monkeypatch, sarvam_error(status, code))
    key = SecretStr("synthetic-personal-key") if personal else None
    with caplog.at_level(logging.WARNING, logger="carekosh.ai"), pytest.raises(HTTPException) as caught:
        await ai_provider.selected_speech("Hand gloves: 2 pairs.", "sarvam", api_key=key)
    assert caught.value.status_code == expected and phrase in caught.value.detail
    assert len(calls) == 1, "no automatic retry and no second key"
    assert calls[0]["key"] == ("synthetic-personal-key" if personal else "synthetic-application-key")
    assert calls[0]["url"] == "https://api.sarvam.ai/text-to-speech"
    if personal:
        assert "Shared credits were not used" in caught.value.detail or status in (429, 503)
    logged = " ".join(record.getMessage() for record in caplog.records)
    assert "synthetic-personal-key" not in logged and "synthetic-application-key" not in logged and "Hand gloves" not in logged
    if status != 500:
        assert f"code={code or 'unknown'}" in logged and "request_id=req_123" in logged


@pytest.mark.asyncio
async def test_long_valid_clip_fits_the_sized_limit_and_oversize_is_rejected(monkeypatch):
    long_clip = base64.b64encode(tone(70)).decode()
    assert 4_000_000 < len(long_clip) < 5_200_000
    network(monkeypatch, lambda request: httpx.Response(200, json={"request_id": "req_ok", "audios": [long_clip]}))
    audio = await ai_provider.selected_speech("A long reply.", "sarvam")
    with wave.open(io.BytesIO(audio)) as parsed:
        assert parsed.getnframes() == 70 * 24000
    network(monkeypatch, lambda request: httpx.Response(200, content=b'{"audios":["' + b"A" * 5_200_000 + b'"]}'))
    with pytest.raises(HTTPException) as caught:
        await ai_provider.selected_speech("A long reply.", "sarvam")
    assert caught.value.status_code == 502 and "oversized" in caught.value.detail


@pytest.mark.asyncio
async def test_rejected_personal_key_reaches_the_phone_as_a_clear_message_and_never_uses_shared_credits(client, monkeypatch):
    _, headers = await register_and_auth(client)
    category = await create_category(client, headers)
    await create_item(client, headers, category_id=category["id"], name="Hand gloves", quantity=2)
    assert (await client.put("/api/v1/ai/consent", headers=headers, json={"version": "voice-2026-10-06", "accepted": True, "scopes": ["sarvam_speech"]})).status_code == 200
    saved = await client.put("/api/v1/ai/sarvam-key", headers=headers, json={"api_key": "synthetic-personal-key", "storage_consent": True})
    assert saved.status_code == 200 and saved.json()["usable"] is True and "synthetic" not in saved.text
    calls = network(monkeypatch, sarvam_error(403, "invalid_api_key_error"))
    async with TestSession() as db:
        before = (await db.scalar(select(func.count()).select_from(Item)), await db.scalar(select(func.count()).select_from(Order)))
    response = await client.post("/api/v1/ai/speak", headers=headers, json={"text": "Hand gloves: 2 pairs.", "provider": "sarvam", "credential_source": "personal"})
    assert response.status_code == 409
    assert "Replace it in Voice setup" in response.json()["detail"] and "synthetic" not in response.text
    assert [call["key"] for call in calls] == ["synthetic-personal-key"]
    async with TestSession() as db:
        assert (await db.scalar(select(func.count()).select_from(Item)), await db.scalar(select(func.count()).select_from(Order))) == before
        usage = (await db.execute(select(AIUsage))).scalars().one()
        assert (usage.provider, usage.credential_source, usage.status) == ("sarvam", "personal", "failed")
    # The key itself is untouched: removal stays an explicit person's action.
    assert (await sarvam_credentials.personal_status((await client.get("/api/v1/auth/me", headers=headers)).json()["id"]))["configured"] is True
