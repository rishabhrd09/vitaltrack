"""Bound request bodies before parsing; never spool user audio.

AI routes get tight limits and an upload deadline, and are refused without a
bearer token before any body is read. Every other route gets a generous cap so a
huge body cannot be buffered whole by FastAPI's JSON parser.
"""

import asyncio
from starlette.responses import JSONResponse

from app.utils.request_ids import safe_request_id

MAX_AUDIO_BODY = (
    900_000  # Includes multipart framing; below UploadFile's spool threshold.
)
MAX_AI_JSON_BODY = 12_000
MAX_SUPPLY_JSON_BODY = 64_000
# Scope key holding an asyncio.Event that is set when the client disconnects from an AI route.
DISCONNECTED = "carekosh.ai.disconnected"
# The largest legitimate request is an order with up to 1,000 lines (well under 1 MB).
MAX_API_BODY = 2_000_000


# This middleware answers some requests itself, outside the app's header middlewares.
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": "no-store",
}


def _refusal(scope, status: int, detail: str, extra: dict | None = None) -> JSONResponse:
    request_id = safe_request_id(dict(scope.get("headers", [])).get(b"x-request-id", b"").decode("latin-1"))
    return JSONResponse({"detail": detail}, status, headers={**SECURITY_HEADERS, "X-Request-ID": request_id, **(extra or {})})


def _has_bearer(scope) -> bool:
    for name, value in scope.get("headers", []):
        if name == b"authorization":
            scheme, _, credentials = value.decode("latin-1").strip().partition(" ")
            return scheme.lower() == "bearer" and bool(credentials.strip())
    return False


class AIBodyLimit:
    def __init__(self, app, api_timeout=60):
        self.app = app
        self.api_timeout = api_timeout

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        if scope["path"] == "/live" and scope.get("method") in {"GET", "HEAD"}:
            # Liveness bypasses admission control. It must never allocate an
            # uncounted body buffer or wait on an attacker-controlled upload.
            return await self.app(scope, receive, send)
        ai = scope["path"].startswith("/api/v1/ai/")
        supply = scope["path"] == "/api/v1/supply-reviews" or scope["path"].startswith("/api/v1/supply-reviews/")
        if (ai or supply) and scope.get("method") != "OPTIONS" and not _has_bearer(scope):
            # Every AI route requires a bearer token: refuse before buffering anything.
            return await _refusal(scope, 401, "Not authenticated", {"WWW-Authenticate": "Bearer"})(scope, receive, send)
        upload = ai and scope["path"].rstrip("/").endswith("/transcribe")
        if ai:
            limit = MAX_AUDIO_BODY if upload else MAX_AI_JSON_BODY
        elif supply:
            limit = MAX_SUPPLY_JSON_BODY
        else:
            limit = MAX_API_BODY
        too_large = "AI request is too large." if ai else "Request is too large."
        headers = dict(scope.get("headers", []))
        try:
            declared = int(headers.get(b"content-length", b"0"))
            if declared < 0 or declared > limit:
                raise ValueError()
        except ValueError:
            return await _refusal(scope, 413, too_large)(scope, receive, send)
        body = bytearray()
        try:
            # Uploads to AI routes must finish promptly: 30 s for a recording on a slow mobile
            # connection, 10 s for JSON. Other routes allow a full minute for
            # slow mobile uploads; this deadline excludes DB/handler processing.
            async with asyncio.timeout((30 if upload else 10) if ai else self.api_timeout):
                while True:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return
                    body.extend(message.get("body", b""))
                    if len(body) > limit:
                        return await _refusal(scope, 413, too_large)(scope, receive, send)
                    if not message.get("more_body", False):
                        break
        except TimeoutError:
            return await _refusal(scope, 408, "Upload timed out. Check the connection and try again.")(scope, receive, send)
        delivered = False
        # AI routes: one watcher reads the connection after the body, so a route can cancel provider
        # work when the phone disconnects (Stop, a new question). Starlette's own disconnect check is
        # not reliable behind the app's @app.middleware("http") layers.
        disconnected = asyncio.Event()

        async def watch():
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    disconnected.set()
                    return

        async def bounded_receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            if not ai:
                return await receive()
            # The watcher owns the connection after the body; only a disconnect can follow.
            await disconnected.wait()
            return {"type": "http.disconnect"}

        if not ai:
            return await self.app(scope, bounded_receive, send)
        scope[DISCONNECTED] = disconnected
        watcher = asyncio.ensure_future(watch())

        async def private_send(message):
            if message["type"] == "http.response.start":
                message["headers"] = [
                    (k, v)
                    for k, v in message.get("headers", [])
                    if k.lower() != b"cache-control"
                ] + [(b"cache-control", b"no-store")]
            await send(message)

        try:
            await self.app(scope, bounded_receive, private_send)
        finally:
            watcher.cancel()
