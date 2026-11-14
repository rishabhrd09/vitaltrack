"""Browser transport and rotation regression tests against disposable PostgreSQL."""
import asyncio
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, update
from app.core.config import settings
from app.main import app, create_app
from app.models import RefreshToken, User
from app.api.v1.web_auth import cookie_settings
from tests.conftest import TestSession, register_user

ORIGIN = 'https://app.carekosh.com'
HEADERS = {'Origin': ORIGIN, 'X-CareKosh-Web': '1', 'Sec-Fetch-Site': 'same-site'}

@pytest.fixture(autouse=True)
def browser_settings(monkeypatch):
    monkeypatch.setattr(settings, 'WEB_AUTH_ENABLED', True)
    monkeypatch.setattr(settings, 'WEB_APP_ORIGINS', [ORIGIN])
    monkeypatch.setattr(settings, 'CORS_ORIGINS', [ORIGIN])

async def browser_login(client):
    await register_user(client, name='Browser test', email='browser@test.com')
    response = await client.post('/api/v1/web-auth/login', headers=HEADERS, json={'identifier':'browser@test.com','password':'TestPass1'})
    assert response.status_code == 200, response.text
    return response

async def test_cookie_is_http_only_scoped_and_not_in_json(client, monkeypatch):
    monkeypatch.setattr(settings, 'ENVIRONMENT', 'production')
    response = await browser_login(client)
    cookie = response.headers['set-cookie']
    assert '__Secure-carekosh_refresh=' in cookie
    assert 'HttpOnly' in cookie and 'Secure' in cookie and 'SameSite=strict' in cookie
    assert 'Path=/api/v1/web-auth' in cookie and 'Domain=' not in cookie
    assert 'refresh_token' not in response.json()
    assert response.headers['cache-control'] == 'no-store'
    auth = {'Authorization': 'Bearer '+response.json()['access_token']}
    assert (await client.get('/api/v1/auth/me', headers=auth)).status_code == 200

@pytest.mark.parametrize('headers', [{}, {'Origin':'null','X-CareKosh-Web':'1'}, {'Origin':'https://evil.example','X-CareKosh-Web':'1'}, {'Origin':ORIGIN}, {**HEADERS,'Sec-Fetch-Site':'cross-site'}])
async def test_origin_and_csrf_header_are_required(client, headers):
    result = await client.post('/api/v1/web-auth/login',headers=headers,json={'identifier':'a','password':'x'})
    assert result.status_code == 403
    assert result.headers['cache-control'] == 'no-store'

async def test_rotation_then_logout_revokes_descendants_from_stale_cookie(client):
    first = await browser_login(client)
    name = cookie_settings()[0]
    initial = first.cookies.get(name)
    rotation = await client.post('/api/v1/web-auth/refresh',headers=HEADERS)
    assert rotation.status_code == 200, rotation.text
    current = rotation.cookies.get(name)
    assert current != initial
    # A logout sent before the refresh response could still carry the old cookie.
    result = await client.post('/api/v1/web-auth/logout',headers={**HEADERS,'Cookie':f'{name}={initial}'})
    assert result.status_code == 200
    assert 'Max-Age=0' in result.headers['set-cookie']
    later = await client.post('/api/v1/web-auth/refresh',headers={**HEADERS,'Cookie':f'{name}={current}'})
    assert later.status_code == 401

async def test_failed_login_keeps_the_current_browser_session(client):
    await browser_login(client)
    failed = await client.post('/api/v1/web-auth/login', headers=HEADERS, json={'identifier':'browser@test.com','password':'WrongPass1'})
    assert failed.status_code == 401
    assert (await client.post('/api/v1/web-auth/refresh', headers=HEADERS)).status_code == 200

