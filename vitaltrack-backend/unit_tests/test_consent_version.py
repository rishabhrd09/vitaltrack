"""V-27: the consent version has one source on the server and matches the phone."""

import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.ai import CONSENT_VERSION, ConsentRequest

MOBILE_SERVICE = Path(__file__).resolve().parents[2] / "vitaltrack-mobile" / "services" / "assistant.ts"


def test_consent_requests_accept_exactly_the_current_version():
    ConsentRequest.model_validate({"version": CONSENT_VERSION, "accepted": True, "scopes": ["groq_text"]})
    with pytest.raises(ValidationError):
        ConsentRequest.model_validate({"version": "voice-2000-01-01", "accepted": True, "scopes": ["groq_text"]})


def test_the_phone_sends_the_same_consent_version():
    if not MOBILE_SERVICE.exists():
        pytest.skip("mobile sources are not part of this checkout")
    match = re.search(r"export const CONSENT_VERSION = '([^']+)';", MOBILE_SERVICE.read_text(encoding="utf-8"))
    assert match, "the phone declares CONSENT_VERSION"
    assert match.group(1) == CONSENT_VERSION, "change the consent version on both sides together"
