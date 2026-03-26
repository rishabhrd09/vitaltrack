"""
VitalTrack — Security Unit Tests

Tests for password hashing (Argon2) and JWT token creation/verification
without hitting any HTTP endpoints. These run in <1 second.

Google Testing Pyramid: unit tests form the base (70% of test count).
"""

from datetime import timedelta

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
