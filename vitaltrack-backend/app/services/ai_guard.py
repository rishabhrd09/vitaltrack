"""Short DB transactions only; provider awaits never pin a pooled connection."""

import contextlib
import logging
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import func, select, text, update
from sqlalchemy.exc import DBAPIError

from app.api.deps import get_current_user, security
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.ai import AIConsent, AIUsage, OpenAICredential, SarvamCredential
from app.schemas.ai import CONSENT_VERSION

logger = logging.getLogger("carekosh.ai")


@dataclass(frozen=True)
class AIPrincipal:
    user_id: str


async def principal(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> AIPrincipal:
    async with AsyncSessionLocal() as db:
        user = await get_current_user(db=db, credentials=credentials)
        request.state.ai_user_id = user.id
        return AIPrincipal(user.id)


def consent_scope(kind: str, provider: str) -> str:
    allowed = {
        ("interpret", "groq"): "groq_text",
        ("interpret", "openai"): "openai_text",
        ("transcribe", "groq"): "groq_audio",
        ("transcribe", "sarvam"): "sarvam_audio",
        ("speak", "sarvam"): "sarvam_speech",
        ("speak", "kokoro"): "kokoro_speech",
        ("speak", "alba"): "alba_speech",
    }
    if (kind, provider) not in allowed:
        raise HTTPException(422, "Unsupported voice provider.")
    return allowed[kind, provider]


def require_enabled(
    kind: str, provider: str | None = None, credential_source: str = "application"
):
    provider = provider or ("alba" if kind == "speak" else "groq")
    consent_scope(kind, provider)
    if (
        credential_source not in ("application", "personal")
        or credential_source == "personal"
        and (kind, provider) not in {("speak", "sarvam"), ("interpret", "openai")}
        or provider == "openai" and credential_source != "personal"
    ):
        raise HTTPException(422, "Unsupported credential source.")
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
    elif provider == "openai":
        from app.services.openai_credentials import require_personal_setup

        require_personal_setup()
    elif provider == "sarvam":
        available = (
            available
            and settings.AI_SARVAM_ENABLED
            and settings.AI_SARVAM_DATA_CONTROLS_REVIEWED
            and (
                credential_source == "personal"
                or bool(settings.SARVAM_API_KEY.get_secret_value())
            )
        )
        if kind == "transcribe":
            available = available and settings.AI_SARVAM_TRANSCRIBE_ENABLED
        elif kind == "speak" and available:
            from app.services.sarvam_speech import english_voice

            english_voice()  # Invalid model/speaker pairs are unavailable before billing.
            if credential_source == "personal":
                from app.services.sarvam_credentials import require_personal_setup

                require_personal_setup()
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


@contextlib.contextmanager
def busy_when_locked():
    """A long wait for the shared budget lock, or a slow statement, is "busy", never a generic 500."""
    try:
        yield
    except DBAPIError as error:
        cause = getattr(error.orig, "__cause__", None)
        state = getattr(error.orig, "sqlstate", None) or getattr(cause, "sqlstate", None)
        if state in {"55P03", "57014"}:  # lock_not_available, query_canceled
            raise HTTPException(503, "AI is busy. Please try again shortly.", headers={"Retry-After": "5", "X-AI-Error": "busy"}) from None
        raise


async def require_consent(user_id: str, kind: str, provider: str) -> None:
    """Check before audio inspection/decoding; multipart framing was parsed by FastAPI.

    reserve() checks consent again under the budget lock before provider work.
    """
    async with AsyncSessionLocal() as db:
        consent = await db.get(AIConsent, user_id)
    if not consent or not consent.accepted or consent.version != CONSENT_VERSION or consent_scope(kind, provider) not in consent.scopes:
        raise HTTPException(403, "Enable cloud processing in AI & Voice settings first.")


async def reserve(
    user_id: str,
    kind: str,
    audio_seconds: int = 0,
    provider: str | None = None,
    credential_source: str = "application",
) -> str:
    provider = provider or ("alba" if kind == "speak" else "groq")
    require_enabled(kind, provider, credential_source)
    now = datetime.now(timezone.utc)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    # Daily limits reset at the next 00:00 UTC (05:30 in India), not after a fixed hour.
    until_reset = str(math.ceil((midnight + timedelta(days=1) - now).total_seconds()))
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
    elif provider == "openai":
        credit = max(50_000, settings.AI_OPENAI_INTERPRET_RESERVE_MICROUSD)
    with busy_when_locked():
        async with AsyncSessionLocal.begin() as db:
            # All API workers share the same budget lock. Transaction ends before inference.
            # A short lock wait keeps a queue of requests from pinning pooled connections.
            await db.execute(text(f"SET LOCAL lock_timeout = '{int(settings.AI_BUDGET_LOCK_TIMEOUT_MS)}ms'"))
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
            if credential_source == "personal":
                if provider == "openai":
                    from app.services.openai_credentials import decrypt_key

                    credential = await db.get(OpenAICredential, user_id)
                else:
                    from app.services.sarvam_credentials import decrypt_key

                    credential = await db.get(SarvamCredential, user_id)
                if credential is None:
                    raise HTTPException(
                        409,
                        "No personal OpenAI key is saved. Add your key or choose on-phone understanding."
                        if provider == "openai" else
                        "No personal Sarvam key is saved. Add your key or explicitly choose another voice.",
                    )
                decrypt_key(user_id, credential.ciphertext)
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
                    "Today's AI processing budget is used. It resets at 00:00 UTC. Basic commands remain available.",
                    headers={"Retry-After": until_reset},
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
                    "Today's AI allowance is used. It resets at 00:00 UTC. Basic typed commands remain available.",
                    headers={"Retry-After": until_reset},
                )
            # One request of each kind per account at a time: a question can be understood while an
            # earlier answer is still being spoken, but no kind can queue billable work.
            if (
                await db.scalar(active) >= settings.AI_GLOBAL_CONCURRENCY
                or await db.scalar(active.where(AIUsage.user_id == user_id, AIUsage.kind == kind)) >= 1
            ):
                raise HTTPException(
                    429,
                    "AI is busy. Please try again shortly.",
                    headers={"Retry-After": "5", "X-AI-Error": "busy"},
                )
            row = AIUsage(
                user_id=user_id,
                kind=kind,
                provider=provider,
                credential_source=credential_source,
                status="reserved",
                reserved_microusd=credit,
                created_at=now,
                expires_at=now + timedelta(seconds=settings.AI_TIMEOUT_SECONDS + 30),
                audio_seconds=audio_seconds,
            )
            db.add(row)
            await db.flush()
            return row.id


