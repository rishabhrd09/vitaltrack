#!/usr/bin/env python3
"""Synthetic CPU microbenchmark only; no HTTP, database, provider or user data.

Use identical signature settings for comparisons. This measures rule execution,
not Android audio, production API latency or database performance.
"""
import argparse
import hashlib
import json
import platform
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.supply_rules import SupplyFact, review_facts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--items", type=int, default=500, choices=range(1, 501), metavar="1..500")
    parser.add_argument("--samples", type=int, default=30, choices=range(2, 101), metavar="2..100")
    parser.add_argument("--revision", default="working-tree")
    parser.add_argument("--inject-delay-ms", type=float, default=0, help="Synthetic seeded delay, 0..100 ms per sample")
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,96}", args.revision) or not 0 <= args.inject_delay_ms <= 100:
        parser.error("Use a synthetic revision ID and a delay between 0 and 100 ms")
    items = [SupplyFact(item_id=f"item-{i}", version=1, name=f"Synthetic supply {i}",
                       unit="pieces", supplier_name=f"Synthetic group {i % 5}",
                       quantity=i % 3, minimum_stock=5, is_critical=False) for i in range(args.items)]
    for _ in range(5):
        review_facts(items, [], {})
    samples = []
    for index in range(args.samples):
        start = time.perf_counter_ns()
        result = review_facts(items, [], {})
        if args.inject_delay_ms:
            time.sleep(args.inject_delay_ms / 1000)
        elapsed = (time.perf_counter_ns() - start) / 1_000_000
        if len(result["lines"]) != args.items:
            raise RuntimeError("Synthetic golden outcome changed")
        samples.append({"case_id": f"pair-{index:03d}", "metrics_ms": {"rules": elapsed}})
    fixture = f"supply-synthetic-v1-items-{args.items}".encode()
    source = Path(__file__).resolve().parents[1] / "app/services/supply_rules.py"
    signature = {"fixture_hash": hashlib.sha256(fixture).hexdigest(), "environment": "local-test",
                 "workload": f"pure-supply-{args.items}", "concurrency": 1, "cold_start": False,
                 "device": platform.machine(), "versions": {"python": platform.python_version(),
                 "system": platform.system(), "release": platform.release()},
                 "provider": "none", "model": "none", "prompt_version": "none"}
    print(json.dumps({"signature": signature, "artifact": {"revision": args.revision,
                     "code_hash": hashlib.sha256(source.read_bytes()).hexdigest()}, "samples": samples}, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
