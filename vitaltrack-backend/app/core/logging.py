"""Keep diagnostic structure without copying account capabilities or SQL values."""

import logging
import re
import traceback
from urllib.parse import urlsplit, urlunsplit

_CAPABILITY_PATH = re.compile(r"(/auth/(?:verify-email|confirm-delete)/)[^\s?\"'#]+", re.IGNORECASE)
_CAPABILITY_QUERY = re.compile(r"([?&](?:token|access_token|refresh_token|password)\s*=)[^&\s\"'#]+", re.IGNORECASE)


def redact_message(value: str) -> str:
    return _CAPABILITY_QUERY.sub(r"\1[REDACTED]", _CAPABILITY_PATH.sub(r"\1[REDACTED]", value))


def safe_url(value: str) -> str:
    """Access/telemetry URLs do not need query values or userinfo."""
    try:
        parts = urlsplit(value)
    except ValueError:
        return "[invalid-url]"
    host = parts.netloc.rsplit("@", 1)[-1]
    return urlunsplit((parts.scheme, host, redact_message(parts.path), "", ""))


def configure_safe_logging() -> None:
    """Cover server handlers too, regardless of their formatter/propagation."""
    previous = logging.getLogRecordFactory()
    if getattr(previous, "_carekosh_safe", False):
        return

    def factory(*args, **kwargs):
        record = previous(*args, **kwargs)
        access_record = record.name == "uvicorn.access" and isinstance(record.args, tuple) and len(record.args) == 5
        if access_record:
            values = list(record.args)
            values[2] = safe_url(str(values[2]))
            record.args = tuple(values)
        else:
            record.msg = redact_message(record.getMessage())
            record.args = ()
        if record.exc_info:
            # Exception str()/locals can contain credentials, driver details and
            # SQL parameters. Preserve type and code locations, never values.
            kind, _, tb = record.exc_info
            locations = " > ".join(f"{frame.name}:{frame.lineno}" for frame in traceback.extract_tb(tb))
            record.msg += f" [exception={kind.__name__ if kind else 'Unknown'}; frames={locations}]"
            record.exc_info = None
            record.exc_text = None
        return record

    setattr(factory, "_carekosh_safe", True)
    logging.setLogRecordFactory(factory)


def scrub_telemetry_event(event, hint):
    """Keep error categories/locations; exclude request payloads and locals."""
    request = event.get("request")
    if request:
        event["request"] = {
            key: safe_url(value) if key == "url" else value
            for key, value in request.items() if key in {"url", "method"}
        }
    event.pop("user", None)
    event.pop("extra", None)
    event.pop("breadcrumbs", None)
    event.pop("logentry", None)
    if "message" in event:
        event["message"] = redact_message(str(event["message"]))
    for error in event.get("exception", {}).get("values", []):
        error["value"] = "Exception details withheld; see type and code location."
        for frame in error.get("stacktrace", {}).get("frames", []):
            frame.pop("vars", None)
    for span in event.get("spans", []):
        span.pop("data", None)
        span.pop("description", None)
    return event
