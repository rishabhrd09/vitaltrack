"""Authenticate proxy metadata before using it for identity or URL generation.

The ASGI server must preserve the socket peer (proxy_headers=False). The
Cloudflare/Render mode verifies an edge-injected secret because Render's last
hop is not necessarily a Cloudflare address. No client ships this secret.
"""

import hmac
import re
from ipaddress import ip_address, ip_network
from urllib.parse import urlsplit

from app.services.ai_body_limit import _refusal

ORIGIN_HEADER = b"x-carekosh-origin-verify"
# Installed Android builds delete their stored tokens when /auth/refresh returns
# 401 or 403. An unverified ingress is an infrastructure condition, so refuse it
# with a retryable status that cannot sign every phone out after a bad edge rule.
UNVERIFIED_INGRESS_STATUS = 503
UNVERIFIED_INGRESS_RETRY = {"Retry-After": "30"}
FORWARDED_HEADERS = {
    b"forwarded",
    b"x-forwarded-for",
    b"x-forwarded-host",
    b"x-forwarded-proto",
    b"x-real-ip",
    b"cf-connecting-ip",
    ORIGIN_HEADER,
}


def _ip(value):
    if "%" in value:
        raise ValueError("Scoped IP is not allowed")
    address = ip_address(value)
    return getattr(address, "ipv4_mapped", None) or address


def validate_ingress_settings(config):
    hosted = config.ENVIRONMENT not in {"development", "testing"}
    if hosted and (config.INGRESS_MODE == "direct" or not config.ALLOWED_HOSTS):
        raise RuntimeError(
            "Hosted API requires explicit INGRESS_MODE and ALLOWED_HOSTS"
        )
    for host in config.ALLOWED_HOSTS:
        if not host or host != host.lower() or any(c in host for c in "*/@?# "):
            raise RuntimeError(
                "ALLOWED_HOSTS must contain exact lowercase hostnames or IP addresses"
            )
        try:
            _ip(host)
        except ValueError:
            if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?", host):
                raise RuntimeError("Invalid ALLOWED_HOSTS hostname") from None
    if config.INGRESS_MODE == "trusted_proxy":
        if not config.TRUSTED_PROXY_CIDRS:
            raise RuntimeError("trusted_proxy requires explicit TRUSTED_PROXY_CIDRS")
        try:
            networks = [ip_network(value) for value in config.TRUSTED_PROXY_CIDRS]
            if any(network.prefixlen == 0 for network in networks):
                raise ValueError()
        except ValueError:
            raise RuntimeError(
                "TRUSTED_PROXY_CIDRS must be specific IP networks, never wildcard trust"
            ) from None
    if config.INGRESS_MODE == "edge_secret":
        if not re.fullmatch(
            r"[A-Za-z0-9_-]{32,256}", config.ORIGIN_VERIFY_SECRET.get_secret_value()
        ):
            raise RuntimeError(
                "edge_secret requires a random 32+ character URL-safe ORIGIN_VERIFY_SECRET"
            )
    if hosted:
        for origin in config.CORS_ORIGINS:
            parsed = urlsplit(origin)
            if (
                parsed.scheme != "https"
                or not parsed.hostname
                or parsed.username
                or parsed.password
                or parsed.path
                or parsed.query
                or parsed.fragment
                or "*" in origin
            ):
                raise RuntimeError(
                    "Hosted CORS_ORIGINS must contain exact HTTPS origins"
                )


