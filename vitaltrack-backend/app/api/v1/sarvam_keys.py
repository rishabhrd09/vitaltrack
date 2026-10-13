"""Personal key management. Saving never calls a provider or enables voice consent."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.schemas.ai import SarvamKeyRequest
from app.services import sarvam_credentials
from app.services.ai_guard import AIPrincipal, principal

router = APIRouter(prefix="/ai/sarvam-key", tags=["AI assistant"])
Principal = Annotated[AIPrincipal, Depends(principal)]


@router.get("")
async def status(user: Principal):
    return await sarvam_credentials.personal_status(user.user_id)


@router.put("")
async def save(body: SarvamKeyRequest, user: Principal):
    await sarvam_credentials.save_key(user.user_id, body.api_key)
    return await sarvam_credentials.personal_status(user.user_id)


@router.delete("")
async def remove(user: Principal):
    await sarvam_credentials.remove_key(user.user_id)
    return await sarvam_credentials.personal_status(user.user_id)
