"""Order creation core, shared by manual routes and atomic proposal confirmation.

The caller owns commit/rollback; retries use savepoints and never discard a
proposal transaction. Transport routes keep their existing response contract.
"""

from datetime import datetime, timezone
import json
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import BigInteger, cast, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActivityActionType, ActivityLog, ClosedOrderSubmission, Item, Order, OrderItem, OrderNumberCounter, OrderStatus
from app.schemas import OrderCreate
from app.services.supply_revision import advance_supply_revision, lock_supply_revision

async def allocate_order_id(db: AsyncSession, now: datetime) -> str:
    """Atomically allocate the existing public ID format, surviving deletions."""
    day = now.strftime("%Y%m%d")
    result = await db.execute(
        insert(OrderNumberCounter).values(day=day, last_value=1)
        .on_conflict_do_update(
            index_elements=[OrderNumberCounter.day],
            set_={"last_value": OrderNumberCounter.last_value + 1},
        ).returning(OrderNumberCounter.last_value)
    )
    return f"ORD-{day}-{result.scalar_one():04d}"


# A taken number is retried after resynchronizing; a persistent conflict is a 409.
ORDER_ID_ATTEMPTS = 3


async def resync_order_counter(db: AsyncSession, now: datetime) -> None:
    """Move today's counter past numbers written outside it.

    An older deployment still serving during a rollout, or a restore, can store
    the next number itself. Seed like migration 0007: the day's highest suffix.
    """
    day = now.strftime("%Y%m%d")
    highest = (
        select(func.coalesce(func.max(cast(func.substring(Order.order_id, 14), BigInteger)), 0))
        .where(Order.order_id.regexp_match(f"^ORD-{day}-[0-9]{{4,18}}$"))
        .scalar_subquery()
    )
    statement = insert(OrderNumberCounter).values(day=day, last_value=highest)
    await db.execute(
        statement.on_conflict_do_update(
            index_elements=[OrderNumberCounter.day],
            set_={"last_value": func.greatest(OrderNumberCounter.last_value, statement.excluded.last_value)},
        )
    )


def _unit_key(unit: str) -> str:
    # Mirrors lower(trim(unit)) in apply_order_to_stock; trim() strips spaces only.
    return unit.strip(" ").lower()


async def _order_number_taken(db: AsyncSession, order_id: str) -> bool:
    return await db.scalar(select(Order.id).where(Order.order_id == order_id).limit(1)) is not None


def _check_replay(existing: Order, data: OrderCreate) -> None:
    # Compare persisted creation fields, not client timestamps, display IDs or
    # expectedVersion (which may be obsolete after the first successful save).
    fields = ("item_id", "name", "brand", "unit", "quantity", "current_stock",
              "minimum_stock", "image_uri", "supplier_name", "purchase_link")
    def lines(items):
        return sorted(json.dumps([getattr(line, key) for key in fields]) for line in items)
    if existing.notes != data.notes or lines(existing.items) != lines(data.items):
        raise HTTPException(409, "This submission ID already belongs to a different order. Reload your saved orders before retrying.")


async def _validate_order_items_belong_to_user(
    db: AsyncSession,
    user_id: str,
    items: list,
) -> None:
    """Ensure an order cannot reference missing or another user's inventory."""
    if not items:
        return

    requested_item_ids = {item.item_id for item in items}
    query = select(Item).where(
        Item.user_id == user_id,
        Item.id.in_(requested_item_ids),
    ).order_by(Item.id)
    if any(line.expected_version is not None for line in items):
        query = query.with_for_update()
    result = await db.execute(query)
    owned = {item.id: item for item in result.scalars().all()}
    owned_item_ids = set(owned)
    invalid_item_ids = [
        item_id for item_id in requested_item_ids if item_id not in owned_item_ids
    ]

    if invalid_item_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order contains invalid inventory item IDs",
        )

    # Optional reviewed-snapshot guard. Old clients retain their existing contract.
    for line in items:
        if line.expected_version is not None:
            current = owned[line.item_id]
            if not current.is_active or current.version != line.expected_version:
                raise HTTPException(409, "Inventory changed after review. Refresh and review the order quantities again.")


async def _find_order_by_local_id(
    db: AsyncSession,
    user_id: str,
    local_id: str,
) -> Optional[Order]:
    """Return the order an earlier submission with this localId created.

    Oldest first: migration 0010 keeps any legacy duplicates as stored and
    leaves the oldest row of each group under the unique index.
    """
    result = await db.execute(
        select(Order)
        .where(Order.user_id == user_id, Order.local_id == local_id)
        .order_by(Order.created_at, Order.id)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def create_order_uncommitted(db: AsyncSession, owner: str, data: OrderCreate, *, allocator=None) -> tuple[Order, bool]:
    """Return the created/replayed order without committing the caller's work."""
    allocator = allocator or allocate_order_id
    await lock_supply_revision(db, owner)
    if data.local_id is not None:
        existing = await _find_order_by_local_id(db, owner, data.local_id)
        if existing is not None:
            _check_replay(existing, data)
            return existing, True
        if await db.get(ClosedOrderSubmission, (owner, data.local_id)) is not None:
            raise HTTPException(409, "This interrupted submission was closed. Review a fresh order before submitting again.")
    await _validate_order_items_belong_to_user(db, owner, data.items)
    resync = False
    for attempt in range(ORDER_ID_ATTEMPTS):
        now = datetime.now(timezone.utc)
        public_id = None
        try:
            async with db.begin_nested():
                if resync:
                    await resync_order_counter(db, now)
                public_id = await allocator(db, now)
                order = Order(user_id=owner, order_id=public_id, total_items=len(data.items),
                              total_units=sum(i.quantity for i in data.items), status=OrderStatus.PENDING,
                              exported_at=now, notes=data.notes, local_id=data.local_id)
                db.add(order)
                await db.flush()
                for line in data.items:
                    db.add(OrderItem(order_id=order.id, **{key: getattr(line, key) for key in
                        ("item_id", "name", "brand", "unit", "quantity", "current_stock", "minimum_stock", "image_uri", "supplier_name", "purchase_link")}))
                db.add(ActivityLog(user_id=owner, action=ActivityActionType.ORDER_CREATED,
                                   item_name=f"Order {public_id}", order_id=public_id,
                                   details=f"{len(data.items)} items, {sum(i.quantity for i in data.items)} units"))
                await advance_supply_revision(db, owner)
                await db.flush()
            await db.refresh(order, ["items"])
            return order, False
        except IntegrityError:
            if data.local_id is not None:
                existing = await _find_order_by_local_id(db, owner, data.local_id)
                if existing is not None:
                    _check_replay(existing, data)
                    return existing, True
            if attempt + 1 == ORDER_ID_ATTEMPTS or public_id is None or not await _order_number_taken(db, public_id):
                raise
            resync = True
    raise HTTPException(409, "Could not allocate an order number. Retry this same submission.")
