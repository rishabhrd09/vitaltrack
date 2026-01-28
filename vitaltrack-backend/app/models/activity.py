"""
VitalTrack Backend - Activity Log Model
Database model for activity/audit logging (matches frontend types)
"""

from enum import Enum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Enum as SQLEnum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.user import User


class ActivityActionType(str, Enum):
    """Activity action types matching frontend ActivityActionType."""
    
    ITEM_CREATE = "item_create"
    ITEM_UPDATE = "item_update"
    ITEM_DELETE = "item_delete"
    STOCK_UPDATE = "stock_update"
    ORDER_CREATED = "order_created"
    ORDER_RECEIVED = "order_received"
    ORDER_DECLINED = "order_declined"
    ORDER_APPLIED = "order_applied"
    DATA_IMPORT = "data_import"
    DATA_EXPORT = "data_export"
    DATA_RESET = "data_reset"
    DATA_RESTORE = "data_restore"
    BACKUP_CREATE = "backup_create"
    BACKUP_RESTORE = "backup_restore"
    # Additional server-side actions
    USER_LOGIN = "user_login"
    USER_LOGOUT = "user_logout"
    USER_REGISTER = "user_register"
    SYNC_PUSH = "sync_push"
    SYNC_PULL = "sync_pull"


class ActivityLog(UUIDMixin, TimestampMixin, Base):
    """Activity/audit log entry - matches frontend ActivityLog interface."""

    __tablename__ = "activity_logs"

    # Owner
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Action details
    action: Mapped[ActivityActionType] = mapped_column(
        SQLEnum(ActivityActionType, native_enum=False, length=30),
        nullable=False,
        index=True,
    )
    item_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    item_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        nullable=True,
        index=True,
    )
    details: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    order_id: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        index=True,
    )

    # Client metadata (for sync tracking)
    client_timestamp: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
    )
    local_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        nullable=True,
        index=True,
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        back_populates="activity_logs",
    )

    def __repr__(self) -> str:
        return f"<ActivityLog {self.action.value} - {self.item_name}>"
