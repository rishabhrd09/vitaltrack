"""Regression contracts for recovery, concurrency, history and log privacy.

Run with --migrated-schema in CI; every database is a guarded disposable target.
"""
import asyncio
import hashlib
import io
import logging
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from uvicorn.logging import AccessFormatter

from app.api import deps
from app.api.v1 import auth, orders
from app.core.logging import scrub_telemetry_event
from app.core.security import create_access_token
from app.main import app
from app.models import AuditLog, Item, User
from tests.conftest import (
    TestSession, auth_header, create_category, create_item, create_order,
    order_item_payload, register_and_auth,
)

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def no_mail(monkeypatch):
    async def stub(*args, **kwargs):
        return True
    for name in ('send_verification_email', 'send_password_reset_email', 'send_password_changed_notification', 'send_email_via_api'):
        monkeypatch.setattr(auth, name, stub)


async def seed(client, email='safety@example.com'):
    account, headers = await register_and_auth(client, name='Safety User', email=email)
    category = await create_category(client, headers)
    item = await create_item(client, headers, category_id=category['id'])
    return account, headers, category, item


async def set_reset(user_id, token):
    async with TestSession() as db:
        await db.execute(update(User).where(User.id == user_id).values(
            password_reset_token=hashlib.sha256(token.encode()).hexdigest(),
            password_reset_expiry=datetime.now(timezone.utc) + timedelta(hours=1),
        ))
        await db.commit()


async def test_profile_keeps_recovery_email_read_only_and_name_edit_works(client):
    account, headers, _, item = await seed(client)
    async with TestSession() as db:
        await db.execute(update(User).where(User.id == account['user']['id']).values(is_email_verified=True))
        await db.commit()
    result = await client.patch('/api/v1/auth/me', headers=headers, json={'email': 'other@example.com', 'name': 'Not Applied'})
    assert result.status_code == 400
    current = (await client.get('/api/v1/auth/me', headers=headers)).json()
    assert current['email'] == 'safety@example.com' and current['name'] == 'Safety User'
    result = await client.patch('/api/v1/auth/me', headers=headers, json={'name': 'New Name'})
    assert result.status_code == 200 and result.json()['name'] == 'New Name'
    assert (await client.get(f"/api/v1/items/{item['id']}", headers=headers)).json()['quantity'] == 10


async def test_password_change_revokes_old_access_refresh_and_reset_but_keeps_data(client):
    account, headers, _, item = await seed(client)
    await set_reset(account['user']['id'], 'synthetic-old-reset')
    # A token issued before deployment (no generation claim) remains compatible
    # until this user's credentials change.
    legacy = auth_header(create_access_token(account['user']['id']))
    assert (await client.get('/api/v1/auth/me', headers=legacy)).status_code == 200
    response = await client.post('/api/v1/auth/change-password', headers=headers, json={'current_password': 'TestPass1', 'new_password': 'ChangedPass2'})
    assert response.status_code == 200
    for old in (headers, legacy):
        assert (await client.get('/api/v1/auth/me', headers=old)).status_code == 401
    assert (await client.post('/api/v1/auth/refresh', json={'refresh_token': account['refresh_token']})).status_code == 401
    assert (await client.post('/api/v1/auth/reset-password', json={'token': 'synthetic-old-reset', 'new_password': 'StalePass3'})).status_code == 400
    login = await client.post('/api/v1/auth/login', json={'identifier': 'safety@example.com', 'password': 'ChangedPass2'})
    assert login.status_code == 200
    new_headers = auth_header(login.json()['access_token'])
    assert (await client.get(f"/api/v1/items/{item['id']}", headers=new_headers)).json()['quantity'] == 10


async def test_same_reset_token_has_only_one_winner(client):
    account, headers = await register_and_auth(client, email='reset@example.com')
    await set_reset(account['user']['id'], 'synthetic-reset')
    results = await asyncio.gather(*(
        client.post('/api/v1/auth/reset-password', json={'token': 'synthetic-reset', 'new_password': f'ChangedPass{i}'})
        for i in (1, 2)
    ))
    assert sorted(result.status_code for result in results) == [200, 400]
    assert (await client.get('/api/v1/auth/me', headers=headers)).status_code == 401


