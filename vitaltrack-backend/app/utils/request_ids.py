"""Bound correlation IDs before echoing them in response headers."""

import re
from uuid import uuid4


def safe_request_id(value: str | None) -> str:
    """Keep short printable IDs; replace control bytes and oversized input."""
    if value and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", value):
        return value
    return uuid4().hex
