"""Synthetic personal keys and inventory; inference is mocked, never billed."""

import asyncio

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from pydantic import SecretStr, ValidationError
from sqlalchemy import delete, func, select

from app.api.v1 import ai
from app.core.config import settings
from app.models import ActivityLog, AuditLog, Category, Item, Order, OrderItem, User
from app.models.ai import AIConsent, AIUsage, OpenAICredential, SarvamCredential
from app.schemas.ai import CONSENT_VERSION, InterpretRequest, OpenAIKeyRequest, Plan
from app.services import ai_guard, ai_provider, openai_credentials as vault, openai_interpreter, sarvam_credentials
from tests.conftest import TestSession, create_category, create_item, register_and_auth, test_engine
from tests.test_voice_plans import group, query_plan

KEY = "synthetic-openai-personal-key"


@pytest.fixture(autouse=True)
def personal_openai(monkeypatch):
    for module in (ai, ai_guard, vault, sarvam_credentials):
        monkeypatch.setattr(module, "AsyncSessionLocal", TestSession)
    for name, value in {
        "AI_ENABLED": True, "AI_OPENAI_ENABLED": True,
        "AI_OPENAI_DATA_CONTROLS_REVIEWED": True,
        "AI_CREDENTIAL_ENCRYPTION_KEY": SecretStr(Fernet.generate_key().decode()),
        "AI_CREDENTIAL_PREVIOUS_ENCRYPTION_KEYS": SecretStr(""),
        "OPENAI_INTENT_MODEL": "gpt-5.4-mini-2026-03-17",
        "AI_USER_DAILY_REQUESTS": 50, "AI_GLOBAL_DAILY_REQUESTS": 500,
        "AI_USER_DAILY_BUDGET_MICROUSD": 200000,
        "AI_GLOBAL_DAILY_BUDGET_MICROUSD": 1000000,
        "AI_OPENAI_INTERPRET_RESERVE_MICROUSD": 50000,
    }.items():
        monkeypatch.setattr(settings, name, value)


async def save(client, headers, key=KEY):
    return await client.put("/api/v1/ai/openai-key", headers=headers,
                            json={"api_key": key, "storage_consent": True})


async def consent(client, headers, scopes=("openai_text",)):
    return await client.put("/api/v1/ai/consent", headers=headers, json={
        "version": CONSENT_VERSION, "accepted": bool(scopes), "scopes": list(scopes),
    })


async def ask(client, headers, **patch):
    return await client.post("/api/v1/ai/interpret", headers=headers, json={
        "question": "Show low stock items", "provider": "openai",
        "contract_version": 3, **patch,
    })


def test_envelope_is_random_owner_provider_bound_and_rotation_safe(monkeypatch):
    secret = SecretStr(KEY)
    token = vault.encrypt_key("owner-a", secret)
    assert KEY not in token and token != vault.encrypt_key("owner-a", secret)
    assert vault.decrypt_key("owner-a", token) == secret
    for owner, damaged in [("owner-b", token), ("owner-a", token[:-4] + "AAAA"),
                            ("owner-a", sarvam_credentials.encrypt_key("owner-a", secret))]:
        with pytest.raises(HTTPException):
            vault.decrypt_key(owner, damaged)
    old = settings.AI_CREDENTIAL_ENCRYPTION_KEY
    monkeypatch.setattr(settings, "AI_CREDENTIAL_ENCRYPTION_KEY", SecretStr(Fernet.generate_key().decode()))
    with pytest.raises(HTTPException):
        vault.decrypt_key("owner-a", token)
    monkeypatch.setattr(settings, "AI_CREDENTIAL_PREVIOUS_ENCRYPTION_KEYS", old)
    assert vault.decrypt_key("owner-a", token) == secret
    with pytest.raises(HTTPException):
        sarvam_credentials.decrypt_key("owner-a", vault.encrypt_key("owner-a", secret))


@pytest.mark.parametrize("key,accepted", [("short", True), ("key with spaces", True),
    ("x" * 513, True), ("nonascii-é", True), (KEY, False), (KEY, 1), (KEY + "\r\n", True)])
def test_key_schema_hides_secrets_and_rejects_invalid_enrollment(key, accepted):
    with pytest.raises(ValidationError):
        OpenAIKeyRequest.model_validate({"api_key": key, "storage_consent": accepted})
    valid = OpenAIKeyRequest(api_key=KEY, storage_consent=True)
    assert KEY not in repr(valid) and KEY not in valid.model_dump_json()


