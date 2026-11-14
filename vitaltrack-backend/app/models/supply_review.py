"""Owned, bounded supply reviews. These records never authorize stock writes."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UUIDMixin


class SupplyRevision(Base):
    __tablename__ = "supply_revisions"
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ClosedOrderSubmission(Base):
    """A metadata-only fence against a delayed, explicitly closed submission.

    Keep until account deletion: deleting this fence could allow an old request
    to create an order after the owner has started a fresh reviewed submission.
    """

    __tablename__ = "closed_order_submissions"
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    local_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SupplyReviewRun(Base, UUIDMixin):
    __tablename__ = "supply_review_runs"
    __table_args__ = (UniqueConstraint("user_id", "request_id", name="uq_supply_review_owner_request"),)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    request_id: Mapped[str] = mapped_column(String(36))
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(24))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    snapshot_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    supply_revision: Mapped[int] = mapped_column(Integer)
    proposal_version: Mapped[int] = mapped_column(Integer, default=0)
    rules_version: Mapped[str] = mapped_column(String(40), default="supply-review-1")
    answers: Mapped[dict] = mapped_column(JSON, default=dict)
    rounds: Mapped[int] = mapped_column(Integer, default=0)
    # Public order identifier remains a tombstone if the owner later deletes it.
    # Deleting a saved order must never reopen the approval for another effect.
    order_id: Mapped[str | None] = mapped_column(String(50), nullable=True)


class SupplyReviewProposal(Base, UUIDMixin):
    __tablename__ = "supply_review_proposals"
    __table_args__ = (UniqueConstraint("run_id", "version", name="uq_supply_review_proposal_version"),)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("supply_review_runs.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    payload: Mapped[dict] = mapped_column(JSON)


class SupplyReviewConfirmation(Base, UUIDMixin):
    __tablename__ = "supply_review_confirmations"
    __table_args__ = (UniqueConstraint("user_id", "idempotency_key", name="uq_supply_review_confirmation_key"),)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("supply_review_runs.id", ondelete="CASCADE"), index=True)
    proposal_id: Mapped[str] = mapped_column(String(36), ForeignKey("supply_review_proposals.id", ondelete="CASCADE"))
    idempotency_key: Mapped[str] = mapped_column(String(36))
    order_id: Mapped[str] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
