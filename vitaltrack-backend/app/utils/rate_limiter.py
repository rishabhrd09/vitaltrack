"""
VitalTrack Backend - Rate Limiting
Prevent brute force attacks on authentication endpoints
"""

from starlette.requests import Request
from slowapi import Limiter


def get_real_client_ip(request: Request) -> str:
    """
    Extract the real client IP behind reverse proxies (Render/Cloudflare).

    Render runs behind Cloudflare, so request.client.host is the proxy IP.
    The real client IP is in X-Forwarded-For or CF-Connecting-IP headers.
    Falls back to request.client.host, then "unknown" to prevent crashes.
    """
    # Cloudflare sets this to the actual client IP
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip

    # Standard proxy header (first IP is the real client)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    # Direct connection (local dev)
    if request.client and request.client.host:
        return request.client.host

    return "unknown"


# Create limiter instance using real client IP (proxy-aware)
# swallow_errors=True prevents 500 errors if rate limiter storage fails
# in_memory_fallback_enabled=True uses memory if primary storage is unavailable
limiter = Limiter(
    key_func=get_real_client_ip,
    swallow_errors=True,
    in_memory_fallback_enabled=True,
)
