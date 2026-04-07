"""
VitalTrack Backend - Activity Log Schemas
Pydantic models for activity log responses.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ActivityLogResponse(BaseModel):
    """Activity log entry response — matches frontend ActivityLog interface."""

    id: str
    action: str
    item_name: str = Field(serialization_alias="itemName")
    item_id: Optional[str] = Field(None, serialization_alias="itemId")
    details: Optional[str] = None
    order_id: Optional[str] = Field(None, serialization_alias="orderId")
    created_at: datetime = Field(serialization_alias="timestamp")

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }


class ActivityLogList(BaseModel):
    """List of activity logs response."""

    activities: list[ActivityLogResponse]
    total: int
