"""
VitalTrack Backend - Order Routes
CRUD operations for purchase orders
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.api.deps import DB, CurrentUser
from app.models import ActivityActionType, ActivityLog, Item, Order, OrderItem, OrderStatus
from app.schemas import (
    OrderCreate,
    OrderListResponse,
    OrderResponse,
    OrderUpdate,
    SuccessResponse,
)


router = APIRouter(prefix="/orders", tags=["Orders"])


def generate_order_id(existing_count: int) -> str:
    """Generate a unique order ID like ORD-20260115-0001."""
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    sequence = str(existing_count + 1).zfill(4)
    return f"ORD-{date_str}-{sequence}"


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
    
    # Get total count
    count_query = select(func.count()).select_from(
        select(Order.id).where(Order.user_id == current_user.id).subquery()
    )
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
    # Count existing orders today for ID generation
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    count_result = await db.execute(
        select(func.count()).where(
            Order.user_id == current_user.id,
            Order.exported_at >= today_start,
        )
    )
    today_count = count_result.scalar() or 0
    
    # Generate order ID
    order_id = generate_order_id(today_count)
    
    # Calculate totals
    total_items = len(data.items)
    total_units = sum(item.quantity for item in data.items)
    
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
    - pending → ordered, declined
    - ordered → received, partially_received
    - received → stock_updated
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
    old_status = order.status
    
    # Update status and timestamp
    order.status = data.status
    
    if data.status == OrderStatus.ORDERED:
        order.ordered_at = now
    elif data.status == OrderStatus.RECEIVED:
        order.received_at = now
    elif data.status == OrderStatus.STOCK_UPDATED:
        order.applied_at = now
    elif data.status == OrderStatus.DECLINED:
        order.declined_at = now
    
    if data.notes:
        order.notes = data.notes
    
    # Log activity
    action_type = {
        OrderStatus.RECEIVED: ActivityActionType.ORDER_RECEIVED,
        OrderStatus.DECLINED: ActivityActionType.ORDER_DECLINED,
        OrderStatus.STOCK_UPDATED: ActivityActionType.ORDER_APPLIED,
    }.get(data.status, ActivityActionType.ITEM_UPDATE)
    
    activity = ActivityLog(
        user_id=current_user.id,
        action=action_type,
        item_name=f"Order {order.order_id}",
        order_id=order.order_id,
        details=f"Status: {old_status.value} → {data.status.value}",
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
    
    if order.status != OrderStatus.RECEIVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order must be in 'received' status to apply to stock",
        )
    
    # Update stock for each item
    for order_item in order.items:
        item_result = await db.execute(
            select(Item).where(
                Item.id == order_item.item_id,
                Item.user_id == current_user.id,
            )
        )
        item = item_result.scalar_one_or_none()
        
        if item:
            item.quantity += order_item.quantity
    
    # Update order status
    order.status = OrderStatus.STOCK_UPDATED
    order.applied_at = datetime.now(timezone.utc)
    
    # Log activity
    activity = ActivityLog(
        user_id=current_user.id,
        action=ActivityActionType.ORDER_APPLIED,
        item_name=f"Order {order.order_id}",
        order_id=order.order_id,
        details=f"Stock updated: +{order.total_units} units",
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
    
    if order.status not in [OrderStatus.PENDING, OrderStatus.DECLINED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending or declined orders can be deleted",
        )
    
    order_display_id = order.order_id
    
    await db.delete(order)
    await db.commit()
    
    return SuccessResponse(message=f"Order '{order_display_id}' deleted")
