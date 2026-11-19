"""Known-answer statistics and hostile report checks; no database/provider."""
import copy
import json

import pytest

from app.services.regression_analysis import compare_timings, evaluate_domain_fixtures, read_report, score_evaluations


def report(values):
    return {"signature": {"fixture_hash": "synthetic-v1", "environment": "local-test",
        "workload": "inventory-500", "concurrency": 1, "cold_start": False,
        "device": "reference-cpu", "versions": {"python": "3.12"},
        "provider": "none", "model": "none", "prompt_version": "none"},
        "samples": [{"case_id": f"pair-{index}", "metrics_ms": {"sql": value}}
                    for index, value in enumerate(values)]}


def test_seeded_slowdown_has_exact_paired_statistics_not_causality():
    result = compare_timings(report([100, 200, 300]), report([200, 300, 400]))
    metric = result["metrics"]["sql"]
    assert result["matched_samples"] == 3
    assert metric["baseline_median_ms"] == 200
    assert metric["candidate_median_ms"] == 300
    assert metric["paired_median_delta_ms"] == 100
    assert metric["median_change_percent"] == 50
    assert metric["baseline_p95_ms"] == 290
    assert metric["investigate"] is True
    assert result["external_actions"] is False
    assert "not proven root cause" in result["interpretation"]


def test_unchanged_and_tiny_noise_do_not_flag_regression():
    assert not compare_timings(report([100, 200]), report([100, 200]))["metrics"]["sql"]["investigate"]
    assert not compare_timings(report([100, 200]), report([101, 201]))["metrics"]["sql"]["investigate"]


@pytest.mark.parametrize("field", ["fixture_hash", "environment", "device", "model", "cold_start", "versions"])
def test_incomparable_benchmarks_are_rejected(field):
    old, new = report([100, 200]), report([200, 300])
    new["signature"][field] = True if field == "cold_start" else {"python": "3.13"} if field == "versions" else "different"
    with pytest.raises(ValueError, match="not comparable"):
        compare_timings(old, new)


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -1, True, "100", 1e12])
def test_invalid_timings_are_rejected(value):
    with pytest.raises(ValueError):
        compare_timings(report([100, 200]), report([value, 200]))


def test_duplicate_ids_missing_metrics_and_raw_content_are_rejected():
    for change in (lambda r: r["samples"][1].update(case_id="pair-0"),
                   lambda r: r["samples"][1].update(metrics_ms={"other": 20}),
                   lambda r: r.update(raw_audio="not-accepted")):
        new = report([100, 200])
        change(new)
        with pytest.raises(ValueError):
            compare_timings(report([100, 200]), new)


def test_zero_baseline_is_explicit_and_inputs_are_not_modified():
    before, after = report([0, 0]), report([100, 100])
    unchanged = copy.deepcopy(after)
    metric = compare_timings(before, after)["metrics"]["sql"]
    assert metric["median_change_percent"] is None and metric["investigate"]
    assert after == unchanged


def test_safety_failure_cannot_hide_behind_correct_json_or_average():
    cases = [dict(case_id="golden", expected={"quantity": 2}, actual={"quantity": 2}, safety_ok=True),
             dict(case_id="wrong-owner", expected={}, actual={}, safety_ok=False),
             dict(case_id="wrong-quantity", expected={"quantity": 2}, actual={"quantity": 3}, safety_ok=True)]
    result = score_evaluations(cases)
    assert result["passed"] == 1 and result["safety_failures"] == 1
    assert result["accuracy"] == 1 / 3 and not result["release_gate"]
    assert "expected" not in json.dumps(result) and "actual" not in json.dumps(result)
    assert score_evaluations(cases[:1])["release_gate"]


@pytest.mark.parametrize("change", [lambda c: c.update(safety_ok=1), lambda c: c.update(case_id="bad id"),
    lambda c: c.update(raw_prompt="not-accepted"), lambda c: c.update(actual={"bad": float("nan")})])
def test_evaluation_refuses_unsafe_or_ambiguous_report_shapes(change):
    case = dict(case_id="synthetic", expected={}, actual={}, safety_ok=True)
    change(case)
    with pytest.raises(ValueError):
        score_evaluations([case])


def test_file_reader_bounds_input_and_rejects_duplicate_nonfinite_json(tmp_path):
    source = tmp_path / "synthetic.json"
    for value in ['{"x":1,"x":2}', '[NaN]', 'x' * 2_000_001]:
        source.write_text(value)
        with pytest.raises(ValueError):
            read_report(source)


def test_actual_domain_rule_goldens_execute_and_detect_seeded_wrong_answer():
    source = __import__("pathlib").Path(__file__).resolve().parents[1] / "scripts" / "fixtures" / "supply_review_eval.json"
    fixtures = read_report(source)
    assert evaluate_domain_fixtures(fixtures)["release_gate"]
    fixtures[0]["expected"]["lines"]["item-a"] = 999
    result = evaluate_domain_fixtures(fixtures)
    assert not result["release_gate"] and result["passed"] == len(fixtures) - 1


def test_artifact_revisions_can_change_while_runtime_comparability_must_hold():
    old, new = report([100, 200]), report([100, 200])
    old["artifact"] = {"revision": "before", "code_hash": "a" * 64}
    new["artifact"] = {"revision": "after", "code_hash": "b" * 64}
    result = compare_timings(old, new)
    assert result["baseline_artifact"]["revision"] == "before"
    assert result["candidate_artifact"]["revision"] == "after"
    new["artifact"]["api_key"] = "not-accepted"
    with pytest.raises(ValueError):
        compare_timings(old, new)
