"""
VitalTrack Backend - Order Routes
CRUD operations for purchase orders
"""

from datetime import datetime, timezone
from typing import Annotated, Optional, Union
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import delete, func, select, update

from app.api.deps import DB, CurrentUser
from app.models import ActivityActionType, ActivityLog, ClosedOrderSubmission, Item, Order, OrderStatus
from app.schemas import (
    OrderCreate,
    OrderListResponse,
    OrderResponse,
    OrderUpdate,
    SuccessResponse,
)
from app.services.audit import log_audit
from app.schemas.order import ClosedSubmissionResolution, SavedSubmissionResolution
from app.services.orders import _find_order_by_local_id, _unit_key, allocate_order_id, create_order_uncommitted
from app.services.supply_revision import advance_supply_revision, lock_supply_revision
from app.utils.rate_limiter import authenticated_ai_rate_key, limiter


router = APIRouter(prefix="/orders", tags=["Orders"])


async def submission_owner(request: Request, user: CurrentUser) -> str:
    request.state.ai_user_id = user.id
    return user.id


SubmissionOwner = Annotated[str, Depends(submission_owner)]

LEGAL_STATUS_TRANSITIONS = {
    OrderStatus.PENDING: frozenset(
        {
            OrderStatus.ORDERED,
            OrderStatus.RECEIVED,
            OrderStatus.DECLINED,
        }
    ),
    OrderStatus.ORDERED: frozenset(
        {
            OrderStatus.PARTIALLY_RECEIVED,
            OrderStatus.RECEIVED,
            OrderStatus.DECLINED,
        }
    ),
    OrderStatus.PARTIALLY_RECEIVED: frozenset({OrderStatus.RECEIVED, OrderStatus.DECLINED}),
    OrderStatus.RECEIVED: frozenset({OrderStatus.DECLINED}),
    OrderStatus.DECLINED: frozenset(),
    OrderStatus.STOCK_UPDATED: frozenset(),
}


def _normalize_order_status(status_value: Optional[Union[str, OrderStatus]]) -> OrderStatus:
    """Convert DB/client status values into the canonical enum."""
    if status_value is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status is required",
        )

    try:
        return OrderStatus(status_value)
    except ValueError:
        member = OrderStatus.__members__.get(str(status_value).upper())
        if member:
            return member
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid order status",
        )


def _status_text(status_value: Optional[Union[str, OrderStatus]]) -> str:
    """Render a status safely whether SQLAlchemy returned a string or enum."""
    if status_value is None:
        return "unknown"

    if isinstance(status_value, OrderStatus):
        return status_value.name.lower()

    raw_status = str(status_value)
    try:
        return OrderStatus(raw_status).name.lower()
    except ValueError:
        member = OrderStatus.__members__.get(raw_status.upper())
        return member.name.lower() if member else raw_status


def _validate_status_transition(
    old_status: OrderStatus,
    new_status: OrderStatus,
) -> None:
    """Reject illegal order workflow changes while allowing retry-safe no-ops."""
    if old_status == new_status:
        return

    if new_status == OrderStatus.STOCK_UPDATED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order stock updates must be applied through the apply endpoint",
        )

    if new_status not in LEGAL_STATUS_TRANSITIONS.get(old_status, frozenset()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Illegal order status transition: "
                f"{_status_text(old_status)} -> {_status_text(new_status)}"
            ),
        )


# =============================================================================
# LIST ORDERS
# =============================================================================
@router.get(
    "",
    response_model=OrderListResponse,
    summary="List all orders",
)
async def list_orders(
    db: DB,
    current_user: CurrentUser,
    status_filter: Optional[OrderStatus] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
) -> OrderListResponse:
    """
    Get all orders for the current user.
    
    - **status**: Filter by order status
    """
    query = select(Order).where(Order.user_id == current_user.id)
    
    if status_filter:
        query = query.where(Order.status == status_filter)
    
    # Order by most recent first
    query = query.order_by(Order.exported_at.desc(), Order.id.desc())
    
    # Get total count with the same filters as the list query
    count_query = select(func.count()).select_from(Order).where(
        Order.user_id == current_user.id
    )
    if status_filter:
        count_query = count_query.where(Order.status == status_filter)
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0
    
    # Apply pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    
    result = await db.execute(query)
    orders = result.scalars().all()
    
    return OrderListResponse(
        orders=[OrderResponse.model_validate(order) for order in orders],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(offset + page_size) < total,
    )


