"""
VitalTrack — Comprehensive Auth Integration Test Suite

Verified against actual endpoint behavior (auth.py source):
  - Register returns 201 Created
  - Duplicate email/username returns 400 Bad Request
  - Login returns 200 OK
  - Wrong credentials returns 401 Unauthorized
  - Token type enforcement: refresh cannot be used as access

Test users: 5 email-based + 4 username-only + dual-identifier
11 test classes · 55 tests
"""

import pytest
from httpx import AsyncClient
from tests.conftest import register_user, login_user, auth_header


# =============================================================================
# 1. REGISTRATION — USERNAME ONLY
# =============================================================================
class TestRegistrationUsername:

    @pytest.mark.asyncio
    async def test_register_with_username(self, client: AsyncClient):
        data = await register_user(client, name="Frank", username="frank")
        assert data["access_token"]
        assert data["refresh_token"]
        assert data["token_type"] == "bearer"
        assert data["user"]["username"] == "frank"
        assert data["user"]["name"] == "Frank"
        assert data["user"]["email"] is None
        assert data["user"]["isActive"] is True

    @pytest.mark.asyncio
    async def test_register_multiple_usernames(self, client: AsyncClient):
        for name, uname in [("Grace", "grace"), ("Heidi", "heidi"), ("Ivan", "ivan")]:
            data = await register_user(client, name=name, username=uname)
            assert data["user"]["username"] == uname


# =============================================================================
# 2. REGISTRATION — WITH EMAIL
# =============================================================================
class TestRegistrationEmail:

    @pytest.mark.asyncio
    async def test_register_with_email(self, client: AsyncClient):
        data = await register_user(client, name="Alice", email="alice@test.com")
        assert data["access_token"]
        assert data["user"]["email"] == "alice@test.com"
        assert data["user"]["isEmailVerified"] is False

    @pytest.mark.asyncio
    async def test_register_multiple_emails(self, client: AsyncClient):
        for name, email in [("Bob", "bob@test.com"), ("Carol", "carol@test.com"), ("Eve", "eve@test.com")]:
            data = await register_user(client, name=name, email=email)
            assert data["user"]["email"] == email

    @pytest.mark.asyncio
    async def test_register_dual_identifier(self, client: AsyncClient):
        """User provides both email and username."""
        resp = await client.post("/api/v1/auth/register", json={
            "name": "Dave", "email": "dave@test.com",
            "username": "dave", "password": "TestPass1",
        })
        assert resp.status_code in [200, 201]
        data = resp.json()
        assert data["user"]["email"] == "dave@test.com"
        assert data["user"]["username"] == "dave"


