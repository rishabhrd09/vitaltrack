#!/usr/bin/env python3
"""Verify the registered /api/v1 route-object count."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.api.v1 import declared_routes


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fail if the FastAPI /api/v1 route-object count drifts.",
    )
    parser.add_argument(
        "--expected",
        type=int,
        default=65,
        help="Expected number of /api/v1 route objects.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    api_v1_paths = [path for path, _ in declared_routes()]
    route_count = len(api_v1_paths)
    paths = sorted(set(api_v1_paths))

    print(f"/api/v1 route objects: {route_count}")
    for path in paths:
        print(f"  {path}")

    blocked_root_routes = {"/api/v1/health", "/api/v1/live"}
    mounted_blocked_roots = blocked_root_routes.intersection(api_v1_paths)
    if mounted_blocked_roots:
        print(
            "Root health routes must not be mounted under /api/v1: "
            + ", ".join(sorted(mounted_blocked_roots)),
            file=sys.stderr,
        )
        return 1

    sync_routes = [path for path in api_v1_paths if "/sync" in path]
    if sync_routes:
        print(
            "Legacy sync routes must remain removed: "
            + ", ".join(sorted(set(sync_routes))),
            file=sys.stderr,
        )
        return 1

    if route_count != args.expected:
        print(
            f"Expected {args.expected} /api/v1 route objects, got {route_count}.",
            file=sys.stderr,
        )
        return 1

    print("API route count gate passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
