"""
VitalTrack Backend - Application Configuration
Uses pydantic-settings for type-safe environment variable handling
"""

import json
from functools import lru_cache
from typing import List, Union

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    APP_NAME: str = "VitalTrack API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"  # development, staging, production

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/vitaltrack"
    DATABASE_POOL_SIZE: int = 5
    DATABASE_MAX_OVERFLOW: int = 10
    DATABASE_POOL_TIMEOUT: int = 30

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def ensure_asyncpg_driver(cls, v):
        """Ensure DATABASE_URL uses asyncpg driver (Railway provides postgresql://)."""
        if isinstance(v, str):
            # Railway provides: postgresql://user:pass@host:port/db
            # We need: postgresql+asyncpg://user:pass@host:port/db
            if v.startswith("postgresql://") and "+asyncpg" not in v:
                v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
            elif v.startswith("postgres://"):
                # Some providers use postgres:// instead of postgresql://
                v = v.replace("postgres://", "postgresql+asyncpg://", 1)
        return v

    # Security
    SECRET_KEY: str = "CHANGE-THIS-IN-PRODUCTION-MIN-32-CHARS-LONG-RANDOM-STRING"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # CORS - Can be a JSON string or list
    # Use ["*"] for development (allows all origins)
    # Use specific origins for production
    CORS_ORIGINS: Union[List[str], str] = ["*"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS_ORIGINS from string (env var) or list."""
        if isinstance(v, str):
            # Handle JSON string like '["*"]' or '["http://localhost:3000"]'
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except json.JSONDecodeError:
                pass
            # Handle comma-separated string
            if "," in v:
                return [origin.strip() for origin in v.split(",")]
            # Single value
            return [v]
        return v

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_BURST: int = 10

    # Email Configuration
    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = "noreply@vitaltrack.app"
    MAIL_PORT: int = 587
    MAIL_SERVER: str = "sandbox.smtp.mailtrap.io"
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False

    # Frontend URL for email links (Points to Backend HTML View)
    FRONTEND_URL: str = "http://127.0.0.1:8000/api/v1/auth"

    # Token Expiry
    EMAIL_VERIFICATION_EXPIRY_HOURS: int = 24
    PASSWORD_RESET_EXPIRY_HOURS: int = 1
    
    # Email Verification Enforcement
    REQUIRE_EMAIL_VERIFICATION: bool = True  # If True, block login until email verified

    @property
    def database_url_sync(self) -> str:
        """Synchronous database URL for Alembic migrations."""
        return self.DATABASE_URL.replace("+asyncpg", "")
    
    @property
    def is_cors_allow_all(self) -> bool:
        """Check if CORS allows all origins (wildcard)."""
        return "*" in self.CORS_ORIGINS


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
