"""
VitalTrack Backend - Order Schemas
Pydantic models for order operations (matches frontend types)
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator
import re

from app.models.order import OrderStatus


# =============================================================================
# ORDER ITEM SCHEMAS
# =============================================================================
class OrderItemCreate(BaseModel):
    """Create order item request - matches frontend OrderItem interface."""
    
    item_id: str = Field(..., max_length=36, alias="itemId")
    name: str = Field(..., min_length=1, max_length=255)
    brand: Optional[str] = Field(None, max_length=255)
    unit: str = Field(default="pieces", max_length=50)
    quantity: int = Field(..., ge=1, le=999999)
    current_stock: int = Field(..., ge=0, alias="currentStock")
    minimum_stock: int = Field(..., ge=0, alias="minimumStock")
    image_uri: Optional[str] = Field(None, max_length=500, alias="imageUri")
    supplier_name: Optional[str] = Field(None, max_length=255, alias="supplierName")
    purchase_link: Optional[str] = Field(None, max_length=500, alias="purchaseLink")

    model_config = {"populate_by_name": True}

    @field_validator("name", "brand", "supplier_name")
    @classmethod
    def sanitize_string(cls, v: Optional[str]) -> Optional[str]:
        """Sanitize string inputs."""
        if v is None:
            return v
        v = re.sub(r"<[^>]*>", "", v)
        return v.strip()


class OrderItemResponse(BaseModel):
    """Order item response - matches frontend OrderItem interface."""
    
    id: str
    order_id: str = Field(serialization_alias="orderId")
    item_id: str = Field(serialization_alias="itemId")
    name: str
    brand: Optional[str] = None
    unit: str
    quantity: int
    current_stock: int = Field(serialization_alias="currentStock")
    minimum_stock: int = Field(serialization_alias="minimumStock")
    image_uri: Optional[str] = Field(None, serialization_alias="imageUri")
    supplier_name: Optional[str] = Field(None, serialization_alias="supplierName")
    purchase_link: Optional[str] = Field(None, serialization_alias="purchaseLink")

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }


# =============================================================================
# ORDER SCHEMAS
# =============================================================================
class OrderCreate(BaseModel):
    """Create order request."""
    
    items: list[OrderItemCreate] = Field(..., min_length=1)
    notes: Optional[str] = Field(None, max_length=1000)
    local_id: Optional[str] = Field(None, max_length=36, alias="localId")

    model_config = {"populate_by_name": True}


class OrderStatusUpdate(BaseModel):
    """Update order status request."""
    
    status: OrderStatus
    notes: Optional[str] = Field(None, max_length=1000)


class OrderResponse(BaseModel):
    """Order response - matches frontend SavedOrder interface."""
    
    id: str
    order_id: str = Field(serialization_alias="orderId")
    pdf_path: Optional[str] = Field(None, serialization_alias="pdfPath")
    items: list[OrderItemResponse]
    total_items: int = Field(serialization_alias="totalItems")
    total_units: int = Field(serialization_alias="totalUnits")
    status: OrderStatus
    exported_at: datetime = Field(serialization_alias="exportedAt")
    ordered_at: Optional[datetime] = Field(None, serialization_alias="orderedAt")
    received_at: Optional[datetime] = Field(None, serialization_alias="receivedAt")
    applied_at: Optional[datetime] = Field(None, serialization_alias="appliedAt")
    declined_at: Optional[datetime] = Field(None, serialization_alias="declinedAt")
    notes: Optional[str] = None
    created_at: datetime = Field(serialization_alias="createdAt")
    updated_at: datetime = Field(serialization_alias="updatedAt")

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }


class OrderBrief(BaseModel):
    """Brief order info for lists."""
    
    id: str
    order_id: str = Field(serialization_alias="orderId")
    total_items: int = Field(serialization_alias="totalItems")
    total_units: int = Field(serialization_alias="totalUnits")
    status: OrderStatus
    exported_at: datetime = Field(serialization_alias="exportedAt")

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }


class OrderList(BaseModel):
    """List of orders response."""
    
    orders: list[OrderResponse]
    total: int