# =============================================================================
# 3. REGISTRATION — ERROR CASES
# =============================================================================
class TestRegistrationErrors:

    @pytest.mark.asyncio
    async def test_duplicate_username_rejected(self, client: AsyncClient):
        """auth.py returns 400 for duplicate username."""
        await register_user(client, name="First", username="frank")
        resp = await client.post("/api/v1/auth/register", json={
            "name": "Imposter", "username": "frank", "password": "TestPass1",
        })
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_duplicate_email_rejected(self, client: AsyncClient):
        """auth.py returns 400 for duplicate email."""
        await register_user(client, name="Alice", email="alice@test.com")
        resp = await client.post("/api/v1/auth/register", json={
            "name": "Fake", "email": "alice@test.com", "password": "TestPass1",
        })
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_no_identifier_rejected(self, client: AsyncClient):
        """Must provide email or username."""
        resp = await client.post("/api/v1/auth/register", json={
            "name": "Nobody", "password": "TestPass1",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_missing_name_rejected(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "username": "noname", "password": "TestPass1",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_uppercase_username_rejected(self, client: AsyncClient):
        """Pydantic pattern ^[a-z0-9_]+$ rejects uppercase before validator normalizes."""
        resp = await client.post("/api/v1/auth/register", json={
            "name": "Upper", "username": "UPPER_USER", "password": "TestPass1",
        })
        assert resp.status_code == 422

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

    @pytest.mark.asyncio
    async def test_empty_body_rejected(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_missing_password_rejected(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "name": "NoPass", "username": "nopass",
        })
        assert resp.status_code == 422


# =============================================================================
# 4. PASSWORD VALIDATION
# Rules: min 8 chars, 1 uppercase, 1 lowercase, 1 digit
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
        assert resp.status_code in [200, 201]

    @pytest.mark.asyncio
    async def test_boundary_exactly_8_chars(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "name": "X", "username": "eight", "password": "Abcdef1x",
        })
        assert resp.status_code in [200, 201]


# =============================================================================
# 5. LOGIN
# =============================================================================
class TestLogin:

    @pytest.mark.asyncio
    async def test_login_by_username(self, client: AsyncClient):
        await register_user(client, name="Frank", username="frank")
        data = await login_user(client, "frank", "TestPass1")
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_login_by_email(self, client: AsyncClient):
        await register_user(client, name="Alice", email="alice@test.com")
        data = await login_user(client, "alice@test.com", "TestPass1")
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_login_dual_via_username(self, client: AsyncClient):
        await client.post("/api/v1/auth/register", json={
            "name": "Dave", "email": "dave@test.com",
            "username": "dave", "password": "TestPass1",
        })
        data = await login_user(client, "dave", "TestPass1")
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_login_dual_via_email(self, client: AsyncClient):
        await client.post("/api/v1/auth/register", json={
            "name": "Dave", "email": "dave@test.com",
            "username": "dave", "password": "TestPass1",
        })
        data = await login_user(client, "dave@test.com", "TestPass1")
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_wrong_password_401(self, client: AsyncClient):
        await register_user(client, name="Frank", username="frank")
        resp = await client.post("/api/v1/auth/login", json={
            "identifier": "frank", "password": "Wrong1234",
        })
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_nonexistent_user_401(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/login", json={
            "identifier": "ghost", "password": "TestPass1",
        })
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_case_insensitive_login(self, client: AsyncClient):
        await register_user(client, name="Frank", username="frank")
        data = await login_user(client, "FRANK", "TestPass1")
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_sql_injection_in_identifier(self, client: AsyncClient):
        """OWASP: verify SQLi in login identifier is harmless."""
        resp = await client.post("/api/v1/auth/login", json={
            "identifier": "' OR 1=1 --", "password": "TestPass1",
        })
        assert resp.status_code in [401, 422]


# =============================================================================
# 6. TOKEN LIFECYCLE — access, refresh, rotation, reuse detection
# =============================================================================
class TestTokenLifecycle:

    @pytest.mark.asyncio
    async def test_access_token_grants_profile(self, client: AsyncClient):
        user = await register_user(client, name="Grace", username="grace")
        resp = await client.get("/api/v1/auth/me", headers=auth_header(user["access_token"]))
        assert resp.status_code == 200
        assert resp.json()["username"] == "grace"

    @pytest.mark.asyncio
    async def test_no_token_401(self, client: AsyncClient):
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_fake_token_401(self, client: AsyncClient):
        resp = await client.get("/api/v1/auth/me", headers=auth_header("fake.jwt.token"))
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_refresh_token_cannot_access_profile(self, client: AsyncClient):
        """Security: refresh token type != 'access', must be rejected."""
        user = await register_user(client, name="Grace", username="grace")
        resp = await client.get(
            "/api/v1/auth/me", headers=auth_header(user["refresh_token"])
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_refresh_returns_new_pair(self, client: AsyncClient):
        user = await register_user(client, name="Grace", username="grace")
        resp = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": user["refresh_token"]},
        )
        assert resp.status_code == 200
        new = resp.json()
        assert new["access_token"] != user["access_token"]
        assert new["refresh_token"] != user["refresh_token"]

    @pytest.mark.asyncio
    async def test_old_refresh_revoked_after_rotation(self, client: AsyncClient):
        """After refresh, the old token must be revoked (theft detection)."""
        user = await register_user(client, name="Grace", username="grace")
        old = user["refresh_token"]
        await client.post("/api/v1/auth/refresh", json={"refresh_token": old})
        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": old})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_new_refresh_works_after_rotation(self, client: AsyncClient):
        user = await register_user(client, name="Grace", username="grace")
        r1 = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": user["refresh_token"]},
        )
        r2 = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": r1.json()["refresh_token"]},
        )
        assert r2.status_code == 200

    @pytest.mark.asyncio
    async def test_new_access_works_after_refresh(self, client: AsyncClient):
        user = await register_user(client, name="Grace", username="grace")
        r = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": user["refresh_token"]},
        )
        p = await client.get(
            "/api/v1/auth/me",
            headers=auth_header(r.json()["access_token"]),
        )
        assert p.status_code == 200
        assert p.json()["username"] == "grace"


