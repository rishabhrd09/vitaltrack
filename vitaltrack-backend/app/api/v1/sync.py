"""
VitalTrack Backend - Sync Routes
Offline-first synchronization endpoints
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import or_, select

from app.api.deps import DB, CurrentUser
from app.models import (
    ActivityActionType,
    ActivityLog,
    Category,
    Item,
    Order,
    OrderItem,
    OrderStatus,
)
from app.schemas import (
    CategoryResponse,
    FullSyncRequest,
    FullSyncResponse,
    ItemResponse,
    OrderResponse,
    SyncEntityType,
    SyncOperation,
    SyncOperationResult,
    SyncOperationType,
    SyncPullRequest,
    SyncPullResponse,
    SyncPushRequest,
    SyncPushResponse,
)


router = APIRouter(prefix="/sync", tags=["Sync"])


# =============================================================================
# PUSH LOCAL CHANGES
# =============================================================================
@router.post(
    "/push",
    response_model=SyncPushResponse,
    summary="Push local changes to server",
)
async def sync_push(
    data: SyncPushRequest,
    db: DB,
    current_user: CurrentUser,
) -> SyncPushResponse:
    """
    Push local changes from the mobile app to the server.
    
    Processes create, update, and delete operations for
    categories, items, and orders.
    """
    results: list[SyncOperationResult] = []
    success_count = 0
    error_count = 0
    
    for op in data.operations:
        try:
            result = await _process_sync_operation(op, db, current_user)
            results.append(result)
            if result.success:
                success_count += 1
            else:
                error_count += 1
        except Exception as e:
            results.append(
                SyncOperationResult(
                    operation_id=op.id,
                    success=False,
                    error=str(e),
                )
            )
            error_count += 1
    
    # Log sync activity
    activity = ActivityLog(
        user_id=current_user.id,
        action=ActivityActionType.SYNC_PUSH,
        item_name="Sync Push",
        details=f"{success_count} succeeded, {error_count} failed",
    )
    db.add(activity)
    
    await db.commit()
    
    return SyncPushResponse(
        results=results,
        server_time=datetime.now(timezone.utc),
        success_count=success_count,
        error_count=error_count,
    )


async def _process_sync_operation(
    op: SyncOperation,
    db,
    current_user,
) -> SyncOperationResult:
    """Process a single sync operation."""
    
    if op.entity == SyncEntityType.CATEGORY:
        return await _sync_category(op, db, current_user)
    elif op.entity == SyncEntityType.ITEM:
        return await _sync_item(op, db, current_user)
    elif op.entity == SyncEntityType.ORDER:
        return await _sync_order(op, db, current_user)
    else:
        return SyncOperationResult(
            operation_id=op.id,
            success=False,
            error=f"Unknown entity type: {op.entity}",
        )


async def _sync_category(
    op: SyncOperation,
    db,
    current_user,
) -> SyncOperationResult:
    """Sync a category operation."""
    
    if op.type == SyncOperationType.CREATE:
        # Check if already exists by local_id
        existing = await db.execute(
            select(Category).where(
                Category.user_id == current_user.id,
                Category.local_id == op.local_id,
            )
        )
        if existing.scalar_one_or_none():
            return SyncOperationResult(
                operation_id=op.id,
                success=True,
                entity_id=op.entity_id,
                server_id=existing.scalar_one_or_none().id,
            )
        
        category = Category(
            user_id=current_user.id,
            name=op.data.get("name", "Untitled"),
            description=op.data.get("description"),
            display_order=op.data.get("displayOrder", 0),
            is_default=op.data.get("isDefault", False),
            local_id=op.local_id,
        )
        db.add(category)
        await db.flush()
        
        return SyncOperationResult(
            operation_id=op.id,
            success=True,
            entity_id=op.entity_id,
            server_id=category.id,
        )
    
    elif op.type == SyncOperationType.UPDATE:
        result = await db.execute(
            select(Category).where(
                Category.user_id == current_user.id,
                or_(
                    Category.id == op.entity_id,
                    Category.local_id == op.local_id,
                ),
            )
        )
        category = result.scalar_one_or_none()
        
        if not category:
            return SyncOperationResult(
                operation_id=op.id,
                success=False,
                error="Category not found",
            )
        
        if op.data:
            if "name" in op.data:
                category.name = op.data["name"]
            if "description" in op.data:
                category.description = op.data["description"]
            if "displayOrder" in op.data:
                category.display_order = op.data["displayOrder"]
            if "isDefault" in op.data:
                category.is_default = op.data["isDefault"]
        
        return SyncOperationResult(
            operation_id=op.id,
            success=True,
            entity_id=op.entity_id,
            server_id=category.id,
        )
    
    elif op.type == SyncOperationType.DELETE:
        result = await db.execute(
            select(Category).where(
                Category.user_id == current_user.id,
                or_(
                    Category.id == op.entity_id,
                    Category.local_id == op.local_id,
                ),
            )
        )
        category = result.scalar_one_or_none()
        
        if category:
            await db.delete(category)
        
        return SyncOperationResult(
            operation_id=op.id,
            success=True,
            entity_id=op.entity_id,
        )
    
    return SyncOperationResult(
        operation_id=op.id,
        success=False,
        error=f"Unknown operation type: {op.type}",
    )


async def _sync_item(
    op: SyncOperation,
    db,
    current_user,
) -> SyncOperationResult:
    """Sync an item operation."""
    
    if op.type == SyncOperationType.CREATE:
        # Check if already exists by local_id
        existing = await db.execute(
            select(Item).where(
                Item.user_id == current_user.id,
                Item.local_id == op.local_id,
            )
        )
        existing_item = existing.scalar_one_or_none()
        if existing_item:
            return SyncOperationResult(
                operation_id=op.id,
                success=True,
                entity_id=op.entity_id,
                server_id=existing_item.id,
            )
        
        # Find category
        cat_id = op.data.get("categoryId")
        if cat_id:
            cat_result = await db.execute(
                select(Category).where(
                    Category.user_id == current_user.id,
                    or_(
                        Category.id == cat_id,
                        Category.local_id == cat_id,
                    ),
                )
            )
            cat = cat_result.scalar_one_or_none()
            if cat:
                cat_id = cat.id
        
        item = Item(
            user_id=current_user.id,
            category_id=cat_id,
            name=op.data.get("name", "Untitled"),
            description=op.data.get("description"),
            quantity=op.data.get("quantity", 0),
            unit=op.data.get("unit", "pieces"),
            minimum_stock=op.data.get("minimumStock", 0),
            expiry_date=op.data.get("expiryDate"),
            brand=op.data.get("brand"),
            notes=op.data.get("notes"),
            supplier_name=op.data.get("supplierName"),
            supplier_contact=op.data.get("supplierContact"),
            purchase_link=op.data.get("purchaseLink"),
            image_uri=op.data.get("imageUri"),
            is_active=op.data.get("isActive", True),
            is_critical=op.data.get("isCritical", False),
            local_id=op.local_id,
        )
        db.add(item)
        await db.flush()
        
        return SyncOperationResult(
            operation_id=op.id,
            success=True,
            entity_id=op.entity_id,
            server_id=item.id,
        )
    
    elif op.type == SyncOperationType.UPDATE:
        result = await db.execute(
            select(Item).where(
                Item.user_id == current_user.id,
                or_(
                    Item.id == op.entity_id,
                    Item.local_id == op.local_id,
                ),
            )
        )
        item = result.scalar_one_or_none()
        
        if not item:
            return SyncOperationResult(
                operation_id=op.id,
                success=False,
                error="Item not found",
            )
        
        if op.data:
            for key, value in op.data.items():
                # Convert camelCase to snake_case
                snake_key = "".join(
                    ["_" + c.lower() if c.isupper() else c for c in key]
                ).lstrip("_")
                if hasattr(item, snake_key):
                    setattr(item, snake_key, value)
        
        return SyncOperationResult(
            operation_id=op.id,
            success=True,
            entity_id=op.entity_id,
            server_id=item.id,
        )
    
    elif op.type == SyncOperationType.DELETE:
        result = await db.execute(
            select(Item).where(
                Item.user_id == current_user.id,
                or_(
                    Item.id == op.entity_id,
                    Item.local_id == op.local_id,
                ),
            )
        )
        item = result.scalar_one_or_none()
        
        if item:
            await db.delete(item)
        
        return SyncOperationResult(
            operation_id=op.id,
            success=True,
            entity_id=op.entity_id,
        )
    
    return SyncOperationResult(
        operation_id=op.id,
        success=False,
        error=f"Unknown operation type: {op.type}",
    )


async def _sync_order(
    op: SyncOperation,
    db,
    current_user,
) -> SyncOperationResult:
    """Sync an order operation."""
    # Orders are typically created on the client and pushed to server
    # This is a simplified implementation
    
    if op.type == SyncOperationType.CREATE:
        existing = await db.execute(
            select(Order).where(
                Order.user_id == current_user.id,
                Order.local_id == op.local_id,
            )
        )
        existing_order = existing.scalar_one_or_none()
        if existing_order:
            return SyncOperationResult(
                operation_id=op.id,
                success=True,
                entity_id=op.entity_id,
                server_id=existing_order.id,
            )
        
        # Create order (simplified)
        order = Order(
            user_id=current_user.id,
            order_id=op.data.get("orderId", f"ORD-{op.local_id[:8]}"),
            total_items=op.data.get("totalItems", 0),
            total_units=op.data.get("totalUnits", 0),
            status=OrderStatus(op.data.get("status", "pending")),
            exported_at=datetime.now(timezone.utc),
            local_id=op.local_id,
        )
        db.add(order)
        await db.flush()
        
        return SyncOperationResult(
            operation_id=op.id,
            success=True,
            entity_id=op.entity_id,
            server_id=order.id,
        )
    
    # Handle update and delete similarly
    return SyncOperationResult(
        operation_id=op.id,
        success=True,
        entity_id=op.entity_id,
    )


# =============================================================================
# PULL SERVER CHANGES
# =============================================================================
@router.post(
    "/pull",
    response_model=SyncPullResponse,
    summary="Pull server changes",
)
async def sync_pull(
    data: SyncPullRequest,
    db: DB,
    current_user: CurrentUser,
) -> SyncPullResponse:
    """
    Pull changes from the server since last sync.
    
    Returns all entities updated after the last_sync_at timestamp.
    """
    query_filter = [Category.user_id == current_user.id]
    
    if data.last_sync_at:
        query_filter.append(Category.updated_at > data.last_sync_at)
    
    # Get categories
    cat_result = await db.execute(
        select(Category).where(*query_filter)
    )
    categories = cat_result.scalars().all()
    
    # Get items
    item_filter = [Item.user_id == current_user.id]
    if data.last_sync_at:
        item_filter.append(Item.updated_at > data.last_sync_at)
    
    item_result = await db.execute(
        select(Item).where(*item_filter)
    )
    items = item_result.scalars().all()
    
    # Get orders
    order_filter = [Order.user_id == current_user.id]
    if data.last_sync_at:
        order_filter.append(Order.updated_at > data.last_sync_at)
    
    order_result = await db.execute(
        select(Order).where(*order_filter)
    )
    orders = order_result.scalars().all()
    
    # Log sync activity
    activity = ActivityLog(
        user_id=current_user.id,
        action=ActivityActionType.SYNC_PULL,
        item_name="Sync Pull",
        details=f"{len(categories)} categories, {len(items)} items, {len(orders)} orders",
    )
    db.add(activity)
    await db.commit()
    
    return SyncPullResponse(
        categories=[CategoryResponse.model_validate(c) for c in categories],
        items=[ItemResponse.model_validate(i) for i in items],
        orders=[OrderResponse.model_validate(o) for o in orders],
        deleted_ids=[],  # Would need soft delete tracking for this
        server_time=datetime.now(timezone.utc),
        has_more=False,
    )


# =============================================================================
# FULL SYNC (PUSH + PULL)
# =============================================================================
@router.post(
    "/full",
    response_model=FullSyncResponse,
    summary="Full sync (push + pull)",
)
async def full_sync(
    data: FullSyncRequest,
    db: DB,
    current_user: CurrentUser,
) -> FullSyncResponse:
    """
    Perform a full sync: push local changes, then pull server changes.
    
    This is the recommended sync method for initial sync and periodic
    full synchronization.
    """
    # Process push operations
    results: list[SyncOperationResult] = []
    success_count = 0
    error_count = 0
    
    for op in data.operations:
        try:
            result = await _process_sync_operation(op, db, current_user)
            results.append(result)
            if result.success:
                success_count += 1
            else:
                error_count += 1
        except Exception as e:
            results.append(
                SyncOperationResult(
                    operation_id=op.id,
                    success=False,
                    error=str(e),
                )
            )
            error_count += 1
    
    await db.commit()
    
    # Pull all data (no timestamp filter for full sync)
    cat_result = await db.execute(
        select(Category).where(Category.user_id == current_user.id)
    )
    categories = cat_result.scalars().all()
    
    item_result = await db.execute(
        select(Item).where(Item.user_id == current_user.id)
    )
    items = item_result.scalars().all()
    
    order_result = await db.execute(
        select(Order).where(Order.user_id == current_user.id)
    )
    orders = order_result.scalars().all()
    
    return FullSyncResponse(
        push_results=results,
        push_success_count=success_count,
        push_error_count=error_count,
        categories=[CategoryResponse.model_validate(c) for c in categories],
        items=[ItemResponse.model_validate(i) for i in items],
        orders=[OrderResponse.model_validate(o) for o in orders],
        deleted_ids=[],
        server_time=datetime.now(timezone.utc),
    )
