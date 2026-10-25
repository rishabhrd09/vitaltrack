"""Intent, not an answer: no stock facts or executable instructions cross this boundary."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator

CONSENT_VERSION = "voice-2026-10-06"
ConsentScope = Literal[
    "groq_text",
    "groq_audio",
    "sarvam_audio",
    "sarvam_speech",
    "kokoro_speech",
    "alba_speech",
    "openai_text",
]
CONSENT_SCOPES = {
    "groq_text",
    "groq_audio",
    "sarvam_audio",
    "sarvam_speech",
    "kokoro_speech",
    "alba_speech",
    "openai_text",
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
    contract_version: Literal[1, 2, 3] = 1
    provider: Literal["groq", "openai"] = "groq"

    @model_validator(mode="after")
    def supported_provider_contract(self):
        if self.provider == "openai" and self.contract_version != 3:
            raise ValueError("OpenAI understanding requires contract version 3")
        return self


class SpeakRequest(StrictModel):
    text: str = Field(min_length=1, max_length=640)
    provider: Literal["alba", "kokoro", "sarvam"] = "alba"
    pace: float = Field(default=1.0, ge=0.9, le=1.1)
    credential_source: Literal["application", "personal"] = "application"

    @model_validator(mode="after")
    def credential_choice(self):
        if self.credential_source == "personal" and self.provider != "sarvam":
            raise ValueError("Personal keys are available only for Sarvam narration")
        return self

    @field_validator("pace")
    @classmethod
    def speaking_pace(cls, value):
        if value not in (0.9, 1.0, 1.1):
            raise ValueError("Unsupported speaking pace")
        return value


class SarvamKeyRequest(StrictModel):
    api_key: SecretStr
    storage_consent: Literal[True]

    @field_validator("api_key", mode="before")
    @classmethod
    def bounded_key(cls, value):
        if not isinstance(value, str) or not 8 <= len(value) <= 512 or any(not 33 <= ord(char) <= 126 for char in value):
            raise ValueError("Enter a valid API key without spaces, up to 512 characters")
        return value

    @field_validator("storage_consent", mode="before")
    @classmethod
    def explicit_storage_consent(cls, value):
        if value is not True:
            raise ValueError("Confirm encrypted key storage first")
        return value


class OpenAIKeyRequest(SarvamKeyRequest):
    """The same bounded secret enrollment, with a separate provider purpose."""


class ConsentRequest(StrictModel):
    # One source of truth: a new consent text changes CONSENT_VERSION only.
    version: Literal[CONSENT_VERSION]  # type: ignore[valid-type]
    accepted: bool
    scopes: list[ConsentScope] = Field(default_factory=list, max_length=7)

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


# Version 3: a bounded selection plan. Version 2 above keeps its meaning for older phones.
# Rows = union of selection.any_of minus rows matching selection.exclude, then sorted; executed on the phone.
StockState = Literal["low", "out", "in_stock", "below_minimum"]


def _phrase(value: str | None) -> bool:
    return value is None or (bool(value.strip()) and len(value) <= 160)


class Comparison(StrictModel):
    op: Literal["lt", "lte", "eq", "gte", "gt"]
    value: int = Field(ge=0, le=999999)


class Condition(StrictModel):
    item_queries: list[str] = Field(max_length=100)
    stock: list[StockState] = Field(max_length=4)
    quantity: list[Comparison] = Field(max_length=2)
    critical: bool | None
    category: str | None
    supplier: str | None
    brand: str | None
    missing_supplier: bool

    @model_validator(mode="after")
    def bounded(self):
        if not all(_phrase(v) for v in [self.category, self.supplier, self.brand, *self.item_queries]):
            raise ValueError("Invalid recorded-name query")
        if len(set(self.stock)) != len(self.stock):
            raise ValueError("Repeated stock state")
        ops = [c.op for c in self.quantity]
        # Two comparisons must form one range; equality stands alone.
        if len(ops) == 2 and not (any(o in ("gt", "gte") for o in ops) and any(o in ("lt", "lte") for o in ops)):
            raise ValueError("Invalid quantity range")
        return self

    def empty(self) -> bool:
        return not (self.item_queries or self.stock or self.quantity or self.missing_supplier) and all(
            v is None for v in (self.critical, self.category, self.supplier, self.brand)
        )


class Selection(StrictModel):
    scope: Literal["inventory", "previous"]
    any_of: list[Condition] = Field(max_length=6)
    exclude: list[Condition] = Field(max_length=6)
    sort: Literal["none", "name", "quantity_asc", "quantity_desc", "shortfall", "priority"]

    @model_validator(mode="after")
    def bounded(self):
        if not self.any_of:
            raise ValueError("Select at least one group")
        if any(c.empty() for c in self.exclude):
            raise ValueError("An exclusion must name a condition")
        return self


class PlanLine(StrictModel):
    operation: Literal["set", "add", "remove"]
    target: Literal["named", "previous"]
    item_query: str | None
    quantity: int | None = Field(ge=1, le=999999)
    unit: str | None

    @model_validator(mode="after")
    def meaning(self):
        if self.target == "named" and (self.item_query is None or not _phrase(self.item_query)):
            raise ValueError("Named lines need an item")
        if self.target == "previous" and self.item_query is not None:
            raise ValueError("A previous-item line names no item")
        if not _phrase(self.unit):
            raise ValueError("Invalid unit")
        if self.operation == "remove" and (self.quantity is not None or self.unit is not None):
            raise ValueError("Remove cannot carry quantities")
        return self


class DraftPlan(StrictModel):
    mode: Literal["new", "edit"]
    lines: list[PlanLine] = Field(max_length=100)
    include_selection: bool


class Plan(StrictModel):
    version: Literal[3]
    intent: Literal["inventory_query", "draft_order", "review_draft", "inventory_export", "clarify", "unsupported_action"]
    selection: Selection | None
    draft: DraftPlan | None
    clarify_reason: Literal["ambiguous", "unsupported_condition", "conflict", "missing_context"] | None

    @model_validator(mode="after")
    def meaning(self):
        if self.clarify_reason is not None and self.intent != "clarify":
            raise ValueError("Only a clarification carries a reason")
        if self.intent == "inventory_query":
            if self.selection is None or self.draft is not None:
                raise ValueError("Invalid inventory query")
        elif self.intent == "draft_order":
            if self.draft is None or (self.selection is not None) != self.draft.include_selection:
                raise ValueError("Invalid draft plan")
            if not (self.draft.lines or self.draft.include_selection):
                raise ValueError("Empty draft command")
        elif self.selection is not None or self.draft is not None:
            raise ValueError("Unexpected plan parameters")
        return self
