"""Shared, fail-closed limits with server-verified client identities."""

import functools
import inspect
import logging
import re
from ipaddress import IPv6Network, ip_address
from urllib.parse import urlsplit

from fastapi import HTTPException
from limits.errors import StorageError
from redis.backoff import NoBackoff
from redis.retry import Retry
from slowapi import Limiter
from starlette.concurrency import run_in_threadpool
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import settings

logger = logging.getLogger(__name__)


def get_real_client_ip(request: Request) -> str:
    # Only IngressGuard may install this value. Headers alone prove nothing.
    verified = getattr(request.state, "verified_client_ip", None)
    if verified:
        return verified
    try:
        address = ip_address(request.client.host if request.client else "")
        return str(getattr(address, "ipv4_mapped", None) or address)
    except ValueError:
        return "unknown"


# One IPv6 subscriber or VM normally controls a whole /64. Per-address keys would
# let it rotate through 2**64 identities, so IPv6 clients share a /64 bucket.
IPV6_RATE_PREFIX = 64


def client_rate_key(request: Request) -> str:
    client = get_real_client_ip(request)
    try:
        address = ip_address(client)
    except ValueError:
        return client
    if address.version == 6:
        return str(IPv6Network((int(address), IPV6_RATE_PREFIX), strict=False))
    return client


def authenticated_ai_rate_key(request: Request) -> str:
    """AI limits follow the validated account across workers and instances."""
    user_id = getattr(request.state, "ai_user_id", None)
    return (
        f"ai-account:{user_id}" if user_id else f"ai-peer:{client_rate_key(request)}"
    )


class LimitStoreUnavailable(HTTPException):
    def __init__(self):
        super().__init__(
            status_code=503,
            detail="Temporarily unable to verify request limits. Please retry shortly.",
            headers={"Retry-After": "5", "Cache-Control": "no-store"},
        )


class SharedLimiter(Limiter):
    def get_app_config(self, key, default_value=None):
        # One configuration source. Legacy RATELIMIT_* variables must not
        # silently disable enforcement or re-enable per-process fallback.
        return default_value

    def _check_request_limit(self, request, endpoint_func, in_middleware=True):
        try:
            return super()._check_request_limit(request, endpoint_func, in_middleware)
        except StorageError:
            # Never log a Redis URL, credentials, exception message or request.
            logger.warning("Shared rate-limit store unavailable")
            raise LimitStoreUnavailable() from None

    def _offload(self, decorator, fail_open=False):
        def decorate(func):
            wrapped = decorator(func)  # Register the limits with SlowAPI.
            if not inspect.iscoroutinefunction(func):
                return wrapped
            signature = inspect.signature(func)

            @functools.wraps(func)
            async def checked(*args, **kwargs):
                if self.enabled:
                    request = signature.bind(*args, **kwargs).arguments["request"]
                    if not getattr(request.state, "_rate_limiting_complete", False):
                        # Redis' sync driver must not block the ASGI event loop.
                        # Checks finish before any endpoint side effect occurs.
                        try:
                            await run_in_threadpool(
                                self._check_request_limit, request, func, False
                            )
                        except LimitStoreUnavailable:
                            if not fail_open:
                                raise
                            # SlowAPI reads this after the endpoint; None = no limit.
                            request.state.view_rate_limit = None
                        request.state._rate_limiting_complete = True
                return await wrapped(*args, **kwargs)

            return checked

        return decorate

    def limit(self, *args, fail_open=False, **kwargs):
        # fail_open is only for side-effect-free reads that core, non-AI flows
        # need; everything else keeps refusing while the store is unavailable.
        return self._offload(super().limit(*args, **kwargs), fail_open)

    def shared_limit(self, *args, **kwargs):
        return self._offload(super().shared_limit(*args, **kwargs))


def build_limiter(config) -> SharedLimiter:
    uri = config.RATE_LIMIT_STORAGE_URI.get_secret_value()
    hosted = config.ENVIRONMENT not in {"development", "testing"}
    try:
        parsed = urlsplit(uri)
        scheme = parsed.scheme
        _ = parsed.port
    except ValueError:
        raise RuntimeError("Invalid rate-limit storage URI") from None
    if scheme not in {"redis", "rediss"} and (hosted or uri != "memory://"):
        raise RuntimeError(
            "RATE_LIMIT_STORAGE_URI must use shared Redis in hosted environments"
        )
    if scheme in {"redis", "rediss"} and (
        not parsed.hostname or parsed.query or parsed.fragment
    ):
        # redis-py URI query values override keyword arguments; do not allow a
        # URI to disable certificate checks or override bounded timeouts.
        raise RuntimeError(
            "Redis URI needs a hostname and must not contain query options or fragments"
        )
    prefix = f"{config.RATE_LIMIT_KEY_PREFIX}:{config.ENVIRONMENT}"
    if not re.fullmatch(r"[a-zA-Z0-9:_-]{1,100}", prefix):
        raise RuntimeError("Invalid rate-limit key prefix or environment")
    options = {"wrap_exceptions": True}
    if scheme in {"redis", "rediss"}:
        options.update(
            socket_connect_timeout=config.RATE_LIMIT_STORAGE_TIMEOUT_SECONDS,
            socket_timeout=config.RATE_LIMIT_STORAGE_TIMEOUT_SECONDS,
            max_connections=32,
            retry=Retry(NoBackoff(), 0),
        )
        if scheme == "rediss":
            options.update(ssl_cert_reqs="required", ssl_check_hostname=True)
    try:
        return SharedLimiter(
            key_func=client_rate_key,
            storage_uri=uri,
            storage_options=options,
            key_prefix=prefix,
            strategy="fixed-window",
            headers_enabled=False,
            swallow_errors=False,
            in_memory_fallback_enabled=False,
        )
    except Exception:
        raise RuntimeError(
            "Unable to configure the rate-limit store; check server settings"
        ) from None


async def rate_limit_exceeded_handler(request, exc):
    # A conservative whole-window retry avoids another store read on overload.
    # Keep SlowAPI's existing error shape for native and browser clients.
    return JSONResponse(
        {"error": f"Rate limit exceeded: {exc.detail}"},
        status_code=429,
        headers={
            "Retry-After": str(exc.limit.limit.get_expiry()),
            "Cache-Control": "no-store",
        },
    )


limiter = build_limiter(settings)
