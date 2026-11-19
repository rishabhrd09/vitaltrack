"""Authenticated first-party supply review; independent of cloud AI consent."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import exists, select
from sqlalchemy.orm import load_only

from app.api.deps import CurrentUser, DB
from app.core.config import settings
from app.models.supply_review import SupplyRevision, SupplyReviewRun
from app.schemas.supply_review import AnswerReview, ChangeReview, ConfirmReview, ReviewList, ReviewRun, StartReview
from app.services import supply_review as service
from app.utils.rate_limiter import authenticated_ai_rate_key, limiter

router = APIRouter(prefix="/supply-reviews", tags=["Supply review"])


async def owner(request: Request, user: CurrentUser) -> str:
    request.state.ai_user_id = user.id
    return user.id


Owner = Annotated[str, Depends(owner)]


@router.get("/capabilities")
@limiter.limit("60/minute", key_func=authenticated_ai_rate_key, fail_open=True)
async def capabilities(request: Request, db: DB, user: Owner):
    has_history = bool(await db.scalar(select(exists().where(SupplyReviewRun.user_id == user))))
    return {"enabled": settings.SUPPLY_REVIEW_ENABLED, "contract_version": 1,
            "ttl_seconds": settings.SUPPLY_REVIEW_TTL_SECONDS, "max_items": settings.SUPPLY_REVIEW_MAX_ITEMS,
            "has_history": has_history}


@router.get("", response_model=ReviewList)
@limiter.limit("60/minute", key_func=authenticated_ai_rate_key, fail_open=True)
async def history(request: Request, db: DB, user: Owner):
    # Recovery remains available when operators pause new reviews.
    runs = (await db.execute(select(SupplyReviewRun).options(load_only(
        SupplyReviewRun.id, SupplyReviewRun.version, SupplyReviewRun.status,
        SupplyReviewRun.created_at, SupplyReviewRun.expires_at, SupplyReviewRun.order_id,
        SupplyReviewRun.supply_revision, SupplyReviewRun.rules_version,
    )).where(SupplyReviewRun.user_id == user)
                            .order_by(SupplyReviewRun.created_at.desc(), SupplyReviewRun.id).limit(20))).scalars().all()
    revision = await db.scalar(select(SupplyRevision.revision).where(SupplyRevision.user_id == user))
    return {"runs": [{"id": run.id, "version": run.version,
                      "status": service.public_status(run, revision), "created_at": run.created_at,
                      "expires_at": run.expires_at, "order_id": run.order_id} for run in runs]}


@router.post("", response_model=ReviewRun)
@limiter.limit("10/minute", key_func=authenticated_ai_rate_key)
async def start(request: Request, body: StartReview, db: DB, user: Owner):
    return await service.start(db, user, body)


@router.get("/{run_id}", response_model=ReviewRun)
@limiter.limit("60/minute", key_func=authenticated_ai_rate_key, fail_open=True)
async def status(request: Request, run_id: str, db: DB, user: Owner):
    return await service.serialize(db, await service.owned_run(db, user, run_id))


@router.post("/{run_id}/answers", response_model=ReviewRun)
@limiter.limit("20/minute", key_func=authenticated_ai_rate_key)
async def answer(request: Request, run_id: str, body: AnswerReview, db: DB, user: Owner):
    return await service.answer(db, user, run_id, body)


@router.post("/{run_id}/refresh", response_model=ReviewRun)
@limiter.limit("20/minute", key_func=authenticated_ai_rate_key)
async def refresh(request: Request, run_id: str, body: ChangeReview, db: DB, user: Owner):
    return await service.refresh(db, user, run_id, body.expected_run_version)


@router.post("/{run_id}/cancel", response_model=ReviewRun)
@limiter.limit("20/minute", key_func=authenticated_ai_rate_key, fail_open=True)
async def cancel(request: Request, run_id: str, body: ChangeReview, db: DB, user: Owner):
    return await service.cancel(db, user, run_id, body.expected_run_version)


@router.post("/{run_id}/confirm", response_model=ReviewRun)
@limiter.limit("10/minute", key_func=authenticated_ai_rate_key)
async def confirm(request: Request, run_id: str, body: ConfirmReview, db: DB, user: Owner):
    return await service.confirm(db, user, run_id, body)