def estimated_cost(kind: str, provider: str, usage: dict) -> int | None:
    """Estimated micro-USD for a successful call from published prices; None keeps the reservation."""
    if kind == "speak" and provider == "sarvam":
        characters = usage.get("characters")
        if type(characters) is int and characters > 0:
            return math.ceil(characters * settings.AI_SARVAM_SPEAK_MICROUSD_PER_CHAR)
    elif kind == "interpret" and provider == "groq":
        prompt, completion = usage.get("prompt_tokens"), usage.get("completion_tokens")
        if type(prompt) is int and type(completion) is int and prompt >= 0 and completion >= 0 and prompt + completion > 0:
            return max(1, math.ceil((prompt * settings.AI_GROQ_INPUT_MICROUSD_PER_1K_TOKENS
                                     + completion * settings.AI_GROQ_OUTPUT_MICROUSD_PER_1K_TOKENS) / 1000))
    elif kind == "interpret" and provider == "openai":
        prompt, completion = usage.get("prompt_tokens"), usage.get("completion_tokens")
        if type(prompt) is int and type(completion) is int and prompt >= 0 and completion > 0:
            # Standard GPT-5.4 mini rates, checked 25 October 2026. Reasoning is
            # already included in output_tokens; cached input is overestimated.
            return max(1, math.ceil((prompt * 750 + completion * 4500) / 1000))
    elif kind == "transcribe" and provider == "groq":
        seconds = usage.get("audio_seconds")
        if type(seconds) in (int, float) and math.isfinite(seconds) and seconds > 0:
            # Groq bills at least 10 seconds of audio per request.
            return max(1, math.ceil(max(10, seconds) * settings.AI_GROQ_STT_MICROUSD_PER_SECOND))
    return None


async def settle(ticket: str, success: bool, usage: dict | None = None):
    """Record the outcome. A failure here must not replace the user's result.

    A successful call is charged its estimated cost, never more than its reservation. A failed or
    cancelled call keeps the whole reservation, because the provider may still have billed it.
    """
    usage = usage or {}
    try:
        async with AsyncSessionLocal.begin() as db:
            audio_usage = (
                {"audio_seconds": min(30, max(1, int(usage["audio_seconds"])))}
                if "audio_seconds" in usage
                else {}
            )
            values = dict(
                status="complete" if success else "failed",
                input_tokens=max(0, int(usage.get("prompt_tokens", 0))),
                output_tokens=max(0, int(usage.get("completion_tokens", 0))),
                **audio_usage,
            )
            if success:
                row = await db.get(AIUsage, ticket)
                estimate = estimated_cost(row.kind, row.provider, usage) if row is not None else None
                if estimate is not None:
                    values["reserved_microusd"] = min(row.reserved_microusd, estimate)
            await db.execute(update(AIUsage).where(AIUsage.id == ticket).values(**values))
    except Exception:
        # The row stays "reserved": it still counts against the daily limits and
        # stops counting as in flight when it expires, so this cannot overspend.
        logger.warning("AI usage settlement failed", exc_info=True)