async def test_refresh_cannot_escape_overlapping_password_change(client, monkeypatch):
    account, headers = await register_and_auth(client, email='refresh-race@example.com')
    claimed, release = asyncio.Event(), asyncio.Event()
    original = AsyncSession.execute

    async def held_execute(session, statement, *args, **kwargs):
        result = await original(session, statement, *args, **kwargs)
        if getattr(statement, 'is_update', False) and statement.table.name == 'refresh_tokens' and statement._returning:
            claimed.set()
            await asyncio.wait_for(release.wait(), 5)
        return result

    monkeypatch.setattr(AsyncSession, 'execute', held_execute)
    rotating = asyncio.create_task(client.post('/api/v1/auth/refresh', json={'refresh_token': account['refresh_token']}))
    await asyncio.wait_for(claimed.wait(), 5)
    changing = asyncio.create_task(client.post('/api/v1/auth/change-password', headers=headers, json={'current_password': 'TestPass1', 'new_password': 'ChangedPass2'}))
    try:
        # Observe a real PostgreSQL lock wait before releasing the issuer.
        async with TestSession() as db:
            for _ in range(100):
                await db.execute(text("SELECT pg_stat_clear_snapshot()"))
                waiting = await db.scalar(text("SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid <> pg_backend_pid())"))
                if waiting:
                    break
                await asyncio.sleep(0.01)
    finally:
        release.set()
    rotated, changed = await asyncio.gather(rotating, changing)
    assert waiting, 'Password change never reached the intended lock interleaving'
    assert rotated.status_code == changed.status_code == 200
    assert (await client.post('/api/v1/auth/refresh', json={'refresh_token': rotated.json()['refresh_token']})).status_code == 401
    assert (await client.get('/api/v1/auth/me', headers=auth_header(rotated.json()['access_token']))).status_code == 401


async def test_verification_policy_applies_to_registration_tokens(client, monkeypatch):
    account, headers = await register_and_auth(client, email='verify@example.com')
    monkeypatch.setattr(auth.settings, 'REQUIRE_EMAIL_VERIFICATION', True)
    monkeypatch.setattr(auth, 'is_email_configured', lambda: True)
    monkeypatch.setattr(deps, 'is_email_configured', lambda: True)
    for endpoint in ('/auth/me', '/categories', '/items', '/orders', '/activities'):
        response = await client.get('/api/v1' + endpoint, headers=headers)
        assert response.status_code == 403
    assert (await client.post('/api/v1/auth/refresh', json={'refresh_token': account['refresh_token']})).status_code == 403
    async with TestSession() as db:
        await db.execute(update(User).where(User.id == account['user']['id']).values(
            email_verification_token=hashlib.sha256(b'synthetic-verify').hexdigest(),
            email_verification_expiry=datetime.now(timezone.utc) + timedelta(hours=1),
        ))
        await db.commit()
    results = await asyncio.gather(*(client.get('/api/v1/auth/verify-email/synthetic-verify') for _ in range(2)))
    assert sorted(result.status_code for result in results) == [200, 400]
    assert (await client.get('/api/v1/auth/me', headers=headers)).status_code == 200


async def test_order_numbers_survive_gaps_and_account_deletion(client):
    first_account, headers, _, item = await seed(client)
    first = await create_order(client, headers, items=[order_item_payload(item)])
    second = await create_order(client, headers, items=[order_item_payload(item)])
    assert (await client.delete(f"/api/v1/orders/{first['id']}", headers=headers)).status_code == 200
    _, other_headers, _, other_item = await seed(client, 'other@example.com')
    third = await create_order(client, other_headers, items=[order_item_payload(other_item)])
    assert int(third['orderId'].rsplit('-', 1)[1]) > int(second['orderId'].rsplit('-', 1)[1])
    async with TestSession() as db:
        await db.execute(delete(User).where(User.id == first_account['user']['id']))
        await db.commit()
    fourth = await create_order(client, other_headers, items=[order_item_payload(other_item)])
    assert len({first['orderId'], second['orderId'], third['orderId'], fourth['orderId']}) == 4


