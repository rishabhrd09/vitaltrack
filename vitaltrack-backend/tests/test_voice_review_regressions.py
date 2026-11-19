"""15 October independent-review regressions; synthetic data and mocked providers."""

import asyncio
import io
import re

import pytest
from pydantic import SecretStr
from sqlalchemy import select
from starlette.datastructures import UploadFile
from starlette.requests import Request

from app.api.v1 import ai
from app.core.config import settings
from app.main import app
from app.models.ai import AIUsage
from app.services import ai_guard, ai_provider, sarvam_credentials
from app.services.ai_body_limit import DISCONNECTED
from app.utils.request_ids import safe_request_id
from tests.conftest import TestSession, register_and_auth, test_engine
from tests.test_ai import consented, enable_sarvam_speech


@pytest.fixture(autouse=True)
def isolated_voice_services(monkeypatch):
    for module in (ai, ai_guard, sarvam_credentials):
        monkeypatch.setattr(module, "AsyncSessionLocal", TestSession)
    for name, value in {
        "AI_ENABLED": True,
        "AI_DATA_CONTROLS_REVIEWED": True,
        "AI_TRANSCRIBE_ENABLED": True,
        "GROQ_API_KEY": SecretStr("synthetic-never-sent"),
    }.items():
        monkeypatch.setattr(settings, name, value)


async def test_rate_limit_follows_account_not_nat_or_forwarded_headers(client, monkeypatch):
    _, first = await register_and_auth(client, name="Rate First", email="rate-first@test.com")
    _, second = await register_and_auth(client, name="Rate Second", email="rate-second@test.com")
    monkeypatch.setattr(app.state.limiter, "enabled", True)
    app.state.limiter.reset()
    try:
        for index in range(30):
            response = await client.get(
                "/api/v1/ai/sarvam-key",
                headers={**first, "CF-Connecting-IP": f"198.51.100.{index}",
                         "X-Forwarded-For": f"203.0.113.{index}, 127.0.0.1"},
            )
            assert response.status_code == 200
        limited = await client.get("/api/v1/ai/sarvam-key", headers=first)
        assert limited.status_code == 429, "changing forwarded headers cannot reset an account's counter"
        assert "rate limit" in limited.json()["error"].lower()
        assert "x-ai-error" not in limited.headers, "a route rate limit is not retryable in-flight busy"
        other = await client.get("/api/v1/ai/sarvam-key", headers=second)
        assert other.status_code == 200, "accounts behind the same socket/NAT have separate counters"
    finally:
        app.state.limiter.reset()


@pytest.mark.parametrize("value", ["ok\r\nInjected: synthetic", "review\x1b[31mred", "x" * 400, "", "synthetic-trace_1:2.3"])
@pytest.mark.parametrize("path", ["/api/v1/ai/capabilities", "/api/v1/items"])
async def test_request_ids_are_safe_on_early_refusals_and_normal_middleware(client, value, path):
    response = await client.get(path, headers={"X-Request-ID": value})
    echoed = response.headers["x-request-id"]
    assert re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", echoed)
    if value == "synthetic-trace_1:2.3":
        assert echoed == value
    else:
        assert len(echoed) == 32 and echoed != value


@pytest.mark.parametrize("value", [None, "white space", "é", "/private/path", "a\tbad", "a\x00bad", "a" * 129])
def test_request_id_rejects_nonportable_or_oversized_input(value):
    assert re.fullmatch(r"[a-f0-9]{32}", safe_request_id(value))


@pytest.mark.parametrize("provider", ["groq", "sarvam"])
@pytest.mark.parametrize("stage", ["already_closed", "normalizing", "provider"])
async def test_transcription_disconnect_cancels_work_and_keeps_reservation(client, monkeypatch, provider, stage):
    enable_sarvam_speech(monkeypatch)
    monkeypatch.setattr(settings, "AI_SARVAM_TRANSCRIBE_ENABLED", True)
    account, _ = await consented(client)
    disconnected, started = asyncio.Event(), asyncio.Event()
    calls, cancelled = [], []

    async def normalize(content, extension):
        calls.append("normalizing")
        if stage == "normalizing":
            started.set()
            try:
                await asyncio.sleep(30)
            except asyncio.CancelledError:
                cancelled.append("normalizing")
                raise
        return b"synthetic-normalized", 1.0

    async def transcribe(*args):
        calls.append("provider")
        started.set()
        try:
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            cancelled.append("provider")
            raise

    monkeypatch.setattr(ai_provider, "audio_info", lambda content: ("wav", 1.0))
    monkeypatch.setattr(ai_provider, "normalize_audio", normalize)
    monkeypatch.setattr(ai_provider, "transcribe", transcribe)
    monkeypatch.setattr(ai_provider, "sarvam_transcribe", transcribe)
    if stage == "already_closed":
        disconnected.set()
    request = Request({"type": "http", "method": "POST", "path": "/api/v1/ai/transcribe",
                       "headers": [], "client": ("127.0.0.1", 1), DISCONNECTED: disconnected})
    upload = UploadFile(io.BytesIO(b"synthetic-recording"))
    task = asyncio.create_task(ai.transcribe.__wrapped__(
        request=request, user=ai_guard.AIPrincipal(account["user"]["id"]), file=upload, provider=provider,
    ))
    if stage != "already_closed":
        await asyncio.wait_for(started.wait(), 2)
        disconnected.set()
    with pytest.raises(ai.HTTPException) as stopped:
        await asyncio.wait_for(task, 2)
    assert stopped.value.status_code == 499
    assert upload.file.closed
    if stage == "already_closed":
        assert not calls
    else:
        assert cancelled == [stage]
    async with TestSession() as db:
        row = (await db.scalars(select(AIUsage))).one()
        assert row.status == "failed"
        reserve = (settings.AI_SARVAM_TRANSCRIBE_RESERVE_MICROUSD if provider == "sarvam"
                   else settings.AI_TRANSCRIBE_RESERVE_MICROUSD)
        assert row.reserved_microusd == reserve
    assert test_engine.pool.checkedout() == 0


async def test_busy_marker_is_distinct_from_daily_allowance(client, monkeypatch):
    account, _ = await consented(client)
    user_id = account["user"]["id"]
    ticket = await ai_guard.reserve(user_id, "interpret")
    with pytest.raises(ai.HTTPException) as busy:
        await ai_guard.reserve(user_id, "interpret")
    assert busy.value.headers["X-AI-Error"] == "busy"
    await ai_guard.settle(ticket, False)
    monkeypatch.setattr(settings, "AI_USER_DAILY_REQUESTS", 0)
    with pytest.raises(ai.HTTPException) as daily:
        await ai_guard.reserve(user_id, "interpret")
    assert daily.value.status_code == 429
    assert "X-AI-Error" not in daily.value.headers


@pytest.mark.parametrize("characters, expected", [(300, 7), (150, 14)])
async def test_daily_speech_examples_preserve_full_reservation_headroom(client, monkeypatch, characters, expected):
    enable_sarvam_speech(monkeypatch)
    account, _ = await consented(client)
    for _ in range(expected):
        ticket = await ai_guard.reserve(account["user"]["id"], "speak", provider="sarvam")
        await ai_guard.settle(ticket, True, {"characters": characters})
    with pytest.raises(ai.HTTPException) as exhausted:
        await ai_guard.reserve(account["user"]["id"], "speak", provider="sarvam")
    assert exhausted.value.status_code == 429
    assert "budget" in exhausted.value.detail
