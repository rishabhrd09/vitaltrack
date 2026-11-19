# CareKosh Supply Review

Source implementation: **5 November 2026**, local feature-branch working tree. This guide describes an additive, server-owned review workflow for the authenticated web app and Android app. It does not establish a deployed release or physical-device acceptance. The marketing site is separate.

## What the user can do

Open **Supply review** from the authenticated app, choose recorded minimums as the starting target, answer any questions, and review a supplier-grouped replenishment proposal. Only explicit confirmation creates a pending order. Normal inventory, order status, stock application, the existing Coach and independent speech settings remain available.

The feature is disabled by default. It makes no model, audio, supplier or purchase call. It can work when all cloud AI providers are disabled. Existing Groq/OpenAI interpretation and Sarvam narration remain separate features with their existing consent and credentials.

## Architecture and authority

```text
Authenticated web or Android
       │ start / answer / read / cancel / confirm
       ▼
FastAPI owner-scoped supply-review routes
       │ short, bounded SQL transaction
       ├── owner supply-revision lock
       ├── fresh authorized inventory + outstanding order columns
       ├── pure Python quantity and unit rules
       ├── durable run + immutable proposal revision
       └── explicit confirmation → existing protected order service
                                      │
                         pending order + confirmation + audit
                                      │
                              one atomic SQL commit
```

SQL remains authoritative. Clients display server-calculated facts and send IDs, versions, targets and explicit choices. They cannot authorize stock changes by submitting a model-generated quantity or a cached snapshot. No mutation is queued for offline replay.

The new workflow is a bounded, human-reviewed supply workflow. It is not an autonomous purchasing or medical agent. The current deterministic Coach remains useful for quick questions and unsaved drafts. Neither LangGraph, a queue, MCP nor vector search is needed for this first workflow. A process-restart-safe HTTP state machine is sufficient; live stock must continue to come from SQL.

## Deterministic rules

Only owned active items are considered. A quantity of zero is out of stock. Positive quantity below the recorded minimum is low stock. Explicitly marked critical equipment at quantity one also receives backup attention. Name-based clinical inference is not used by this new workflow.

For an eligible item:

```text
order quantity = max(0, chosen target − on hand − known ordered inbound)
```

Quantities are nonnegative integers. Targets are bounded by 999,999. The recorded minimum is used only after the user explicitly selects that starting policy. A missing/zero minimum or a backup item already meeting its minimum needs the user's target. It is not an optimal-stock recommendation.

Units are matched by the same space trimming and case normalization as stock application. Boxes are never converted into pieces. Empty or mismatched units require correction in the normal screens or exclusion from this proposal. No daily use, days remaining, dose, clinical consumption or delivery promise is inferred.

| Order state | Treatment |
|---|---|
| Unsaved client/AI draft | No inbound quantity and no database order. |
| `pending` | An existing saved commitment; ask the user to reconcile it or exclude the affected item. Do not subtract it as delivery. |
| `ordered` | Subtract the recorded line quantity only for the same item ID and matching unit. This is user-recorded inbound, not supplier verification. |
| `partially_received` | Remaining quantity is unknown in the current schema. Require reconciliation; never subtract the whole order line. |
| `received` | Awaiting manual stock application. Require reconciliation; never apply stock automatically. |
| `stock_updated` | Already reflected in stock; do not count it again. |
| `declined` | No inbound quantity. |

Rows explain on-hand quantity, minimum, inbound, chosen target, proposed quantity and reason. Questions can be answered or excluded together in one request. A numeric target cannot override an unresolved order or unit conflict.

## Review and request sequence

1. Authenticated capability discovery checks the optional feature without changing ordinary app startup requirements.
2. Start sends a fresh `request_id` and explicit `target_mode:"minimum"`. Retrying that start ID returns the same owned run.
3. The backend reads current records under the cooperating owner lock, calculates a proposal and stores its source revision/fingerprint and rules version.
4. Clarifications and exclusions create a new immutable proposal revision. Refresh clears earlier target choices so a changed source requires renewed review.
5. The UI displays snapshot time, expiry, reasons, questions and excluded rows. An empty result cannot create an empty order.
6. Explicit confirmation sends the reviewed run/proposal versions and an idempotency key. The server revalidates ownership, expiry, rules, source revision, fingerprint, item versions and units.
7. Order creation, durable result linkage, confirmation and audit commit together. Stock does not increase; the new order is `pending`.
8. Lost responses are recovered by reading the owned run. A completed run returns its original order identifier. Repeated confirmations and competing web/Android reviews cannot create duplicate effects from one approval.