# =============================================================================
# RECOVER A KNOWN SUBMISSION WITHOUT REPLAYING A WRITE
# =============================================================================
@router.get("/submission/{local_id}", response_model=OrderResponse)
@limiter.limit("60/minute", key_func=authenticated_ai_rate_key, fail_open=True)
async def get_order_submission(request: Request, local_id: UUID, db: DB, user: SubmissionOwner) -> OrderResponse:
    order = await _find_order_by_local_id(db, user, str(local_id))
    if order is None:
        raise HTTPException(404, "Order submission not found")
    return OrderResponse.model_validate(order)


@router.post("/submission/{local_id}/resolve", response_model=SavedSubmissionResolution | ClosedSubmissionResolution)
@limiter.limit("20/minute", key_func=authenticated_ai_rate_key)
async def resolve_order_submission(request: Request, local_id: UUID, db: DB, user: SubmissionOwner):
    """Explicitly recover a saved order or fence off a lost submission.

    The owner lock makes this mutually exclusive with order creation. A closed
    response means a delayed original POST can no longer create that order.
    No payload is replayed and no stock/order is created by this endpoint.
    """
    await lock_supply_revision(db, user)
    local_key = str(local_id)
    order = await _find_order_by_local_id(db, user, local_key)
    if order is not None:
        return SavedSubmissionResolution(order=OrderResponse.model_validate(order))
    if await db.get(ClosedOrderSubmission, (user, local_key)) is None:
        db.add(ClosedOrderSubmission(user_id=user, local_id=local_key, created_at=datetime.now(timezone.utc)))
        await log_audit(db, user, "order_submission", local_key, "close_interrupted", new_values={"state": "closed"})
        await db.flush()
    return ClosedSubmissionResolution()


# =============================================================================
# GET SINGLE ORDER
# =============================================================================
@router.get(
    "/{order_id}",
    response_model=OrderResponse,
    summary="Get order by ID",
)
async def get_order(
    order_id: str,
    db: DB,
    current_user: CurrentUser,
) -> OrderResponse:
    """
    Get a single order by ID or order_id (e.g., ORD-20260115-0001).
    """
    result = await db.execute(
        select(Order).where(
            Order.user_id == current_user.id,
            (Order.id == order_id) | (Order.order_id == order_id),
        )
    )
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )
    
    return OrderResponse.model_validate(order)


# =============================================================================
# CREATE ORDER
# =============================================================================
@router.post(
    "",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        status.HTTP_200_OK: {
            "model": OrderResponse,
            "description": "Replayed submission (same localId): the order it already created",
        },
    },
    summary="Create a new order",
)
async def create_order(
    data: OrderCreate,
    db: DB,
    current_user: CurrentUser,
    response: Response,
) -> OrderResponse:
    """
    Create a new purchase order.
    
    - **items**: List of items to order
    - **notes**: Optional notes
    - **localId**: Optional per-submission key. Sending the same key again
      returns the order it created (200) instead of creating another one.
    """
    order, replayed = await create_order_uncommitted(db, current_user.id, data, allocator=allocate_order_id)
    if replayed:
        response.status_code = status.HTTP_200_OK
    await db.commit()
    await db.refresh(order)
    return OrderResponse.model_validate(order)


