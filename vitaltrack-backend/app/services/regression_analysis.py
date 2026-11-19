"""Offline evaluation and matched timing statistics over explicitly supplied data.

No provider, database, subprocess or network access. Reports contain case IDs and
statistics only; they are evidence for investigation, never a root-cause claim.
"""

import json
import math
import re
import statistics
from pathlib import Path

MAX_REPORT_BYTES = 2_000_000
MAX_CASES = 10_000
IDENTIFIER = re.compile(r"[A-Za-z0-9_.:-]{1,96}\Z")
SIGNATURE_FIELDS = {
    "fixture_hash", "environment", "workload", "concurrency", "cold_start",
    "device", "versions", "provider", "model", "prompt_version",
}


def _unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Repeated JSON field")
        result[key] = value
    return result


def _nonfinite(_):
    raise ValueError("Nonfinite JSON number")


def read_report(path: Path):
    with path.open("rb") as stream:
        raw = stream.read(MAX_REPORT_BYTES + 1)
    if len(raw) > MAX_REPORT_BYTES:
        raise ValueError("Report exceeds the input size limit")
    try:
        return json.loads(raw, object_pairs_hook=_unique, parse_constant=_nonfinite)
    except (UnicodeError, RecursionError, TypeError) as exc:
        raise ValueError("Malformed report") from exc


def _id(value):
    if not isinstance(value, str) or not IDENTIFIER.fullmatch(value):
        raise ValueError("Case/metric IDs must be short synthetic identifiers")
    return value


def _number(value):
    if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1_000_000_000:
        raise ValueError("Timing must be a finite nonnegative millisecond value")
    return float(value)


def percentile(values, fraction):
    ordered = sorted(values)
    index = (len(ordered) - 1) * fraction
    lower = math.floor(index)
    upper = math.ceil(index)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (index - lower)


def _timings(report):
    if not isinstance(report, dict) or not {"signature", "samples"} <= set(report) or set(report) - {"signature", "samples", "artifact"}:
        raise ValueError("Timing report requires signature, samples and optional artifact IDs")
    if "artifact" in report:
        if not isinstance(report["artifact"], dict) or set(report["artifact"]) != {"revision", "code_hash"}:
            raise ValueError("Artifact requires only revision and code_hash")
        for value in report["artifact"].values():
            _id(value)
    signature = report["signature"]
    if not isinstance(signature, dict) or set(signature) != SIGNATURE_FIELDS:
        raise ValueError("Complete benchmark comparability signature is required")
    # Comparability metadata is bounded and never echoed into output/logs.
    if len(json.dumps(signature, allow_nan=False)) > 4096:
        raise ValueError("Benchmark signature is too large")
    for field in SIGNATURE_FIELDS - {"concurrency", "cold_start", "versions"}:
        _id(signature[field])
    if type(signature["concurrency"]) is not int or not 1 <= signature["concurrency"] <= 1000:
        raise ValueError("Invalid concurrency")
    if type(signature["cold_start"]) is not bool:
        raise ValueError("Cold and warm benchmarks must be distinguished")
    if not isinstance(signature["versions"], dict) or not signature["versions"] or len(signature["versions"]) > 30:
        raise ValueError("Reference runtime versions are required")
    for key, value in signature["versions"].items():
        _id(key)
        _id(value)
    samples = report["samples"]
    if not isinstance(samples, list) or not 2 <= len(samples) <= MAX_CASES:
        raise ValueError("Use 2 to 10000 paired timing samples")
    result = {}
    metrics = None
    for sample in samples:
        if not isinstance(sample, dict) or set(sample) != {"case_id", "metrics_ms"}:
            raise ValueError("Sample requires only case_id and metrics_ms")
        key = _id(sample["case_id"])
        if key in result:
            raise ValueError("Timing sample IDs must be unique")
        values = sample["metrics_ms"]
        if not isinstance(values, dict) or not 1 <= len(values) <= 20:
            raise ValueError("Use 1 to 20 timing metrics")
        current = {_id(name): _number(value) for name, value in values.items()}
        if metrics is not None and set(current) != metrics:
            raise ValueError("Every sample must contain the same metrics")
        metrics = set(current)
        result[key] = current
    return signature, result


