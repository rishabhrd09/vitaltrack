"""Synthetic personal credentials; disposable DB and mocked Sarvam only."""

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from pydantic import SecretStr, ValidationError
from sqlalchemy import delete, func, select

from app.api.v1 import ai
from app.core.config import settings
from app.models.ai import AIConsent, AIUsage, SarvamCredential
from app.models.user import User
from app.schemas.ai import CONSENT_VERSION, SarvamKeyRequest, SpeakRequest
from app.services import ai_guard, ai_provider, sarvam_credentials as vault
from tests.conftest import TestSession, register_and_auth, test_engine


@pytest.fixture(autouse=True)
def byok(monkeypatch):
    for module in (ai, ai_guard, vault):
        monkeypatch.setattr(module, "AsyncSessionLocal", TestSession)
    for name, value in dict(
        AI_ENABLED=True,
        AI_SPEECH_ENABLED=True,
        AI_SARVAM_ENABLED=True,
        AI_SARVAM_BYOK_ENABLED=True,
        AI_SARVAM_DATA_CONTROLS_REVIEWED=True,
        AI_SARVAM_TRANSCRIBE_ENABLED=False,
        AI_CREDENTIAL_ENCRYPTION_KEY=SecretStr(Fernet.generate_key().decode()),
        AI_CREDENTIAL_PREVIOUS_ENCRYPTION_KEYS=SecretStr(""),
        SARVAM_API_KEY=SecretStr("synthetic-shared-key"),
        SARVAM_TTS_MODEL="bulbul:v3",
        SARVAM_SPEAKER="",
        AI_USER_DAILY_REQUESTS=50,
        AI_GLOBAL_DAILY_REQUESTS=500,
        AI_USER_DAILY_BUDGET_MICROUSD=100000,
        AI_GLOBAL_DAILY_BUDGET_MICROUSD=500000,
    ).items():
        monkeypatch.setattr(settings, name, value)


async def save(client, headers, key="synthetic-personal-key"):
    return await client.put(
        "/api/v1/ai/sarvam-key",
        headers=headers,
        json={"api_key": key, "storage_consent": True},
    )


async def consent(client, headers):
    response = await client.put(
        "/api/v1/ai/consent",
        headers=headers,
        json={
            "version": CONSENT_VERSION,
            "accepted": True,
            "scopes": ["sarvam_speech"],
        },
    )
    assert response.status_code == 200


async def speak(client, headers, source="personal"):
    return await client.post(
        "/api/v1/ai/speak",
        headers=headers,
        json={
            "text": "Synthetic short voice test.",
            "provider": "sarvam",
            "credential_source": source,
        },
    )


def test_encryption_randomized_owner_bound_tamper_safe_and_rotation(monkeypatch):
    secret = SecretStr("synthetic-personal-key")
    token = vault.encrypt_key("owner-a", secret)
    assert secret.get_secret_value() not in token
    assert vault.encrypt_key("owner-a", secret) != token
    assert vault.decrypt_key("owner-a", token) == secret
    for owner, damaged in [
        ("owner-b", token),
        ("owner-a", token[:-10] + "AAAAAAAAAA"),
        ("owner-a", "bad!"),
    ]:
        with pytest.raises(HTTPException) as failure:
            vault.decrypt_key(owner, damaged)
        assert failure.value.status_code == 503
        assert "synthetic" not in failure.value.detail
    old = settings.AI_CREDENTIAL_ENCRYPTION_KEY
    monkeypatch.setattr(
        settings,
        "AI_CREDENTIAL_ENCRYPTION_KEY",
        SecretStr(Fernet.generate_key().decode()),
    )
    with pytest.raises(HTTPException):
        vault.decrypt_key("owner-a", token)
    monkeypatch.setattr(settings, "AI_CREDENTIAL_PREVIOUS_ENCRYPTION_KEYS", old)
    assert vault.decrypt_key("owner-a", token) == secret
    new = vault.encrypt_key("owner-a", secret)
    monkeypatch.setattr(
        settings, "AI_CREDENTIAL_PREVIOUS_ENCRYPTION_KEYS", SecretStr("")
    )
    assert vault.decrypt_key("owner-a", new) == secret


