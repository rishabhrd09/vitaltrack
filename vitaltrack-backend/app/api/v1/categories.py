"""
VitalTrack Backend - Category Routes
CRUD operations for inventory categories
"""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.api.deps import DB, CurrentUser
from app.models import ActivityActionType, ActivityLog, Category, Item
from app.schemas import (
    CategoryCreate,
    CategoryList,
    CategoryResponse,
    CategoryUpdate,
    CategoryWithCount,
    SuccessResponse,
)


router = APIRouter(prefix="/categories", tags=["Categories"])


# =============================================================================
# LIST CATEGORIES
# =============================================================================
@router.get(
    "",
    response_model=CategoryList,
    summary="List all categories",
)
async def list_categories(
    db: DB,
    current_user: CurrentUser,
) -> CategoryList:
    """
    Get all categories for the current user.
    
    Categories are ordered by display_order.
    """
    result = await db.execute(
        select(Category)
        .where(Category.user_id == current_user.id)
        .order_by(Category.display_order)
    )
    categories = result.scalars().all()
    
    return CategoryList(
        categories=[CategoryResponse.model_validate(c) for c in categories],
        total=len(categories),
    )


@router.get(
    "/with-counts",
    response_model=list[CategoryWithCount],
    summary="List categories with item counts",
)
async def list_categories_with_counts(
    db: DB,
    current_user: CurrentUser,
) -> list[CategoryWithCount]:
    """
    Get all categories with item counts.
    
    Useful for dashboard and inventory overview.
    """
    # Get categories with item counts
    result = await db.execute(
        select(
            Category,
            func.count(Item.id).label("item_count"),
        )
        .outerjoin(Item, (Item.category_id == Category.id) & (Item.is_active.is_(True)))
        .where(Category.user_id == current_user.id)
        .group_by(Category.id)
        .order_by(Category.display_order)
    )
    rows = result.all()
    
    return [
        CategoryWithCount(
            id=row.Category.id,
            name=row.Category.name,
            description=row.Category.description,
            display_order=row.Category.display_order,
            is_default=row.Category.is_default,
            created_at=row.Category.created_at,
            updated_at=row.Category.updated_at,
            item_count=row.item_count,
        )
        for row in rows
    ]


# =============================================================================
# GET SINGLE CATEGORY
# =============================================================================
@router.get(
    "/{category_id}",
    response_model=CategoryResponse,
    summary="Get category by ID",
)
async def get_category(
    category_id: str,
    db: DB,
    current_user: CurrentUser,
) -> CategoryResponse:
    """
    Get a single category by ID.
    """
    result = await db.execute(
        select(Category).where(
            Category.id == category_id,
            Category.user_id == current_user.id,
        )
    )
    category = result.scalar_one_or_none()
    
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )
    
    return CategoryResponse.model_validate(category)


# =============================================================================
# CREATE CATEGORY
# =============================================================================
@router.post(
    "",
    response_model=CategoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new category",
)
async def create_category(
    data: CategoryCreate,
    db: DB,
    current_user: CurrentUser,
) -> CategoryResponse:
    """
    Create a new category.
    
    - **name**: Category name (required)
    - **description**: Optional description
    - **display_order**: Order in the list (default: 0)
    - **is_default**: Whether this is a default category
    """
    # Check for duplicate name
    result = await db.execute(
        select(Category).where(
            Category.user_id == current_user.id,
            Category.name == data.name,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category with this name already exists",
        )
    
    category = Category(
        user_id=current_user.id,
        name=data.name,
        description=data.description,
        display_order=data.display_order,
        is_default=data.is_default,
        local_id=data.local_id,
    )
    db.add(category)
    await db.flush()
    
    # Log activity
    activity = ActivityLog(
        user_id=current_user.id,
        action=ActivityActionType.ITEM_CREATE,
        item_name=f"Category: {category.name}",
        item_id=category.id,
        details="Category created",
    )
    db.add(activity)
    
    await db.commit()
    await db.refresh(category)
    
    return CategoryResponse.model_validate(category)


# =============================================================================
# UPDATE CATEGORY
# =============================================================================
@router.put(
    "/{category_id}",
    response_model=CategoryResponse,
    summary="Update a category",
)
async def update_category(
    category_id: str,
    data: CategoryUpdate,
    db: DB,
    current_user: CurrentUser,
) -> CategoryResponse:
    """
    Update an existing category.
    
    All fields are optional - only provided fields will be updated.
    """
    result = await db.execute(
        select(Category).where(
            Category.id == category_id,
            Category.user_id == current_user.id,
        )
    )
    category = result.scalar_one_or_none()
    
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )
    
    # Check for duplicate name if changing
    if data.name and data.name != category.name:
        name_check = await db.execute(
            select(Category).where(
                Category.user_id == current_user.id,
                Category.name == data.name,
                Category.id != category_id,
            )
        )
        if name_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Category with this name already exists",
            )
    
    # Update fields
    if data.name is not None:
        category.name = data.name
    if data.description is not None:
        category.description = data.description
    if data.display_order is not None:
        category.display_order = data.display_order
    if data.is_default is not None:
        category.is_default = data.is_default
    
    await db.commit()
    await db.refresh(category)
    
    return CategoryResponse.model_validate(category)


# =============================================================================
# DELETE CATEGORY
# =============================================================================
@router.delete(
    "/{category_id}",
    response_model=SuccessResponse,
    summary="Delete a category",
)
async def delete_category(
    category_id: str,
    db: DB,
    current_user: CurrentUser,
) -> SuccessResponse:
    """
    Delete a category.
    
    **Warning**: This will also delete all items in the category!
    """
    result = await db.execute(
        select(Category).where(
            Category.id == category_id,
            Category.user_id == current_user.id,
        )
    )
    category = result.scalar_one_or_none()
    
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )
    
    category_name = category.name
    
    # Log activity before deletion
    activity = ActivityLog(
        user_id=current_user.id,
        action=ActivityActionType.ITEM_DELETE,
        item_name=f"Category: {category_name}",
        details="Category and all items deleted",
    )
    db.add(activity)
    
    await db.delete(category)
    await db.commit()
    
    return SuccessResponse(message=f"Category '{category_name}' deleted")
