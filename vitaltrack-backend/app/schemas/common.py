"""
VitalTrack Backend - Common Schemas
Shared Pydantic models and response types
"""

from datetime import datetime
from typing import Generic, Optional, TypeVar

from pydantic import BaseModel, Field


T = TypeVar("T")


class ErrorDetail(BaseModel):
    """Error detail structure."""
    
    field: Optional[str] = None
    message: str
    code: Optional[str] = None


class ErrorResponse(BaseModel):
    """Standard error response."""
    
    error: str
    message: str
    details: Optional[list[ErrorDetail]] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class SuccessResponse(BaseModel):
    """Generic success response."""
    
    success: bool = True
    message: str


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response."""
    
    items: list[T]
    total: int
    page: int
    page_size: int = Field(alias="pageSize")
    total_pages: int = Field(alias="totalPages")
    has_next: bool = Field(alias="hasNext")
    has_previous: bool = Field(alias="hasPrevious")

    model_config = {"populate_by_name": True}


class DashboardStats(BaseModel):
    """Dashboard statistics - matches frontend DashboardStats interface."""
    
    total_items: int = Field(serialization_alias="totalItems")
    total_categories: int = Field(serialization_alias="totalCategories")
    low_stock_count: int = Field(serialization_alias="lowStockCount")
    out_of_stock_count: int = Field(serialization_alias="outOfStockCount")
    pending_orders_count: int = Field(serialization_alias="pendingOrdersCount")

    model_config = {"populate_by_name": True}


class HealthCheck(BaseModel):
    """Health check response."""
    
    status: str = "healthy"
    version: str
    environment: str
    database: str = "connected"
    timestamp: datetime = Field(default_factory=datetime.utcnow)