@pytest.mark.parametrize(
    "key,accepted",
    [
        ("short", True),
        ("has spaces", True),
        ("x" * 513, True),
        ("nonascii-é", True),
        ("synthetic-key", False),
        ("synthetic-key", 1),
    ],
)
def test_key_validation_requires_explicit_consent_and_bounded_printable_key(
    key, accepted
):
    with pytest.raises(ValidationError):
        SarvamKeyRequest.model_validate({"api_key": key, "storage_consent": accepted})
    request = SarvamKeyRequest(api_key="synthetic-key", storage_consent=True)
    assert "synthetic-key" not in repr(request)
    assert "synthetic-key" not in request.model_dump_json()
    with pytest.raises(ValidationError):
        SpeakRequest(text="Synthetic", provider="kokoro", credential_source="personal")


async def test_auth_storage_status_replace_and_owner_isolation(client, monkeypatch):
    a, ha = await register_and_auth(client, name="Owner A")
    b, hb = await register_and_auth(client, name="Owner B")
    for method in (client.get, client.put, client.delete):
        response = await method("/api/v1/ai/sarvam-key")
        assert response.status_code == 401

    async def forbidden(*args, **kwargs):
        raise AssertionError("Saving must not call a provider")

    monkeypatch.setattr(ai_provider, "bounded_call", forbidden)
    response = await save(client, ha)
    assert response.status_code == 200
    assert response.json()["configured"] and response.json()["usable"]
    assert "synthetic" not in response.text and "ciphertext" not in response.text
    assert response.headers["cache-control"] == "no-store"
    cb = (await client.get("/api/v1/ai/capabilities", headers=hb)).json()
    assert cb["sarvam_personal_key"]["configured"] is False
    ca = (await client.get("/api/v1/ai/capabilities", headers=ha)).json()
    assert ca["scopes"] == []
    async with TestSession() as db:
        row = await db.get(SarvamCredential, a["user"]["id"])
        assert "synthetic-personal-key" not in row.ciphertext
        original = row.ciphertext
        assert await db.get(SarvamCredential, b["user"]["id"]) is None
        assert await db.scalar(select(func.count()).select_from(AIUsage)) == 0
    assert (await save(client, ha, "synthetic-replacement-key")).status_code == 200
    async with TestSession() as db:
        row = await db.get(SarvamCredential, a["user"]["id"])
        assert row.ciphertext != original
        assert (
            vault.decrypt_key(a["user"]["id"], row.ciphertext).get_secret_value()
            == "synthetic-replacement-key"
        )
    await client.delete("/api/v1/ai/sarvam-key", headers=hb)
    assert (await client.get("/api/v1/ai/sarvam-key", headers=ha)).json()[
        "configured"
    ] is True
    response = await client.put(
        "/api/v1/ai/sarvam-key",
        headers=ha,
        json={
            "api_key": "synthetic-secret-with-space ",
            "storage_consent": True,
            "user_id": b["user"]["id"],
        },
    )
    assert response.status_code == 422 and "synthetic-secret" not in response.text


