"""Exercise the real API contract behind the new origin boundary."""

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr

from app.core.config import settings
from app.core.database import get_db
from app.main import create_app
from app.utils.rate_limiter import limiter
from tests.conftest import (
    _test_db_override,
    create_category,
    create_item,
    create_order,
    order_item_payload,
    register_and_auth,
)

SECRET = "local-ingress-compatibility-test-not-a-real-secret"
ORIGIN = "https://app.carekosh.com"
EDGE = {"X-CareKosh-Origin-Verify": SECRET, "CF-Connecting-IP": "198.51.100.72"}
WEB = {"Origin": ORIGIN, "X-CareKosh-Web": "1", "Sec-Fetch-Site": "same-site"}


@pytest.fixture
def guarded_app(monkeypatch):
    monkeypatch.setattr(settings, "INGRESS_MODE", "edge_secret")
    monkeypatch.setattr(settings, "ALLOWED_HOSTS", ["api.test"])
    monkeypatch.setattr(settings, "ORIGIN_VERIFY_SECRET", SecretStr(SECRET))
    monkeypatch.setattr(settings, "WEB_AUTH_ENABLED", True)
    monkeypatch.setattr(settings, "WEB_APP_ORIGINS", [ORIGIN])
    monkeypatch.setattr(settings, "CORS_ORIGINS", [ORIGIN])
    monkeypatch.setattr(limiter, "enabled", True)
    limiter.reset()  # Global application limiter uses disposable memory in tests.
    application = create_app()
    application.dependency_overrides[get_db] = _test_db_override
    yield application
    limiter.reset()


async def test_android_register_login_refresh_inventory_orders_and_sync_behind_edge(
    guarded_app,
):
    # These extra headers simulate the EDGE, not anything added to the APK.
    async with AsyncClient(
        transport=ASGITransport(app=guarded_app),
        base_url="https://api.test",
        headers=EDGE,
    ) as client:
        registered, auth = await register_and_auth(client, email="native-edge@test.com")
        assert registered["access_token"] and registered["refresh_token"]
        login = await client.post(
            "/api/v1/auth/login",
            json={"identifier": "native-edge@test.com", "password": "TestPass1"},
        )
        assert login.status_code == 200
        rotated = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": login.json()["refresh_token"]},
        )
        assert rotated.status_code == 200 and rotated.json()["refresh_token"]
        auth = {"Authorization": f"Bearer {rotated.json()['access_token']}"}
        assert (await client.get("/api/v1/auth/me", headers=auth)).status_code == 200
        category = await create_category(client, auth)
        item = await create_item(client, auth, category_id=category["id"], quantity=5)
        order = await create_order(
            client, auth, items=[order_item_payload(item, quantity=2)]
        )
        assert order["status"] == "pending"
        assert (await client.get("/api/v1/items", headers=auth)).status_code == 200
        assert (await client.get("/api/v1/orders", headers=auth)).status_code == 200
        # Android sync uses the paginated list APIs, not a separate sync route.
        sync = await client.get("/api/v1/items?page=1&pageSize=100", headers=auth)
        assert sync.status_code == 200 and sync.json()["total"] == 1
        # Browser login/logout must not revoke a separate Android token family.
        browser = await client.post(
            "/api/v1/web-auth/login",
            headers=WEB,
            json={"identifier": "native-edge@test.com", "password": "TestPass1"},
        )
        assert browser.status_code == 200
        assert "refresh_token" not in browser.json()
        assert (
            await client.post("/api/v1/web-auth/logout", headers=WEB)
        ).status_code == 200
        native_refresh = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": rotated.json()["refresh_token"]},
        )
        assert native_refresh.status_code == 200


async def test_real_auth_routes_share_quota_and_cannot_spoof_proxy_identity(
    guarded_app,
):
    async with AsyncClient(
        transport=ASGITransport(app=guarded_app),
        base_url="https://api.test",
        headers=EDGE,
    ) as client:
        for i in range(5):
            route = "/api/v1/auth/login" if i % 2 else "/api/v1/web-auth/login"
            response = await client.post(
                route,
                headers={**WEB, "X-Forwarded-For": f"203.0.113.{i}"},
                json={"identifier": "missing@test.com", "password": "TestPass1"},
            )
            assert response.status_code == 401
        denied = await client.post(
            "/api/v1/auth/login",
            headers=WEB,
            json={"identifier": "missing@test.com", "password": "TestPass1"},
        )
        assert denied.status_code == 429
        assert denied.headers["retry-after"] == "60"
        assert denied.headers["access-control-allow-origin"] == ORIGIN


async def test_ipv6_rotation_inside_one_64_shares_the_login_quota(guarded_app):
    async with AsyncClient(
        transport=ASGITransport(app=guarded_app), base_url="https://api.test"
    ) as client:
        statuses = [
            (
                await client.post(
                    "/api/v1/auth/login",
                    headers={**EDGE, "CF-Connecting-IP": f"2001:db8:1:2::{i + 10:x}"},
                    json={"identifier": "missing@test.com", "password": "TestPass1"},
                )
            ).status_code
            for i in range(7)
        ]
    assert statuses == [401] * 5 + [429] * 2


async def test_origin_and_body_refusals_keep_browser_cors_and_native_health(
    guarded_app,
):
    async with AsyncClient(
        transport=ASGITransport(app=guarded_app), base_url="https://api.test"
    ) as client:
        denied = await client.get("/api/v1/auth/me", headers=WEB)
        assert denied.status_code == 503
        assert denied.headers["access-control-allow-origin"] == ORIGIN
        assert (await client.get("/live")).status_code == 200
        assert (await client.get("/health")).status_code == 503
        large = await client.post(
            "/api/v1/auth/login", headers={**WEB, **EDGE, "Content-Length": "2000001"}
        )
        assert (
            large.status_code == 413
            and large.headers["access-control-allow-origin"] == ORIGIN
        )
        csrf = await client.post(
            "/api/v1/web-auth/login",
            headers=EDGE,
            json={"identifier": "missing@test.com", "password": "TestPass1"},
        )
        assert csrf.status_code == 403  # Browser-origin checks remain independent.


async def test_unverified_edge_never_looks_like_a_revoked_android_session(
    guarded_app,
):
    # Installed Android builds delete their tokens on 401/403 from /auth/refresh,
    # so a missing or rotated edge secret must stay a retryable refusal.
    async with AsyncClient(
        transport=ASGITransport(app=guarded_app), base_url="https://api.test"
    ) as client:
        registered = (
            await client.post(
                "/api/v1/auth/register",
                headers=EDGE,
                json={
                    "name": "Native refresh",
                    "email": "native-refresh@test.com",
                    "password": "TestPass1",
                },
            )
        ).json()
        for headers in (
            {"CF-Connecting-IP": "198.51.100.72"},
            {**EDGE, "X-CareKosh-Origin-Verify": "rotated-secret-not-current"},
        ):
            refused = await client.post(
                "/api/v1/auth/refresh",
                headers=headers,
                json={"refresh_token": registered["refresh_token"]},
            )
            assert refused.status_code == 503
            assert refused.headers["retry-after"] == "30"
        # The refusal consumed nothing: the same token still rotates via the edge.
        rotated = await client.post(
            "/api/v1/auth/refresh",
            headers=EDGE,
            json={"refresh_token": registered["refresh_token"]},
        )
        assert rotated.status_code == 200
