"""
VitalTrack — Comprehensive Auth Integration Test Suite

Verified against actual endpoint behavior (auth.py source):
  - Register returns 201 Created
  - Duplicate email/username returns 400 Bad Request
  - Login returns 200 OK
  - Wrong credentials returns 401 Unauthorized
  - Token type enforcement: refresh cannot be used as access

Test users: 5 email-based + 4 username-only + dual-identifier
13 test classes · 60 tests
"""

import hashlib
import html
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from httpx import AsyncClient

from app.api.v1 import auth as auth_routes
from app.models import User
from tests.conftest import TestSession, register_user, login_user, auth_header


MALICIOUS_RESET_TOKEN = "abc'\");</script><script>alert(1)</script>"


async def _set_deletion_token(
    email: str,
    token: str,
    expires_at: datetime | None = None,
) -> str:
    async with TestSession() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one()
        user.deletion_token = hashlib.sha256(token.encode()).hexdigest()
        user.deletion_token_expires = expires_at or (
            datetime.now(timezone.utc) + timedelta(hours=1)
        )
        user_id = str(user.id)
        await session.commit()
        return user_id


async def _set_password_reset_token(
    email: str,
    token: str,
    expires_at: datetime | None = None,
) -> None:
    async with TestSession() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one()
        user.password_reset_token = hashlib.sha256(token.encode()).hexdigest()
        user.password_reset_expiry = expires_at or (
            datetime.now(timezone.utc) + timedelta(hours=1)
        )
        await session.commit()


async def _user_exists(user_id: str) -> bool:
    async with TestSession() as session:
        return await session.get(User, user_id) is not None