A changed proposal, expired review or changed inventory/order source requires renewed review. Refreshing a browser or restarting Android never grants approval. Cancel is a durable state transition, not proof that an already completed save was undone.

## API and source map

All paths below are relative to `/api/v1`. Authentication remains required, including capability/history endpoints.

| Method/path | Purpose |
|---|---|
| `GET /supply-reviews/capabilities` | Version 1, enabled state, limits, TTL and whether this owner has history. |
| `GET /supply-reviews` | Up to 20 owned summaries, without proposal payloads. |
| `POST /supply-reviews` | Start or recover an identical start request. |
| `GET /supply-reviews/{run_id}` | Authoritative status/result recovery. |
| `POST /supply-reviews/{run_id}/answers` | Versioned targets/exclusions in one batch. |
| `POST /supply-reviews/{run_id}/refresh` | Fresh proposal and renewed review. |
| `POST /supply-reviews/{run_id}/cancel` | Versioned cancellation; safe repeat returns current result. |
| `POST /supply-reviews/{run_id}/confirm` | Explicit, idempotent, transactionally revalidated pending-order creation. |
| `GET /orders/submission/{local_id}` | Owner-scoped ordinary order recovery by original UUID. |
| `POST /orders/submission/{local_id}/resolve` | Explicitly recover a saved order or close/fence an absent interrupted submission. |

Run statuses are `needs_input`, `awaiting_review`, `completed`, `cancelled`, `expired` and `stale`. A run contains an immutable proposal ID/version, snapshot/expiry/source revision, reasons, questions, exclusions and optional public `ORD-…` result identifier. History provides summaries only.

| Area | Files |
|---|---|
| HTTP/schema | `vitaltrack-backend/app/api/v1/supply_reviews.py`, `app/schemas/supply_review.py` |
| Pure rules | `vitaltrack-backend/app/services/supply_rules.py` |
| Orchestration/revalidation | `vitaltrack-backend/app/services/supply_review.py`, `supply_revision.py` |
| Reused order transaction | `vitaltrack-backend/app/services/orders.py`, `app/api/v1/orders.py` |
| Durable state | `vitaltrack-backend/app/models/supply_review.py`, migration `20261105_supply_reviews.py` (revision `0013`) |
| Web | `carekosh-web/src/services/supply-review.ts`, `src/pages/SupplyReview.tsx`, `src/components/SupplyReviewEntry.ts` |
| Android | `vitaltrack-mobile/services/supplyReview.ts`, `features/supplyReview/`, `components/supplyReview/`, `app/supply-review.tsx` |
| Retention | `vitaltrack-backend/app/services/supply_retention.py`, `scripts/prune_supply_reviews.py` |
| Evaluation | `vitaltrack-backend/app/services/regression_analysis.py`, `scripts/evaluate_supply_review.py`, `scripts/compare_benchmarks.py`, `scripts/benchmark_supply_rules.py` |

## Safety, privacy and bounded work

- Owner identity comes from authenticated server state. Another user's run returns 404. Item names and notes are data, never executable instructions.
- This workflow sends no inventory, order tool result, audio or prompt to a model. Adding model-visible records later requires minimized fields and a new, explicit versioned data consent. Existing audio, text and narration consents remain separate.
- Existing browser memory access tokens/HttpOnly refresh cookies and Android SecureStore are reused. Credentials are not added to bundles, recovery pointers or logs. There is no paid-provider fallback.
- New review JSON is capped at 64 KB. Defaults bound inventory at 500 active items, outstanding order lines at 5,000, open runs at 20 per owner, proposal revisions at 10 and clarification rounds at nine. Larger sources fail clearly rather than silently truncating facts.
- A shared owner revision serializes relevant manual item/category/order writes and confirmation. Locks exist only within a transaction, never while waiting for user review, speech, PDFs or a model. Lock acquisition has a 1.5-second timeout and a sanitized retry response.
- Completed run/result and confirmation records prevent a deleted order from reopening an old approval. Closed interrupted-submission IDs also remain fenced until account deletion.
- Operator pause prevents new starts/answers/refresh/confirm, while history, status and cancellation stay usable. Capability failure hides this optional entry rather than disabling inventory.