async def test_concurrent_order_creates_have_distinct_numbers(client):
    _, headers, _, item = await seed(client)
    created = await asyncio.gather(*(create_order(client, headers, items=[order_item_payload(item)]) for _ in range(6)))
    assert len({order['orderId'] for order in created}) == 6
    assert (await client.get(f"/api/v1/items/{item['id']}", headers=headers)).json()['quantity'] == 10


async def test_delete_cannot_erase_an_order_applied_after_its_precheck(client, monkeypatch):
    _, headers, _, item = await seed(client)
    order = await create_order(client, headers, items=[order_item_payload(item, quantity=4)])
    reached, release = asyncio.Event(), asyncio.Event()
    original = AsyncSession.execute

    async def hold_delete(session, statement, *args, **kwargs):
        if getattr(statement, 'is_delete', False) and statement.table.name == 'orders':
            reached.set()
            await asyncio.wait_for(release.wait(), 5)
        return await original(session, statement, *args, **kwargs)

    monkeypatch.setattr(AsyncSession, 'execute', hold_delete)
    deleting = asyncio.create_task(client.delete(f"/api/v1/orders/{order['id']}", headers=headers))
    await asyncio.wait_for(reached.wait(), 5)
    try:
        assert (await client.patch(f"/api/v1/orders/{order['id']}/status", headers=headers, json={'status': 'received'})).status_code == 200
        assert (await client.post(f"/api/v1/orders/{order['id']}/apply", headers=headers)).status_code == 200
    finally:
        release.set()
    assert (await deleting).status_code == 400
    assert (await client.get(f"/api/v1/orders/{order['id']}", headers=headers)).json()['status'] == 'stock_updated'
    assert (await client.get(f"/api/v1/items/{item['id']}", headers=headers)).json()['quantity'] == 14


@pytest.mark.parametrize('kind', ['categories', 'items'])
async def test_concurrent_duplicate_names_have_one_winner(client, kind):
    _, headers, category, _ = await seed(client)
    payload = {'name': 'Concurrent Name', 'categoryId': category['id']}
    results = await asyncio.gather(*(client.post(f'/api/v1/{kind}', headers=headers, json=payload) for _ in range(4)))
    assert sorted(result.status_code for result in results) == [201, 409, 409, 409]


async def test_long_category_name_does_not_overflow_activity(client):
    _, headers = await register_and_auth(client)
    category = await create_category(client, headers, name='C' * 250, description=None)
    assert category['name'] == 'C' * 250
    assert (await client.delete(f"/api/v1/categories/{category['id']}", headers=headers)).status_code == 200


async def test_partial_apply_failure_preserves_stocks_versions_order_and_audit(client, monkeypatch):
    _, headers, category, first = await seed(client)
    second = await create_item(client, headers, category_id=category['id'], name='Second', quantity=20)
    order = await create_order(client, headers, items=[order_item_payload(first), order_item_payload(second)])
    await client.patch(f"/api/v1/orders/{order['id']}/status", headers=headers, json={'status': 'received'})
    original, count = orders.log_audit, 0

    async def fail_second(*args, **kwargs):
        nonlocal count
        count += 1
        if count == 2:
            raise RuntimeError('Synthetic failure')
        await original(*args, **kwargs)

    monkeypatch.setattr(orders, 'log_audit', fail_second)
    async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url='http://test') as failing:
        assert (await failing.post(f"/api/v1/orders/{order['id']}/apply", headers=headers)).status_code == 500
    assert (await client.get(f"/api/v1/orders/{order['id']}", headers=headers)).json()['status'] == 'received'
    for item in (first, second):
        actual = (await client.get(f"/api/v1/items/{item['id']}", headers=headers)).json()
        assert (actual['quantity'], actual['version']) == (item['quantity'], item['version'])
    async with TestSession() as db:
        assert await db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action == 'stock_update')) == 0
        assert await db.scalar(select(func.count()).select_from(Item)) == 2


