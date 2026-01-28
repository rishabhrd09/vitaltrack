"""
VitalTrack Backend - Sync Schemas
Pydantic models for offline-first synchronization
"""

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.schemas.category import CategoryResponse
from app.schemas.item import ItemResponse
from app.schemas.order import OrderResponse


class SyncOperationType(str, Enum):
    """Sync operation types."""
    
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


class SyncEntityType(str, Enum):
    """Sync entity types."""
    
    CATEGORY = "category"
    ITEM = "item"
    ORDER = "order"


# =============================================================================
# SYNC OPERATION SCHEMAS
# =============================================================================
class SyncOperation(BaseModel):
    """Single sync operation from client."""
    
    id: str = Field(..., description="Client-generated operation ID")
    type: SyncOperationType
    entity: SyncEntityType
    entity_id: str = Field(..., alias="entityId")
    local_id: str = Field(..., alias="localId")
    data: Optional[dict[str, Any]] = None
    timestamp: datetime
    retry_count: int = Field(default=0, alias="retryCount")

    model_config = {"populate_by_name": True}


class SyncPushRequest(BaseModel):
    """Push local changes to server."""
    
    operations: list[SyncOperation]
    last_sync_at: Optional[datetime] = Field(None, alias="lastSyncAt")

    model_config = {"populate_by_name": True}


class SyncOperationResult(BaseModel):
    """Result of a single sync operation."""
    
    operation_id: str = Field(alias="operationId")
    success: bool
    entity_id: Optional[str] = Field(None, alias="entityId")
    server_id: Optional[str] = Field(None, alias="serverId")
    error: Optional[str] = None

    model_config = {"populate_by_name": True}


class SyncPushResponse(BaseModel):
    """Response to push request."""
    
    results: list[SyncOperationResult]
    server_time: datetime = Field(alias="serverTime")
    success_count: int = Field(alias="successCount")
    error_count: int = Field(alias="errorCount")

    model_config = {"populate_by_name": True}


# =============================================================================
# SYNC PULL SCHEMAS
# =============================================================================
class SyncPullRequest(BaseModel):
    """Request server changes since last sync."""
    
    last_sync_at: Optional[datetime] = Field(None, alias="lastSyncAt")
    include_deleted: bool = Field(default=True, alias="includeDeleted")

    model_config = {"populate_by_name": True}


class SyncPullResponse(BaseModel):
    """Response with server changes."""
    
    categories: list[CategoryResponse]
    items: list[ItemResponse]
    orders: list[OrderResponse]
    deleted_ids: list[str] = Field(default_factory=list, alias="deletedIds")
    server_time: datetime = Field(alias="serverTime")
    has_more: bool = Field(default=False, alias="hasMore")

    model_config = {"populate_by_name": True}


# =============================================================================
# FULL SYNC SCHEMAS
# =============================================================================
class FullSyncRequest(BaseModel):
    """Full sync request (push + pull in one request)."""
    
    operations: list[SyncOperation] = Field(default_factory=list)
    last_sync_at: Optional[datetime] = Field(None, alias="lastSyncAt")
    include_deleted: bool = Field(default=True, alias="includeDeleted")

    model_config = {"populate_by_name": True}


class FullSyncResponse(BaseModel):
    """Full sync response."""
    
    # Push results
    push_results: list[SyncOperationResult] = Field(alias="pushResults")
    push_success_count: int = Field(alias="pushSuccessCount")
    push_error_count: int = Field(alias="pushErrorCount")
    
    # Pull data
    categories: list[CategoryResponse]
    items: list[ItemResponse]
    orders: list[OrderResponse]
    deleted_ids: list[str] = Field(default_factory=list, alias="deletedIds")
    
    # Metadata
    server_time: datetime = Field(alias="serverTime")

    model_config = {"populate_by_name": True}


# =============================================================================
# CONFLICT RESOLUTION
# =============================================================================
class ConflictResolution(str, Enum):
    """How to resolve sync conflicts."""
    
    SERVER_WINS = "server_wins"
    CLIENT_WINS = "client_wins"
    LATEST_WINS = "latest_wins"


class SyncConflict(BaseModel):
    """Detected sync conflict."""
    
    entity: SyncEntityType
    entity_id: str = Field(alias="entityId")
    local_id: str = Field(alias="localId")
    client_data: dict[str, Any] = Field(alias="clientData")
    server_data: dict[str, Any] = Field(alias="serverData")
    client_updated_at: datetime = Field(alias="clientUpdatedAt")
    server_updated_at: datetime = Field(alias="serverUpdatedAt")

    model_config = {"populate_by_name": True}