async def test_enrollment_is_owned_encrypted_and_never_grants_processing(client, monkeypatch):
    first, headers = await register_and_auth(client, email="first-openai@test.com")
    _, other = await register_and_auth(client, email="other-openai@test.com")
    async def forbidden(*args, **kwargs):
        raise AssertionError("Saving/status/removing keys must not contact a provider")
    monkeypatch.setattr(openai_interpreter, "interpret", forbidden)
    monkeypatch.setattr(openai_interpreter, "check_model", forbidden)
    assert (await client.get("/api/v1/ai/openai-key")).status_code == 401
    response = await save(client, headers)
    assert response.status_code == 200 and response.json()["configured"] is True
    assert KEY not in response.text
    assert set(response.json()) == {"setup_available", "configured", "usable", "updated_at"}
    assert (await client.get("/api/v1/ai/openai-key", headers=other)).json()["configured"] is False
    async with TestSession() as db:
        row = await db.get(OpenAICredential, first["user"]["id"])
        assert KEY not in row.ciphertext
        assert vault.decrypt_key(row.user_id, row.ciphertext).get_secret_value() == KEY
        assert await db.scalar(select(func.count()).select_from(AIConsent)) == 0
        assert await db.scalar(select(func.count()).select_from(AIUsage)) == 0
        ciphertext = row.ciphertext
    assert (await save(client, headers, KEY + "-replacement")).status_code == 200
    async with TestSession() as db:
        assert (await db.get(OpenAICredential, first["user"]["id"])).ciphertext != ciphertext
    await client.delete("/api/v1/ai/openai-key", headers=other)
    assert (await client.get("/api/v1/ai/openai-key", headers=headers)).json()["configured"] is True


@pytest.mark.parametrize("setting", ["AI_ENABLED", "AI_OPENAI_ENABLED", "AI_OPENAI_DATA_CONTROLS_REVIEWED"])
async def test_paused_provider_blocks_save_but_still_allows_owned_removal(client, monkeypatch, setting):
    account, headers = await register_and_auth(client)
    assert (await save(client, headers)).status_code == 200
    monkeypatch.setattr(settings, setting, False)
    assert (await save(client, headers, KEY + "-new")).status_code == 503
    status = (await client.get("/api/v1/ai/openai-key", headers=headers)).json()
    assert status["configured"] and not status["usable"]
    assert (await client.delete("/api/v1/ai/openai-key", headers=headers)).status_code == 200
    async with TestSession() as db:
        assert await db.get(OpenAICredential, account["user"]["id"]) is None


async def test_model_check_is_explicit_no_question_or_inference_consent(client, monkeypatch):
    _, headers = await register_and_auth(client)
    await save(client, headers)
    calls = []
    async def check(key):
        assert test_engine.pool.checkedout() == 0
        calls.append(key.get_secret_value())
        return {"available": True, "model": settings.OPENAI_INTENT_MODEL}
    monkeypatch.setattr(openai_interpreter, "check_model", check)
    response = await client.post("/api/v1/ai/openai-key/check", headers=headers)
    assert response.status_code == 200 and response.json()["available"] is True
    assert calls == [KEY] and KEY not in response.text
    async with TestSession() as db:
        assert await db.scalar(select(func.count()).select_from(AIConsent)) == 0
        assert await db.scalar(select(func.count()).select_from(AIUsage)) == 0


async def test_openai_scope_is_new_explicit_and_legacy_groq_capability_is_unchanged(client, monkeypatch):
    _, headers = await register_and_auth(client)
    monkeypatch.setattr(settings, "AI_DATA_CONTROLS_REVIEWED", True)
    monkeypatch.setattr(settings, "GROQ_API_KEY", SecretStr("synthetic-groq-key"))
    await consent(client, headers, ["groq_text", "groq_audio", "sarvam_speech"])
    await save(client, headers)
    caps = (await client.get("/api/v1/ai/capabilities", headers=headers)).json()
    assert caps["interpret"] is True and set(caps["interpretation_providers"]) == {"groq", "openai"}
    assert caps["scopes"] == ["groq_text", "groq_audio", "sarvam_speech"]
    assert (await ask(client, headers)).status_code == 403
    async with TestSession() as db:
        assert await db.scalar(select(func.count()).select_from(AIUsage)) == 0
    await consent(client, headers, [*caps["scopes"], "openai_text"])
    updated = (await client.get("/api/v1/ai/capabilities", headers=headers)).json()
    assert set(updated["scopes"]) == {"groq_text", "groq_audio", "sarvam_speech", "openai_text"}


async def test_interpretation_is_personal_accounted_and_cannot_modify_business_tables(client, monkeypatch):
    account, headers = await register_and_auth(client)
    category = await create_category(client, headers)
    await create_item(client, headers, category_id=category["id"], quantity=2)
    await save(client, headers)
    await consent(client, headers)
    tables = [Item, Category, Order, OrderItem, ActivityLog, AuditLog]
    async def counts():
        async with TestSession() as db:
            return [await db.scalar(select(func.count()).select_from(t)) for t in tables]
    before = await counts()
    async def interpreted(question, previous, key):
        assert key.get_secret_value() == KEY and previous is False
        assert question == "Show low stock items"
        assert test_engine.pool.checkedout() == 0
        return Plan.model_validate(query_plan(group(stock=["low"]))), {"prompt_tokens": 100, "completion_tokens": 100}
    async def forbidden(*args, **kwargs):
        raise AssertionError("OpenAI must never use Groq or an application key")
    monkeypatch.setattr(openai_interpreter, "interpret", interpreted)
    monkeypatch.setattr(ai_provider, "interpret", forbidden)
    response = await ask(client, headers)
    assert response.status_code == 200 and response.json()["version"] == 3
    assert await counts() == before
    async with TestSession() as db:
        row = (await db.scalars(select(AIUsage))).one()
        assert row.user_id == account["user"]["id"] and row.provider == "openai"
        assert row.credential_source == "personal" and row.status == "complete"
        assert row.reserved_microusd == 525


