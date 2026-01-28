"""
VitalTrack Backend - Order Models
Database models for order tracking (matches frontend types)
"""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Enum as SQLEnum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.user import User


class OrderStatus(str, Enum):
    """Order status enum matching frontend OrderStatus type."""
    
    PENDING = "pending"
    ORDERED = "ordered"
    PARTIALLY_RECEIVED = "partially_received"
    RECEIVED = "received"
    STOCK_UPDATED = "stock_updated"
    DECLINED = "declined"


class Order(UUIDMixin, TimestampMixin, Base):
    """Order/purchase request model - matches frontend SavedOrder interface."""

    __tablename__ = "orders"

    # Owner
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Order identification
    order_id: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
    )  # e.g., "ORD-20260115-0001"

    # PDF storage path
    pdf_path: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
    )

    # Totals
    total_items: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    total_units: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    # Status
    status: Mapped[OrderStatus] = mapped_column(
        SQLEnum(OrderStatus, native_enum=False, length=20),
        default=OrderStatus.PENDING,
        nullable=False,
    )

    # Timestamps for status changes
    exported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    ordered_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    received_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    applied_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    declined_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Notes
    notes: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
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
        back_populates="orders",
    )
    items: Mapped[list["OrderItem"]] = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Order {self.order_id} status={self.status.value}>"


class OrderItem(UUIDMixin, TimestampMixin, Base):
    """Order line item - matches frontend OrderItem interface."""

    __tablename__ = "order_items"

    # Parent order
    order_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Reference to inventory item
    item_id: Mapped[str] = mapped_column(
        String(36),
        nullable=False,
        index=True,
    )

    # Snapshot of item details at time of order
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    brand: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    unit: Mapped[str] = mapped_column(
        String(50),
        default="pieces",
        nullable=False,
    )

    # Quantities
    quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )  # Quantity to order
    current_stock: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )  # Stock at time of order
    minimum_stock: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )  # Minimum stock at time of order

    # Optional details
    image_uri: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
    )
    supplier_name: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    purchase_link: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
    )

    # Relationships
    order: Mapped["Order"] = relationship(
        "Order",
        back_populates="items",
    )

    def __repr__(self) -> str:
        return f"<OrderItem {self.name} qty={self.quantity}>"
