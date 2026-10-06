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
