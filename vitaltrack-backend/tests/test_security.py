"""
VitalTrack — Security Unit Tests

Tests for password hashing (Argon2) and JWT token creation/verification
without hitting any HTTP endpoints. These run in <1 second.

Google Testing Pyramid: unit tests form the base (70% of test count).
"""

import importlib.util
import logging
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import SecretStr

from app.core.config import Settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    create_token_pair,
    decode_token,
    hash_password,
    verify_access_token,
    verify_password,
    verify_refresh_token,
)
from app.utils import email as email_utils


def load_restore_drill_module():
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "restore_drill.py"
    spec = importlib.util.spec_from_file_location("restore_drill", script_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# =============================================================================
# PASSWORD HASHING (Argon2)
# =============================================================================
class TestPasswordHashing:

    def test_hash_is_not_plaintext(self):
        hashed = hash_password("MyPass99")
        assert hashed != "MyPass99"
        assert len(hashed) > 20

    def test_verify_correct_password(self):
        hashed = hash_password("MyPass99")
        assert verify_password("MyPass99", hashed) is True

    def test_verify_wrong_password(self):
        hashed = hash_password("MyPass99")
        assert verify_password("WrongPass1", hashed) is False

    def test_different_hashes_for_same_password(self):
        """Argon2 uses random salt — same input produces different hashes."""
        h1 = hash_password("MyPass99")
        h2 = hash_password("MyPass99")
        assert h1 != h2
        # But both verify correctly
        assert verify_password("MyPass99", h1) is True
        assert verify_password("MyPass99", h2) is True

    def test_empty_password_hashes(self):
        """Hashing doesn't crash on empty string."""
        hashed = hash_password("")
        assert verify_password("", hashed) is True
        assert verify_password("notempty", hashed) is False


# =============================================================================
# JWT TOKEN CREATION
# =============================================================================
class TestJWTCreation:

    def test_access_token_is_string(self):
        token = create_access_token(subject="user-123")
        assert isinstance(token, str)
        assert len(token) > 20

    def test_refresh_token_is_string(self):
        token = create_refresh_token(subject="user-123", jti="jti-abc")
        assert isinstance(token, str)
        assert len(token) > 20

    def test_token_pair_has_both_tokens(self):
        pair = create_token_pair(user_id="user-123", jti="jti-abc")
        assert pair.access_token
        assert pair.refresh_token
        assert pair.token_type == "bearer"
        assert pair.expires_in > 0

    def test_access_and_refresh_are_different(self):
        pair = create_token_pair(user_id="user-123", jti="jti-abc")
        assert pair.access_token != pair.refresh_token


# =============================================================================
# JWT TOKEN VERIFICATION
# =============================================================================
class TestJWTVerification:

    def test_decode_valid_access_token(self):
        token = create_access_token(subject="user-123")
        payload = decode_token(token)
        assert payload is not None
        assert payload.sub == "user-123"
        assert payload.type == "access"

    def test_decode_valid_refresh_token(self):
        token = create_refresh_token(subject="user-123", jti="jti-abc")
        payload = decode_token(token)
        assert payload is not None
        assert payload.sub == "user-123"
        assert payload.type == "refresh"
        assert payload.jti == "jti-abc"

    def test_decode_tampered_token_returns_none(self):
        token = create_access_token(subject="user-123")
        tampered = token[:-5] + "XXXXX"
        assert decode_token(tampered) is None

    def test_decode_garbage_returns_none(self):
        assert decode_token("not.a.token") is None
        assert decode_token("") is None
        assert decode_token("abc123") is None

    def test_expired_token_returns_none(self):
        token = create_access_token(
            subject="user-123",
            expires_delta=timedelta(seconds=-1),
        )
        assert decode_token(token) is None

    def test_verify_access_token_returns_user_id(self):
        token = create_access_token(subject="user-123")
        user_id = verify_access_token(token)
        assert user_id == "user-123"

    def test_verify_access_rejects_refresh_token(self):
        """Security: refresh token must NOT be usable as access token."""
        token = create_refresh_token(subject="user-123", jti="jti-abc")
        assert verify_access_token(token) is None

    def test_verify_refresh_token_returns_tuple(self):
        token = create_refresh_token(subject="user-123", jti="jti-abc")
        result = verify_refresh_token(token)
        assert result is not None
        user_id, jti = result
        assert user_id == "user-123"
        assert jti == "jti-abc"

    def test_verify_refresh_rejects_access_token(self):
        """Security: access token must NOT be usable as refresh token."""
        token = create_access_token(subject="user-123")
        assert verify_refresh_token(token) is None

    def test_verify_expired_access_returns_none(self):
        token = create_access_token(
            subject="user-123",
            expires_delta=timedelta(seconds=-1),
        )
        assert verify_access_token(token) is None


# =============================================================================
# SETTINGS SECRET HANDLING
# =============================================================================
class TestSettingsSecrets:

    def test_secret_fields_are_masked_but_accessors_return_raw_values(self):
        raw_secret = "super-secret-key-for-tests-minimum-32-chars"
        raw_mail_password = "brevo-api-key-secret"

        configured = Settings(
            ENVIRONMENT="testing",
            DATABASE_URL="postgresql+asyncpg://test:test@localhost:5432/test_db",
            SECRET_KEY=raw_secret,
            MAIL_PASSWORD=raw_mail_password,
        )

        assert isinstance(configured.DATABASE_URL, str)
        assert isinstance(configured.SECRET_KEY, SecretStr)
        assert isinstance(configured.MAIL_PASSWORD, SecretStr)
        assert configured.secret_key_value == raw_secret
        assert configured.mail_password_value == raw_mail_password

        dumped = configured.model_dump()
        dumped_json = configured.model_dump(mode="json")

        for rendered in (repr(configured), repr(dumped), repr(dumped_json)):
            assert raw_secret not in rendered
            assert raw_mail_password not in rendered

        assert dumped_json["SECRET_KEY"] != raw_secret
        assert dumped_json["MAIL_PASSWORD"] != raw_mail_password

    def test_email_configuration_check_uses_raw_mail_password_accessor(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setattr(
            email_utils,
            "settings",
            SimpleNamespace(mail_password_value="  raw-brevo-key  "),
        )

        assert email_utils.is_email_configured() is True

    @pytest.mark.asyncio
    async def test_email_api_header_uses_raw_mail_password_accessor(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ):
        captured: dict[str, object] = {}

        class FakeBrevoResponse:
            status_code = 201
            text = ""

            def json(self) -> dict[str, str]:
                return {"messageId": "test-message-id"}

        class FakeAsyncClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return None

            async def post(self, url, json, headers, timeout):
                captured["url"] = url
                captured["headers"] = headers
                captured["payload"] = json
                captured["timeout"] = timeout
                return FakeBrevoResponse()

        monkeypatch.setattr(
            email_utils,
            "settings",
            SimpleNamespace(
                mail_password_value="raw-brevo-api-key",
                MAIL_FROM="sender@example.com",
            ),
        )
        monkeypatch.setattr(email_utils.httpx, "AsyncClient", FakeAsyncClient)

        sent = await email_utils.send_email_via_api(
            "recipient@example.com",
            "Recipient",
            "Subject",
            "<p>Hello</p>",
        )

        assert sent is True
        assert captured["headers"]["api-key"] == "raw-brevo-api-key"

    @pytest.mark.asyncio
    async def test_email_logs_redact_recipient_and_provider_body(
        self,
        monkeypatch: pytest.MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
    ):
        class FakeBrevoResponse:
            status_code = 500
            text = "recipient@example.com secret-api-key raw provider failure"

            def json(self) -> dict[str, str]:
                return {}

        class FakeAsyncClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return None

            async def post(self, url, json, headers, timeout):
                return FakeBrevoResponse()

        monkeypatch.setattr(
            email_utils,
            "settings",
            SimpleNamespace(
                mail_password_value="raw-brevo-api-key",
                MAIL_FROM="sender@example.com",
            ),
        )
        monkeypatch.setattr(email_utils.httpx, "AsyncClient", FakeAsyncClient)

        with caplog.at_level(logging.INFO, logger="vitaltrack.email"):
            sent = await email_utils.send_email_via_api(
                "recipient@example.com",
                "Recipient",
                "Subject",
                "<p>Hello</p>",
            )

        log_text = caplog.text
        assert sent is False
        assert "recipient@example.com" not in log_text
        assert "secret-api-key" not in log_text
        assert "raw provider failure" not in log_text
        assert "Status: 500" in log_text


class TestRestoreDrillGuards:

    def test_restore_target_url_must_include_disposable_marker(self):
        restore_drill = load_restore_drill_module()

        errors = restore_drill.validate_url_pair(
            "postgresql://user@source.example.com/source_db",
            "postgresql://user@target.example.com/neondb",
        )

        assert any("reserved for long-lived environments" in error for error in errors)
        assert any("target URL must include a strong disposable marker" in error for error in errors)

    def test_restore_target_url_accepts_marked_disposable_target(self):
        restore_drill = load_restore_drill_module()

        errors = restore_drill.validate_url_pair(
            "postgresql://user@source.example.com/source_db",
            "postgresql://user@target.example.com/carekosh_restore_drill_target",
        )

        assert errors == []

    def test_restore_target_url_rejects_multi_host_decoy(self):
        # libpq failover: urlparse().hostname collapses the comma-joined list, so
        # a disposable-looking decoy host can smuggle a real prod host past the
        # per-field checks. Multi-host targets must be rejected outright.
        restore_drill = load_restore_drill_module()

        errors = restore_drill.validate_url_pair(
            "postgresql://user@source.example.com/source_db",
            "postgresql://owner@scratch-x.example.com,"
            "ep-prod-real-123.us-east-2.aws.neon.tech/app_db",
        )

        assert any("must list exactly one host" in error for error in errors)

    def test_restore_target_url_rejects_username_only_marker(self):
        # A disposable marker in the username must not satisfy the marker check
        # while the real protected host/database go unchecked.
        restore_drill = load_restore_drill_module()

        errors = restore_drill.validate_url_pair(
            "postgresql://user@source.example.com/source_db",
            "postgresql://restore-drill@prod-db.example.com/customers",
        )

        assert any(
            "must include a strong disposable marker" in error for error in errors
        )

    def test_restore_target_url_rejects_protected_environment_word(self):
        restore_drill = load_restore_drill_module()

        errors = restore_drill.validate_url_pair(
            "postgresql://user@source.example.com/source_db",
            "postgresql://user@scratch-prod.example.com/carekosh_restore_drill_target",
        )

        assert any("protected environment word" in error for error in errors)

    def test_restore_target_url_rejects_configured_production_host(self, monkeypatch):
        # The built-in host allowlist cannot know a deployment's real Neon
        # endpoint, so operators add it to CAREKOSH_RESTORE_DENY_HOSTS. A
        # disposable-marked URL on a random Neon endpoint passes until the
        # operator denylists that endpoint host.
        restore_drill = load_restore_drill_module()
        prod_host = "ep-cool-darkness-a1b2c3d4.us-east-2.aws.neon.tech"
        target = f"postgresql://user@{prod_host}/scratch_db"
        source = "postgresql://user@source.example.com/source_db"

        monkeypatch.delenv("CAREKOSH_RESTORE_DENY_HOSTS", raising=False)
        assert restore_drill.validate_url_pair(source, target) == []

        monkeypatch.setenv("CAREKOSH_RESTORE_DENY_HOSTS", "ep-cool-darkness-a1b2c3d4")
        errors = restore_drill.validate_url_pair(source, target)
        assert any("protected fragment" in error for error in errors)

    def test_redact_url_survives_multi_host_with_port(self):
        # A multi-host netloc with an explicit port previously crashed evidence
        # logging via ValueError on parsed.port.
        restore_drill = load_restore_drill_module()

        redacted = restore_drill.redact_url(
            "postgresql://owner@scratch.example.com:5432,ep-prod.neon.tech/app_db"
        )

        assert "<redacted>" in redacted
        assert "owner" not in redacted

    def test_redact_url_survives_malformed_url(self):
        restore_drill = load_restore_drill_module()

        assert restore_drill.redact_url("not a postgres URL") == "<invalid-url>"

    def test_restore_target_url_rejects_host_query_override(self):
        # libpq honors ?host= and it OVERRIDES the netloc host, so a decoy host
        # carrying a disposable marker must not unlock a restore that actually
        # connects to a smuggled prod host + neondb in the query string.
        restore_drill = load_restore_drill_module()

        errors = restore_drill.validate_url_pair(
            "postgresql://user@source.example.com/source_db",
            "postgresql://u:p@ep-decoy-scratch.example.com/scratchdb"
            "?host=ep-prod-real.invalid&dbname=neondb",
        )

        assert errors != []
        # The EFFECTIVE database (?dbname=neondb) is what gets protected,
        # not the harmless /scratchdb path.
        assert any("reserved for long-lived environments" in error for error in errors)
        # The EFFECTIVE host has no marker, so the decoy marker no longer counts.
        assert any(
            "must include a strong disposable marker" in error for error in errors
        )

    def test_restore_target_url_rejects_dbname_query_override(self):
        # Even with a genuinely disposable-marked host, ?dbname=neondb retargets
        # the restore onto the protected database and must be rejected.
        restore_drill = load_restore_drill_module()

        errors = restore_drill.validate_url_pair(
            "postgresql://user@source.example.com/source_db",
            "postgresql://user@scratch-disposable.example.com/scratch_db"
            "?dbname=neondb",
        )

        assert any("reserved for long-lived environments" in error for error in errors)

    def test_restore_target_url_rejects_query_host_multi_host(self):
        # A comma-separated ?host= list is libpq failover routing and can hide a
        # protected host behind a disposable-looking one, so it is rejected.
        restore_drill = load_restore_drill_module()

        errors = restore_drill.validate_url_pair(
            "postgresql://user@source.example.com/source_db",
            "postgresql://user@scratch-disposable.example.com/scratch_db"
            "?host=scratch-x.example.com,ep-prod-real.neon.tech",
        )

        assert any("must list exactly one host" in error for error in errors)

    def test_restore_target_url_rejects_hostaddr_query_param(self):
        # hostaddr names a raw IP we cannot reason about against the disposable
        # policy, so any target carrying it is rejected outright.
        restore_drill = load_restore_drill_module()

        errors = restore_drill.validate_url_pair(
            "postgresql://user@source.example.com/source_db",
            "postgresql://user@scratch-disposable.example.com/scratch_db"
            "?hostaddr=203.0.113.10",
        )

        assert any(
            "cannot be validated" in error and "hostaddr" in error for error in errors
        )

    def test_restore_target_url_rejects_service_query_param(self):
        # service references an opaque external connection-service file, so the
        # effective target cannot be validated and must be rejected.
        restore_drill = load_restore_drill_module()

        errors = restore_drill.validate_url_pair(
            "postgresql://user@source.example.com/source_db",
            "postgresql://user@scratch-disposable.example.com/scratch_db"
            "?service=prod",
        )

        assert any(
            "cannot be validated" in error and "service" in error for error in errors
        )

    def test_restore_target_url_accepts_sslmode_only_query(self):
        # A legitimate query that does not retarget the connection (sslmode) must
        # still pass.
        restore_drill = load_restore_drill_module()

        errors = restore_drill.validate_url_pair(
            "postgresql://user@source.example.com/source_db",
            "postgresql://user@scratch-disposable.example.com/"
            "carekosh_restore_drill_target?sslmode=require",
        )

        assert errors == []

    def test_redact_url_surfaces_query_override(self):
        # The smuggled ?host=/?dbname= must NOT be hidden from the evidence trail,
        # while credentials (userinfo password and any password query param) are
        # masked.
        restore_drill = load_restore_drill_module()

        redacted = restore_drill.redact_url(
            "postgresql://u:supersecret@decoy-scratch.example.com/scratchdb"
            "?host=ep-prod-real.invalid&dbname=neondb&password=hunter2"
        )

        # Smuggled connection target is surfaced for the audit log.
        assert "ep-prod-real.invalid" in redacted
        assert "dbname=neondb" in redacted
        # Credentials are masked.
        assert "supersecret" not in redacted
        assert "hunter2" not in redacted
        assert "<redacted>" in redacted