## Web and Android recovery

Web uses typed interaction, accessible tables, keyboard controls, a stable run URL and authenticated history. Demo mode explains that server reviews are unavailable and makes no supply API calls. Refresh, multiple tabs, logout and account switching re-authorize each read; server transactions decide simultaneous confirmations.

Android uses the same proposal contract. Its account-bound recovery pointer for ordinary orders stores only an original local UUID and timestamp, not an order body or approval. A 404 lookup alone does not prove an earlier POST cannot still finish. Explicit resolution acquires the same owner lock: it returns an existing order or stores a closed-ID fence that rejects a delayed old POST. Unknown outcomes retain the pointer.

There is no automatic write replay. Supply Review resumes from server history/status after process death. Backgrounding, microphone denial and provider failure must leave typed/manual inventory usable. Existing microphone, Moonshine, Whistle, Sarvam, device speech and experimental voice gates are separate from this workflow.

## Staging and release procedure

No hosting, hostname, deployment or release was changed by implementing this source. Follow the current Render/database arrangement.

1. Review the complete dirty checkout and publish only an intentionally reviewed change set. This task itself does not commit or push.
2. Take a database backup and prove a restore into a separate disposable database. Record the API revision and migration head without exposing credentials.
3. Keep `SUPPLY_REVIEW_ENABLED=false`. Apply migration `0013` using the existing release migration process before the new backend serves requests.
4. Deploy the new backend to every instance/worker before enabling Supply Review. Older backend writers do not participate in its revision lock. Do not mix old writers with enabled new proposals.
5. Deploy matching staging web assets and build a signed Android preview APK. Verify API/build revisions and exact staging origins. Old clients may continue their manual workflows against the new backend.
6. In the staging Render environment, set `SUPPLY_REVIEW_ENABLED=true`. Optional settings are `SUPPLY_REVIEW_TTL_SECONDS=900` and `SUPPLY_REVIEW_MAX_ITEMS=500`. No new provider key is required.
7. Run the synthetic staging and physical-device acceptance below. Enable production only after those evidence gates and backup/monitoring checks pass.

For an operational pause, set `SUPPLY_REVIEW_ENABLED=false`; read recovery remains available. For backend rollback, pause first, drain in-flight requests and keep the additive schema. Do not downgrade a database automatically. A frontend rollback is not a database rollback. The new backend's normal writes require the new revision/fence tables even when Supply Review is disabled.

Android OTA app-code updates remain disabled. A local JavaScript export is not an APK, signed AAB, native compile, Play release or physical-phone test. Existing production guards keep experimental voices and cleartext out of production.

## Retention, monitoring and incidents

Expiry limits approval, not storage retention. `scripts/prune_supply_reviews.py` is operator-only and dry-run by default. It reports counts, not user data. Its bounded batch may remove unconfirmed cancelled/logically expired reviews only after at least 30 days. It never removes completed effects, confirmation records or closed-order fences. Account deletion uses existing foreign-key cascades.

From a configured backend operator shell, inspect first:

```bash
python scripts/prune_supply_reviews.py --days 30 --limit 100
```

Apply only after checking the target environment, retention policy and backup:

```bash
python scripts/prune_supply_reviews.py --days 30 --limit 100 --apply --expect-environment staging
```

This is one batch, not a scheduled deletion job. No retention command was run against a hosted database. Confirm local legal/product retention requirements before scheduling it.

Monitor existing sanitized request logs and audit records for response status, route latency, 409/410 stale/expired reviews, 503 lock contention, provider-stage errors and unknown save outcomes. Never attach credentials, transcripts or complete proposal bodies to alerts. Record a staging baseline before setting latency/error alerts. The offline comparison script flags investigation; it does not establish root cause.

An incident drill should pause new reviews, recover known run/order IDs, inspect sanitized request IDs and transaction evidence, fix the cause, add a regression test, then restore service through staging. Do not use an AI agent to run autonomous production tests, edit code or deploy.

## Acceptance and evidence

