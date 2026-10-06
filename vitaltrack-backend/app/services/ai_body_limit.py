"""Bound request bodies before parsing; never spool user audio.

AI routes get tight limits and an upload deadline, and are refused without a
bearer token before any body is read. Every other route gets a generous cap so a
huge body cannot be buffered whole by FastAPI's JSON parser.
"""

import asyncio
from starlette.responses import JSONResponse

MAX_AUDIO_BODY = (
    900_000  # Includes multipart framing; below UploadFile's spool threshold.
)
MAX_AI_JSON_BODY = 12_000
# The largest legitimate request is an order with up to 1,000 lines (well under 1 MB).
MAX_API_BODY = 2_000_000


def _has_bearer(scope) -> bool:
    for name, value in scope.get("headers", []):
        if name == b"authorization":
            scheme, _, credentials = value.decode("latin-1").strip().partition(" ")
            return scheme.lower() == "bearer" and bool(credentials.strip())
    return False


class AIBodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        ai = scope["path"].startswith("/api/v1/ai/")
        if ai and scope.get("method") != "OPTIONS" and not _has_bearer(scope):
            # Every AI route requires a bearer token: refuse before buffering anything.
            return await JSONResponse(
                {"detail": "Not authenticated"},
                401,
                headers={"WWW-Authenticate": "Bearer"},
            )(scope, receive, send)
        if ai:
            limit = (
                MAX_AUDIO_BODY
                if scope["path"].rstrip("/").endswith("/transcribe")
                else MAX_AI_JSON_BODY
            )
        else:
            limit = MAX_API_BODY
        too_large = "AI request is too large." if ai else "Request is too large."
        headers = dict(scope.get("headers", []))
        try:
            declared = int(headers.get(b"content-length", b"0"))
            if declared < 0 or declared > limit:
                raise ValueError()
        except ValueError:
            return await JSONResponse({"detail": too_large}, 413)(
                scope, receive, send
            )
        body = bytearray()
        try:
            # Uploads to AI routes must finish quickly; elsewhere slow phones on a
            # cold-starting server keep the old behaviour (no read deadline).
            async with asyncio.timeout(10 if ai else None):
                while True:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return
                    body.extend(message.get("body", b""))
                    if len(body) > limit:
                        return await JSONResponse({"detail": too_large}, 413)(
                            scope, receive, send
                        )
                    if not message.get("more_body", False):
                        break
        except TimeoutError:
            return await JSONResponse({"detail": "Audio upload timed out."}, 408)(
                scope, receive, send
            )
        delivered = False

        async def bounded_receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        if not ai:
            return await self.app(scope, bounded_receive, send)

        async def private_send(message):
            if message["type"] == "http.response.start":
                message["headers"] = [
                    (k, v)
                    for k, v in message.get("headers", [])
                    if k.lower() != b"cache-control"
                ] + [(b"cache-control", b"no-store")]
            await send(message)

        await self.app(scope, bounded_receive, private_send)