@pytest.mark.parametrize("patch", [{"contract_version": 1}, {"contract_version": 2},
    {"provider": "shell"}, {"credential_source": "application"}, {"model": "arbitrary"},
    {"base_url": "http://127.0.0.1/admin"}, {"api_key": "not-accepted-here"}])
async def test_bad_contract_or_arbitrary_provider_configuration_is_rejected(client, patch):
    _, headers = await register_and_auth(client)
    response = await ask(client, headers, **patch)
    assert response.status_code == 422
    async with TestSession() as db:
        assert await db.scalar(select(func.count()).select_from(AIUsage)) == 0


async def test_failed_personal_call_retains_allowance_and_never_retries_another_provider(client, monkeypatch):
    _, headers = await register_and_auth(client)
    await save(client, headers)
    await consent(client, headers)
    calls = []
    async def unavailable(*args):
        calls.append(1)
        raise HTTPException(402, "OpenAI credits are unavailable.", headers={"X-AI-Error": "openai_quota"})
    monkeypatch.setattr(openai_interpreter, "interpret", unavailable)
    response = await ask(client, headers)
    assert response.status_code == 402 and len(calls) == 1
    async with TestSession() as db:
        row = (await db.scalars(select(AIUsage))).one()
        assert row.status == "failed" and row.reserved_microusd == 50000
    monkeypatch.setattr(settings, "AI_USER_DAILY_BUDGET_MICROUSD", 50000)
    limited = await ask(client, headers)
    assert limited.status_code == 429 and len(calls) == 1
    assert limited.headers.get("x-ai-error") != "busy"


async def test_key_delete_and_full_withdrawal_block_new_requests(client, monkeypatch):
    _, headers = await register_and_auth(client)
    await save(client, headers)
    await consent(client, headers)
    await client.delete("/api/v1/ai/openai-key", headers=headers)
    assert (await ask(client, headers)).status_code == 409
    await save(client, headers)
    await consent(client, headers, [])
    assert (await ask(client, headers)).status_code == 403


async def test_only_new_credentials_cascade_with_deleted_account(client):
    account, headers = await register_and_auth(client)
    await save(client, headers)
    async with TestSession.begin() as db:
        await db.execute(delete(User).where(User.id == account["user"]["id"]))
    async with TestSession() as db:
        assert await db.scalar(select(func.count()).select_from(OpenAICredential)) == 0


async def test_removing_openai_key_preserves_the_independent_sarvam_key(client):
    from datetime import datetime, timezone

    account, headers = await register_and_auth(client)
    await save(client, headers)
    owner = account["user"]["id"]
    encrypted = sarvam_credentials.encrypt_key(owner, SecretStr("synthetic-sarvam-independent"))
    async with TestSession.begin() as db:
        db.add(SarvamCredential(user_id=owner, ciphertext=encrypted, updated_at=datetime.now(timezone.utc)))
    assert (await client.delete("/api/v1/ai/openai-key", headers=headers)).status_code == 200
    async with TestSession() as db:
        assert (await db.get(SarvamCredential, owner)).ciphertext == encrypted


async def test_disconnection_cancels_inference_and_preserves_reservation(client, monkeypatch):
    account, headers = await register_and_auth(client)
    await save(client, headers)
    await consent(client, headers)
    from starlette.requests import Request
    from app.services.ai_body_limit import DISCONNECTED
    started, disconnected = asyncio.Event(), asyncio.Event()
    async def held(*args):
        started.set()
        await asyncio.sleep(30)
    monkeypatch.setattr(openai_interpreter, "interpret", held)
    request = Request({"type": "http", "method": "POST", "path": "/api/v1/ai/interpret", "headers": [], DISCONNECTED: disconnected})
    task = asyncio.create_task(ai.interpret.__wrapped__(request, InterpretRequest(
        question="Show low stock items", provider="openai", contract_version=3,
    ), ai_guard.AIPrincipal(account["user"]["id"])))
    await asyncio.wait_for(started.wait(), 3)
    disconnected.set()
    with pytest.raises(HTTPException) as failure:
        await task
    assert failure.value.status_code == 499
    async with TestSession() as db:
        row = (await db.scalars(select(AIUsage))).one()
        assert row.status == "failed" and row.reserved_microusd == 50000
