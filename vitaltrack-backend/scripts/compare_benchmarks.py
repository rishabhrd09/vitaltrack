#!/usr/bin/env python3
"""Offline paired report comparison. Never runs a benchmark or contacts a model."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.regression_analysis import compare_timings, read_report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--relative-threshold", type=float, default=.20)
    parser.add_argument("--absolute-threshold-ms", type=float, default=50)
    args = parser.parse_args()
    try:
        report = compare_timings(read_report(args.baseline), read_report(args.candidate),
                                 relative_threshold=args.relative_threshold,
                                 absolute_threshold_ms=args.absolute_threshold_ms)
    except (OSError, ValueError, TypeError, RecursionError):
        print("Cannot compare reports: check bounded JSON format and matching benchmark metadata.", file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2, allow_nan=False))
    return 1 if any(metric["investigate"] for metric in report["metrics"].values()) else 0


if __name__ == "__main__":
    raise SystemExit(main())
