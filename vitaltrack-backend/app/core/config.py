"""
VitalTrack Backend - Application Configuration
Uses pydantic-settings for type-safe environment variable handling
"""

import json
from functools import lru_cache
from typing import List, Union

from pydantic import Field, SecretStr, field_validator
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
    APP_NAME: str = "CareKosh API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"  # development, staging, production

    # Observability — error tracking (optional; leave empty to disable Sentry)
    SENTRY_DSN: str = ""

    # Server-owned AI credentials. All outbound processing is opt-in and off by default.
    AI_ENABLED: bool = False
    AI_TRANSCRIBE_ENABLED: bool = False
    AI_SPEECH_ENABLED: bool = False
    AI_DATA_CONTROLS_REVIEWED: bool = False
    AI_ALBA_RIGHTS_APPROVED: bool = False
    GROQ_API_KEY: SecretStr = SecretStr("")
    GROQ_STT_MODEL: str = "whisper-large-v3"
    GROQ_INTENT_MODEL: str = "openai/gpt-oss-20b"
    AI_TIMEOUT_SECONDS: int = Field(default=25, ge=1, le=60)
    AI_USER_DAILY_REQUESTS: int = Field(default=50, ge=0, le=10000)
    AI_GLOBAL_DAILY_REQUESTS: int = Field(default=500, ge=0, le=100000)
    AI_GLOBAL_CONCURRENCY: int = Field(default=4, ge=1, le=32)
    # Conservative credits, millionths of USD. Not a provider billing cap.
    AI_USER_DAILY_BUDGET_MICROUSD: int = Field(default=100_000, ge=0)
    AI_GLOBAL_DAILY_BUDGET_MICROUSD: int = Field(default=1_000_000, ge=0)
    AI_INTERPRET_RESERVE_MICROUSD: int = Field(default=5_000, ge=1)
    AI_TRANSCRIBE_RESERVE_MICROUSD: int = Field(default=1_000, ge=1)
    AI_SPEAK_RESERVE_MICROUSD: int = Field(default=1_000, ge=1)
    PIPER_SERVICE_URL: str = ""
    PIPER_SERVICE_TOKEN: SecretStr = SecretStr("")
    # Optional, explicitly consented providers. Offline phone speech needs none of these.
    SARVAM_API_KEY: SecretStr = SecretStr("")
    AI_SARVAM_ENABLED: bool = False
    AI_SARVAM_DATA_CONTROLS_REVIEWED: bool = False
    SARVAM_STT_MODEL: str = "saaras:v4"
    SARVAM_TTS_MODEL: str = "bulbul:v3"
    SARVAM_SPEAKER: str = "shubh"
    AI_SARVAM_TRANSCRIBE_RESERVE_MICROUSD: int = Field(default=5_000, ge=1)
    AI_SARVAM_SPEAK_RESERVE_MICROUSD: int = Field(default=20_000, ge=1)
    AI_KOKORO_ENABLED: bool = False
    AI_KOKORO_RIGHTS_APPROVED: bool = False
    KOKORO_SERVICE_URL: str = ""
    KOKORO_SERVICE_TOKEN: SecretStr = SecretStr("")

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
        """
        Ensure DATABASE_URL uses asyncpg driver and is compatible with asyncpg.

        Handles two issues:
        1. Provider URL format conversion (postgresql:// → postgresql+asyncpg://)
        2. Query parameter stripping — Neon provides ?sslmode=require&channel_binding=require
           but asyncpg doesn't accept these as URL params. SSL is handled via connect_args
           in database.py instead.
        """
        if isinstance(v, str):
            # Strip query parameters (e.g., ?sslmode=require from Neon)
            # asyncpg can't handle these as URL params — SSL is set via connect_args instead
            if "?" in v:
                v = v.split("?")[0]

            # Convert provider URL formats to asyncpg format
            # Railway/Render provide: postgresql://user:pass@host:port/db
            # Neon provides:          postgres://user:pass@host/db (sometimes)
            # We need:                postgresql+asyncpg://user:pass@host:port/db
            if v.startswith("postgresql://") and "+asyncpg" not in v:
                v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
            elif v.startswith("postgres://"):
                v = v.replace("postgres://", "postgresql+asyncpg://", 1)
        return v

    # Security
    SECRET_KEY: SecretStr = SecretStr(
        "CHANGE-THIS-IN-PRODUCTION-MIN-32-CHARS-LONG-RANDOM-STRING"
    )

    @field_validator("SECRET_KEY")
    @classmethod
    def reject_weak_secret_in_production(cls, v, info):
        secret_value = v.get_secret_value() if isinstance(v, SecretStr) else str(v)
        env = info.data.get("ENVIRONMENT", "development")
        # The default is public: any deployed environment (staging included) using
        # it would accept forged tokens. Only local development and tests may.
        if env not in ("development", "testing") and secret_value.startswith("CHANGE-THIS"):
            raise ValueError(
                "SECRET_KEY must be set to a strong random value outside development and testing. "
                'Generate with: python -c "import secrets; print(secrets.token_urlsafe(32))"'
            )
        if len(secret_value) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters")
        return v
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
    MAIL_PASSWORD: SecretStr = SecretStr("")
    MAIL_FROM: str = "noreply@carekosh.com"
    MAIL_PORT: int = 587
    MAIL_SERVER: str = "sandbox.smtp.mailtrap.io"
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False

    # Frontend URL for email links (Points to Backend HTML View)
    FRONTEND_URL: str = ""

    @field_validator("FRONTEND_URL")
    @classmethod
    def require_frontend_url_in_production(cls, v, info):
        env = info.data.get("ENVIRONMENT", "development")
        if env == "production" and not v:
            raise ValueError("FRONTEND_URL must be set in production")
        return v or "http://127.0.0.1:8000/api/v1/auth"

    # Token Expiry
    EMAIL_VERIFICATION_EXPIRY_HOURS: int = 24
    PASSWORD_RESET_EXPIRY_HOURS: int = 1
    
    # Email Verification Enforcement
    REQUIRE_EMAIL_VERIFICATION: bool = False  # Default False — set True only when Brevo MAIL_PASSWORD is configured

    @property
    def database_url_sync(self) -> str:
        """Synchronous database URL for Alembic migrations."""
        return self.DATABASE_URL.replace("+asyncpg", "")

    @property
    def secret_key_value(self) -> str:
        """Raw JWT signing secret for crypto APIs that require a plain string."""
        return self.SECRET_KEY.get_secret_value()

    @property
    def mail_password_value(self) -> str:
        """Raw Brevo API key for outbound email calls."""
        return self.MAIL_PASSWORD.get_secret_value()
    
    @property
    def is_cors_allow_all(self) -> bool:
        """Check if CORS allows all origins (wildcard)."""
        return "*" in self.CORS_ORIGINS


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