# =============================================================================
# 7. LOGOUT
# =============================================================================
class TestLogout:

    @pytest.mark.asyncio
    async def test_logout_succeeds(self, client: AsyncClient):
        user = await register_user(client, name="Frank", username="frank")
        resp = await client.post(
            "/api/v1/auth/logout",
            json={"refresh_token": user["refresh_token"]},
            headers=auth_header(user["access_token"]),
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_refresh_revoked_after_logout(self, client: AsyncClient):
        user = await register_user(client, name="Frank", username="frank")
        await client.post(
            "/api/v1/auth/logout",
            json={"refresh_token": user["refresh_token"]},
            headers=auth_header(user["access_token"]),
        )
        resp = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": user["refresh_token"]},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_can_login_again_after_logout(self, client: AsyncClient):
        user = await register_user(client, name="Frank", username="frank")
        await client.post(
            "/api/v1/auth/logout",
            json={"refresh_token": user["refresh_token"]},
            headers=auth_header(user["access_token"]),
        )
        data = await login_user(client, "frank", "TestPass1")
        assert "access_token" in data


# =============================================================================
# 8. PASSWORD CHANGE
# =============================================================================
class TestPasswordChange:

    @pytest.mark.asyncio
    async def test_change_succeeds(self, client: AsyncClient):
        user = await register_user(client, name="Heidi", username="heidi")
        resp = await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "TestPass1", "new_password": "NewPass99"},
            headers=auth_header(user["access_token"]),
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_new_password_works(self, client: AsyncClient):
        user = await register_user(client, name="Heidi", username="heidi")
        await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "TestPass1", "new_password": "NewPass99"},
            headers=auth_header(user["access_token"]),
        )
        data = await login_user(client, "heidi", "NewPass99")
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_old_password_fails_after_change(self, client: AsyncClient):
        user = await register_user(client, name="Heidi", username="heidi")
        await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "TestPass1", "new_password": "NewPass99"},
            headers=auth_header(user["access_token"]),
        )
        resp = await client.post("/api/v1/auth/login", json={
            "identifier": "heidi", "password": "TestPass1",
        })
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_wrong_current_password_rejected(self, client: AsyncClient):
        user = await register_user(client, name="Heidi", username="heidi")
        resp = await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "WrongOld1", "new_password": "NewPass99"},
            headers=auth_header(user["access_token"]),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_weak_new_password_rejected(self, client: AsyncClient):
        user = await register_user(client, name="Heidi", username="heidi")
        resp = await client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "TestPass1", "new_password": "weak"},
            headers=auth_header(user["access_token"]),
        )
        assert resp.status_code == 422


