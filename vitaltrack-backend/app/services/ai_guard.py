"""Short DB transactions only; provider awaits never pin a pooled connection."""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func, select, text, update

from app.api.deps import get_current_user, security
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.ai import AIConsent, AIUsage
from app.schemas.ai import CONSENT_VERSION

logger = logging.getLogger("carekosh.ai")


@dataclass(frozen=True)
class AIPrincipal:
    user_id: str


async def principal(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> AIPrincipal:
    async with AsyncSessionLocal() as db:
        user = await get_current_user(db=db, credentials=credentials)
        return AIPrincipal(user.id)


def consent_scope(kind: str, provider: str) -> str:
    allowed = {
        ("interpret", "groq"): "groq_text",
        ("transcribe", "groq"): "groq_audio",
        ("transcribe", "sarvam"): "sarvam_audio",
        ("speak", "sarvam"): "sarvam_speech",
        ("speak", "kokoro"): "kokoro_speech",
        ("speak", "alba"): "alba_speech",
    }
    if (kind, provider) not in allowed:
        raise HTTPException(422, "Unsupported voice provider.")
    return allowed[kind, provider]


def require_enabled(kind: str, provider: str | None = None):
    provider = provider or ("alba" if kind == "speak" else "groq")
    consent_scope(kind, provider)
    available = settings.AI_ENABLED
    if kind == "transcribe":
        available = available and settings.AI_TRANSCRIBE_ENABLED
    if kind == "speak":
        available = available and settings.AI_SPEECH_ENABLED
    if provider == "groq":
        available = (
            available
            and settings.AI_DATA_CONTROLS_REVIEWED
            and bool(settings.GROQ_API_KEY.get_secret_value())
        )
    elif provider == "sarvam":
        available = (
            available
            and settings.AI_SARVAM_ENABLED
            and settings.AI_SARVAM_DATA_CONTROLS_REVIEWED
            and bool(settings.SARVAM_API_KEY.get_secret_value())
        )
    elif provider == "kokoro":
        available = (
            available
            and settings.AI_KOKORO_ENABLED
            and settings.AI_KOKORO_RIGHTS_APPROVED
            and bool(
                settings.KOKORO_SERVICE_URL
                and settings.KOKORO_SERVICE_TOKEN.get_secret_value()
            )
        )
    else:
        available = (
            available
            and settings.AI_DATA_CONTROLS_REVIEWED
            and settings.AI_ALBA_RIGHTS_APPROVED
            and bool(
                settings.PIPER_SERVICE_URL
                and settings.PIPER_SERVICE_TOKEN.get_secret_value()
            )
        )
    if not available:
        raise HTTPException(
            503,
            "This AI feature is unavailable. Use typed basic commands or the normal inventory screen.",
        )


async def reserve(
    user_id: str, kind: str, audio_seconds: int = 0, provider: str | None = None
) -> str:
    provider = provider or ("alba" if kind == "speak" else "groq")
    require_enabled(kind, provider)
    now = datetime.now(timezone.utc)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    credit = {
        "interpret": settings.AI_INTERPRET_RESERVE_MICROUSD,
        "transcribe": settings.AI_TRANSCRIBE_RESERVE_MICROUSD,
        "speak": settings.AI_SPEAK_RESERVE_MICROUSD,
    }[kind]
    if provider == "sarvam":
        credit = (
            settings.AI_SARVAM_TRANSCRIBE_RESERVE_MICROUSD
            if kind == "transcribe"
            else settings.AI_SARVAM_SPEAK_RESERVE_MICROUSD
        )
    async with AsyncSessionLocal.begin() as db:
        # All API workers share the same budget lock. Transaction ends before inference.
        await db.execute(text("SELECT pg_advisory_xact_lock(72401931)"))
        consent = await db.get(AIConsent, user_id)
        if (
            not consent
            or not consent.accepted
            or consent.version != CONSENT_VERSION
            or consent_scope(kind, provider) not in consent.scopes
        ):
            raise HTTPException(
                403, "Enable cloud processing in AI & Voice settings first."
            )
        daily = (
            select(func.count())
            .select_from(AIUsage)
            .where(AIUsage.created_at >= midnight)
        )
        total = await db.scalar(daily)
        user_total = await db.scalar(daily.where(AIUsage.user_id == user_id))
        spent = select(func.coalesce(func.sum(AIUsage.reserved_microusd), 0)).where(
            AIUsage.created_at >= midnight
        )
        if (
            await db.scalar(spent)
        ) + credit > settings.AI_GLOBAL_DAILY_BUDGET_MICROUSD or (
            await db.scalar(spent.where(AIUsage.user_id == user_id))
        ) + credit > settings.AI_USER_DAILY_BUDGET_MICROUSD:
            raise HTTPException(
                429,
                "Today's AI processing budget is used. Basic commands remain available.",
                headers={"Retry-After": "3600"},
            )
        active = (
            select(func.count())
            .select_from(AIUsage)
            .where(AIUsage.status == "reserved", AIUsage.expires_at > now)
        )
        if (
            total >= settings.AI_GLOBAL_DAILY_REQUESTS
            or user_total >= settings.AI_USER_DAILY_REQUESTS
        ):
            raise HTTPException(
                429,
                "Today's AI allowance is used. Basic typed commands remain available.",
                headers={"Retry-After": "3600"},
            )
        if (
            await db.scalar(active) >= settings.AI_GLOBAL_CONCURRENCY
            or await db.scalar(active.where(AIUsage.user_id == user_id)) >= 1
        ):
            raise HTTPException(
                429,
                "AI is busy. Please try again shortly.",
                headers={"Retry-After": "5"},
            )
        row = AIUsage(
            user_id=user_id,
            kind=kind,
            provider=provider,
            status="reserved",
            reserved_microusd=credit,
            created_at=now,
            expires_at=now + timedelta(seconds=settings.AI_TIMEOUT_SECONDS + 30),
            audio_seconds=audio_seconds,
        )
        db.add(row)
        await db.flush()
        return row.id


async def settle(ticket: str, success: bool, usage: dict | None = None):
    """Record the outcome. A failure here must not replace the user's result."""
    usage = usage or {}
    try:
        async with AsyncSessionLocal.begin() as db:
            audio_usage = (
                {"audio_seconds": min(30, max(1, int(usage["audio_seconds"])))}
                if "audio_seconds" in usage
                else {}
            )
            await db.execute(
                update(AIUsage)
                .where(AIUsage.id == ticket)
                .values(
                    status="complete" if success else "failed",
                    input_tokens=max(0, int(usage.get("prompt_tokens", 0))),
                    output_tokens=max(0, int(usage.get("completion_tokens", 0))),
                    **audio_usage,
                )
            )
    except Exception:
        # The row stays "reserved": it still counts against the daily limits and
        # stops counting as in flight when it expires, so this cannot overspend.
        logger.warning("AI usage settlement failed", exc_info=True)
