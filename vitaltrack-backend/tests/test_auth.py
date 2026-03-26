"""
VitalTrack — Comprehensive Auth & Verification Test Suite

Research basis: "Test every JWT auth flow explicitly: valid login, invalid
credentials, expired tokens, refresh token rotation, and token reuse detection."

9 test users (5 email, 4 username-only) · 11 classes · 54 tests
"""

import pytest
from httpx import AsyncClient
from tests.conftest import register_user, login_user, auth_header


# =============================================================================
# 1. REGISTRATION — USERNAME ONLY (frank, grace, heidi, ivan)
# =============================================================================
class TestRegistrationUsername:

    @pytest.mark.asyncio
    async def test_register_frank(self, client: AsyncClient):
        data = await register_user(client, name="Frank", username="frank")
        assert data["access_token"]
        assert data["refresh_token"]
        assert data["token_type"] == "bearer"
        assert data["user"]["username"] == "frank"
        assert data["user"]["name"] == "Frank"
        assert data["user"]["email"] is None
        assert data["user"]["isActive"] is True

    @pytest.mark.asyncio
    async def test_register_grace(self, client: AsyncClient):
        data = await register_user(client, name="Grace", username="grace")
        assert data["user"]["username"] == "grace"

    @pytest.mark.asyncio
    async def test_register_heidi(self, client: AsyncClient):
        data = await register_user(client, name="Heidi", username="heidi")
        assert data["user"]["username"] == "heidi"

    @pytest.mark.asyncio
    async def test_register_ivan(self, client: AsyncClient):
        data = await register_user(client, name="Ivan", username="ivan")
        assert data["user"]["username"] == "ivan"


