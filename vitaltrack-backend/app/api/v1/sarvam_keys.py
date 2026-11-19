"""Personal key management. Saving never calls a provider or enables voice consent."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.schemas.ai import SarvamKeyRequest
from app.services import sarvam_credentials
from app.services.ai_guard import AIPrincipal, principal
from app.utils.rate_limiter import authenticated_ai_rate_key, limiter

router = APIRouter(prefix="/ai/sarvam-key", tags=["AI assistant"])
Principal = Annotated[AIPrincipal, Depends(principal)]


@router.get("")
@limiter.limit("30/minute", key_func=authenticated_ai_rate_key)
async def status(request: Request, user: Principal):
    return await sarvam_credentials.personal_status(user.user_id)


@router.put("")
@limiter.limit("10/minute", key_func=authenticated_ai_rate_key)
async def save(request: Request, body: SarvamKeyRequest, user: Principal):
    await sarvam_credentials.save_key(user.user_id, body.api_key)
    return await sarvam_credentials.personal_status(user.user_id)


@router.delete("")
@limiter.limit("10/minute", key_func=authenticated_ai_rate_key)
async def remove(request: Request, user: Principal):
    await sarvam_credentials.remove_key(user.user_id)
    return await sarvam_credentials.personal_status(user.user_id)
