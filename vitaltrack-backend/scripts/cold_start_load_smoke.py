"""Small CareKosh cold-start and early-user load smoke.

This is intentionally tiny. It is a launch confidence check for /live and
/health, not a capacity benchmark.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


TARGETS = {
    "staging": "https://vitaltrack-api-staging.onrender.com",
    "production": "https://vitaltrack-api.onrender.com",
    "local": "http://127.0.0.1:8000",
}
MAX_REQUESTS = 60
MAX_CONCURRENCY = 6


@dataclass
class ProbeResult:
    path: str
    status: int | None
    ok: bool
    elapsed_ms: int
    error: str | None = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", choices=sorted(TARGETS), default="staging")
    parser.add_argument("--base-url", help="Override target base URL.")
    parser.add_argument(
        "--allow-production",
        action="store_true",
        help="Required when target/base URL points at production.",
    )
    parser.add_argument("--requests", type=int, default=12)
    parser.add_argument("--concurrency", type=int, default=3)
    parser.add_argument("--timeout", type=float, default=90.0)
    parser.add_argument("--output", help="Optional JSON evidence output path.")
    return parser.parse_args()


def is_production_url(base_url: str) -> bool:
    return "vitaltrack-api.onrender.com" in base_url.rstrip("/")


def probe(base_url: str, path: str, timeout: float) -> ProbeResult:
    url = f"{base_url.rstrip('/')}{path}"
    req = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "carekosh-goal10-load/1.0"},
        method="GET",
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            response.read()
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            return ProbeResult(
                path=path,
                status=response.status,
                ok=200 <= response.status < 300,
                elapsed_ms=elapsed_ms,
            )
    except urllib.error.HTTPError as exc:
        exc.read()
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return ProbeResult(
            path=path,
            status=exc.code,
            ok=False,
            elapsed_ms=elapsed_ms,
            error=f"HTTP {exc.code}",
        )
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return ProbeResult(
            path=path,
            status=None,
            ok=False,
            elapsed_ms=elapsed_ms,
            error=str(exc.reason if isinstance(exc, urllib.error.URLError) else exc),
        )


def percentile(values: list[int], pct: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((pct / 100) * (len(ordered) - 1))))
    return ordered[index]


def summarize(results: list[ProbeResult]) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    for path in sorted({result.path for result in results}):
        path_results = [result for result in results if result.path == path]
        latencies = [result.elapsed_ms for result in path_results if result.ok]
        statuses: dict[str, int] = {}
        for result in path_results:
            key = str(result.status) if result.status is not None else "network_error"
            statuses[key] = statuses.get(key, 0) + 1
        summary[path] = {
            "count": len(path_results),
            "ok_count": sum(1 for result in path_results if result.ok),
            "status_counts": statuses,
            "min_ms": min(latencies) if latencies else None,
            "median_ms": int(statistics.median(latencies)) if latencies else None,
            "p95_ms": percentile(latencies, 95),
            "max_ms": max(latencies) if latencies else None,
        }
    return summary


def result_to_dict(result: ProbeResult) -> dict[str, Any]:
    return {
        "path": result.path,
        "status": result.status,
        "ok": result.ok,
        "elapsed_ms": result.elapsed_ms,
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
    if args.requests < 1 or args.requests > MAX_REQUESTS:
        print(f"--requests must be between 1 and {MAX_REQUESTS}.", file=sys.stderr)
        return 2
    if args.concurrency < 1 or args.concurrency > MAX_CONCURRENCY:
        print(
            f"--concurrency must be between 1 and {MAX_CONCURRENCY}.",
            file=sys.stderr,
        )
        return 2

    first_live = probe(base_url, "/live", args.timeout)
    first_health = probe(base_url, "/health", args.timeout)

    paths = ["/live", "/health"]
    queued_paths = [paths[index % len(paths)] for index in range(args.requests)]
    warm_results: list[ProbeResult] = []
    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = [executor.submit(probe, base_url, path, args.timeout) for path in queued_paths]
        for future in as_completed(futures):
            warm_results.append(future.result())

    warm_summary = summarize(warm_results)
    thresholds = {
        "cold_live_max_ms": 75_000,
        "warm_live_p95_max_ms": 5_000,
        "warm_health_p95_max_ms": 10_000,
    }
    pass_checks = {
        "cold_live_within_threshold": first_live.ok
        and first_live.elapsed_ms <= thresholds["cold_live_max_ms"],
        "warm_live_p95_within_threshold": (
            warm_summary.get("/live", {}).get("p95_ms") is not None
            and warm_summary["/live"]["p95_ms"] <= thresholds["warm_live_p95_max_ms"]
        ),
        "warm_health_p95_within_threshold": (
            warm_summary.get("/health", {}).get("p95_ms") is not None
            and warm_summary["/health"]["p95_ms"] <= thresholds["warm_health_p95_max_ms"]
        ),
        "no_unexpected_warm_failures": all(result.ok for result in warm_results),
    }

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "target": args.target,
        "base_url": base_url,
        "production_allowed": bool(args.allow_production),
        "requests": args.requests,
        "concurrency": args.concurrency,
        "thresholds": thresholds,
        "first_probes": [result_to_dict(first_live), result_to_dict(first_health)],
        "warm_summary": warm_summary,
        "warm_results": [result_to_dict(result) for result in warm_results],
        "pass_checks": pass_checks,
        "ok": all(pass_checks.values()),
    }

    if args.output:
        write_output(args.output, payload)

    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