async def test_real_access_formatter_and_exception_logs_redact_capabilities(caplog):
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(AccessFormatter('%(client_addr)s - "%(request_line)s" %(status_code)s', use_colors=False))
    logger = logging.getLogger('uvicorn.access')
    original_level = logger.level
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    try:
        for path in ('/api/v1/auth/reset-password?token=synthetic-secret', '/api/v1/auth/verify-email/synthetic-secret', '/api/v1/auth/confirm-delete/synthetic-secret'):
            logger.info('%s - "%s %s HTTP/%s" %d', '127.0.0.1', 'GET', path, '1.1', 200)
    finally:
        logger.removeHandler(handler)
        logger.setLevel(original_level)
    assert 'synthetic-secret' not in stream.getvalue()
    assert 'GET /api/v1/auth/' in stream.getvalue()
    try:
        raise ValueError('synthetic-password-hash and private@example.com')
    except ValueError:
        logging.getLogger('carekosh.test').exception('Database failure')
    assert 'synthetic-password-hash' not in caplog.text and 'private@example.com' not in caplog.text
    assert 'exception=ValueError' in caplog.text


async def test_telemetry_drops_request_secrets_and_exception_values():
    marker = 'synthetic-secret'
    event = {'request': {'url': f'https://example.com/api/v1/auth/confirm-delete/{marker}?token={marker}', 'data': marker, 'headers': {'Authorization': marker}}, 'exception': {'values': [{'type': 'IntegrityError', 'value': marker, 'stacktrace': {'frames': [{'function': 'save', 'vars': {'password': marker}}]}}]}, 'breadcrumbs': {'values': [{'message': marker}]}, 'extra': {'sql': marker}}
    cleaned = scrub_telemetry_event(event, {})
    assert marker not in str(cleaned)
    assert cleaned['exception']['values'][0]['type'] == 'IntegrityError'


@pytest.mark.parametrize('email,verified,allowed', [
    (None, False, False), ('verified@example.com', False, False), ('verified@example.com', True, True),
])
async def test_verified_dependency_requires_a_verified_email(email, verified, allowed):
    from fastapi import HTTPException
    user = User(email=email, is_email_verified=verified)
    if allowed:
        assert await deps.get_current_verified_user(user) is user
    else:
        with pytest.raises(HTTPException) as error:
            await deps.get_current_verified_user(user)
        assert error.value.status_code == 403


async def test_oversized_request_bodies_are_refused_before_parsing(client: AsyncClient):
    """Every API route caps its body (2 MB); AI routes refuse anonymous uploads unread."""
    _, headers = await register_and_auth(client, name="Body Owner", email="body-owner@test.com")
    category = await create_category(client, headers, name="Body Category")
    huge = {"categoryId": category["id"], "name": "Big", "description": "d" * 2_100_000}
    resp = await client.post("/api/v1/items", headers=headers, json=huge)
    assert resp.status_code == 413
    assert resp.json() == {"detail": "Request is too large."}
    assert (await client.get("/api/v1/items", headers=headers)).json()["total"] == 0

    async def chunks():
        for _ in range(30):
            yield b"x" * 100_000

    streamed = await client.post(
        "/api/v1/items",
        headers={**headers, "content-type": "application/json"},
        content=chunks(),
    )
    assert streamed.status_code == 413

    anonymous_audio = await client.post(
        "/api/v1/ai/transcribe",
        headers={"content-type": "multipart/form-data; boundary=zzz"},
        content=b"x" * 850_000,
    )
    assert anonymous_audio.status_code == 401
    assert anonymous_audio.headers["www-authenticate"] == "Bearer"

    preflight = await client.options(
        "/api/v1/ai/interpret",
        headers={"Origin": "https://example.com", "Access-Control-Request-Method": "POST"},
    )
    assert preflight.status_code == 200
