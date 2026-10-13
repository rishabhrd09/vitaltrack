"""Read-only inventory assistant transport. No inventory/order mutations."""

import asyncio
import math
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
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
from app.services.sarvam_speech import english_voice
from app.services.ai_guard import (
    AIPrincipal,
    principal,
    require_enabled,
    reserve,
    settle,
)

router = APIRouter(prefix="/ai", tags=["AI assistant"])
Principal = Annotated[AIPrincipal, Depends(principal)]


@router.get("/capabilities")
async def capabilities(user: Principal):
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
async def consent(body: ConsentRequest, user: Principal):
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
async def interpret(body: InterpretRequest, user: Principal):
    ticket = await reserve(user.user_id, "interpret")
    success, usage = False, {}
    try:
        if body.contract_version in (2, 3):
            result, usage = await ai_provider.interpret(
                body.question, body.has_previous_item, body.contract_version
            )
        else:
            result, usage = await ai_provider.interpret(
                body.question, body.has_previous_item
            )
        success = True
        return result
    finally:
        await asyncio.shield(settle(ticket, success, usage))


@router.post("/transcribe")
async def transcribe(
    user: Principal,
    file: UploadFile = File(...),
    provider: Literal["groq", "sarvam"] = Form("groq"),
):
    require_enabled("transcribe", provider)
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
        normalized, duration = await ai_provider.normalize_audio(content, extension)
        transcript = (
            await ai_provider.transcribe(normalized, "wav")
            if provider == "groq"
            else await ai_provider.sarvam_transcribe(normalized)
        )
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
async def speak(body: SpeakRequest, user: Principal):
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
            audio = await ai_provider.selected_speech(
                body.text, "sarvam", body.pace, api_key=key
            )
        elif body.provider == "alba":
            audio = await ai_provider.speak(body.text)
        else:
            audio = await ai_provider.selected_speech(
                body.text, body.provider, body.pace
            )
        success = True
        return Response(
            audio, media_type="audio/wav", headers={"Cache-Control": "no-store"}
        )
    finally:
        await asyncio.shield(settle(ticket, success))
