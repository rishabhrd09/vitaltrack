"""
VitalTrack Backend - FIXED Sync Routes (v2)
Offline-first synchronization with ORPHAN CLEANUP

CRITICAL FIX: After processing push operations, delete any items
that exist in the database but were NOT included in the push.
This handles the case where user deletes items locally.

Replace your existing app/api/v1/sync.py with this file.
"""

from datetime import datetime, timezone
from typing import Optional, Set

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import or_, select, delete
from sqlalchemy.orm import selectinload

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


def _parse_datetime(value) -> Optional[datetime]:
    """Parse ISO datetime string to Python datetime object."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            # Handle ISO format with Z suffix
            if value.endswith('Z'):
                value = value[:-1] + '+00:00'
            return datetime.fromisoformat(value)
        except (ValueError, TypeError):
            return None
    return None


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
    
    CRITICAL FIX (v2): After UPSERT operations, performs ORPHAN CLEANUP:
    - Any items in the database that were NOT pushed will be DELETED
    - This ensures local deletions are reflected on the server
    """
    results: list[SyncOperationResult] = []
    success_count = 0
    error_count = 0
    
    # Track which items were pushed (for orphan cleanup)
    pushed_category_local_ids: Set[str] = set()
    pushed_item_local_ids: Set[str] = set()
    pushed_order_local_ids: Set[str] = set()
    
    print(f"[Sync] Push received: {len(data.operations)} operations from user {current_user.id}")
    
    # =========================================================================
    # CRITICAL FIX: Sort operations by dependency order
    # Categories must be processed BEFORE items (items reference categories)
    # Order: 1. Categories, 2. Items, 3. Orders
    # =========================================================================
    def get_operation_priority(op: SyncOperation) -> int:
        if op.entity == SyncEntityType.CATEGORY:
            return 0  # Process first
        elif op.entity == SyncEntityType.ITEM:
            return 1  # Process second
        elif op.entity == SyncEntityType.ORDER:
            return 2  # Process last
        return 3
    
    sorted_operations = sorted(data.operations, key=get_operation_priority)
    print(f"[Sync] Operations sorted: {sum(1 for o in sorted_operations if o.entity == SyncEntityType.CATEGORY)} categories, "
          f"{sum(1 for o in sorted_operations if o.entity == SyncEntityType.ITEM)} items, "
          f"{sum(1 for o in sorted_operations if o.entity == SyncEntityType.ORDER)} orders")
    
    for op in sorted_operations:
        try:
            # Track pushed entities for orphan cleanup
            if op.entity == SyncEntityType.CATEGORY and op.type != SyncOperationType.DELETE:
                pushed_category_local_ids.add(op.local_id)
            elif op.entity == SyncEntityType.ITEM and op.type != SyncOperationType.DELETE:
                pushed_item_local_ids.add(op.local_id)
            elif op.entity == SyncEntityType.ORDER and op.type != SyncOperationType.DELETE:
                pushed_order_local_ids.add(op.local_id)
            
            result = await _process_sync_operation(op, db, current_user)
            results.append(result)
            if result.success:
                success_count += 1
            else:
                error_count += 1
                print(f"[Sync] Operation failed: {op.id} - {result.error}")
        except Exception as e:
            print(f"[Sync] Operation exception: {op.id} - {str(e)}")
            results.append(
                SyncOperationResult(
                    operation_id=op.id,
                    success=False,
                    error=str(e),
                )
            )
            error_count += 1
    
    # =========================================================================
    # ORPHAN CLEANUP - Delete items not in the push
    # =========================================================================
    orphans_deleted = 0
    
    # Only do orphan cleanup if we received a meaningful number of operations
    # This prevents accidental deletion on empty/failed syncs
    if len(data.operations) >= 1:
        
        # Delete orphan items (items in DB but not pushed)
        if pushed_item_local_ids:
            orphan_items = await db.execute(
                select(Item).where(
                    Item.user_id == current_user.id,
                    Item.local_id.notin_(pushed_item_local_ids)
                )
            )
            for item in orphan_items.scalars().all():
                print(f"[Sync] Deleting orphan item: {item.local_id} - {item.name}")
                await db.delete(item)
                orphans_deleted += 1
        
        # Delete orphan categories (only if no items reference them)
        if pushed_category_local_ids:
            # Get categories that weren't pushed
            orphan_cats = await db.execute(
                select(Category).where(
                    Category.user_id == current_user.id,
                    Category.local_id.notin_(pushed_category_local_ids)
                )
            )
            for cat in orphan_cats.scalars().all():
                # Check if any items still reference this category
                items_in_cat = await db.execute(
                    select(Item).where(Item.category_id == cat.id).limit(1)
                )
                if not items_in_cat.scalar_one_or_none():
                    print(f"[Sync] Deleting orphan category: {cat.local_id} - {cat.name}")
                    await db.delete(cat)
                    orphans_deleted += 1
        
        # Delete orphan orders
        if pushed_order_local_ids:
            orphan_orders = await db.execute(
                select(Order).where(
                    Order.user_id == current_user.id,
                    Order.local_id.notin_(pushed_order_local_ids)
                )
            )
            for order in orphan_orders.scalars().all():
                print(f"[Sync] Deleting orphan order: {order.local_id}")
                await db.delete(order)
                orphans_deleted += 1
    
    if orphans_deleted > 0:
        print(f"[Sync] Orphan cleanup: deleted {orphans_deleted} orphaned records")
    
    # Log sync activity
    activity = ActivityLog(
        user_id=current_user.id,
        action=ActivityActionType.SYNC_PUSH,
        item_name="Sync Push",
        details=f"{success_count} succeeded, {error_count} failed, {orphans_deleted} orphans deleted",
    )
    db.add(activity)
    
    await db.commit()
    
    print(f"[Sync] Push complete: {success_count} succeeded, {error_count} failed, {orphans_deleted} orphans deleted")
    
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
    """
    Sync a category operation.
    CREATE = UPSERT (update if exists, insert if new)
    """
    
    if op.type == SyncOperationType.CREATE:
        # Check if already exists by local_id
        existing = await db.execute(
            select(Category).where(
                Category.user_id == current_user.id,
                Category.local_id == op.local_id,
            )
        )
        existing_category = existing.scalar_one_or_none()
        
        if existing_category:
            # UPSERT: Update existing category
            print(f"[Sync] Category exists, updating: {op.local_id} -> {existing_category.name}")
            
            if op.data:
                if "name" in op.data:
                    existing_category.name = op.data["name"]
                # NOTE: icon, color, is_active are not in the Category model
                if "description" in op.data:
                    existing_category.description = op.data.get("description")
                if "displayOrder" in op.data:
                    existing_category.display_order = op.data["displayOrder"]
                if "isDefault" in op.data:
                    existing_category.is_default = op.data["isDefault"]
                
                existing_category.updated_at = datetime.now(timezone.utc)
            
            return SyncOperationResult(
                operation_id=op.id,
                success=True,
                entity_id=op.entity_id,
                server_id=str(existing_category.id),
            )
        
        # Create new category
        # NOTE: icon, color, is_active are not in the Category model - ignore them
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
        
        print(f"[Sync] Category created: {category.id} - {category.name} (local: {op.local_id})")
        
        return SyncOperationResult(
            operation_id=op.id,
            success=True,
            entity_id=op.entity_id,
            server_id=str(category.id),
        )
    
    elif op.type == SyncOperationType.UPDATE:
        result = await db.execute(
            select(Category).where(
                Category.user_id == current_user.id,
                or_(
                    Category.id == op.entity_id if _is_valid_uuid(op.entity_id) else False,
                    Category.local_id == op.local_id,
                ),
            )
        )
        category = result.scalar_one_or_none()
        
        if not category:
            # Treat as create
            op.type = SyncOperationType.CREATE
            return await _sync_category(op, db, current_user)
        
        if op.data:
            for key, value in op.data.items():
                snake_key = _camel_to_snake(key)
                if hasattr(category, snake_key):
                    setattr(category, snake_key, value)
            category.updated_at = datetime.now(timezone.utc)
        
        return SyncOperationResult(
            operation_id=op.id,
            success=True,
            entity_id=op.entity_id,
            server_id=str(category.id),
        )
    
    elif op.type == SyncOperationType.DELETE:
        result = await db.execute(
            select(Category).where(
                Category.user_id == current_user.id,
                or_(
                    Category.id == op.entity_id if _is_valid_uuid(op.entity_id) else False,
                    Category.local_id == op.local_id,
                ),
            )
        )
        category = result.scalar_one_or_none()
        
        if category:
            await db.delete(category)
            print(f"[Sync] Category deleted: {op.local_id}")
        
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
    """
    Sync an item operation.
    CREATE = UPSERT (update if exists, insert if new)
    """
    
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
            # UPSERT: Update existing item
            print(f"[Sync] Item exists, updating: {op.local_id} -> {existing_item.name}")
            
            if op.data:
                # Resolve category ID if provided
                cat_id = op.data.get("categoryId")
                if cat_id:
                    cat_result = await db.execute(
                        select(Category).where(
                            Category.user_id == current_user.id,
                            or_(
                                Category.id == cat_id if _is_valid_uuid(cat_id) else False,
                                Category.local_id == cat_id,
                            ),
                        )
                    )
                    cat = cat_result.scalar_one_or_none()
                    if cat:
                        existing_item.category_id = cat.id
                
                # Update all provided fields
                field_mapping = {
                    "name": "name",
                    "description": "description",
                    "quantity": "quantity",
                    "unit": "unit",
                    "minimumStock": "minimum_stock",
                    "expiryDate": "expiry_date",
                    "brand": "brand",
                    "notes": "notes",
                    "supplierName": "supplier_name",
                    "supplierContact": "supplier_contact",
                    "purchaseLink": "purchase_link",
                    "imageUri": "image_uri",
                    "isActive": "is_active",
                    "isCritical": "is_critical",
                }
                
                for camel_key, snake_key in field_mapping.items():
                    if camel_key in op.data:
                        setattr(existing_item, snake_key, op.data[camel_key])
                
                existing_item.updated_at = datetime.now(timezone.utc)
            
            return SyncOperationResult(
                operation_id=op.id,
                success=True,
                entity_id=op.entity_id,
                server_id=str(existing_item.id),
            )
        
        # Find category for new item
        cat_id = op.data.get("categoryId")
        resolved_cat_id = None
        if cat_id:
            cat_result = await db.execute(
                select(Category).where(
                    Category.user_id == current_user.id,
                    or_(
                        Category.id == cat_id if _is_valid_uuid(cat_id) else False,
                        Category.local_id == cat_id,
                    ),
                )
            )
            cat = cat_result.scalar_one_or_none()
            if cat:
                resolved_cat_id = cat.id
        
        # Create new item
        item = Item(
            user_id=current_user.id,
            category_id=resolved_cat_id,
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
        
        print(f"[Sync] Item created: {item.id} - {item.name} (local: {op.local_id})")
        
        return SyncOperationResult(
            operation_id=op.id,
            success=True,
            entity_id=op.entity_id,
            server_id=str(item.id),
        )
    
    elif op.type == SyncOperationType.UPDATE:
        result = await db.execute(
            select(Item).where(
                Item.user_id == current_user.id,
                or_(
                    Item.id == op.entity_id if _is_valid_uuid(op.entity_id) else False,
                    Item.local_id == op.local_id,
                ),
            )
        )
        item = result.scalar_one_or_none()
        
        if not item:
            # Item doesn't exist - treat as create
            op.type = SyncOperationType.CREATE
            return await _sync_item(op, db, current_user)
        
        if op.data:
            # Resolve category ID if provided
            cat_id = op.data.get("categoryId")
            if cat_id:
                cat_result = await db.execute(
                    select(Category).where(
                        Category.user_id == current_user.id,
                        or_(
                            Category.id == cat_id if _is_valid_uuid(cat_id) else False,
                            Category.local_id == cat_id,
                        ),
                    )
                )
                cat = cat_result.scalar_one_or_none()
                if cat:
                    item.category_id = cat.id
            
            # Update fields
            field_mapping = {
                "name": "name",
                "description": "description",
                "quantity": "quantity",
                "unit": "unit",
                "minimumStock": "minimum_stock",
                "expiryDate": "expiry_date",
                "brand": "brand",
                "notes": "notes",
                "supplierName": "supplier_name",
                "supplierContact": "supplier_contact",
                "purchaseLink": "purchase_link",
                "imageUri": "image_uri",
                "isActive": "is_active",
                "isCritical": "is_critical",
            }
            
            for camel_key, snake_key in field_mapping.items():
                if camel_key in op.data:
                    setattr(item, snake_key, op.data[camel_key])
            
            item.updated_at = datetime.now(timezone.utc)
        
        print(f"[Sync] Item updated: {item.id} - {item.name}")
        
        return SyncOperationResult(
            operation_id=op.id,
            success=True,
            entity_id=op.entity_id,
            server_id=str(item.id),
        )
    
    elif op.type == SyncOperationType.DELETE:
        result = await db.execute(
            select(Item).where(
                Item.user_id == current_user.id,
                or_(
                    Item.id == op.entity_id if _is_valid_uuid(op.entity_id) else False,
                    Item.local_id == op.local_id,
                ),
            )
        )
        item = result.scalar_one_or_none()
        
        if item:
            item_name = item.name
            await db.delete(item)
            print(f"[Sync] Item deleted: {op.local_id} - {item_name}")
        
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
    """
    Sync an order operation.
    FIXED: Now properly saves and updates order items.
    """
    
    if op.type == SyncOperationType.CREATE:
        # Check if already exists by local_id OR by order_id (to handle duplicates)
        order_id_from_data = op.data.get("orderId") if op.data else None
        
        existing = await db.execute(
            select(Order).where(
                Order.user_id == current_user.id,
                or_(
                    Order.local_id == op.local_id,
                    Order.order_id == order_id_from_data if order_id_from_data else False,
                ),
            )
        )
        existing_order = existing.scalar_one_or_none()
        
        if existing_order:
            # UPSERT: Update existing order
            print(f"[Sync] Order exists, updating: {op.local_id} -> {existing_order.order_id}")
            
            if op.data:
                if "status" in op.data:
                    existing_order.status = OrderStatus(op.data["status"])
                if "totalItems" in op.data:
                    existing_order.total_items = op.data["totalItems"]
                if "totalUnits" in op.data:
                    existing_order.total_units = op.data["totalUnits"]
                if "orderedAt" in op.data and op.data["orderedAt"]:
                    existing_order.ordered_at = _parse_datetime(op.data["orderedAt"])
                if "receivedAt" in op.data and op.data["receivedAt"]:
                    existing_order.received_at = _parse_datetime(op.data["receivedAt"])
                if "appliedAt" in op.data and op.data["appliedAt"]:
                    existing_order.applied_at = _parse_datetime(op.data["appliedAt"])
                if "declinedAt" in op.data and op.data["declinedAt"]:
                    existing_order.declined_at = _parse_datetime(op.data["declinedAt"])
                
                # Update order items
                if "items" in op.data and op.data["items"]:
                    # Delete existing items
                    await db.execute(
                        delete(OrderItem).where(OrderItem.order_id == existing_order.id)
                    )
                    # Create new items
                    for item_data in op.data["items"]:
                        # NOTE: OrderItem model only has: name, brand, unit, quantity, 
                        # current_stock, minimum_stock, image_uri, supplier_name, purchase_link
                        order_item = OrderItem(
                            order_id=existing_order.id,
                            item_id=item_data.get("itemId") or item_data.get("id", ""),
                            name=item_data.get("name", "Unknown"),
                            brand=item_data.get("brand"),
                            unit=item_data.get("unit", "pieces"),
                            quantity=item_data.get("quantity", 1),
                            current_stock=item_data.get("currentStock", 0),
                            minimum_stock=item_data.get("minimumStock", 0),
                            image_uri=item_data.get("imageUri"),
                            supplier_name=item_data.get("supplierName"),
                            purchase_link=item_data.get("purchaseLink"),
                        )
                        db.add(order_item)
                
                existing_order.updated_at = datetime.now(timezone.utc)
            
            return SyncOperationResult(
                operation_id=op.id,
                success=True,
                entity_id=op.entity_id,
                server_id=str(existing_order.id),
            )
        
        # Create new order
        # IMPORTANT: order_id has a GLOBAL unique constraint (not per-user)
        # We must check if the order_id already exists globally and generate a new one if needed
        proposed_order_id = op.data.get("orderId", f"ORD-{op.local_id[:8]}")
        
        # Check if this order_id exists globally (for any user)
        global_check = await db.execute(
            select(Order).where(Order.order_id == proposed_order_id)
        )
        if global_check.scalar_one_or_none():
            # Order ID exists globally, generate a unique one using user's ID prefix
            import uuid
            unique_suffix = str(uuid.uuid4())[:8].upper()
            proposed_order_id = f"{proposed_order_id}-{current_user.id[:4]}-{unique_suffix}"
            print(f"[Sync] Order ID collision detected, using unique ID: {proposed_order_id}")
        
        order = Order(
            user_id=current_user.id,
            order_id=proposed_order_id,
            total_items=op.data.get("totalItems", 0),
            total_units=op.data.get("totalUnits", 0),
            status=OrderStatus(op.data.get("status", "pending")),
            exported_at=_parse_datetime(op.data.get("exportedAt")) or datetime.now(timezone.utc),
            ordered_at=_parse_datetime(op.data.get("orderedAt")),
            received_at=_parse_datetime(op.data.get("receivedAt")),
            applied_at=_parse_datetime(op.data.get("appliedAt")),
            declined_at=_parse_datetime(op.data.get("declinedAt")),
            local_id=op.local_id,
        )
        db.add(order)
        await db.flush()
        
        # Create order items
        items_count = 0
        if op.data.get("items"):
            for item_data in op.data["items"]:
                # NOTE: OrderItem model only has: name, brand, unit, quantity, 
                # current_stock, minimum_stock, image_uri, supplier_name, purchase_link
                order_item = OrderItem(
                    order_id=order.id,
                    item_id=item_data.get("itemId") or item_data.get("id", ""),
                    name=item_data.get("name", "Unknown"),
                    brand=item_data.get("brand"),
                    unit=item_data.get("unit", "pieces"),
                    quantity=item_data.get("quantity", 1),
                    current_stock=item_data.get("currentStock", 0),
                    minimum_stock=item_data.get("minimumStock", 0),
                    image_uri=item_data.get("imageUri"),
                    supplier_name=item_data.get("supplierName"),
                    purchase_link=item_data.get("purchaseLink"),
                )
                db.add(order_item)
                items_count += 1
        
        print(f"[Sync] Order created: {order.id} - {order.order_id} with {items_count} items")
        
        return SyncOperationResult(
            operation_id=op.id,
            success=True,
            entity_id=op.entity_id,
            server_id=str(order.id),
        )
    
    elif op.type == SyncOperationType.UPDATE:
        # Same as CREATE with UPSERT
        op.type = SyncOperationType.CREATE
        return await _sync_order(op, db, current_user)
    
    elif op.type == SyncOperationType.DELETE:
        result = await db.execute(
            select(Order).where(
                Order.user_id == current_user.id,
                or_(
                    Order.id == op.entity_id if _is_valid_uuid(op.entity_id) else False,
                    Order.local_id == op.local_id,
                ),
            )
        )
        order = result.scalar_one_or_none()
        
        if order:
            # Delete order items first (ON DELETE CASCADE should handle this, but be explicit)
            await db.execute(
                delete(OrderItem).where(OrderItem.order_id == order.id)
            )
            await db.delete(order)
            print(f"[Sync] Order deleted: {op.local_id}")
        
        return SyncOperationResult(
            operation_id=op.id,
            success=True,
            entity_id=op.entity_id,
        )
    
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
    Returns all entities for the user.
    """
    # Get categories
    cat_result = await db.execute(
        select(Category).where(Category.user_id == current_user.id)
    )
    categories = cat_result.scalars().all()
    
    # Get items
    item_result = await db.execute(
        select(Item).where(Item.user_id == current_user.id)
    )
    items = item_result.scalars().all()
    
    # Get orders WITH their items
    order_result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))  # CRITICAL: Load order items!
        .where(Order.user_id == current_user.id)
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
    
    print(f"[Sync] Pull complete for user {current_user.id}: {len(categories)} categories, {len(items)} items, {len(orders)} orders")
    
    return SyncPullResponse(
        categories=[CategoryResponse.model_validate(c) for c in categories],
        items=[ItemResponse.model_validate(i) for i in items],
        orders=[OrderResponse.model_validate(o) for o in orders],
        deleted_ids=[],
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
    """
    # Use the same push logic (which includes orphan cleanup)
    push_response = await sync_push(
        SyncPushRequest(operations=data.operations, last_sync_at=data.last_sync_at),
        db,
        current_user,
    )
    
    # Pull all data
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
        push_results=push_response.results,
        push_success_count=push_response.success_count,
        push_error_count=push_response.error_count,
        categories=[CategoryResponse.model_validate(c) for c in categories],
        items=[ItemResponse.model_validate(i) for i in items],
        orders=[OrderResponse.model_validate(o) for o in orders],
        deleted_ids=[],
        server_time=datetime.now(timezone.utc),
    )


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================
def _camel_to_snake(name: str) -> str:
    """Convert camelCase to snake_case."""
    result = []
    for char in name:
        if char.isupper():
            result.append('_')
            result.append(char.lower())
        else:
            result.append(char)
    return ''.join(result).lstrip('_')


def _is_valid_uuid(val: str) -> bool:
    """Check if string is a valid UUID."""
    try:
        import uuid
        uuid.UUID(str(val))
        return True
    except (ValueError, AttributeError):
        return False
