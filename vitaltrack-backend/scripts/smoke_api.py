"""Safe CareKosh API smoke checks for launch readiness.

Defaults to staging and read-only health checks. Authenticated checks require a
smoke account and are opt-in because login creates session/activity traces.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


TARGETS = {
    "staging": "https://staging-api.carekosh.com",
    "production": "https://api.carekosh.com",
    "local": "http://127.0.0.1:8000",
}
PRODUCTION_HOSTS = {"api.carekosh.com", "vitaltrack-api.onrender.com"}


@dataclass
class HttpResult:
    method: str
    path: str
    status: int | None
    ok: bool
    elapsed_ms: int
    body: dict[str, Any] | list[Any] | str | None
    error: str | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--target",
        choices=sorted(TARGETS),
        default="staging",
        help="Named API target. Defaults to staging.",
    )
    parser.add_argument("--base-url", help="Override target base URL.")
    parser.add_argument(
        "--allow-production",
        action="store_true",
        help="Required when target/base URL points at production.",
    )
    parser.add_argument(
        "--include-authenticated",
        action="store_true",
        help="Run smoke-account login and inventory list checks.",
    )
    parser.add_argument(
        "--identifier",
        default=os.environ.get("CAREKOSH_SMOKE_IDENTIFIER"),
        help="Smoke account email or username. Defaults to CAREKOSH_SMOKE_IDENTIFIER.",
    )
    parser.add_argument(
        "--password",
        default=os.environ.get("CAREKOSH_SMOKE_PASSWORD"),
        help="Smoke account password. Defaults to CAREKOSH_SMOKE_PASSWORD.",
    )
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--output", help="Optional JSON evidence output path.")
    return parser.parse_args()


def is_production_url(base_url: str) -> bool:
    host = urllib.parse.urlparse(base_url.rstrip("/")).hostname
    return host in PRODUCTION_HOSTS


def request_json(
    base_url: str,
    method: str,
    path: str,
    *,
    payload: dict[str, Any] | None = None,
    token: str | None = None,
    timeout: float,
) -> HttpResult:
    url = f"{base_url.rstrip('/')}{path}"
    data = None
    headers = {"Accept": "application/json", "User-Agent": "carekosh-goal10-smoke/1.0"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"

    started = time.perf_counter()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            body = parse_body(raw)
            return HttpResult(
                method=method,
                path=path,
                status=response.status,
                ok=200 <= response.status < 300,
                elapsed_ms=elapsed_ms,
                body=body,
            )
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return HttpResult(
            method=method,
            path=path,
            status=exc.code,
            ok=False,
            elapsed_ms=elapsed_ms,
            body=parse_body(raw),
            error=f"HTTP {exc.code}",
        )
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return HttpResult(
            method=method,
            path=path,
            status=None,
            ok=False,
            elapsed_ms=elapsed_ms,
            body=None,
            error=str(exc.reason if isinstance(exc, urllib.error.URLError) else exc),
        )


def parse_body(raw: str) -> dict[str, Any] | list[Any] | str | None:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw[:500]


def result_to_public_dict(result: HttpResult) -> dict[str, Any]:
    body = result.body
    public_body: dict[str, Any] | list[Any] | str | None = body
    if isinstance(body, dict):
        public_body = {key: value for key, value in body.items() if key not in {"user"}}
        public_body.pop("access_token", None)
        public_body.pop("refresh_token", None)
        if "access_token" in body:
            public_body["access_token_present"] = bool(body["access_token"])
        if "refresh_token" in body:
            public_body["refresh_token_present"] = bool(body["refresh_token"])
        if "user" in body:
            public_body["user_present"] = bool(body["user"])

    return {
        "method": result.method,
        "path": result.path,
        "status": result.status,
        "ok": result.ok,
        "elapsed_ms": result.elapsed_ms,
        "body": public_body,
        "error": result.error,
    }


def write_output(path: str, payload: dict[str, Any]) -> None:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def main() -> int:
    args = parse_args()
    base_url = args.base_url or TARGETS[args.target]
    if is_production_url(base_url) and not args.allow_production:
        print(
            "Refusing to run against production without --allow-production.",
            file=sys.stderr,
        )
        return 2

    checks: list[dict[str, Any]] = []
    for path in ("/live", "/health"):
        result = request_json(base_url, "GET", path, timeout=args.timeout)
        checks.append(result_to_public_dict(result))

    authenticated_status = "skipped"
    token: str | None = None
    if args.include_authenticated:
        if not args.identifier or not args.password:
            print(
                "Authenticated smoke requires --identifier/--password or "
                "CAREKOSH_SMOKE_IDENTIFIER/CAREKOSH_SMOKE_PASSWORD.",
                file=sys.stderr,
            )
            return 2

        login_result = request_json(
            base_url,
            "POST",
            "/api/v1/auth/login",
            payload={"identifier": args.identifier, "password": args.password},
            timeout=args.timeout,
        )
        checks.append(result_to_public_dict(login_result))
        if isinstance(login_result.body, dict):
            token_value = login_result.body.get("access_token")
            token = token_value if isinstance(token_value, str) else None

        if token:
            inventory_result = request_json(
                base_url,
                "GET",
                "/api/v1/items?page=1&pageSize=5",
                token=token,
                timeout=args.timeout,
            )
            inventory_public = result_to_public_dict(inventory_result)
            if isinstance(inventory_result.body, dict):
                inventory_public["summary"] = {
                    "total": inventory_result.body.get("total"),
                    "items_returned": len(inventory_result.body.get("items", [])),
                }
                inventory_public["body"] = {"shape": "ItemList redacted"}
            checks.append(inventory_public)
            authenticated_status = "completed"
        else:
            authenticated_status = "login_failed"

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "target": args.target,
        "base_url": base_url,
        "production_allowed": bool(args.allow_production),
        "authenticated_status": authenticated_status,
        "checks": checks,
        "ok": all(check["ok"] for check in checks),
    }

    if args.output:
        write_output(args.output, payload)

    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
