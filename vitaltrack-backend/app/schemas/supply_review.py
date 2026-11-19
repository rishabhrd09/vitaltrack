"""Version-one review contract. Caller data can select a target, never stock facts."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ReviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class StartReview(ReviewInput):
    request_id: UUID
    target_mode: Literal["minimum"]


class ChangeReview(ReviewInput):
    expected_run_version: int = Field(ge=1, strict=True)


class ReviewAnswer(ReviewInput):
    item_id: str = Field(min_length=1, max_length=36)
    target_quantity: int | None = Field(default=None, ge=0, le=999999, strict=True)
    exclude: bool = Field(default=False, strict=True)

    @model_validator(mode="after")
    def one_choice(self):
        if self.exclude == (self.target_quantity is not None):
            raise ValueError("Choose a target or exclude the item")
        return self


class AnswerReview(ChangeReview):
    answers: list[ReviewAnswer] = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def unique_items(self):
        if len({a.item_id for a in self.answers}) != len(self.answers):
            raise ValueError("Answer each item once")
        return self


class ConfirmReview(ChangeReview):
    proposal_id: UUID
    proposal_version: int = Field(ge=1, strict=True)
    idempotency_key: UUID


class ReviewLine(BaseModel):
    item_id: str
    item_version: int
    name: str
    unit: str
    supplier_name: str | None
    on_hand: int
    minimum_stock: int
    known_inbound: int
    target_quantity: int
    order_quantity: int
    reasons: list[str]


class ReviewQuestion(BaseModel):
    item_id: str
    name: str
    unit: str
    code: Literal["missing_target", "backup_target", "pending_commitment", "partial_receipt", "received_not_applied", "unit_mismatch"]
    message: str


class ReviewExcluded(BaseModel):
    item_id: str
    name: str
    reason: str


class ReviewProposal(BaseModel):
    id: str
    version: int
    expires_at: datetime
    lines: list[ReviewLine]


class ReviewRun(BaseModel):
    id: str
    version: int
    status: Literal["needs_input", "awaiting_review", "completed", "cancelled", "expired", "stale"]
    created_at: datetime
    expires_at: datetime
    snapshot_at: datetime
    supply_revision: int
    proposal: ReviewProposal | None
    questions: list[ReviewQuestion]
    excluded: list[ReviewExcluded]
    order_id: str | None


class ReviewSummary(BaseModel):
    id: str
    version: int
    status: Literal["needs_input", "awaiting_review", "completed", "cancelled", "expired", "stale"]
    created_at: datetime
    expires_at: datetime
    order_id: str | None


class ReviewList(BaseModel):
    runs: list[ReviewSummary]
