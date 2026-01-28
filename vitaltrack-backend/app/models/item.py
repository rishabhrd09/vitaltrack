"""
VitalTrack Backend - Item Model
Database model for inventory items (matches frontend types exactly)
"""

from datetime import date
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.user import User


class Item(UUIDMixin, TimestampMixin, Base):
    """Inventory item model - matches frontend Item interface exactly."""

    __tablename__ = "items"

    # Owner
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Category relationship
    category_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("categories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Basic info (required)
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )
    quantity: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    unit: Mapped[str] = mapped_column(
        String(50),
        default="pieces",
        nullable=False,
    )
    minimum_stock: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    # Optional fields
    description: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    expiry_date: Mapped[Optional[date]] = mapped_column(
        Date,
        nullable=True,
    )
    brand: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    notes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    # Supplier info
    supplier_name: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    supplier_contact: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    purchase_link: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
    )

    # Image
    image_uri: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
    )

    # Status flags
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    is_critical: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    # Sync tracking (for offline-first)
    local_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        nullable=True,
        index=True,
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        back_populates="items",
    )
    category: Mapped["Category"] = relationship(
        "Category",
        back_populates="items",
    )

    def __repr__(self) -> str:
        return f"<Item {self.name} qty={self.quantity}>"

    @property
    def is_out_of_stock(self) -> bool:
        """Check if item is out of stock."""
        return self.quantity <= 0

    @property
    def is_low_stock(self) -> bool:
        """Check if item is low on stock (below minimum)."""
        if self.quantity <= 0:
            return False
        return self.quantity < self.minimum_stock

    @property
    def needs_attention(self) -> bool:
        """Check if item needs attention (out of stock or low stock)."""
        return self.is_out_of_stock or self.is_low_stock