# =============================================================================
# 2. REGISTRATION — WITH EMAIL (alice, bob, carol, dave, eve)
# =============================================================================
class TestRegistrationEmail:

    @pytest.mark.asyncio
    async def test_register_alice(self, client: AsyncClient):
        data = await register_user(client, name="Alice", email="alice@test.com")
        assert data["access_token"]
        assert data["user"]["email"] == "alice@test.com"
        assert data["user"]["isEmailVerified"] is False

    @pytest.mark.asyncio
    async def test_register_bob(self, client: AsyncClient):
        data = await register_user(client, name="Bob", email="bob@test.com")
        assert data["user"]["email"] == "bob@test.com"

    @pytest.mark.asyncio
    async def test_register_carol(self, client: AsyncClient):
        data = await register_user(client, name="Carol", email="carol@test.com")
        assert data["user"]["email"] == "carol@test.com"

    @pytest.mark.asyncio
    async def test_register_dave_dual_identifier(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "name": "Dave", "email": "dave@test.com", "username": "dave", "password": "TestPass1",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["user"]["email"] == "dave@test.com"
        assert data["user"]["username"] == "dave"

    @pytest.mark.asyncio
    async def test_register_eve(self, client: AsyncClient):
        data = await register_user(client, name="Eve", email="eve@test.com")
        assert data["user"]["email"] == "eve@test.com"


# =============================================================================
# 3. REGISTRATION — ERRORS
# =============================================================================
class TestRegistrationErrors:

    @pytest.mark.asyncio
    async def test_duplicate_username_409(self, client: AsyncClient):
        await register_user(client, name="First", username="frank")
        resp = await client.post("/api/v1/auth/register", json={
            "name": "Imposter", "username": "frank", "password": "TestPass1",
        })
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_duplicate_email_409(self, client: AsyncClient):
        await register_user(client, name="Alice", email="alice@test.com")
        resp = await client.post("/api/v1/auth/register", json={
            "name": "Fake", "email": "alice@test.com", "password": "TestPass1",
        })
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_no_identifier_422(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "name": "Nobody", "password": "TestPass1",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_missing_name_422(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "username": "noname", "password": "TestPass1",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_uppercase_username_normalized(self, client: AsyncClient):
        data = await register_user(client, name="Upper", username="UPPER_USER")
        assert data["user"]["username"] == "upper_user"

    @pytest.mark.asyncio
    async def test_at_sign_in_username_rejected(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "name": "At", "username": "user@name", "password": "TestPass1",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_username_too_short_rejected(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "name": "Short", "username": "ab", "password": "TestPass1",
        })
        assert resp.status_code == 422


# =============================================================================
# 4. PASSWORD VALIDATION
# Research: "min 8, 1 upper, 1 lower, 1 digit" + boundary tests
# =============================================================================
class TestPasswordValidation:

    @pytest.mark.asyncio
    async def test_too_short(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "name": "X", "username": "shortpw", "password": "Ab1",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_no_uppercase(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "name": "X", "username": "noup", "password": "testpass1",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_no_lowercase(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "name": "X", "username": "nolow", "password": "TESTPASS1",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_no_digit(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "name": "X", "username": "nodig", "password": "TestPass",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_valid_password(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "name": "X", "username": "goodpw", "password": "MyPass99",
        })
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_boundary_exactly_8_chars(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "name": "X", "username": "eight", "password": "Abcdef1x",
        })
        assert resp.status_code == 200


# =============================================================================
# 5. LOGIN
# =============================================================================
class TestLogin:

    @pytest.mark.asyncio
    async def test_login_username(self, client: AsyncClient):
        await register_user(client, name="Frank", username="frank")
        data = await login_user(client, "frank", "TestPass1")
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_login_email(self, client: AsyncClient):
        await register_user(client, name="Alice", email="alice@test.com")
        data = await login_user(client, "alice@test.com", "TestPass1")
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_login_dual_via_username(self, client: AsyncClient):
        await client.post("/api/v1/auth/register", json={
            "name": "Dave", "email": "dave@test.com", "username": "dave", "password": "TestPass1",
        })
        data = await login_user(client, "dave", "TestPass1")
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_login_dual_via_email(self, client: AsyncClient):
        await client.post("/api/v1/auth/register", json={
            "name": "Dave", "email": "dave@test.com", "username": "dave", "password": "TestPass1",
        })
        data = await login_user(client, "dave@test.com", "TestPass1")
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_wrong_password_401(self, client: AsyncClient):
        await register_user(client, name="Frank", username="frank")
        resp = await client.post("/api/v1/auth/login", json={"identifier": "frank", "password": "Wrong1234"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_nonexistent_user_401(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/login", json={"identifier": "ghost", "password": "TestPass1"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_case_insensitive(self, client: AsyncClient):
        await register_user(client, name="Frank", username="frank")
        data = await login_user(client, "FRANK", "TestPass1")
        assert "access_token" in data


# =============================================================================
# 6. TOKEN LIFECYCLE
# Research: "refresh rotation, old token revoked, reuse detection"
# =============================================================================
class TestTokenLifecycle:

    @pytest.mark.asyncio
    async def test_access_grants_profile(self, client: AsyncClient):
        user = await register_user(client, name="Grace", username="grace")
        resp = await client.get("/api/v1/auth/me", headers=auth_header(user["access_token"]))
        assert resp.status_code == 200
        assert resp.json()["username"] == "grace"

    @pytest.mark.asyncio
    async def test_no_token_401(self, client: AsyncClient):
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code in [401, 403]

    @pytest.mark.asyncio
    async def test_fake_token_401(self, client: AsyncClient):
        resp = await client.get("/api/v1/auth/me", headers=auth_header("fake.jwt.token"))
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_refresh_new_pair(self, client: AsyncClient):
        user = await register_user(client, name="Grace", username="grace")
        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": user["refresh_token"]})
        assert resp.status_code == 200
        assert resp.json()["access_token"] != user["access_token"]
        assert resp.json()["refresh_token"] != user["refresh_token"]

    @pytest.mark.asyncio
    async def test_old_refresh_revoked(self, client: AsyncClient):
        """Research: 'if a previously-used token reappears, revoke — indicating theft'"""
        user = await register_user(client, name="Grace", username="grace")
        old = user["refresh_token"]
        await client.post("/api/v1/auth/refresh", json={"refresh_token": old})
        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": old})
        assert resp.status_code in [401, 403]

    @pytest.mark.asyncio
    async def test_new_refresh_works(self, client: AsyncClient):
        user = await register_user(client, name="Grace", username="grace")
        r1 = await client.post("/api/v1/auth/refresh", json={"refresh_token": user["refresh_token"]})
        r2 = await client.post("/api/v1/auth/refresh", json={"refresh_token": r1.json()["refresh_token"]})
        assert r2.status_code == 200

    @pytest.mark.asyncio
    async def test_new_access_works(self, client: AsyncClient):
        user = await register_user(client, name="Grace", username="grace")
        r = await client.post("/api/v1/auth/refresh", json={"refresh_token": user["refresh_token"]})
        p = await client.get("/api/v1/auth/me", headers=auth_header(r.json()["access_token"]))
        assert p.status_code == 200
        assert p.json()["username"] == "grace"


# =============================================================================
# 7. LOGOUT
# =============================================================================
class TestLogout:

    @pytest.mark.asyncio
    async def test_logout_ok(self, client: AsyncClient):
        user = await register_user(client, name="Frank", username="frank")
        resp = await client.post("/api/v1/auth/logout",
            json={"refresh_token": user["refresh_token"]},
            headers=auth_header(user["access_token"]))
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_refresh_revoked_after_logout(self, client: AsyncClient):
        user = await register_user(client, name="Frank", username="frank")
        await client.post("/api/v1/auth/logout",
            json={"refresh_token": user["refresh_token"]},
            headers=auth_header(user["access_token"]))
        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": user["refresh_token"]})
        assert resp.status_code in [401, 403]

    @pytest.mark.asyncio
    async def test_relogin_after_logout(self, client: AsyncClient):
        user = await register_user(client, name="Frank", username="frank")
        await client.post("/api/v1/auth/logout",
            json={"refresh_token": user["refresh_token"]},
            headers=auth_header(user["access_token"]))
        data = await login_user(client, "frank", "TestPass1")
        assert "access_token" in data


# =============================================================================
# 8. PASSWORD CHANGE
# =============================================================================
class TestPasswordChange:

    @pytest.mark.asyncio
    async def test_change_succeeds(self, client: AsyncClient):
        user = await register_user(client, name="Heidi", username="heidi")
        resp = await client.post("/api/v1/auth/change-password",
            json={"current_password": "TestPass1", "new_password": "NewPass99"},
            headers=auth_header(user["access_token"]))
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_new_password_works(self, client: AsyncClient):
        user = await register_user(client, name="Heidi", username="heidi")
        await client.post("/api/v1/auth/change-password",
            json={"current_password": "TestPass1", "new_password": "NewPass99"},
            headers=auth_header(user["access_token"]))
        data = await login_user(client, "heidi", "NewPass99")
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_old_password_fails(self, client: AsyncClient):
        user = await register_user(client, name="Heidi", username="heidi")
        await client.post("/api/v1/auth/change-password",
            json={"current_password": "TestPass1", "new_password": "NewPass99"},
            headers=auth_header(user["access_token"]))
        resp = await client.post("/api/v1/auth/login", json={"identifier": "heidi", "password": "TestPass1"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_wrong_current_rejected(self, client: AsyncClient):
        user = await register_user(client, name="Heidi", username="heidi")
        resp = await client.post("/api/v1/auth/change-password",
            json={"current_password": "WrongOld1", "new_password": "NewPass99"},
            headers=auth_header(user["access_token"]))
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_weak_new_rejected(self, client: AsyncClient):
        user = await register_user(client, name="Heidi", username="heidi")
        resp = await client.post("/api/v1/auth/change-password",
            json={"current_password": "TestPass1", "new_password": "weak"},
            headers=auth_header(user["access_token"]))
        assert resp.status_code == 422


# =============================================================================
# 9. DATA PERSISTENCE — profile survives logout/login/refresh
# =============================================================================
class TestDataPersistence:

    @pytest.mark.asyncio
    async def test_profile_survives_relogin(self, client: AsyncClient):
        user = await register_user(client, name="Dave", email="dave@test.com", username="dave")
        p1 = (await client.get("/api/v1/auth/me", headers=auth_header(user["access_token"]))).json()
        await client.post("/api/v1/auth/logout",
            json={"refresh_token": user["refresh_token"]},
            headers=auth_header(user["access_token"]))
        login = await login_user(client, "dave", "TestPass1")
        p2 = (await client.get("/api/v1/auth/me", headers=auth_header(login["access_token"]))).json()
        assert p1["id"] == p2["id"]
        assert p1["email"] == p2["email"]
        assert p1["username"] == p2["username"]
        assert p1["name"] == p2["name"]

    @pytest.mark.asyncio
    async def test_profile_survives_refresh(self, client: AsyncClient):
        user = await register_user(client, name="Eve", email="eve@test.com")
        p1 = (await client.get("/api/v1/auth/me", headers=auth_header(user["access_token"]))).json()
        r = await client.post("/api/v1/auth/refresh", json={"refresh_token": user["refresh_token"]})
        p2 = (await client.get("/api/v1/auth/me", headers=auth_header(r.json()["access_token"]))).json()
        assert p1["id"] == p2["id"]
        assert p1["email"] == p2["email"]

    @pytest.mark.asyncio
    async def test_same_user_via_email_and_username(self, client: AsyncClient):
        await client.post("/api/v1/auth/register", json={
            "name": "Dave", "email": "dave@test.com", "username": "dave", "password": "TestPass1",
        })
        via_email = await login_user(client, "dave@test.com", "TestPass1")
        via_uname = await login_user(client, "dave", "TestPass1")
        assert via_email["user"]["id"] == via_uname["user"]["id"]


# =============================================================================
# 10. SESSION ISOLATION — multi-user, concurrent sessions
# =============================================================================
class TestSessionIsolation:

    @pytest.mark.asyncio
    async def test_two_users_separate(self, client: AsyncClient):
        alice = await register_user(client, name="Alice", email="alice@test.com")
        frank = await register_user(client, name="Frank", username="frank")
        pa = (await client.get("/api/v1/auth/me", headers=auth_header(alice["access_token"]))).json()
        pf = (await client.get("/api/v1/auth/me", headers=auth_header(frank["access_token"]))).json()
        assert pa["name"] == "Alice"
        assert pf["name"] == "Frank"
        assert pa["id"] != pf["id"]

    @pytest.mark.asyncio
    async def test_logout_one_other_unaffected(self, client: AsyncClient):
        alice = await register_user(client, name="Alice", email="alice@test.com")
        frank = await register_user(client, name="Frank", username="frank")
        await client.post("/api/v1/auth/logout",
            json={"refresh_token": alice["refresh_token"]},
            headers=auth_header(alice["access_token"]))
        resp = await client.get("/api/v1/auth/me", headers=auth_header(frank["access_token"]))
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_concurrent_sessions(self, client: AsyncClient):
        await register_user(client, name="Ivan", username="ivan")
        s1 = await login_user(client, "ivan", "TestPass1")
        s2 = await login_user(client, "ivan", "TestPass1")
        r1 = await client.get("/api/v1/auth/me", headers=auth_header(s1["access_token"]))
        r2 = await client.get("/api/v1/auth/me", headers=auth_header(s2["access_token"]))
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"]

    @pytest.mark.asyncio
    async def test_logout_one_session_other_survives(self, client: AsyncClient):
        await register_user(client, name="Ivan", username="ivan")
        s1 = await login_user(client, "ivan", "TestPass1")
        s2 = await login_user(client, "ivan", "TestPass1")
        await client.post("/api/v1/auth/logout",
            json={"refresh_token": s1["refresh_token"]},
            headers=auth_header(s1["access_token"]))
        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": s2["refresh_token"]})
        assert resp.status_code == 200


# =============================================================================
# 11. HEALTH & DIAGNOSTICS
# =============================================================================
class TestHealthDiagnostics:

    @pytest.mark.asyncio
    async def test_health(self, client: AsyncClient):
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "healthy"

    @pytest.mark.asyncio
    async def test_email_status(self, client: AsyncClient):
        resp = await client.get("/api/v1/auth/email-service-status")
        assert resp.status_code == 200
        assert "message" in resp.json()
