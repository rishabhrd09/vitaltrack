"""
VitalTrack Backend - Item Schemas
Pydantic models for item operations (matches frontend types)
"""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator
import re


# =============================================================================
# REQUEST SCHEMAS
# =============================================================================
class ItemCreate(BaseModel):
    """Create item request - matches frontend Item interface."""
    
    category_id: str = Field(..., max_length=36, alias="categoryId")
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    quantity: int = Field(default=0, ge=0, le=999999)
    unit: str = Field(default="pieces", max_length=50)
    minimum_stock: int = Field(default=0, ge=0, le=999999, alias="minimumStock")
    expiry_date: Optional[date] = Field(None, alias="expiryDate")
    brand: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = Field(None, max_length=1000)
    supplier_name: Optional[str] = Field(None, max_length=255, alias="supplierName")
    supplier_contact: Optional[str] = Field(None, max_length=255, alias="supplierContact")
    purchase_link: Optional[str] = Field(None, max_length=500, alias="purchaseLink")
    image_uri: Optional[str] = Field(None, max_length=500, alias="imageUri")
    is_active: bool = Field(default=True, alias="isActive")
    is_critical: bool = Field(default=False, alias="isCritical")
    local_id: Optional[str] = Field(None, max_length=36, alias="localId")

    model_config = {"populate_by_name": True}

    @field_validator("name", "description", "brand", "notes", "supplier_name")
    @classmethod
    def sanitize_string(cls, v: Optional[str]) -> Optional[str]:
        """Sanitize string inputs."""
        if v is None:
            return v
        # Remove HTML tags
        v = re.sub(r"<[^>]*>", "", v)
        # Remove dangerous characters for XSS
        v = re.sub(r"javascript:", "", v, flags=re.IGNORECASE)
        v = re.sub(r"on\w+=", "", v, flags=re.IGNORECASE)
        return v.strip()

    @field_validator("supplier_contact")
    @classmethod
    def sanitize_contact(cls, v: Optional[str]) -> Optional[str]:
        """Sanitize contact info."""
        if v is None:
            return v
        # Keep phone-valid chars and email chars
        v = re.sub(r"[^0-9\s\-\(\)\+\.@a-zA-Z]", "", v)
        return v.strip()[:100]

    @field_validator("purchase_link")
    @classmethod
    def validate_url(cls, v: Optional[str]) -> Optional[str]:
        """Validate URL is http/https only."""
        if v is None or not v.strip():
            return None
        v = v.strip()
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v


class ItemUpdate(BaseModel):
    """Update item request - all fields optional."""
    
    category_id: Optional[str] = Field(None, max_length=36, alias="categoryId")
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    quantity: Optional[int] = Field(None, ge=0, le=999999)
    unit: Optional[str] = Field(None, max_length=50)
    minimum_stock: Optional[int] = Field(None, ge=0, le=999999, alias="minimumStock")
    expiry_date: Optional[date] = Field(None, alias="expiryDate")
    brand: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = Field(None, max_length=1000)
    supplier_name: Optional[str] = Field(None, max_length=255, alias="supplierName")
    supplier_contact: Optional[str] = Field(None, max_length=255, alias="supplierContact")
    purchase_link: Optional[str] = Field(None, max_length=500, alias="purchaseLink")
    image_uri: Optional[str] = Field(None, max_length=500, alias="imageUri")
    is_active: Optional[bool] = Field(None, alias="isActive")
    is_critical: Optional[bool] = Field(None, alias="isCritical")

    model_config = {"populate_by_name": True}

    @field_validator("name", "description", "brand", "notes", "supplier_name")
    @classmethod
    def sanitize_string(cls, v: Optional[str]) -> Optional[str]:
        """Sanitize string inputs."""
        if v is None:
            return v
        v = re.sub(r"<[^>]*>", "", v)
        v = re.sub(r"javascript:", "", v, flags=re.IGNORECASE)
        v = re.sub(r"on\w+=", "", v, flags=re.IGNORECASE)
        return v.strip()

    @field_validator("purchase_link")
    @classmethod
    def validate_url(cls, v: Optional[str]) -> Optional[str]:
        """Validate URL is http/https only."""
        if v is None or not v.strip():
            return None
        v = v.strip()
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v


class StockUpdate(BaseModel):
    """Quick stock update request."""
    
    quantity: int = Field(..., ge=0, le=999999)


# =============================================================================
# RESPONSE SCHEMAS
# =============================================================================
class ItemResponse(BaseModel):
    """Item response - matches frontend Item interface exactly."""
    
    id: str
    category_id: str = Field(serialization_alias="categoryId")
    name: str
    description: Optional[str] = None
    quantity: int
    unit: str
    minimum_stock: int = Field(serialization_alias="minimumStock")
    expiry_date: Optional[date] = Field(None, serialization_alias="expiryDate")
    brand: Optional[str] = None
    notes: Optional[str] = None
    supplier_name: Optional[str] = Field(None, serialization_alias="supplierName")
    supplier_contact: Optional[str] = Field(None, serialization_alias="supplierContact")
    purchase_link: Optional[str] = Field(None, serialization_alias="purchaseLink")
    image_uri: Optional[str] = Field(None, serialization_alias="imageUri")
    is_active: bool = Field(serialization_alias="isActive")
    is_critical: bool = Field(serialization_alias="isCritical")
    created_at: datetime = Field(serialization_alias="createdAt")
    updated_at: datetime = Field(serialization_alias="updatedAt")

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }


class ItemBrief(BaseModel):
    """Brief item info for lists."""
    
    id: str
    name: str
    quantity: int
    unit: str
    minimum_stock: int = Field(serialization_alias="minimumStock")
    is_critical: bool = Field(serialization_alias="isCritical")

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }


class ItemList(BaseModel):
    """List of items response."""
    
    items: list[ItemResponse]
    total: int


class ItemStats(BaseModel):
    """Item statistics for dashboard - matches frontend DashboardStats."""
    
    total_items: int = Field(serialization_alias="totalItems")
    total_categories: int = Field(serialization_alias="totalCategories")
    out_of_stock: int = Field(serialization_alias="outOfStockCount")
    low_stock: int = Field(serialization_alias="lowStockCount")
    critical_items: int = Field(serialization_alias="criticalItems")
    pending_orders_count: int = Field(serialization_alias="pendingOrdersCount")

    model_config = {"populate_by_name": True}
