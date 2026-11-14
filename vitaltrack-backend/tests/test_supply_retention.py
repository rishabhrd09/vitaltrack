"""Retention is exercised only on the existing explicitly disposable test DB."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.models.supply_review import ClosedOrderSubmission, SupplyReviewConfirmation, SupplyReviewProposal, SupplyReviewRun
from app.services.supply_retention import prune_abandoned_reviews
from tests.conftest import TestSession, register_and_auth


async def test_retention_dry_run_bounded_and_preserves_completed_and_live_reviews(client):
    owner, _ = await register_and_auth(client, email="synthetic-retention@example.com")
    now = datetime.now(timezone.utc)
    async with TestSession.begin() as db:
        for status, age, order_id in [
            ("expired", 40, None), ("cancelled", 40, None),
            ("completed", 40, "ORD-synthetic"), ("awaiting_review", 40, None),
            ("needs_input", 40, None), ("expired", 2, None),
            ("expired", 40, "ORD-synthetic-tombstone"),
        ]:
            db.add(SupplyReviewRun(
                user_id=owner["user"]["id"], request_id=str(uuid4()), version=1, status=status,
                created_at=now - timedelta(days=age + 1), expires_at=now - timedelta(days=age),
                snapshot_at=now - timedelta(days=age + 1), supply_revision=0,
                proposal_version=0, order_id=order_id,
            ))
    async with TestSession.begin() as db:
        assert await prune_abandoned_reviews(db, now=now) == 4
        assert await db.scalar(select(func.count()).select_from(SupplyReviewRun)) == 7
        assert await prune_abandoned_reviews(db, now=now, apply=True, limit=1) == 1
    async with TestSession.begin() as db:
        assert await prune_abandoned_reviews(db, now=now, apply=True) == 3
        assert await db.scalar(select(func.count()).select_from(SupplyReviewRun)) == 3


@pytest.mark.parametrize("kwargs", [{"days": 29}, {"days": True}, {"limit": 101}, {"limit": 0}])
async def test_retention_rejects_unbounded_policy_before_db_access(kwargs):
    with pytest.raises(ValueError):
        await prune_abandoned_reviews(None, now=datetime.now(timezone.utc), **kwargs)


async def test_retention_never_removes_confirmation_or_closed_submission_fences(client):
    owner, _ = await register_and_auth(client, email="synthetic-fences@example.com")
    owner_id = owner["user"]["id"]
    now = datetime.now(timezone.utc)
    old = now - timedelta(days=40)
    async with TestSession.begin() as db:
        run = SupplyReviewRun(user_id=owner_id, request_id=str(uuid4()), version=1,
                              status="cancelled", created_at=old, expires_at=old,
                              snapshot_at=old, supply_revision=0, proposal_version=1)
        db.add(run)
        await db.flush()
        proposal = SupplyReviewProposal(user_id=owner_id, run_id=run.id, version=1,
                                        expires_at=old, payload={})
        db.add(proposal)
        await db.flush()
        db.add(SupplyReviewConfirmation(user_id=owner_id, run_id=run.id, proposal_id=proposal.id,
                                       idempotency_key=str(uuid4()), order_id="ORD-synthetic-fence", created_at=old))
        db.add(ClosedOrderSubmission(user_id=owner_id, local_id=str(uuid4()), created_at=old))
    async with TestSession.begin() as db:
        assert await prune_abandoned_reviews(db, now=now, apply=True) == 0
        assert await db.scalar(select(func.count()).select_from(SupplyReviewConfirmation)) == 1
        assert await db.scalar(select(func.count()).select_from(ClosedOrderSubmission)) == 1