### Local verification — 5 November 2026

The saved pre-change working-tree backend passed 895 tests through migrations. The final candidate passed **977 tests in each schema mode** on separate disposable PostgreSQL 16 databases, using Python 3.12 and synthetic records. Redis was also an isolated local test service. No hosted database was used.

| Check actually run | Result |
|---|---|
| `python -m pytest tests/ unit_tests/ -q` | 977 passed. |
| Same suite with `--migrated-schema` | 977 passed; additive migration preservation included. |
| Ruff across backend app/tests/unit tests/scripts | Passed. |
| API route inventory | 65 registered `/api/v1` route objects; gate passed. |
| Coverage floor | Items 96.72%, order routes 88.35%, order service 95.65%, supply service 92.15%, revision lock 80.65%, pure rules 97.59%; all exceed 70%. |
| Mobile `npm test` | 491 passed. |
| Mobile TypeScript and lint | Types clean; zero lint errors and one existing `app/builder.tsx:118` warning. |
| Local offline Android JavaScript export | Passed, 1,977 modules; not a native APK or phone test. |
| Web units, TypeScript and lint | 103 units passed; types/lint clean. |
| Browser flows | 30 mocked/demo browser cases passed; 11 Supply Review cases rerun after the final screenshot-path change. One existing opt-in real-API case was skipped. |
| Web release builds and hosting | Production/staging builds and unsafe-config guards passed; 22 deep links, four expected 404s and security/cache headers checked locally. |
| Pure rule goldens | 12/12 passed, no safety failures. |
| Seeded timing regression | Correctly flagged a synthetic +100 ms slowdown; intentional comparator exit 1. |

Coverage uses Python 3.12's `sys.monitoring` core (`COVERAGE_CORE=sysmon`). The default local tracer undercounted resumed asynchronous handlers; no coverage floor was lowered. CI now checks both schema modes and the shared order/supply services.

A matched local API probe used 32 synthetic items, five warmups and 50 samples per version. Median inventory reads were 2.431 ms before and 2.403 ms after. Median stock updates were 3.777 ms before and 4.232 ms after: approximately **0.455 ms added** for coordination, or 12% at this very small local baseline. This is measured overhead, not a promise of zero regression or a production load test. Pure rules for 500 synthetic items had a 0.392 ms median over 30 samples.

The added live browser-to-HTTP/PostgreSQL acceptance check remains pending. No real or hosted data was accessed. Existing API/database tests and mocked browser tests provide separate evidence, not a substitute for this missing combined check. Physical Android audio, staging deployment, restore drills and operated-production acceptance also remain pending.

The dated local verification results are recorded in the implementation handoff. Test source and CI configuration alone are not proof of execution. Backend integration tests drop/recreate tables and require an explicitly disposable test database. The implementation's checks use synthetic records only.

| Layer | Required evidence |
|---|---|
| Pure unit/rule evaluation | Exact quantity, all status/unit cases, no invented targets, injection strings, bounds and seeded regression reports. |
| Real local API/database | Both model-created and Alembic-created schemas; wrong owner, stale review, same/different keys, competing clients, rollback and closed-submission fencing. |
| Browser | Clarification, empty/ready/stale results, lost response, refresh, paused history, logout/tabs, demo isolation, keyboard and narrow/large-text layout. |
| Android source checks | Tests, TypeScript, lint, session/background/process-restart recovery, existing voice and order regressions. |
| Physical Nord 4 | Signed preview revision; manual stock/edit/order/PDF/apply; Supply Review; mic deny/revoke; Moonshine/Whistle; Sarvam/device voice; second question; background/kill/reopen/network switch; large text/TalkBack. |
| Operated release | Verified deployed revision/migration/flags, restore drill, monitored pilot, measured failure handling and supported-client matrix. |

Live provider calls, physical Android audio, hosted configuration, store status and real backup restoration remain separate acceptance work. Passing local tests cannot certify all devices or promise zero performance degradation.

See [learning and ownership](SUPPLY_REVIEW_LEARNING.md), [voice architecture](VOICE_INVENTORY_AND_ORDER_DRAFTS.md), [OpenAI understanding](OPENAI_UNDERSTANDING.md) and [Sarvam narration](SARVAM_ENGLISH_VOICE.md).
