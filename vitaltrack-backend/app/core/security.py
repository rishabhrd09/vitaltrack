"""
VitalTrack Backend - Security Utilities
Password hashing (Argon2) and JWT token management
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

from app.core.config import settings


# =============================================================================
# PASSWORD HASHING
# =============================================================================
# Using Argon2 (recommended by OWASP) with bcrypt as fallback
pwd_context = CryptContext(
    schemes=["argon2", "bcrypt"],
    deprecated="auto",
)


def hash_password(password: str) -> str:
    """Hash a password using Argon2."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


# =============================================================================
# JWT TOKEN MODELS
# =============================================================================
class TokenPayload(BaseModel):
    """JWT token payload structure."""

    sub: str  # Subject (user_id)
    exp: datetime  # Expiration time
    iat: datetime  # Issued at
    type: str  # Token type: "access" or "refresh"
    jti: Optional[str] = None  # JWT ID (for refresh token tracking)


class TokenResponse(BaseModel):
    """Response model for token endpoints."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # Seconds until access token expires


# =============================================================================
# JWT TOKEN CREATION
# =============================================================================
def create_access_token(
    subject: str | UUID,
    expires_delta: Optional[timedelta] = None,
    additional_claims: Optional[dict[str, Any]] = None,
) -> str:
    """
    Create a JWT access token.

    Args:
        subject: User ID or identifier
        expires_delta: Custom expiration time
        additional_claims: Extra claims to include

    Returns:
        Encoded JWT token string
    """
    now = datetime.now(timezone.utc)

    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode = {
        "sub": str(subject),
        "exp": expire,
        "iat": now,
        "type": "access",
    }

    if additional_claims:
        to_encode.update(additional_claims)

    return jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def create_refresh_token(
    subject: str | UUID,
    jti: Optional[str] = None,
) -> str:
    """
    Create a JWT refresh token.

    Args:
        subject: User ID or identifier
        jti: Unique token ID for tracking/revocation

    Returns:
        Encoded JWT refresh token string
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    to_encode = {
        "sub": str(subject),
        "exp": expire,
        "iat": now,
        "type": "refresh",
        "jti": jti or str(uuid4()),
    }

    return jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def create_token_pair(user_id: str | UUID, jti: Optional[str] = None) -> TokenResponse:
    """
    Create both access and refresh tokens.

    Args:
        user_id: User identifier
        jti: Unique ID for refresh token

    Returns:
        TokenResponse with both tokens
    """
    token_jti = jti or str(uuid4())
    access_token = create_access_token(subject=user_id)
    refresh_token = create_refresh_token(subject=user_id, jti=token_jti)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# =============================================================================
# JWT TOKEN VERIFICATION
# =============================================================================
def decode_token(token: str) -> Optional[TokenPayload]:
    """
    Decode and validate a JWT token.

    Args:
        token: JWT token string

    Returns:
        TokenPayload if valid, None if invalid
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return TokenPayload(**payload)
    except JWTError:
        return None


def verify_access_token(token: str) -> Optional[str]:
    """
    Verify an access token and return the user_id.

    Args:
        token: JWT access token

    Returns:
        User ID if valid, None if invalid
    """
    payload = decode_token(token)

    if payload is None:
        return None

    if payload.type != "access":
        return None

    return payload.sub


def verify_refresh_token(token: str) -> Optional[tuple[str, Optional[str]]]:
    """
    Verify a refresh token and return user_id and jti.

    Args:
        token: JWT refresh token

    Returns:
        Tuple of (user_id, jti) if valid, None if invalid
    """
    payload = decode_token(token)

    if payload is None:
        return None

    if payload.type != "refresh":
        return None

    return (payload.sub, payload.jti)
