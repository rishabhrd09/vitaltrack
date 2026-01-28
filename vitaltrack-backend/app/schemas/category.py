"""
VitalTrack Backend - Category Schemas
Pydantic models for category operations
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator
import re


# =============================================================================
# REQUEST SCHEMAS
# =============================================================================
class CategoryCreate(BaseModel):
    """Create category request."""
    
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    display_order: int = Field(default=0, ge=0)
    is_default: bool = False
    local_id: Optional[str] = Field(None, max_length=36)

    @field_validator("name", "description")
    @classmethod
    def sanitize_string(cls, v: Optional[str]) -> Optional[str]:
        """Sanitize string inputs."""
        if v is None:
            return v
        # Remove HTML tags
        v = re.sub(r"<[^>]*>", "", v)
        # Remove dangerous characters
        v = re.sub(r"[<>'\";]", "", v)
        return v.strip()


class CategoryUpdate(BaseModel):
    """Update category request."""
    
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    display_order: Optional[int] = Field(None, ge=0)
    is_default: Optional[bool] = None

    @field_validator("name", "description")
    @classmethod
    def sanitize_string(cls, v: Optional[str]) -> Optional[str]:
        """Sanitize string inputs."""
        if v is None:
            return v
        v = re.sub(r"<[^>]*>", "", v)
        v = re.sub(r"[<>'\";]", "", v)
        return v.strip()


# =============================================================================
# RESPONSE SCHEMAS
# =============================================================================
class CategoryResponse(BaseModel):
    """Category response - matches frontend Category interface."""
    
    id: str
    name: str
    description: Optional[str] = None
    display_order: int = Field(serialization_alias="displayOrder")
    is_default: bool = Field(serialization_alias="isDefault")
    created_at: datetime = Field(serialization_alias="createdAt")
    updated_at: datetime = Field(serialization_alias="updatedAt")

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }


class CategoryWithCount(CategoryResponse):
    """Category with item count for dashboard."""
    
    item_count: int = Field(default=0, serialization_alias="itemCount")


class CategoryList(BaseModel):
    """List of categories response."""
    
    categories: list[CategoryResponse]
    total: int
