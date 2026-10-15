"""Read-only inventory assistant transport. No inventory/order mutations."""

import asyncio
import contextlib
import inspect
import math
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from sqlalchemy.dialects.postgresql import insert

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.ai import AIConsent
from app.schemas.ai import (
    CONSENT_VERSION,
    ConsentRequest,
    Intent,
    InterpretRequest,
    Plan,
    SpeakRequest,
    Specification,
)
from app.services import ai_provider, sarvam_credentials
from app.services.ai_body_limit import DISCONNECTED
from app.services.sarvam_speech import english_voice
from app.services.ai_guard import (
    AIPrincipal,
    principal,
    require_consent,
    require_enabled,
    reserve,
    settle,
)
from app.utils.rate_limiter import authenticated_ai_rate_key, limiter

# Soft per-account, per-route, per-worker limits. PostgreSQL separately enforces
# shared daily budgets and concurrency across workers.
AI_RATE = "30/minute"

router = APIRouter(prefix="/ai", tags=["AI assistant"])
Principal = Annotated[AIPrincipal, Depends(principal)]


async def until_disconnected(request: Request, work):
    """Run provider work, cancelling it when the phone disconnects (Stop, a new question, leaving).

    A cancelled call is settled as failed and keeps its whole reservation: the provider may still bill it.
    """
    disconnected = request.scope.get(DISCONNECTED)
    if disconnected is None:
        return await work
    if disconnected.is_set():
        # Do not start an outbound call if the connection has already gone away.
        if inspect.iscoroutine(work):
            work.close()
        elif isinstance(work, asyncio.Future):
            work.cancel()
        raise HTTPException(499, "The phone closed this request.")
    task = asyncio.ensure_future(work)
    waiter = asyncio.ensure_future(disconnected.wait())
    try:
        done, _ = await asyncio.wait({task, waiter}, return_when=asyncio.FIRST_COMPLETED)
        if task in done:
            return task.result()
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        raise HTTPException(499, "The phone closed this request.")
    finally:
        waiter.cancel()
        if not task.done():
            task.cancel()


@router.get("/capabilities")
@limiter.limit("60/minute", key_func=authenticated_ai_rate_key)
async def capabilities(request: Request, user: Principal):
    async with AsyncSessionLocal() as db:
        consent = await db.get(AIConsent, user.user_id)
        accepted = bool(
            consent and consent.accepted and consent.version == CONSENT_VERSION
        )
        scopes = consent.scopes if accepted else []

    def enabled(kind, provider=None):
        try:
            require_enabled(kind, provider)
            return True
        except HTTPException:
            return False

    personal = await sarvam_credentials.personal_status(user.user_id)
    shared_sarvam = enabled("speak", "sarvam")
    speech_providers = [
        p
        for p in ("kokoro", "sarvam", "alba")
        if enabled("speak", p) or p == "sarvam" and personal["usable"]
    ]
    return {
        "interpret": enabled("interpret"),
        "interpret_contracts": [1, 2, 3],
        "order_review_guard": True,
        "transcribe": enabled("transcribe"),
        "speak": bool(speech_providers),
        "consent_version": CONSENT_VERSION,
        "consented": accepted,
        "voice": english_voice()["speaker"]
        if "sarvam" in speech_providers
        else "en_GB-alba-medium"
        if "alba" in speech_providers
        else "",
        "scopes": scopes,
        "transcription_providers": [
            p for p in ("groq", "sarvam") if enabled("transcribe", p)
        ],
        "speech_providers": speech_providers,
        "sarvam_application_available": shared_sarvam,
        "sarvam_personal_key": personal,
        "sarvam_english_voice": english_voice()
        if "sarvam" in speech_providers
        else None,
    }


