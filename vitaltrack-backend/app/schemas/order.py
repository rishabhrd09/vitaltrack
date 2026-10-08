"""
VitalTrack Backend - Order Schemas (FIXED)

CRITICAL FIX: Added 'items' field to OrderResponse schema.
Without this, orders are returned without their items array,
causing the frontend to show empty orders.

Replace your app/schemas/order.py with this file.
"""

from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field, field_validator

INT32_MAX = 2_147_483_647


# =============================================================================
# ORDER ITEM SCHEMA
# =============================================================================

class OrderItemBase(BaseModel):
    """Base order item schema."""
    item_id: str = Field(alias="itemId")
    name: str
    brand: Optional[str] = None
    unit: str = "pieces"
    quantity: int = Field(1, gt=0, le=999999)
    current_stock: int = Field(default=0, alias="currentStock")
    minimum_stock: int = Field(default=0, alias="minimumStock")
    category_name: Optional[str] = Field(None, alias="categoryName")
    image_uri: Optional[str] = Field(None, alias="imageUri")
    supplier_name: Optional[str] = Field(None, alias="supplierName")
    purchase_link: Optional[str] = Field(None, alias="purchaseLink")
    is_essential: bool = Field(default=False, alias="isEssential")
    notes: Optional[str] = None

    model_config = {"populate_by_name": True}


class OrderItemCreate(OrderItemBase):
    """Create order item schema.

    Bounds mirror the database columns, so oversized input is a 422 instead of a
    500. They apply to requests only: rows already stored must still serialise.
    """
    expected_version: Optional[int] = Field(None, ge=1, alias="expectedVersion")
    id: Optional[str] = None
    order_id: Optional[str] = Field(None, alias="orderId")
    item_id: str = Field(alias="itemId", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    brand: Optional[str] = Field(None, max_length=255)
    unit: str = Field("pieces", max_length=50)
    current_stock: int = Field(default=0, ge=0, le=INT32_MAX, alias="currentStock")
    minimum_stock: int = Field(default=0, ge=0, le=INT32_MAX, alias="minimumStock")
    image_uri: Optional[str] = Field(None, max_length=500, alias="imageUri")
    supplier_name: Optional[str] = Field(None, max_length=255, alias="supplierName")
    purchase_link: Optional[str] = Field(None, max_length=500, alias="purchaseLink")

    @field_validator("purchase_link")
    @classmethod
    def http_links_only(cls, v: Optional[str]) -> Optional[str]:
        """Keep http(s) links; drop anything else (e.g. javascript:) instead of storing it."""
        if v is None or not v.strip():
            return None
        v = v.strip()
        return v if v.lower().startswith(("http://", "https://")) else None


class OrderItemResponse(OrderItemBase):
    """Order item response schema."""
    id: str
    order_id: str = Field(alias="orderId")

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }


# =============================================================================
# ORDER SCHEMAS
# =============================================================================

class OrderCreate(BaseModel):
    """Create order request."""
    order_id: str = Field(alias="orderId")
    total_items: int = Field(default=0, alias="totalItems")
    total_units: int = Field(default=0, alias="totalUnits")
    status: str = "pending"
    exported_at: Optional[datetime] = Field(None, alias="exportedAt")
    ordered_at: Optional[datetime] = Field(None, alias="orderedAt")
    received_at: Optional[datetime] = Field(None, alias="receivedAt")
    applied_at: Optional[datetime] = Field(None, alias="appliedAt")
    declined_at: Optional[datetime] = Field(None, alias="declinedAt")
    # Per-submission idempotency key; blank would merge unrelated orders.
    local_id: Optional[str] = Field(None, min_length=1, max_length=36, alias="localId")
    notes: Optional[str] = None
    # Include items for creation. An order needs at least one line (an empty
    # order can never be applied); the cap keeps total_units within int32.
    items: List[OrderItemCreate] = Field(min_length=1, max_length=1000)

    model_config = {"populate_by_name": True}


class OrderUpdate(BaseModel):
    """Update order request."""
    status: Optional[str] = None
    ordered_at: Optional[datetime] = Field(None, alias="orderedAt")
    received_at: Optional[datetime] = Field(None, alias="receivedAt")
    applied_at: Optional[datetime] = Field(None, alias="appliedAt")
    declined_at: Optional[datetime] = Field(None, alias="declinedAt")
    notes: Optional[str] = None

    model_config = {"populate_by_name": True}


class OrderResponse(BaseModel):
    """
    Order response - MUST include items array!
    
    FIXED: Added 'items' field and localId serialization.
    """
    id: str
    user_id: str = Field(serialization_alias="userId")
    order_id: str = Field(serialization_alias="orderId")
    total_items: int = Field(serialization_alias="totalItems")
    total_units: int = Field(serialization_alias="totalUnits")
    status: str
    exported_at: Optional[datetime] = Field(None, serialization_alias="exportedAt")
    ordered_at: Optional[datetime] = Field(None, serialization_alias="orderedAt")
    received_at: Optional[datetime] = Field(None, serialization_alias="receivedAt")
    applied_at: Optional[datetime] = Field(None, serialization_alias="appliedAt")
    declined_at: Optional[datetime] = Field(None, serialization_alias="declinedAt")
    
    # CRITICAL: Include localId for sync matching
    local_id: Optional[str] = Field(None, serialization_alias="localId")
    
    # CRITICAL: Include items array!
    items: List[OrderItemResponse] = Field(default_factory=list)
    
    created_at: datetime = Field(serialization_alias="createdAt")
    updated_at: datetime = Field(serialization_alias="updatedAt")

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }


class OrderListResponse(BaseModel):
    """Paginated order list response."""
    orders: List[OrderResponse]
    total: int
    page: int = 1
    page_size: int = Field(default=20, serialization_alias="pageSize")
    has_more: bool = Field(default=False, serialization_alias="hasMore")

    model_config = {"populate_by_name": True}


class OrderBrief(BaseModel):
    """Brief order info for lists/summaries."""
    id: str
    order_id: str = Field(serialization_alias="orderId")
    status: str
    total_items: int = Field(serialization_alias="totalItems")
    created_at: datetime = Field(serialization_alias="createdAt")

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }
