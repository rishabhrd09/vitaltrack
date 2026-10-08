"""Intent, not an answer: no stock facts or executable instructions cross this boundary."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

CONSENT_VERSION = "voice-2026-10-06"
ConsentScope = Literal[
    "groq_text",
    "groq_audio",
    "sarvam_audio",
    "sarvam_speech",
    "kokoro_speech",
    "alba_speech",
]
CONSENT_SCOPES = {
    "groq_text",
    "groq_audio",
    "sarvam_audio",
    "sarvam_speech",
    "kokoro_speech",
    "alba_speech",
}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Intent(StrictModel):
    intent: Literal[
        "read_item",
        "summary",
        "low_stock",
        "out_of_stock",
        "close",
        "stop_speaking",
        "clarify",
        "unsupported_action",
    ]
    item_query: str | None
    reference: Literal["named", "previous", "none"]
    fields: list[Literal["quantity", "supplier", "status"]]

    @model_validator(mode="after")
    def check_meaning(self):
        if len(self.fields) > 3 or len(set(self.fields)) != len(self.fields):
            raise ValueError("Invalid fields")
        if self.intent == "read_item":
            if not self.fields or self.reference == "none":
                raise ValueError("Missing item reference")
            if self.reference == "named" and (
                not self.item_query
                or not self.item_query.strip()
                or len(self.item_query) > 160
            ):
                raise ValueError("Invalid item query")
            if self.reference == "previous" and self.item_query is not None:
                raise ValueError("Previous reference must not name an item")
        elif self.fields or self.item_query is not None or self.reference != "none":
            raise ValueError("Unexpected item parameters")
        return self


class InterpretRequest(StrictModel):
    question: str = Field(min_length=1, max_length=600)
    has_previous_item: bool = False
    contract_version: Literal[1, 2] = 1


class SpeakRequest(StrictModel):
    text: str = Field(min_length=1, max_length=640)
    provider: Literal["alba", "kokoro", "sarvam"] = "alba"


class ConsentRequest(StrictModel):
    version: Literal["voice-2026-10-06"]
    accepted: bool
    scopes: list[ConsentScope] = Field(default_factory=list, max_length=6)

    @model_validator(mode="after")
    def explicit_scopes(self):
        if len(self.scopes) != len(set(self.scopes)) or (
            self.accepted and not self.scopes
        ):
            raise ValueError("Select the specific cloud processing to consent to")
        if not self.accepted and self.scopes:
            raise ValueError("Revocation must clear all scopes")
        return self


class InventoryQuery(StrictModel):
    status: Literal["any", "low", "out", "attention", "below_minimum"]
    category: str | None
    supplier: str | None
    brand: str | None
    missing_supplier: bool
    item_queries: list[str] = Field(max_length=100)
    sort: Literal["none", "name", "stock"]
    previous: bool

    @model_validator(mode="after")
    def phrases(self):
        for value in [self.category, self.supplier, self.brand, *self.item_queries]:
            if value is not None and (not value.strip() or len(value) > 160):
                raise ValueError("Invalid recorded-name query")
        return self


class DraftLine(StrictModel):
    operation: Literal["set", "add", "remove"]
    item_query: str = Field(min_length=1, max_length=160)
    quantity: int | None = Field(ge=1, le=999999)
    unit: str | None

    @model_validator(mode="after")
    def meaning(self):
        if not self.item_query.strip() or (self.unit is not None and (not self.unit.strip() or len(self.unit) > 160)):
            raise ValueError("Invalid draft name or unit")
        if self.operation == "remove" and (self.quantity is not None or self.unit is not None):
            raise ValueError("Remove cannot carry quantities")
        return self


class Specification(StrictModel):
    version: Literal[2]
    intent: Literal["inventory_query", "draft_order", "review_draft", "inventory_export", "clarify", "unsupported_action"]
    draft_mode: Literal["new", "edit"] | None
    query: InventoryQuery | None
    lines: list[DraftLine] = Field(max_length=100)
    include_low: bool
    include_out: bool

    @model_validator(mode="after")
    def meaning(self):
        if (self.intent == "draft_order" and self.draft_mode is None) or (self.intent != "draft_order" and self.draft_mode is not None):
            raise ValueError("Invalid draft mode")
        if self.intent == "inventory_query":
            if self.query is None or self.lines or self.include_low or self.include_out:
                raise ValueError("Invalid inventory query")
        elif self.query is not None:
            raise ValueError("Unexpected query")
        if self.intent != "draft_order" and (self.lines or self.include_low or self.include_out):
            raise ValueError("Unexpected draft fields")
        if self.intent == "draft_order" and not (self.lines or self.include_low or self.include_out):
            raise ValueError("Empty draft command")
        return self