# =============================================================================
# UPDATE ORDER STATUS
# =============================================================================
@router.patch(
    "/{order_id}/status",
    response_model=OrderResponse,
    summary="Update order status",
)
async def update_order_status(
    order_id: str,
    data: OrderUpdate,
    db: DB,
    current_user: CurrentUser,
) -> OrderResponse:
    """
    Update the status of an order.
    
    Valid status transitions:
    - pending → ordered, received, declined
    - ordered → received, partially_received, declined
    - partially_received → received, declined
    - received → declined (only while its stock is not applied)
    - stock_updated is only reached through POST /orders/{id}/apply
    """
    await lock_supply_revision(db, current_user.id)
    result = await db.execute(
        select(Order).where(
            Order.user_id == current_user.id,
            (Order.id == order_id) | (Order.order_id == order_id),
        )
    )
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )
    
    now = datetime.now(timezone.utc)
    old_status = _normalize_order_status(order.status)
    new_status = _normalize_order_status(data.status)
    _validate_status_transition(old_status, new_status)

    if old_status == new_status:
        return OrderResponse.model_validate(order)
    
    # Apply the transition atomically: the UPDATE only fires while the order is
    # still in the status we validated against, so two concurrent transitions
    # cannot both win (no read-then-write race / last-writer-wins).
    status_values: dict = {"status": new_status}
    if new_status == OrderStatus.ORDERED:
        status_values["ordered_at"] = now
    elif new_status == OrderStatus.RECEIVED:
        status_values["received_at"] = now
    elif new_status == OrderStatus.DECLINED:
        status_values["declined_at"] = now

    if data.notes:
        status_values["notes"] = data.notes

    transition_result = await db.execute(
        update(Order)
        .where(
            Order.id == order.id,
            Order.user_id == current_user.id,
            Order.status == old_status,
        )
        .values(**status_values)
        .returning(Order.id)
    )
    if transition_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Order was modified by another request. Please refresh and try again.",
        )

    # Log activity
    action_type = {
        OrderStatus.RECEIVED: ActivityActionType.ORDER_RECEIVED,
        OrderStatus.DECLINED: ActivityActionType.ORDER_DECLINED,
    }.get(new_status, ActivityActionType.ITEM_UPDATE)
    
    activity = ActivityLog(
        user_id=current_user.id,
        action=action_type,
        item_name=f"Order {order.order_id}",
        order_id=order.order_id,
        details=f"Status: {_status_text(old_status)} -> {_status_text(new_status)}",
    )
    db.add(activity)
    
    await advance_supply_revision(db, current_user.id)
    await db.commit()
    await db.refresh(order)
    
    return OrderResponse.model_validate(order)


# =============================================================================
# APPLY ORDER TO STOCK
# =============================================================================
@router.post(
    "/{order_id}/apply",
    response_model=OrderResponse,
    summary="Apply order to inventory",
)
async def apply_order_to_stock(
    order_id: str,
    db: DB,
    current_user: CurrentUser,
) -> OrderResponse:
    """
    Apply received order quantities to inventory.
    
    This will:
    1. Add order quantities to item stock levels
    2. Update order status to stock_updated
    """
    await lock_supply_revision(db, current_user.id)
    result = await db.execute(
        select(Order).where(
            Order.user_id == current_user.id,
            (Order.id == order_id) | (Order.order_id == order_id),
        )
    )
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )
    
    if _normalize_order_status(order.status) == OrderStatus.STOCK_UPDATED:
        return OrderResponse.model_validate(order)
    if _normalize_order_status(order.status) != OrderStatus.RECEIVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order must be in 'received' status to apply to stock",
        )

    if not order.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order has no items to apply",
        )
    
    # Resolve all inventory items before claiming so missing items don't change
    # order state or cause a partial stock application.
    missing_items = []
    changed_units = []
    for order_item in order.items:
        item_result = await db.execute(
            select(Item.id, Item.unit).where(
                Item.id == order_item.item_id,
                Item.user_id == current_user.id,
            )
        )
        current = item_result.one_or_none()

        if not current:
            missing_items.append(order_item.name)
        elif _unit_key(current.unit) != _unit_key(order_item.unit):
            # Adding 2 "boxes" to a count now kept in "pieces" corrupts stock.
            changed_units.append(f"{order_item.name} ({order_item.unit} → {current.unit})")

    if missing_items:
        missing_preview = ", ".join(missing_items[:3])
        if len(missing_items) > 3:
            missing_preview += ", ..."
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot apply order because inventory items are missing: {missing_preview}",
        )

    if changed_units:
        changed_preview = ", ".join(changed_units[:3])
        if len(changed_units) > 3:
            changed_preview += ", ..."
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot apply order because units changed since ordering: {changed_preview}. "
                "Update the item's stock manually."
            ),
        )

    now = datetime.now(timezone.utc)
    claim_result = await db.execute(
        update(Order)
        .where(
            Order.id == order.id,
            Order.user_id == current_user.id,
            Order.status == OrderStatus.RECEIVED,
        )
        .values(
            status=OrderStatus.STOCK_UPDATED,
            applied_at=now,
        )
        .returning(Order.id)
    )
    claimed_order_id = claim_result.scalar_one_or_none()

    if not claimed_order_id:
        await db.refresh(order)
        if _normalize_order_status(order.status) == OrderStatus.STOCK_UPDATED:
            return OrderResponse.model_validate(order)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order must be in 'received' status to apply to stock",
        )

    # Update stock for each item in one transaction. Lock rows in item-id order so
    # two concurrent applies that share items queue instead of deadlocking.
    updated_items = []
    for order_item in sorted(order.items, key=lambda line: (line.item_id, line.id)):
        item_update_result = await db.execute(
            update(Item)
            .where(
                Item.id == order_item.item_id,
                Item.user_id == current_user.id,
                # Also guards a unit edit committed after the check above.
                func.lower(func.trim(Item.unit)) == _unit_key(order_item.unit),
            )
            .values(
                quantity=Item.quantity + order_item.quantity,
                version=Item.version + 1,
            )
            .returning(Item.id, Item.name, Item.quantity)
        )
        updated_item = item_update_result.one_or_none()

        if not updated_item:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Cannot apply order because inventory items are missing or changed: "
                    f"{order_item.name}"
                ),
            )

        item_id, item_name, new_qty = updated_item
        old_qty = new_qty - order_item.quantity
        updated_items.append(
            {"id": item_id, "name": item_name, "old_qty": old_qty, "new_qty": new_qty}
        )

        # Audit each stock update
        await log_audit(
            db,
            user_id=current_user.id,
            entity_type="item",
            entity_id=item_id,
            action="stock_update",
            old_values={"quantity": old_qty},
            new_values={"quantity": new_qty, "source": f"order:{order.order_id}"},
        )

    # Log activity
    activity = ActivityLog(
        user_id=current_user.id,
        action=ActivityActionType.ORDER_APPLIED,
        item_name=f"Order {order.order_id}",
        order_id=order.order_id,
        details=f"Stock updated: +{order.total_units} units across {len(updated_items)} items",
    )
    db.add(activity)

    await advance_supply_revision(db, current_user.id)
    await db.commit()
    await db.refresh(order)

    return OrderResponse.model_validate(order)


