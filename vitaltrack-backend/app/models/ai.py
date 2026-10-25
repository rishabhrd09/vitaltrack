"""Account consent, content-free usage and encrypted narration credentials."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UUIDMixin


class AIConsent(Base):
    __tablename__ = "ai_consents"
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    version: Mapped[str] = mapped_column(String(40))
    accepted: Mapped[bool] = mapped_column(Boolean)
    scopes: Mapped[list[str]] = mapped_column(JSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AIUsage(Base, UUIDMixin):
    __tablename__ = "ai_usage"
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(20))
    provider: Mapped[str] = mapped_column(String(20), default="groq")
    credential_source: Mapped[str] = mapped_column(String(20), default="application")
    status: Mapped[str] = mapped_column(String(20))
    reserved_microusd: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Failed/cancelled requests remain charged against request limits.
    audio_seconds: Mapped[int] = mapped_column(Integer, default=0)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)


class SarvamCredential(Base):
    """Encrypted narration-only personal credential. Never serialize this model."""

    __tablename__ = "ai_sarvam_credentials"
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    ciphertext: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class OpenAICredential(Base):
    """Encrypted personal text-understanding key. Never serialize this model."""

    __tablename__ = "ai_openai_credentials"
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    ciphertext: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