async def test_personal_voice_needs_consent_no_operator_key_and_no_business_writes(
    client, monkeypatch
):
    account, headers = await register_and_auth(client)
    await save(client, headers)
    monkeypatch.setattr(settings, "SARVAM_API_KEY", SecretStr(""))
    calls = []

    async def synth(text, provider, pace, *, api_key=None):
        assert test_engine.pool.checkedout() == 0
        calls.append(api_key.get_secret_value())
        return b"synthetic-wav"

    monkeypatch.setattr(ai_provider, "selected_speech", synth)
    assert (await speak(client, headers)).status_code == 403
    assert calls == []
    await consent(client, headers)
    caps = (await client.get("/api/v1/ai/capabilities", headers=headers)).json()
    assert (
        caps["sarvam_application_available"] is False
        and "sarvam" in caps["speech_providers"]
    )
    before_items = (await client.get("/api/v1/items", headers=headers)).json()
    before_orders = (await client.get("/api/v1/orders", headers=headers)).json()
    response = await speak(client, headers)
    assert response.status_code == 200 and response.content == b"synthetic-wav"
    assert calls == ["synthetic-personal-key"]
    assert (await client.get("/api/v1/items", headers=headers)).json() == before_items
    assert (await client.get("/api/v1/orders", headers=headers)).json() == before_orders
    async with TestSession() as db:
        row = await db.scalar(select(AIUsage))
        assert (
            row.user_id == account["user"]["id"]
            and row.credential_source == "personal"
            and row.status == "complete"
        )
    await client.put(
        "/api/v1/ai/consent",
        headers=headers,
        json={"version": CONSENT_VERSION, "accepted": False, "scopes": []},
    )
    assert (await speak(client, headers)).status_code == 403
    assert len(calls) == 1


async def test_missing_removed_and_unreadable_keys_never_fall_back(client, monkeypatch):
    account, headers = await register_and_auth(client)
    await consent(client, headers)
    calls = []

    async def synth(*args, **kwargs):
        calls.append(kwargs)
        raise HTTPException(503, "Provider unavailable")

    monkeypatch.setattr(ai_provider, "selected_speech", synth)
    assert (await speak(client, headers)).status_code == 409
    await save(client, headers)
    assert (await speak(client, headers)).status_code == 503
    assert (
        len(calls) == 1
        and calls[0]["api_key"].get_secret_value() == "synthetic-personal-key"
    )
    monkeypatch.setattr(
        settings,
        "AI_CREDENTIAL_ENCRYPTION_KEY",
        SecretStr(Fernet.generate_key().decode()),
    )
    assert (await client.get("/api/v1/ai/sarvam-key", headers=headers)).json()[
        "usable"
    ] is False
    assert (await speak(client, headers)).status_code == 503
    monkeypatch.setattr(settings, "AI_SARVAM_BYOK_ENABLED", False)
    response = await client.delete("/api/v1/ai/sarvam-key", headers=headers)
    assert response.status_code == 200 and not response.json()["configured"]
    assert len(calls) == 1
    async with TestSession() as db:
        rows = (await db.scalars(select(AIUsage))).all()
        assert len(rows) == 1 and rows[0].status == "failed"


async def test_shared_billing_remains_explicit_personal_does_not_enable_mic(
    client, monkeypatch
):
    _, headers = await register_and_auth(client)
    await save(client, headers)
    await consent(client, headers)
    calls = []

    async def synth(*args, **kwargs):
        calls.append(kwargs)
        return b"synthetic-wav"

    monkeypatch.setattr(ai_provider, "selected_speech", synth)
    assert (await speak(client, headers, "application")).status_code == 200
    assert calls == [{}]
    with pytest.raises(HTTPException):
        ai_guard.require_enabled("transcribe", "sarvam")


async def test_byok_budget_and_account_deletion_cascade(client, monkeypatch):
    account, headers = await register_and_auth(client)
    await save(client, headers)
    await consent(client, headers)
    monkeypatch.setattr(settings, "AI_USER_DAILY_BUDGET_MICROUSD", 19999)
    assert (await speak(client, headers)).status_code == 429
    async with TestSession.begin() as db:
        assert await db.scalar(select(func.count()).select_from(AIUsage)) == 0
        await db.execute(delete(User).where(User.id == account["user"]["id"]))
    async with TestSession() as db:
        assert await db.scalar(select(func.count()).select_from(SarvamCredential)) == 0
        assert await db.scalar(select(func.count()).select_from(AIConsent)) == 0
    assert (
        await client.get("/api/v1/ai/sarvam-key", headers=headers)
    ).status_code == 401