# =============================================================================
# 9. DATA PERSISTENCE — profile data survives logout/login/refresh
# =============================================================================
class TestDataPersistence:

    @pytest.mark.asyncio
    async def test_profile_survives_relogin(self, client: AsyncClient):
        user = await register_user(
            client, name="Dave", email="dave@test.com", username="dave"
        )
        p1 = (await client.get(
            "/api/v1/auth/me", headers=auth_header(user["access_token"])
        )).json()

        await client.post(
            "/api/v1/auth/logout",
            json={"refresh_token": user["refresh_token"]},
            headers=auth_header(user["access_token"]),
        )

        login = await login_user(client, "dave", "TestPass1")
        p2 = (await client.get(
            "/api/v1/auth/me", headers=auth_header(login["access_token"])
        )).json()

        assert p1["id"] == p2["id"]
        assert p1["email"] == p2["email"]
        assert p1["username"] == p2["username"]
        assert p1["name"] == p2["name"]

    @pytest.mark.asyncio
    async def test_profile_survives_refresh(self, client: AsyncClient):
        user = await register_user(client, name="Eve", email="eve@test.com")
        p1 = (await client.get(
            "/api/v1/auth/me", headers=auth_header(user["access_token"])
        )).json()

        r = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": user["refresh_token"]},
        )
        p2 = (await client.get(
            "/api/v1/auth/me", headers=auth_header(r.json()["access_token"])
        )).json()

        assert p1["id"] == p2["id"]
        assert p1["email"] == p2["email"]

    @pytest.mark.asyncio
    async def test_same_user_via_email_and_username(self, client: AsyncClient):
        await client.post("/api/v1/auth/register", json={
            "name": "Dave", "email": "dave@test.com",
            "username": "dave", "password": "TestPass1",
        })
        via_email = await login_user(client, "dave@test.com", "TestPass1")
        via_uname = await login_user(client, "dave", "TestPass1")
        assert via_email["user"]["id"] == via_uname["user"]["id"]


# =============================================================================
# 10. SESSION ISOLATION — multi-user, concurrent sessions
# =============================================================================
class TestSessionIsolation:

    @pytest.mark.asyncio
    async def test_two_users_have_separate_profiles(self, client: AsyncClient):
        alice = await register_user(client, name="Alice", email="alice@test.com")
        frank = await register_user(client, name="Frank", username="frank")

        pa = (await client.get(
            "/api/v1/auth/me", headers=auth_header(alice["access_token"])
        )).json()
        pf = (await client.get(
            "/api/v1/auth/me", headers=auth_header(frank["access_token"])
        )).json()

        assert pa["name"] == "Alice"
        assert pf["name"] == "Frank"
        assert pa["id"] != pf["id"]

    @pytest.mark.asyncio
    async def test_logout_one_user_other_unaffected(self, client: AsyncClient):
        alice = await register_user(client, name="Alice", email="alice@test.com")
        frank = await register_user(client, name="Frank", username="frank")

        await client.post(
            "/api/v1/auth/logout",
            json={"refresh_token": alice["refresh_token"]},
            headers=auth_header(alice["access_token"]),
        )

        resp = await client.get(
            "/api/v1/auth/me", headers=auth_header(frank["access_token"])
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_concurrent_sessions_same_user(self, client: AsyncClient):
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

        await client.post(
            "/api/v1/auth/logout",
            json={"refresh_token": s1["refresh_token"]},
            headers=auth_header(s1["access_token"]),
        )

        resp = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": s2["refresh_token"]},
        )
        assert resp.status_code == 200


# =============================================================================
# 11. HEALTH & DIAGNOSTICS
# =============================================================================
class TestHealthDiagnostics:

    @pytest.mark.asyncio
    async def test_health_endpoint(self, client: AsyncClient):
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "healthy"

    @pytest.mark.asyncio
    async def test_email_service_status(self, client: AsyncClient):
        resp = await client.get("/api/v1/auth/email-service-status")
        assert resp.status_code == 200
        assert "message" in resp.json()

    @pytest.mark.asyncio
    async def test_root_endpoint(self, client: AsyncClient):
        resp = await client.get("/")
        assert resp.status_code == 200
        body = resp.json()
        assert "name" in body
        assert "version" in body