class IngressGuard:
    def __init__(self, app, config):
        validate_ingress_settings(config)
        self.app = app
        self.mode = config.INGRESS_MODE
        self.hosts = set(config.ALLOWED_HOSTS)
        self.secret = config.ORIGIN_VERIFY_SECRET.get_secret_value().encode("ascii")
        self.networks = (
            [ip_network(value) for value in config.TRUSTED_PROXY_CIDRS]
            if self.mode == "trusted_proxy"
            else []
        )

    def _trusted(self, address):
        return any(address in network for network in self.networks)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = {}
        for key, value in scope.get("headers", []):
            headers.setdefault(key.lower(), []).append(value)

        def one(name, required=True):
            values = headers.get(name, [])
            if len(values) != 1:
                if not values and not required:
                    return ""
                raise ValueError("Missing or repeated ingress header")
            return values[0].decode("ascii")

        live = scope["path"] == "/live" and scope["method"] in {"GET", "HEAD"}
        try:
            host = one(b"host")
            # Host is never sourced from a forwarding header.
            parsed = urlsplit(f"//{host}")
            if (
                not parsed.hostname
                or parsed.username
                or parsed.password
                or parsed.path
                or parsed.query
                or parsed.fragment
                or any(c.isspace() for c in host)
            ):
                raise ValueError("Invalid host")
            _ = parsed.port
            hostname = parsed.hostname.lower()
            if (
                self.hosts
                and hostname not in self.hosts
                and not (live and hostname in {"localhost", "127.0.0.1", "::1"})
            ):
                return await _refusal(scope, 400, "Invalid request host.")(
                    scope, receive, send
                )
            peer = _ip(scope["client"][0]) if scope.get("client") else None
            client_ip = str(peer) if peer is not None else "unknown"
            scheme = scope.get("scheme", "http")
            if not live and self.mode == "edge_secret":
                supplied = one(ORIGIN_HEADER, required=False).encode("ascii")
                if not hmac.compare_digest(supplied, self.secret):
                    return await _refusal(
                        scope,
                        UNVERIFIED_INGRESS_STATUS,
                        "Request must pass through the trusted edge.",
                        UNVERIFIED_INGRESS_RETRY,
                    )(scope, receive, send)
                client_ip = str(_ip(one(b"cf-connecting-ip")))
                # The edge must enforce HTTPS and use Full (strict) to the origin.
                scheme = "https"
            elif not live and self.mode == "trusted_proxy":
                if peer is None or not self._trusted(peer):
                    return await _refusal(
                        scope,
                        UNVERIFIED_INGRESS_STATUS,
                        "Untrusted proxy.",
                        UNVERIFIED_INGRESS_RETRY,
                    )(scope, receive, send)
                chain = one(b"x-forwarded-for")
                if len(chain) > 1024 or len(chain.split(",")) > 16:
                    raise ValueError("Forwarding chain is too long")
                addresses = [_ip(value.strip()) for value in chain.split(",")]
                # Walk from the verified socket toward the client. Never use a
                # caller-injected leftmost address past an untrusted hop.
                while addresses:
                    candidate = addresses.pop()
                    if not self._trusted(candidate):
                        client_ip = str(candidate)
                        break
                else:
                    raise ValueError("No untrusted client in forwarding chain")
                scheme = one(b"x-forwarded-proto")
                if scheme not in {"http", "https"}:
                    raise ValueError("Invalid forwarded scheme")
        except (ValueError, UnicodeError):
            return await _refusal(scope, 400, "Invalid ingress metadata.")(
                scope, receive, send
            )
        scope.setdefault("state", {})["verified_client_ip"] = client_ip
        scope["scheme"] = scheme
        # Downstream code cannot accidentally re-trust these headers or expose
        # the shared secret. The socket peer itself remains untouched.
        scope["headers"] = [
            (k, v)
            for k, v in scope.get("headers", [])
            if k.lower() not in FORWARDED_HEADERS
        ]
        return await self.app(scope, receive, send)


class RequestCapacity:
    """Bound per-worker body buffers and work; reject excess instead of queuing."""

    def __init__(self, app, maximum):
        self.app, self.maximum, self.active = app, maximum, 0

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or (
            scope["path"] == "/live" and scope["method"] in {"GET", "HEAD"}
        ):
            return await self.app(scope, receive, send)
        if self.active >= self.maximum:
            return await _refusal(
                scope,
                503,
                "Server is busy. Please retry shortly.",
                {"Retry-After": "2"},
            )(scope, receive, send)
        # No await between checking and incrementing on this worker's event loop.
        self.active += 1
        try:
            return await self.app(scope, receive, send)
        finally:
            self.active -= 1