# =============================================================================
# DELETE ORDER
# =============================================================================
@router.delete(
    "/{order_id}",
    response_model=SuccessResponse,
    summary="Delete an order",
)
async def delete_order(
    order_id: str,
    db: DB,
    current_user: CurrentUser,
) -> SuccessResponse:
    """
    Delete an order.
    
    **Note**: Orders can only be deleted if status is 'pending' or 'declined'.
    """
    await lock_supply_revision(db, current_user.id)
    result = await db.execute(
        select(Order).where(
            Order.user_id == current_user.id,
            (Order.id == order_id) | (Order.order_id == order_id),
        )
    )
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )
    
    if _normalize_order_status(order.status) not in [OrderStatus.PENDING, OrderStatus.DECLINED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending or declined orders can be deleted",
        )
    
    order_display_id = order.order_id
    # Snapshot before the DELETE: afterwards the session treats `order` as deleted.
    order_pk = order.id
    deleted_values = {
        "order_id": order_display_id,
        "status": _status_text(order.status),
        "total_items": order.total_items,
        "total_units": order.total_units,
    }

    deleted = await db.execute(
        delete(Order).where(
            Order.id == order_pk,
            Order.user_id == current_user.id,
            Order.status.in_([OrderStatus.PENDING, OrderStatus.DECLINED]),
        ).returning(Order.id)
    )
    if deleted.scalar_one_or_none() is None:
        raise HTTPException(status_code=400, detail="Only pending or declined orders can be deleted")

    # Keep the deletion in history (same convention as category deletes).
    db.add(
        ActivityLog(
            user_id=current_user.id,
            action=ActivityActionType.ITEM_DELETE,
            item_name=f"Order {order_display_id}",
            order_id=order_display_id,
            details="Order deleted",
        )
    )
    await log_audit(
        db,
        user_id=current_user.id,
        entity_type="order",
        entity_id=order_pk,
        action="delete",
        old_values=deleted_values,
    )
    await advance_supply_revision(db, current_user.id)
    await db.commit()

    return SuccessResponse(message=f"Order '{order_display_id}' deleted")
