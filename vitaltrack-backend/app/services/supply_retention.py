"""Bounded operator retention for abandoned reviews; never remove saved effects."""

from datetime import datetime, timedelta

from sqlalchemy import delete, exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supply_review import SupplyReviewConfirmation, SupplyReviewRun


async def prune_abandoned_reviews(
    db: AsyncSession, *, now: datetime, days: int = 30, limit: int = 100, apply: bool = False
) -> int:
    """Return a bounded candidate count, deleting only on explicit operator apply.

    The caller owns the transaction. Completed runs, confirmation records and
    closed-order fences are never eligible. SKIP LOCKED avoids waiting for an
    active request. No item names, owner identifiers or payloads are returned.
    """
    if type(days) is not int or not 30 <= days <= 3650:
        raise ValueError("Retention must be 30 to 3650 days")
    if type(limit) is not int or not 1 <= limit <= 100:
        raise ValueError("Batch size must be 1 to 100")
    if now.tzinfo is None:
        raise ValueError("A timezone-aware cutoff is required")
    confirmed = exists().where(SupplyReviewConfirmation.run_id == SupplyReviewRun.id)
    query = (
        select(SupplyReviewRun.id)
        .where(
            # Expiry is also derived on read, so old active storage states are
            # logically expired even when nobody has opened them since.
            SupplyReviewRun.status.in_(["expired", "cancelled", "needs_input", "awaiting_review", "stale"]),
            SupplyReviewRun.expires_at < now - timedelta(days=days),
            SupplyReviewRun.order_id.is_(None),
            ~confirmed,
        )
        .order_by(SupplyReviewRun.expires_at, SupplyReviewRun.id)
        .limit(limit)
    )
    if apply:
        query = query.with_for_update(skip_locked=True)
    ids = list((await db.execute(query)).scalars())
    if apply and ids:
        await db.execute(delete(SupplyReviewRun).where(SupplyReviewRun.id.in_(ids)))
    return len(ids)
