"""
VitalTrack Backend - Item Routes
CRUD operations for inventory items
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import and_, or_, select

from app.api.deps import DB, CurrentUser, Pagination
from app.models import ActivityActionType, ActivityLog, Category, Item
from app.schemas import (
    ItemCreate,
    ItemList,
    ItemResponse,
    ItemStats,
    ItemUpdate,
    StockUpdate,
    SuccessResponse,
)


router = APIRouter(prefix="/items", tags=["Items"])


# =============================================================================
# LIST ITEMS
# =============================================================================
@router.get(
    "",
    response_model=ItemList,
    summary="List all items",
)
async def list_items(
    db: DB,
    current_user: CurrentUser,
    category_id: Optional[str] = Query(None, alias="categoryId"),
    is_active: Optional[bool] = Query(None, alias="isActive"),
    is_critical: Optional[bool] = Query(None, alias="isCritical"),
    low_stock_only: Optional[bool] = Query(False, alias="lowStockOnly"),
    out_of_stock_only: Optional[bool] = Query(False, alias="outOfStockOnly"),
    search: Optional[str] = Query(None, max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100, alias="pageSize"),
) -> ItemList:
    """
    Get all items for the current user with optional filters.
    
    - **categoryId**: Filter by category
    - **isActive**: Filter by active status
    - **isCritical**: Filter by critical flag
    - **lowStockOnly**: Only show items below minimum stock
    - **outOfStockOnly**: Only show items with zero quantity
    - **search**: Search in name, description, and brand
    """
    query = select(Item).where(Item.user_id == current_user.id)
    
    # Apply filters
    if category_id:
        query = query.where(Item.category_id == category_id)
    
    if is_active is not None:
        query = query.where(Item.is_active == is_active)
    
    if is_critical is not None:
        query = query.where(Item.is_critical == is_critical)
    
    if low_stock_only:
        query = query.where(
            and_(
                Item.quantity > 0,
                Item.quantity < Item.minimum_stock,
            )
        )
    
    if out_of_stock_only:
        query = query.where(Item.quantity <= 0)
    
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Item.name.ilike(search_term),
                Item.description.ilike(search_term),
                Item.brand.ilike(search_term),
            )
        )
    
    # Order by name
    query = query.order_by(Item.name)
    
    # Get total count
    count_result = await db.execute(
        select(Item.id).where(Item.user_id == current_user.id)
    )
    total = len(count_result.all())
    
    # Apply pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    
    result = await db.execute(query)
    items = result.scalars().all()
    
    return ItemList(
        items=[ItemResponse.model_validate(item) for item in items],
        total=total,
    )


@router.get(
    "/stats",
    response_model=ItemStats,
    summary="Get item statistics",
)
async def get_item_stats(
    db: DB,
    current_user: CurrentUser,
) -> ItemStats:
    """
    Get inventory statistics for dashboard.
    Returns counts matching frontend DashboardStats interface.
    """
    # Get items
    result = await db.execute(
        select(Item).where(
            Item.user_id == current_user.id,
            Item.is_active == True,
        )
    )
    items = result.scalars().all()
    
    total_items = len(items)
    out_of_stock = sum(1 for item in items if item.quantity <= 0)
    low_stock = sum(1 for item in items if 0 < item.quantity < item.minimum_stock)
    critical_items = sum(1 for item in items if item.is_critical)
    
    # Get total categories count
    from sqlalchemy import func
    cat_result = await db.execute(
        select(func.count()).select_from(Category).where(
            Category.user_id == current_user.id
        )
    )
    total_categories = cat_result.scalar() or 0
    
    # Get pending orders count (pending or received status)
    from app.models import Order, OrderStatus
    pending_result = await db.execute(
        select(func.count()).select_from(Order).where(
            Order.user_id == current_user.id,
            Order.status.in_([OrderStatus.PENDING, OrderStatus.RECEIVED])
        )
    )
    pending_orders_count = pending_result.scalar() or 0
    
    return ItemStats(
        total_items=total_items,
        total_categories=total_categories,
        out_of_stock=out_of_stock,
        low_stock=low_stock,
        critical_items=critical_items,
        pending_orders_count=pending_orders_count,
    )


@router.get(
    "/needs-attention",
    response_model=ItemList,
    summary="Get items needing attention",
)
async def get_items_needing_attention(
    db: DB,
    current_user: CurrentUser,
) -> ItemList:
    """
    Get items that are out of stock or low on stock.
    
    Results are ordered with out-of-stock items first,
    then critical items, then by quantity.
    """
    result = await db.execute(
        select(Item)
        .where(
            Item.user_id == current_user.id,
            Item.is_active == True,
            or_(
                Item.quantity <= 0,
                Item.quantity < Item.minimum_stock,
            ),
        )
        .order_by(
            Item.quantity,  # Out of stock first
            Item.is_critical.desc(),  # Critical items next
            Item.name,
        )
    )
    items = result.scalars().all()
    
    return ItemList(
        items=[ItemResponse.model_validate(item) for item in items],
        total=len(items),
    )


# =============================================================================
# GET SINGLE ITEM
# =============================================================================
@router.get(
    "/{item_id}",
    response_model=ItemResponse,
    summary="Get item by ID",
)
async def get_item(
    item_id: str,
    db: DB,
    current_user: CurrentUser,
) -> ItemResponse:
    """
    Get a single item by ID.
    """
    result = await db.execute(
        select(Item).where(
            Item.id == item_id,
            Item.user_id == current_user.id,
        )
    )
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found",
        )
    
    return ItemResponse.model_validate(item)


# =============================================================================
# CREATE ITEM
# =============================================================================
@router.post(
    "",
    response_model=ItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new item",
)
async def create_item(
    data: ItemCreate,
    db: DB,
    current_user: CurrentUser,
) -> ItemResponse:
    """
    Create a new inventory item.
    
    - **categoryId**: Category to assign item to (required)
    - **name**: Item name (required)
    - **quantity**: Current stock level
    - **minimumStock**: Reorder threshold
    - **isCritical**: Mark as critical equipment
    """
    # Verify category exists and belongs to user
    cat_result = await db.execute(
        select(Category).where(
            Category.id == data.category_id,
            Category.user_id == current_user.id,
        )
    )
    if not cat_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category not found",
        )
    
    item = Item(
        user_id=current_user.id,
        category_id=data.category_id,
        name=data.name,
        description=data.description,
        quantity=data.quantity,
        unit=data.unit,
        minimum_stock=data.minimum_stock,
        expiry_date=data.expiry_date,
        brand=data.brand,
        notes=data.notes,
        supplier_name=data.supplier_name,
        supplier_contact=data.supplier_contact,
        purchase_link=data.purchase_link,
        image_uri=data.image_uri,
        is_active=data.is_active,
        is_critical=data.is_critical,
        local_id=data.local_id,
    )
    db.add(item)
    await db.flush()
    
    # Log activity
    activity = ActivityLog(
        user_id=current_user.id,
        action=ActivityActionType.ITEM_CREATE,
        item_name=item.name,
        item_id=item.id,
        details=f"Created with {item.quantity} {item.unit}",
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(item)
    
    return ItemResponse.model_validate(item)


# =============================================================================
# UPDATE ITEM
# =============================================================================
@router.put(
    "/{item_id}",
    response_model=ItemResponse,
    summary="Update an item",
)
async def update_item(
    item_id: str,
    data: ItemUpdate,
    db: DB,
    current_user: CurrentUser,
) -> ItemResponse:
    """
    Update an existing item.
    
    All fields are optional - only provided fields will be updated.
    """
    result = await db.execute(
        select(Item).where(
            Item.id == item_id,
            Item.user_id == current_user.id,
        )
    )
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found",
        )
    
    # Track changes for activity log
    changes = []
    
    # Verify category if changing
    if data.category_id and data.category_id != item.category_id:
        cat_result = await db.execute(
            select(Category).where(
                Category.id == data.category_id,
                Category.user_id == current_user.id,
            )
        )
        if not cat_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Category not found",
            )
        item.category_id = data.category_id
        changes.append("category changed")
    
    # Update fields
    if data.name is not None:
        item.name = data.name
    if data.description is not None:
        item.description = data.description
    if data.quantity is not None and data.quantity != item.quantity:
        changes.append(f"qty: {item.quantity} → {data.quantity}")
        item.quantity = data.quantity
    if data.unit is not None:
        item.unit = data.unit
    if data.minimum_stock is not None:
        item.minimum_stock = data.minimum_stock
    if data.expiry_date is not None:
        item.expiry_date = data.expiry_date
    if data.brand is not None:
        item.brand = data.brand
    if data.notes is not None:
        item.notes = data.notes
    if data.supplier_name is not None:
        item.supplier_name = data.supplier_name
    if data.supplier_contact is not None:
        item.supplier_contact = data.supplier_contact
    if data.purchase_link is not None:
        item.purchase_link = data.purchase_link
    if data.image_uri is not None:
        item.image_uri = data.image_uri
    if data.is_active is not None:
        item.is_active = data.is_active
    if data.is_critical is not None:
        item.is_critical = data.is_critical
    
    # Log activity
    activity = ActivityLog(
        user_id=current_user.id,
        action=ActivityActionType.ITEM_UPDATE,
        item_name=item.name,
        item_id=item.id,
        details=", ".join(changes) if changes else "Updated",
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(item)
    
    return ItemResponse.model_validate(item)


# =============================================================================
# UPDATE STOCK ONLY
# =============================================================================
@router.patch(
    "/{item_id}/stock",
    response_model=ItemResponse,
    summary="Update item stock",
)
async def update_stock(
    item_id: str,
    data: StockUpdate,
    db: DB,
    current_user: CurrentUser,
) -> ItemResponse:
    """
    Quick update of item stock level.
    
    Use this for simple stock adjustments.
    """
    result = await db.execute(
        select(Item).where(
            Item.id == item_id,
            Item.user_id == current_user.id,
        )
    )
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found",
        )
    
    old_quantity = item.quantity
    item.quantity = data.quantity
    
    # Log activity
    activity = ActivityLog(
        user_id=current_user.id,
        action=ActivityActionType.STOCK_UPDATE,
        item_name=item.name,
        item_id=item.id,
        details=f"Stock: {old_quantity} → {data.quantity} {item.unit}",
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(item)
    
    return ItemResponse.model_validate(item)


# =============================================================================
# DELETE ITEM
# =============================================================================
@router.delete(
    "/{item_id}",
    response_model=SuccessResponse,
    summary="Delete an item",
)
async def delete_item(
    item_id: str,
    db: DB,
    current_user: CurrentUser,
) -> SuccessResponse:
    """
    Delete an inventory item.
    """
    result = await db.execute(
        select(Item).where(
            Item.id == item_id,
            Item.user_id == current_user.id,
        )
    )
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found",
        )
    
    item_name = item.name
    
    # Log activity before deletion
    activity = ActivityLog(
        user_id=current_user.id,
        action=ActivityActionType.ITEM_DELETE,
        item_name=item_name,
        details="Item deleted",
    )
    db.add(activity)
    
    await db.delete(item)
    await db.commit()
    
    return SuccessResponse(message=f"Item '{item_name}' deleted")
