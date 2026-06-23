"""
VitalTrack Backend - Order Routes
CRUD operations for purchase orders
"""

from datetime import datetime, timezone
from typing import Optional, Union

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.api.deps import DB, CurrentUser
from app.models import ActivityActionType, ActivityLog, Item, Order, OrderItem, OrderStatus
from app.schemas import (
    OrderCreate,
    OrderListResponse,
    OrderResponse,
    OrderUpdate,
    SuccessResponse,
)
from app.services.audit import log_audit


router = APIRouter(prefix="/orders", tags=["Orders"])

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
        }
    ),
    OrderStatus.PARTIALLY_RECEIVED: frozenset({OrderStatus.RECEIVED}),
    OrderStatus.RECEIVED: frozenset(),
    OrderStatus.DECLINED: frozenset(),
    OrderStatus.STOCK_UPDATED: frozenset(),
}


def generate_order_id(existing_count: int) -> str:
    """Generate a unique order ID like ORD-20260115-0001."""
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    sequence = str(existing_count + 1).zfill(4)
    return f"ORD-{date_str}-{sequence}"


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


async def _validate_order_items_belong_to_user(
    db: DB,
    user_id: str,
    items: list,
) -> None:
    """Ensure an order cannot reference missing or another user's inventory."""
    if not items:
        return

    requested_item_ids = {item.item_id for item in items}
    result = await db.execute(
        select(Item.id).where(
            Item.user_id == user_id,
            Item.id.in_(requested_item_ids),
        )
    )
    owned_item_ids = set(result.scalars().all())
    invalid_item_ids = [
        item_id for item_id in requested_item_ids if item_id not in owned_item_ids
    ]

    if invalid_item_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order contains invalid inventory item IDs",
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
    query = query.order_by(Order.exported_at.desc())
    
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
    summary="Create a new order",
)
async def create_order(
    data: OrderCreate,
    db: DB,
    current_user: CurrentUser,
) -> OrderResponse:
    """
    Create a new purchase order.
    
    - **items**: List of items to order
    - **notes**: Optional notes
    """
    await _validate_order_items_belong_to_user(db, current_user.id, data.items)

    # Count existing orders today globally for ID generation
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    count_result = await db.execute(
        select(func.count()).where(
            Order.exported_at >= today_start,
        )
    )
    today_count = count_result.scalar() or 0

    # Calculate totals
    total_items = len(data.items)
    total_units = sum(item.quantity for item in data.items)

    for attempt in range(3):
        order_id = generate_order_id(today_count + attempt)
        now = datetime.now(timezone.utc)

        # Create order
        order = Order(
            user_id=current_user.id,
            order_id=order_id,
            total_items=total_items,
            total_units=total_units,
            status=OrderStatus.PENDING,
            exported_at=now,
            notes=data.notes,
            local_id=data.local_id,
        )
        db.add(order)

        try:
            await db.flush()

            # Create order items
            for item_data in data.items:
                order_item = OrderItem(
                    order_id=order.id,
                    item_id=item_data.item_id,
                    name=item_data.name,
                    brand=item_data.brand,
                    unit=item_data.unit,
                    quantity=item_data.quantity,
                    current_stock=item_data.current_stock,
                    minimum_stock=item_data.minimum_stock,
                    image_uri=item_data.image_uri,
                    supplier_name=item_data.supplier_name,
                    purchase_link=item_data.purchase_link,
                )
                db.add(order_item)

            # Log activity
            activity = ActivityLog(
                user_id=current_user.id,
                action=ActivityActionType.ORDER_CREATED,
                item_name=f"Order {order_id}",
                order_id=order_id,
                details=f"{total_items} items, {total_units} units",
            )
            db.add(activity)

            await db.commit()
            await db.refresh(order)

            return OrderResponse.model_validate(order)
        except IntegrityError:
            await db.rollback()
            if attempt == 2:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Order ID conflict. Please try again.",
                )

    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Order ID conflict. Please try again.",
    )


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
    - ordered → received, partially_received
    - partially_received → received
    - stock_updated is only reached through POST /orders/{id}/apply
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
    for order_item in order.items:
        item_result = await db.execute(
            select(Item.id).where(
                Item.id == order_item.item_id,
                Item.user_id == current_user.id,
            )
        )
        item_id = item_result.scalar_one_or_none()

        if not item_id:
            missing_items.append(order_item.name)

    if missing_items:
        missing_preview = ", ".join(missing_items[:3])
        if len(missing_items) > 3:
            missing_preview += ", ..."
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot apply order because inventory items are missing: {missing_preview}",
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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order must be in 'received' status to apply to stock",
        )

    # Update stock for each item in one transaction.
    updated_items = []
    for order_item in order.items:
        item_update_result = await db.execute(
            update(Item)
            .where(
                Item.id == order_item.item_id,
                Item.user_id == current_user.id,
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
                    "Cannot apply order because inventory items are missing: "
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
    
    await db.delete(order)
    await db.commit()
    
    return SuccessResponse(message=f"Order '{order_display_id}' deleted")