@router.put("/consent")
@limiter.limit(AI_RATE, key_func=authenticated_ai_rate_key)
async def consent(request: Request, body: ConsentRequest, user: Principal):
    if body.accepted and not settings.AI_ENABLED:
        # Cloud voice is switched off: there is nothing to consent to, so nothing
        # is written. Revoking (accepted=false) stays possible at all times.
        raise HTTPException(503, "Cloud processing is not available.")
    async with AsyncSessionLocal.begin() as db:
        values = dict(
            user_id=user.user_id,
            version=body.version,
            accepted=body.accepted,
            scopes=body.scopes,
            updated_at=datetime.now(timezone.utc),
        )
        await db.execute(
            insert(AIConsent)
            .values(**values)
            .on_conflict_do_update(index_elements=[AIConsent.user_id], set_=values)
        )
    return {
        "consented": body.accepted,
        "consent_version": CONSENT_VERSION,
        "scopes": body.scopes,
    }


@router.post("/interpret", response_model=Intent | Specification | Plan)
@limiter.limit(AI_RATE, key_func=authenticated_ai_rate_key)
async def interpret(request: Request, body: InterpretRequest, user: Principal):
    ticket = await reserve(user.user_id, "interpret")
    success, usage = False, {}
    try:
        if body.contract_version in (2, 3):
            result, usage = await until_disconnected(request, ai_provider.interpret(
                body.question, body.has_previous_item, body.contract_version
            ))
        else:
            result, usage = await until_disconnected(request, ai_provider.interpret(
                body.question, body.has_previous_item
            ))
        success = True
        return result
    finally:
        await asyncio.shield(settle(ticket, success, usage))


@router.post("/transcribe")
@limiter.limit(AI_RATE, key_func=authenticated_ai_rate_key)
async def transcribe(
    request: Request,
    user: Principal,
    file: UploadFile = File(...),
    provider: Literal["groq", "sarvam"] = Form("groq"),
):
    require_enabled("transcribe", provider)
    # Consent before audio inspection/decoding/provider upload. FastAPI has already
    # parsed multipart framing; reserve() checks again under the budget lock.
    await require_consent(user.user_id, "transcribe", provider)
    try:
        content = await file.read(900_001)
    finally:
        await file.close()
    if not content or len(content) > 900_000:
        raise HTTPException(413, "Recording is too large or empty.")
    extension, duration = ai_provider.audio_info(content)
    # Reserve the upper bound before decoding, so concurrency also bounds CPU work.
    ticket = await reserve(user.user_id, "transcribe", 30, provider)
    success = False
    try:
        async def process_recording():
            normalized, measured_duration = await ai_provider.normalize_audio(content, extension)
            transcript = (
                await ai_provider.transcribe(normalized, "wav")
                if provider == "groq"
                else await ai_provider.sarvam_transcribe(normalized)
            )
            return transcript, measured_duration

        transcript, duration = await until_disconnected(request, process_recording())
        success = True
        return {"transcript": transcript, "requires_confirmation": True}
    finally:
        await asyncio.shield(
            settle(
                ticket,
                success,
                {
                    "audio_seconds": max(
                        10 if provider == "groq" else 1, math.ceil(duration)
                    )
                },
            )
        )


@router.post("/speak")
@limiter.limit(AI_RATE, key_func=authenticated_ai_rate_key)
async def speak(request: Request, body: SpeakRequest, user: Principal):
    ticket = await reserve(
        user.user_id,
        "speak",
        provider=body.provider,
        credential_source=body.credential_source,
    )
    success = False
    try:
        if body.credential_source == "personal":
            # Re-read after reservation; removed keys cannot silently use the app key.
            key = await sarvam_credentials.load_key(user.user_id)
            audio = await until_disconnected(request, ai_provider.selected_speech(
                body.text, "sarvam", body.pace, api_key=key
            ))
        elif body.provider == "alba":
            audio = await until_disconnected(request, ai_provider.speak(body.text))
        else:
            audio = await until_disconnected(request, ai_provider.selected_speech(
                body.text, body.provider, body.pace
            ))
        success = True
        return Response(
            audio, media_type="audio/wav", headers={"Cache-Control": "no-store"}
        )
    finally:
        await asyncio.shield(settle(ticket, success, {"characters": len(body.text.strip())}))
