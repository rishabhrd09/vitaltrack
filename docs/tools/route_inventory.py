#!/usr/bin/env python3
"""List every HTTP route registered on the CareKosh FastAPI app and check that each
has a row in docs/API_TRACEABILITY.md.

The app is imported, never served, and no database connection is opened. Run from
vitaltrack-backend/ with the backend dependencies installed:

    ENVIRONMENT=testing SECRET_KEY=<32+ chars> \
    DATABASE_URL=postgresql+asyncpg://user@127.0.0.1:5432/anything_test \
    python ../docs/tools/route_inventory.py [--json out.json]

How routes are counted: one row per (method, path) on `app.routes`. Each CareKosh
route object has exactly one method, so route objects = operations. CI's gate
(scripts/check_api_routes.py) counts only paths starting with /api/v1 (44);
this inventory also includes /, /health and /live (47 in total). The Swagger
routes (/docs, /redoc, /openapi.json) exist only when DEBUG=true and are excluded.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / "vitaltrack-backend"
MATRIX = Path(__file__).resolve().parents[1] / "API_TRACEABILITY.md"
sys.path.insert(0, str(BACKEND))

from fastapi.routing import APIRoute  # noqa: E402

from app.main import app  # noqa: E402

DOC_ROUTES = {"/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"}


def inventory() -> list[dict]:
    rows = []
    for route in app.routes:
        if not isinstance(route, APIRoute) or route.path in DOC_ROUTES:
            continue
        for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
            endpoint = route.endpoint
            rows.append({
                "method": method,
                "path": route.path,
                "handler": f"{endpoint.__module__}.{endpoint.__name__}",
                "in_openapi": route.include_in_schema,
                "status_code": route.status_code or 200,
            })
    return sorted(rows, key=lambda r: (r["path"], r["method"]))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--json", help="write the inventory to this file")
    args = parser.parse_args()
    rows = inventory()
    matrix = MATRIX.read_text(encoding="utf-8") if MATRIX.exists() else ""
    documented = set(re.findall(r"`(GET|POST|PUT|PATCH|DELETE) (/[^`\s]*)`", matrix))
    missing = [r for r in rows if (r["method"], r["path"]) not in documented]
    # Reverse check: a full path in the matrix that matches no registered route.
    # Prose uses short forms such as `POST /auth/login` or `PUT /items/{id}`; those are
    # not route claims, so only full /api/v1 paths and the three root paths are compared,
    # with path-parameter names ignored.
    def shape(path: str) -> str:
        return re.sub(r"\{[^}]*\}", "{}", path)
    registered = {(r["method"], shape(r["path"])) for r in rows}
    roots = {"/", "/health", "/live"}
    extra = sorted(
        (m, p) for m, p in documented
        if (p.startswith("/api/v1/") or p in roots) and (m, shape(p)) not in registered
    )
    api_v1 = sum(1 for r in rows if r["path"].startswith("/api/v1"))
    for r in rows:
        flag = "" if (r["method"], r["path"]) in documented else "   <-- not in API_TRACEABILITY.md"
        print(f'{r["method"]:6} {r["path"]:42} {r["handler"]}{flag}')
    print(f"\n{len(rows)} operations ({api_v1} under /api/v1, {len(rows) - api_v1} root).")
    print(f"Documented in API_TRACEABILITY.md: {len(rows) - len(missing)}/{len(rows)}")
    if extra:
        print("Documented but not registered:", ", ".join(f"{m} {p}" for m, p in extra))
    if args.json:
        Path(args.json).write_text(json.dumps(rows, indent=2) + "\n")
    return 1 if missing or extra else 0


if __name__ == "__main__":
    raise SystemExit(main())
