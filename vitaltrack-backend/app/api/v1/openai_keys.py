"""Personal text-key enrollment; key checks never perform inference."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.schemas.ai import OpenAIKeyRequest
from app.services import openai_credentials, openai_interpreter
from app.services.ai_guard import AIPrincipal, principal
from app.utils.rate_limiter import authenticated_ai_rate_key, limiter

router = APIRouter(prefix="/ai/openai-key", tags=["AI assistant"])
Principal = Annotated[AIPrincipal, Depends(principal)]


@router.get("")
@limiter.limit("30/minute", key_func=authenticated_ai_rate_key)
async def status(request: Request, user: Principal):
    return await openai_credentials.personal_status(user.user_id)


@router.put("")
@limiter.limit("10/minute", key_func=authenticated_ai_rate_key)
async def save(request: Request, body: OpenAIKeyRequest, user: Principal):
    await openai_credentials.save_key(user.user_id, body.api_key)
    return await openai_credentials.personal_status(user.user_id)


@router.delete("")
@limiter.limit("10/minute", key_func=authenticated_ai_rate_key)
async def remove(request: Request, user: Principal):
    await openai_credentials.remove_key(user.user_id)
    return await openai_credentials.personal_status(user.user_id)


@router.post("/check")
@limiter.limit("5/minute", key_func=authenticated_ai_rate_key)
async def check(request: Request, user: Principal):
    # No transcript, inventory or inference request is involved. The DB session
    # closes before this explicitly requested bounded model-metadata lookup.
    key = await openai_credentials.load_key(user.user_id)
    from app.api.v1.ai import until_disconnected

    return await until_disconnected(request, openai_interpreter.check_model(key))
