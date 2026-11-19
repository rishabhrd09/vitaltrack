# Supply Review: learning, evaluation and personal ownership

**5 November 2026.** This guide accompanies the [Supply Review implementation](SUPPLY_REVIEW.md). The source was AI-assisted. Generated code does not establish the owner's personal implementation experience, production operation or GPU/EDA verification experience.

## First three learning sessions

1. Trace one authenticated item read and one pending-order save. Draw the owner boundary, transaction, expected item version and original `localId`. Explain why a display cache cannot authorize a stock write.
2. Reimplement `replenishment_quantity` in a scratch exercise and test zero, exact target, inbound coverage, invalid input and overflow. Compare it with the production function before proposing any change.
3. Trace one Supply Review from start through clarification to explicit confirmation. Explain the immutable proposal version, source revision, expiry and order linkage. Then read the stale/duplicate tests.

Use roughly three hours per session, five sessions a week, with room for caregiving. Treat the following as readiness gates, not guaranteed dates. Implementation can exist before you personally understand, demonstrate and operate it.

## Ten-to-twelve-week ownership path

| Phase | Benefit and code to reuse | Personal work and concepts | Measurable gate and release consequence |
|---|---|---|---|
| Weeks 1–2: existing app baseline | Preserve auth, inventory, order transactions, SecureStore and cookie sessions. Read `app/api/v1/items.py`, `orders.py`, both clients' API wrappers. | Trace requests; explain SQL compare-and-swap, localId idempotency, refresh races, server-first caches and transaction rollback. | Record synthetic manual/staging checks and exact API/APK/web revisions. No production claim until actual devices/hosting are verified. |
| Weeks 3–4: Python facts and rules | Reuse owner-scoped models and `supply_rules.py`. | Personally implement a typed read-only owner tool and quantity exercise; defend inbound-state policy and unit refusal. | Known-answer tests prove no stock write, no invented target and no wrong-user data. Additive code only; cloud context remains unchanged. |
| Weeks 5–6: durable approval | Reuse `supply_review.py`, `supply_revision.py` and noncommitting order service. | Implement one idempotent transition and stale/duplicate regression yourself; explain locking, immutable snapshots and atomic result linkage. | Two concurrent client confirmations yield one effect; changed stock/orders force new review; lost outcome recovers. Migration/rollback rehearsal passes on a disposable DB. |
| Weeks 7–8: matching clients | Reuse web `SupplyReview.tsx` and Android `ProposalReview.tsx`, existing sessions and dialogs. | Personally build/review one accessible proposal component on each client; handle refresh, account switch and background recovery. | Browser keyboard/320px/large-text checks and physical Nord 4 acceptance pass. Matching backend first; no automatic offline writes. |
| Weeks 9–10: evaluation and operations | Reuse pure fixture scoring, timing comparison, CI and current hosting. | Own evaluation/performance scripts, a backup restore drill and a synthetic staging incident. Learn matched benchmarks, percentiles, logs and safe rollback. | Reproduce a seeded slowdown and its regression test. Evidence distinguishes source, local test, hosted pilot and operated service. |
| Weeks 11–12: hardening and explanation | Keep the bounded design unless measured needs justify infrastructure. | Review retention, privacy, old-client compatibility and limits. Demonstrate architecture/failure tradeoffs without memorizing generated answers. | Short demo, failure drill and interview answers match actual authored/operated work. Production rollout remains a separate explicit action. |

## Eight pieces to own and demonstrate

