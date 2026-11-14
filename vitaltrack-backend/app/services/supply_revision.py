"""Cooperating normal writers and proposal confirmation share one short lock.

The lock exists only inside the caller's SQL transaction. It is never held
while calling a model, generating audio/PDFs or waiting for human review.
"""

from fastapi import HTTPException
from sqlalchemy import inspect, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import DBAPIError

from app.models.supply_review import SupplyRevision


async def lock_supply_revision(db: AsyncSession, owner: str) -> SupplyRevision:
    transaction = db.sync_session.get_transaction()
    cached = db.info.get("carekosh_supply_lock")
    if cached and cached[0] is transaction and cached[1] == owner and not inspect(cached[2]).expired:
        return cached[2]
    try:
        # Both owner-lock acquisition and later row locks are bounded. The value
        # is static; no caller-controlled SQL setting reaches this statement.
        await db.execute(text("SET LOCAL lock_timeout = '1500ms'"))
        query = select(SupplyRevision).where(SupplyRevision.user_id == owner).with_for_update().execution_options(populate_existing=True)
        row = (await db.execute(query)).scalar_one_or_none()
        if row is None:
            # Existing owners avoid a redundant INSERT/unique-index round trip.
            # First-write races still serialize on the primary key, followed by
            # the same locked read after the concurrent insert commits.
            await db.execute(insert(SupplyRevision).values(user_id=owner, revision=0).on_conflict_do_nothing(index_elements=[SupplyRevision.user_id]))
            row = (await db.execute(query)).scalar_one()
    except DBAPIError as error:
        cause = getattr(error.orig, "__cause__", None)
        state = getattr(error.orig, "sqlstate", None) or getattr(cause, "sqlstate", None)
        if state in {"55P03", "57014", "40P01"}:
            raise HTTPException(503, "Supply changes are busy. Retry this same request shortly.", headers={"Retry-After": "2"}) from None
        raise
    # Reusing the row avoids another insert/select pair when a writer advances
    # the revision later in this same transaction. Savepoint rollback expiry
    # forces a fresh read; commit/rollback changes the transaction identity.
    db.info["carekosh_supply_lock"] = (db.sync_session.get_transaction(), owner, row)
    return row


async def advance_supply_revision(db: AsyncSession, owner: str) -> int:
    row = await lock_supply_revision(db, owner)
    row.revision += 1
    await db.flush()
    return row.revision
