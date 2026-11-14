#!/usr/bin/env python3
"""Score existing synthetic golden outcomes offline; no model/database is called."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.regression_analysis import evaluate_domain_fixtures, read_report, score_evaluations


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cases", type=Path)
    parser.add_argument("--run-rules", action="store_true", help="Execute the real pure Python rules against synthetic fixtures")
    args = parser.parse_args()
    try:
        report = (evaluate_domain_fixtures if args.run_rules else score_evaluations)(read_report(args.cases))
    except (OSError, ValueError, TypeError, RecursionError):
        print("Cannot score report: use bounded synthetic cases with explicit safety outcomes.", file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2, allow_nan=False))
    return 0 if report["release_gate"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