async def test_successful_login_replaces_the_previous_browser_session(client):
    first = await browser_login(client)
    name = cookie_settings()[0]
    replaced = first.cookies.get(name)
    again = await client.post('/api/v1/web-auth/login', headers=HEADERS, json={'identifier':'browser@test.com','password':'TestPass1'})
    assert again.status_code == 200
    stale = await client.post('/api/v1/web-auth/refresh', headers={**HEADERS, 'Cookie': f'{name}={replaced}'})
    assert stale.status_code == 401
    assert (await client.post('/api/v1/web-auth/refresh', headers=HEADERS)).status_code == 200

async def test_parallel_refresh_has_one_winner(client):
    first = await browser_login(client)
    name=cookie_settings()[0]
    headers={**HEADERS,'Cookie':f'{name}={first.cookies.get(name)}'}
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as other:
        results=await asyncio.gather(other.post('/api/v1/web-auth/refresh',headers=headers),client.post('/api/v1/web-auth/refresh',headers=headers))
    assert sorted(r.status_code for r in results)==[200,401]

async def test_browser_logout_does_not_log_out_android(client):
    mobile=await register_user(client,name='Browser test',email='browser@test.com')
    web=await client.post('/api/v1/web-auth/login',headers=HEADERS,json={'identifier':'browser@test.com','password':'TestPass1'})
    assert web.status_code==200
    await client.post('/api/v1/web-auth/logout',headers=HEADERS)
    android=await client.post('/api/v1/auth/refresh',json={'refresh_token':mobile['refresh_token']})
    assert android.status_code==200
    assert android.json()['refresh_token']

async def test_mobile_refresh_cannot_be_used_as_browser_cookie(client):
    mobile=await register_user(client,name='Mobile',email='mobile@test.com')
    response=await client.post('/api/v1/web-auth/refresh',headers={**HEADERS,'Cookie':f'{cookie_settings()[0]}={mobile["refresh_token"]}'})
    assert response.status_code==401

async def test_registration_returns_no_tokens_and_is_not_a_session(client):
    response=await client.post('/api/v1/web-auth/register',headers=HEADERS,json={'name':'New browser','email':'newbrowser@test.com','password':'TestPass1'})
    assert response.status_code==201, response.text
    assert set(response.json())=={'verificationRequired','user'}
    assert 'set-cookie' not in response.headers
    async with TestSession() as db:
        tokens=(await db.scalars(select(RefreshToken))).all()
        assert tokens and all(t.is_revoked for t in tokens)

async def test_session_generation_invalidates_browser_refresh(client):
    response=await browser_login(client)
    async with TestSession() as db:
        await db.execute(update(User).where(User.id==response.json()['user']['id']).values(session_version=99))
        await db.commit()
    assert (await client.post('/api/v1/web-auth/refresh',headers=HEADERS)).status_code==401

async def test_disabled_account_cannot_refresh(client):
    response=await browser_login(client)
    async with TestSession() as db:
        await db.execute(update(User).where(User.id==response.json()['user']['id']).values(is_active=False))
        await db.commit()
    assert (await client.post('/api/v1/web-auth/refresh',headers=HEADERS)).status_code==401

async def test_explicit_cors_preflight(client):
    fresh=create_app()
    async with AsyncClient(transport=ASGITransport(app=fresh),base_url='http://test') as c:
        response=await c.options('/api/v1/web-auth/login',headers={'Origin':ORIGIN,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-carekosh-web'})
        assert response.status_code==200
        assert response.headers['access-control-allow-origin']==ORIGIN
        assert response.headers['access-control-allow-credentials']=='true'
        bad=await c.options('/api/v1/web-auth/login',headers={'Origin':'https://other.example','Access-Control-Request-Method':'POST'})
        assert bad.status_code==400

async def test_wildcard_cors_fails_when_web_auth_enabled(monkeypatch):
    monkeypatch.setattr(settings,'CORS_ORIGINS',['*'])
    with pytest.raises(RuntimeError,match='explicit WEB_APP_ORIGINS'):
        create_app()