| Deliverable | Learn and demonstrate | Interview question |
|---|---|---|
| Owner-scoped typed tool | Restrict selected columns and owner in SQL; use synthetic second-account denial. | Why is authenticated identity insufficient without resource-level authorization? |
| Quantity function | Derive the integer formula and prove status/unit boundaries without a model. | Why is `pending` different from known inbound? |
| Stale and duplicate tests | Race two clients and change stock between review and confirm. | Why are both item versions and an owner supply revision needed? |
| Web and Android review | Show identical server facts, accessible reason/quantity rows and renewed review. | Which logic belongs in Python versus the UI? |
| Idempotent transition | Same approval after timeout returns the original saved result; a closed submission rejects delayed POSTs. | Why does a 404 lookup not prove that the original request cannot still commit? |
| Evaluation script | Execute synthetic domain fixtures and require explicit safety outcomes. | Can a high average score hide a dangerous failure? |
| Performance script | Compare matched workload/environment signatures, medians and p95. | What makes a before/after benchmark incomparable? |
| Staging incident | Seed a safe failure, diagnose with evidence, fix and add a regression test. | What was observed, what was inferred, and how did you prove the fix? |

Say honestly: “I used an AI coding assistant, reviewed the generated changes, and personally implemented and tested these specific parts.” Describe only work you can reproduce and explain. Do not claim you authored every generated line.

## Offline evaluation and performance tools

These commands use synthetic JSON fixtures and pure Python. They do not call a provider, database, browser or production system. Run from `vitaltrack-backend` with the project's Python 3.12 environment:

```bash
python scripts/evaluate_supply_review.py scripts/fixtures/supply_review_eval.json --run-rules
python scripts/compare_benchmarks.py scripts/fixtures/timing_baseline.json scripts/fixtures/timing_slowdown.json
python scripts/benchmark_supply_rules.py --help
```

The seeded slowdown comparison intentionally exits **1** when it flags investigation. Invalid or incomparable input exits **2**. Success exits **0**. The scoring script uses the actual pure rules for domain fixtures; explicit safety failures block its release gate even if other examples pass.

Timing reports require identical fixture, environment, workload, concurrency, cold-start, device, dependency/provider/model and prompt signatures, plus matching sample IDs. Code revision/hash may differ. The comparator reports paired differences, median and p95, and flags changes beyond both its relative and absolute thresholds. It rejects mismatched, oversized or nonfinite input.

The CPU benchmark is local and bounded at 500 synthetic items. Its optional seeded delay is for regression demonstrations. It is not an API load test or evidence about Android speech latency. Real API/browser/voice measurements must be sanitized and labelled by stage, device, network and warm/cold state.

## Optional Regression Analysis Assistant

The implemented first step is deterministic offline scoring and comparison. A later model may explain sanitized staging reports and suggest investigations, but must not calculate authoritative statistics, assert correlation as proven cause, execute tests or modify production.

Before adding that model, define a separate minimized report contract and consent/data policy. Strip tokens, user records, transcripts, private paths and item/order contents. Preserve raw evidence references and clearly label hypotheses. Seed known failures/slowdowns and compare the explanation against known answers. No MCP, OAuth integration, code-edit tool or deployment tool is required.

Do not call this GPU hardware verification. It demonstrates Python performance analysis and reproducible regression investigation relevant to automation work. It does not establish GPU/EDA experience or replace a role's required professional years.

## Definition of done

The local implementation is reviewable when both backend schema modes, unit/rule checks, contract tests, browser checks, Android source checks and documentation checks pass with dated evidence. All unrelated owner work remains preserved.

A deployed pilot additionally needs verified backend/migration/flag, web and signed APK revisions; live session and provider checks where enabled; physical-device acceptance; and documented restore/rollback procedures.

An operated production service additionally needs monitored real usage, proven failure recovery, backups and restore drills, supported old-client behavior and operational ownership. No local suite alone establishes this stage.

Future Apple-oriented claim, after personal implementation and staging operation: “Implemented owner-scoped Python supply-review tools, deterministic business rules, idempotent approval transactions and shared web/Android recovery, with regression tests and cloud deployment evidence.”

Future NVIDIA-oriented claim, after personally reproducing the benchmark/incident work: “Built Python tools to score known-answer outcomes, compare matched performance runs and investigate seeded regressions with reproducible evidence.”