def compare_timings(baseline, candidate, *, relative_threshold=0.20, absolute_threshold_ms=50.0):
    """Compare only matched runs; thresholds flag investigations, not causality."""
    relative_threshold = _number(relative_threshold)
    absolute_threshold_ms = _number(absolute_threshold_ms)
    old_signature, old = _timings(baseline)
    new_signature, new = _timings(candidate)
    if old_signature != new_signature:
        raise ValueError("Benchmark signatures differ; results are not comparable")
    if old.keys() != new.keys() or set(next(iter(old.values()))) != set(next(iter(new.values()))):
        raise ValueError("Benchmark sample IDs and metrics must match exactly")
    metrics = {}
    for metric in sorted(next(iter(old.values()))):
        before = [old[key][metric] for key in sorted(old)]
        after = [new[key][metric] for key in sorted(old)]
        previous, current = statistics.median(before), statistics.median(after)
        delta = current - previous
        ratio = delta / previous if previous else None
        metrics[metric] = {
            "baseline_median_ms": previous, "candidate_median_ms": current,
            "baseline_p95_ms": percentile(before, .95),
            "candidate_p95_ms": percentile(after, .95),
            "paired_median_delta_ms": statistics.median(b - a for a, b in zip(before, after, strict=True)),
            "median_change_percent": ratio * 100 if ratio is not None else None,
            "investigate": delta >= absolute_threshold_ms and (ratio is None or ratio >= relative_threshold),
        }
    return {
        "matched_samples": len(old), "metrics": metrics,
        "baseline_artifact": baseline.get("artifact"), "candidate_artifact": candidate.get("artifact"),
        "interpretation": "Matched timing differences are evidence for investigation, not proven root cause.",
        "external_actions": False,
    }


def score_evaluations(cases):
    """Exact golden-outcome scoring; never use a model as the numerical judge.

    Outcomes are bounded JSON values from synthetic fixtures. A safety failure is
    counted independently from semantic correctness and cannot hide in averages.
    """
    if not isinstance(cases, list) or not 1 <= len(cases) <= MAX_CASES:
        raise ValueError("Use 1 to 10000 synthetic evaluation cases")
    seen, passed, safety_failures, failures = set(), 0, 0, []
    for case in cases:
        if not isinstance(case, dict) or set(case) != {"case_id", "expected", "actual", "safety_ok"}:
            raise ValueError("Evaluation case requires case_id, expected, actual and safety_ok")
        key = _id(case["case_id"])
        if key in seen:
            raise ValueError("Evaluation case IDs must be unique")
        seen.add(key)
        if type(case["safety_ok"]) is not bool:
            raise ValueError("Safety result must be an explicit Boolean")
        try:
            expected = json.dumps(case["expected"], sort_keys=True, allow_nan=False)
            actual = json.dumps(case["actual"], sort_keys=True, allow_nan=False)
        except (TypeError, ValueError, RecursionError) as exc:
            raise ValueError("Evaluation outcomes must be finite JSON data") from exc
        if max(len(expected), len(actual)) > 100_000:
            raise ValueError("Evaluation outcome is too large")
        safe = case["safety_ok"]
        correct = expected == actual
        passed += bool(correct and safe)
        safety_failures += not safe
        if not correct or not safe:
            failures.append({"case_id": key, "semantic_match": correct, "safety_ok": safe})
    return {"cases": len(cases), "passed": passed, "accuracy": passed / len(cases),
            "safety_failures": safety_failures, "failures": failures,
            "release_gate": safety_failures == 0 and passed == len(cases)}


def evaluate_domain_fixtures(cases):
    """Execute the actual pure replenishment rules against synthetic goldens."""
    from app.services.supply_rules import InboundFact, SupplyFact, review_facts

    if not isinstance(cases, list) or not 1 <= len(cases) <= MAX_CASES:
        raise ValueError("Use bounded synthetic rule fixtures")
    scored = []
    for case in cases:
        if not isinstance(case, dict) or set(case) != {"case_id", "items", "inbound", "answers", "expected"}:
            raise ValueError("Rule fixture requires case_id, items, inbound, answers and expected")
        _id(case["case_id"])
        if not isinstance(case["items"], list) or len(case["items"]) > 500:
            raise ValueError("Too many fixture items")
        if not isinstance(case["inbound"], list) or len(case["inbound"]) > 500:
            raise ValueError("Too many fixture order lines")
        if not isinstance(case["answers"], dict):
            raise ValueError("Fixture answers must be an object")
        try:
            facts = [SupplyFact(**row) for row in case["items"]]
            inbound = [InboundFact(**row) for row in case["inbound"]]
            result = review_facts(facts, inbound, case["answers"])
        except (TypeError, OverflowError) as exc:
            raise ValueError("Invalid rule fixture") from exc
        actual = {
            "lines": {row["item_id"]: row["order_quantity"] for row in result["lines"]},
            "questions": {row["item_id"]: row["code"] for row in result["questions"]},
            "excluded": sorted(row["item_id"] for row in result["excluded"]),
        }
        owned = {item.item_id for item in facts}
        safe = all(row["item_id"] in owned and type(row["order_quantity"]) is int
                   and 0 < row["order_quantity"] <= 999999 for row in result["lines"])
        scored.append({"case_id": case["case_id"], "expected": case["expected"],
                       "actual": actual, "safety_ok": safe})
    return score_evaluations(scored)
