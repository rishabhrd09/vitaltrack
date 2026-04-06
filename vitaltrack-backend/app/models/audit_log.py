"""
VitalTrack Backend - Audit Log Model
Records every mutation with before/after JSONB snapshots.
"""

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class AuditLog(Base):
    """Audit log entry — records mutations with old/new value snapshots."""

    __tablename__ = "audit_log"

    # Primary key (matches UUIDMixin pattern but self-contained)
    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid4()),
        nullable=False,
    )

    # Who made the change
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # What was changed
    entity_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    entity_id: Mapped[str] = mapped_column(
        String(36),
        nullable=False,
    )

    # What kind of change
    action: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    # Before/after snapshots
    old_values: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        nullable=True,
    )
    new_values: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        nullable=True,
    )

    # When
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
    )

    def __repr__(self) -> str:
        return f"<AuditLog {self.action} {self.entity_type}:{self.entity_id}>"