def _reset_password_script(html_source: str) -> str:
    script_start = html_source.index("<script>")
    script_end = html_source.index("</script>", script_start)
    return html_source[script_start:script_end]


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
        assert data["user"]["email"] == "frank@test.com"
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
            "name": "Imposter", "email": "imposter@test.com", "username": "frank", "password": "TestPass1",
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
            "name": "X", "email": "shortpw@test.com", "username": "shortpw", "password": "Ab1",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_no_uppercase(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "name": "X", "email": "noup@test.com", "username": "noup", "password": "testpass1",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_no_lowercase(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "name": "X", "email": "nolow@test.com", "username": "nolow", "password": "TESTPASS1",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_no_digit(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "name": "X", "email": "nodig@test.com", "username": "nodig", "password": "TestPass",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_valid_password(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "name": "X", "email": "goodpw@test.com", "username": "goodpw", "password": "MyPass99",
        })
        assert resp.status_code in [200, 201]

    @pytest.mark.asyncio
    async def test_boundary_exactly_8_chars(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/register", json={
            "name": "X", "email": "eight@test.com", "username": "eight", "password": "Abcdef1x",
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
        # Refresh tokens always differ (unique jti). Access tokens CAN match
        # if issued in the same second (same iat/exp/sub → identical JWT).
        assert new["refresh_token"] != user["refresh_token"]
        assert new["access_token"]

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
# 9. PASSWORD RESET — HTML token escaping and POST contract
# =============================================================================
class TestPasswordReset:

    @pytest.mark.asyncio
    async def test_reset_password_form_renders_for_normal_token(
        self, client: AsyncClient
    ):
        resp = await client.get(
            "/api/v1/auth/reset-password",
            params={"token": "normal-reset-token"},
        )

        assert resp.status_code == 200
        assert "Reset Your Password" in resp.text
        assert 'id="form-container"' in resp.text
        assert 'data-token="normal-reset-token"' in resp.text
        assert "async function resetPassword()" in resp.text

    @pytest.mark.asyncio
    async def test_reset_password_form_escapes_crafted_token(
        self, client: AsyncClient
    ):
        resp = await client.get(
            "/api/v1/auth/reset-password",
            params={"token": MALICIOUS_RESET_TOKEN},
        )

        escaped_token = html.escape(MALICIOUS_RESET_TOKEN, quote=True)
        assert resp.status_code == 200
        assert f'data-token="{escaped_token}"' in resp.text
        assert MALICIOUS_RESET_TOKEN not in resp.text

    @pytest.mark.asyncio
    async def test_reset_password_script_does_not_contain_raw_crafted_token(
        self, client: AsyncClient
    ):
        resp = await client.get(
            "/api/v1/auth/reset-password",
            params={"token": MALICIOUS_RESET_TOKEN},
        )

        script = _reset_password_script(resp.text)
        assert MALICIOUS_RESET_TOKEN not in script
        assert "const token = document.getElementById('form-container').dataset.token;" in script
        assert "JSON.stringify({ token, new_password: password })" in script

    @pytest.mark.asyncio
    async def test_reset_password_old_inline_token_pattern_is_gone(
        self, client: AsyncClient
    ):
        resp = await client.get(
            "/api/v1/auth/reset-password",
            params={"token": MALICIOUS_RESET_TOKEN},
        )

        script = _reset_password_script(resp.text)
        assert f"token: '{MALICIOUS_RESET_TOKEN}'" not in resp.text
        assert "token: '{token}'" not in resp.text
        assert "token: '" not in script

    @pytest.mark.asyncio
    async def test_post_reset_password_contract_still_works(
        self, client: AsyncClient, monkeypatch: pytest.MonkeyPatch
    ):
        async def fake_send_password_changed_notification(**kwargs) -> bool:
            return True

        monkeypatch.setattr(
            auth_routes,
            "send_password_changed_notification",
            fake_send_password_changed_notification,
        )

        raw_token = "valid-reset-token"
        await register_user(
            client,
            name="Reset User",
            email="reset-post@test.com",
            password="OldPass1",
        )
        await _set_password_reset_token("reset-post@test.com", raw_token)

        resp = await client.post(
            "/api/v1/auth/reset-password",
            json={"token": raw_token, "new_password": "NewPass99"},
        )

        assert resp.status_code == 200
        assert resp.json()["message"] == (
            "Password reset successfully! Please log in with your new password."
        )

        old_login = await client.post(
            "/api/v1/auth/login",
            json={"identifier": "reset-post@test.com", "password": "OldPass1"},
        )
        new_login = await login_user(client, "reset-post@test.com", "NewPass99")

        assert old_login.status_code == 401
        assert "access_token" in new_login


# =============================================================================
# 10. DATA PERSISTENCE — profile data survives logout/login/refresh
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
# 11. ACCOUNT DELETION CONFIRMATION — GET is safe, POST is destructive
# =============================================================================
class TestAccountDeletionConfirmation:

    @pytest.mark.asyncio
    async def test_get_confirm_delete_valid_token_does_not_delete_user(
        self, client: AsyncClient
    ):
        raw_token = "safe-get-token"
        user = await register_user(
            client, name="Delete Preview", email="delete-preview@test.com"
        )
        user_id = await _set_deletion_token("delete-preview@test.com", raw_token)

        resp = await client.get(f"/api/v1/auth/confirm-delete/{raw_token}")

        assert resp.status_code == 200
        assert "Confirm Account Deletion" in resp.text
        assert 'method="post"' in resp.text
        assert 'action=""' in resp.text
        assert "has not been deleted yet" in resp.text
        assert "Account Deleted" not in resp.text
        assert await _user_exists(user_id)
        assert user["user"]["email"] == "delete-preview@test.com"

    @pytest.mark.asyncio
    async def test_post_confirm_delete_valid_token_deletes_user(
        self, client: AsyncClient
    ):
        raw_token = "post-delete-token"
        await register_user(client, name="Delete Me", email="post-delete@test.com")
        user_id = await _set_deletion_token("post-delete@test.com", raw_token)

        resp = await client.post(f"/api/v1/auth/confirm-delete/{raw_token}")

        assert resp.status_code == 200
        assert "Account Deleted" in resp.text
        assert "post-delete@test.com" in resp.text
        assert not await _user_exists(user_id)

    @pytest.mark.asyncio
    @pytest.mark.parametrize("method", ["get", "post"])
    async def test_confirm_delete_invalid_token_returns_error_and_keeps_user(
        self, client: AsyncClient, method: str
    ):
        await register_user(client, name="Invalid Token", email="invalid-token@test.com")
        user_id = await _set_deletion_token("invalid-token@test.com", "real-token")

        resp = await client.request(
            method.upper(), "/api/v1/auth/confirm-delete/wrong-token"
        )

        assert resp.status_code == 400
        assert "Invalid or Expired Link" in resp.text
        assert await _user_exists(user_id)

    @pytest.mark.asyncio
    @pytest.mark.parametrize("method", ["get", "post"])
    async def test_confirm_delete_expired_token_returns_error_and_keeps_user(
        self, client: AsyncClient, method: str
    ):
        raw_token = "expired-token"
        await register_user(client, name="Expired Token", email="expired-token@test.com")
        user_id = await _set_deletion_token(
            "expired-token@test.com",
            raw_token,
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )

        resp = await client.request(
            method.upper(), f"/api/v1/auth/confirm-delete/{raw_token}"
        )

        assert resp.status_code == 400
        assert "Invalid or Expired Link" in resp.text
        assert await _user_exists(user_id)

    @pytest.mark.asyncio
    async def test_request_and_cancel_account_deletion_still_work(
        self, client: AsyncClient, monkeypatch: pytest.MonkeyPatch
    ):
        async def fake_send_email_via_api(**kwargs) -> bool:
            return True

        monkeypatch.setattr(auth_routes, "is_email_configured", lambda: True)
        monkeypatch.setattr(auth_routes, "send_email_via_api", fake_send_email_via_api)

        user = await register_user(
            client, name="Cancel Delete", email="cancel-delete@test.com"
        )
        headers = auth_header(user["access_token"])

        delete_resp = await client.delete("/api/v1/auth/me", headers=headers)

        assert delete_resp.status_code == 200
        assert "confirmation email" in delete_resp.json()["message"]

        async with TestSession() as session:
            result = await session.execute(
                select(User).where(User.email == "cancel-delete@test.com")
            )
            db_user = result.scalar_one()
            assert db_user.deletion_token is not None
            assert db_user.deletion_token_expires is not None

        cancel_resp = await client.post("/api/v1/auth/cancel-delete", headers=headers)

        assert cancel_resp.status_code == 200
        assert cancel_resp.json()["message"] == (
            "Account deletion request has been cancelled."
        )

        async with TestSession() as session:
            result = await session.execute(
                select(User).where(User.email == "cancel-delete@test.com")
            )
            db_user = result.scalar_one()
            assert db_user.deletion_token is None
            assert db_user.deletion_token_expires is None


# =============================================================================
# 12. SESSION ISOLATION — multi-user, concurrent sessions
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
# 12. HEALTH & DIAGNOSTICS
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
