#!/usr/bin/env python3
"""Check per-file coverage thresholds from coverage.py JSON output."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


DEFAULT_FILES = ("app/api/v1/items.py", "app/api/v1/orders.py")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fail if selected files are below the configured coverage floor.",
    )
    parser.add_argument(
        "coverage_json",
        type=Path,
        help="Path to coverage.py JSON output.",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=70.0,
        help="Minimum percent coverage required for each selected file.",
    )
    parser.add_argument(
        "--file",
        dest="files",
        action="append",
        default=None,
        help="File path to check. Can be passed more than once.",
    )
    return parser.parse_args()


def load_coverage(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        print(f"Coverage JSON not found: {path}", file=sys.stderr)
    except json.JSONDecodeError as exc:
        print(f"Coverage JSON is invalid: {path}: {exc}", file=sys.stderr)
    return {}


def main() -> int:
    args = parse_args()
    coverage = load_coverage(args.coverage_json)
    if not coverage:
        return 1

    coverage_files = coverage.get("files", {})
    if not isinstance(coverage_files, dict):
        print("Coverage JSON does not contain a 'files' object.", file=sys.stderr)
        return 1

    requested_files = tuple(args.files or DEFAULT_FILES)
    failures: list[str] = []

    for requested_file in requested_files:
        normalized = Path(requested_file).as_posix()
        file_coverage = coverage_files.get(normalized)
        if file_coverage is None:
            failures.append(f"{normalized}: missing from coverage report")
            continue

        summary = file_coverage.get("summary", {})
        percent = float(summary.get("percent_covered", 0.0))
        print(f"{normalized}: {percent:.2f}% covered (floor {args.threshold:.2f}%)")
        if percent < args.threshold:
            failures.append(
                f"{normalized}: {percent:.2f}% is below {args.threshold:.2f}%"
            )

    if failures:
        for failure in failures:
            print(failure, file=sys.stderr)
        return 1

    print("Per-file coverage gate passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
