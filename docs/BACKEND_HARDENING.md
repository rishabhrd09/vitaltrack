# Backend safety changes — 23 September 2026

## Inventory answers and local drafts — 8 October 2026

The later local feature adds strict v2 interpretation, richer inventory tables, session-scoped unsaved drafts, touch-confirmed order saving and shared PDF recovery. The server optionally validates active item versions under stable-order locks; older clients remain compatible. No new migration, stock formula, order status transition, model or provider key was introduced. Saving stays separate from applying stock; voice still cannot commit an order. The existing reset, credential/session and request/retry safety fixes are preserved. [Current flow and verification boundaries](VOICE_INVENTORY_AND_ORDER_DRAFTS.md).


> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. Earlier dated test/release claims retain their original scope. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](VOICE_INVENTORY_AND_ORDER_DRAFTS.md).


## Safety follow-up (8 October 2026)

These are owner-authorized local changes after the documentation audit of commit `03cfebb`. They have not been committed, pushed or deployed as part of this follow-up. Earlier sections below describe the original hardening work; their “no dependency upgrade” statement does not describe this later change.

| Finding | Current implementation | Verification |
|---|---|---|
| A-1 — stale edit form | Capture the version with the initial form fields. A background cache refresh cannot replace that version. An unloaded form still cannot save. | Real rendered item-form tests: stale cache refresh, unloaded form and ordinary save; existing backend version-conflict tests. The stale-form test also fails on the previous screen code while its two safety controls pass. |
| A-29 — reset backup mismatch | Fetch all server items and categories into private DTO copies, save that snapshot to a unique backup filename, then delete only its IDs. Resets send item versions; the backend checks them under row locks. Reset category deletes send the original `updatedAt` timestamp and require an empty category; a row lock protects later metadata edits and blocks new FK inserts. Preserve existing essential-item rules and ordinary category deletion's cascade. Assert the same signed-in session before each step. | Mobile reset tests cover saved data, independent snapshots and filenames at the same instant, backup failure, missing versions/timestamps, essential items and account changes. Disposable PostgreSQL tests cover changed item/category records, non-empty/empty categories, ownership, normal cascade and an observed concurrent insert lock wait. |
| A-12/A-31 — request bounds and uncertain saves | One 90 s overall deadline for ordinary requests, including response parsing and refresh/retry waits. AI retains 50 s; shared refresh retains 30 s. Missing responses are described as uncertain. Successful writes, network/gateway failures and 409s invalidate relevant queries so active views refetch. Retry retains its original variables. | Stalled fetch/body, cancellation and shared-refresh tests; real TanStack mutation/cache reconciliation tests. |
| A-32 — logout race | Clear local credentials and user state without waiting for the server. Block login/registration only during local cleanup. Revoke captured credentials separately, best effort, with a 30 s deadline; rotate/revoke in memory if access expired. Serialize credential writes; stale refresh replies cannot erase a newer login or restore logged-out credentials. Retire abandoned rotated pairs best effort. | Real service/client/store tests with stalled revocation, timeouts, token expiry and late refresh success/rejection after a new login. |
| A-27 — percent-encoded database URLs | Escape percent signs only when writing to Alembic's ConfigParser; reading the option returns the original URL. Reserved password characters should still be URL-encoded normally. | Execute the real Alembic environment in offline mode with ordinary and percent-encoded URLs; full migrated-schema suite. |
| A-30/A-25 — text preservation | Preserve ordinary punctuation and Unicode in name/contact text. Remove markup; continue escaping HTML exports. Contact create/update share the same cleaner and retain the existing 100-character limit. The form rejects a name that cleans to empty; the broader API-only empty-name issue A-24 remains open. | Mobile sanitization and rendered form tests; backend create/update contact test and full item suite. |
| A-33 — names containing safety words | An exact active item name from this login's verified cache can fence name words off from safety checks. The final answer still resolves against verified inventory. Without an owned cache, sync inventory first. Mutation, medical, historical and negated instructions remain refused. | Existing refusal tests plus exact-name parser and transcript → Send → stock-answer component tests. |
| A-34 — automatic recording route | Remove the unused `listen=1` automatic-start path. Recording requires a microphone tap; upload requires Send. | Rendered assistant test verifies that the route parameter starts no recording or permission request. |
| A-20 — JWT dependency | Pin `python-jose[cryptography]==3.5.0`; retain HS256, key configuration and token claims. | Full auth/security/backend suites with the installed 3.5.0 package. The [maintainer changelog](https://github.com/mpdavis/python-jose/blob/3.5.0/CHANGELOG.md) records the security fixes in 3.4.0 and Python 3.12 support in 3.5.0. |
| A-3 — partial follow-up | Show the actual server 409 message. Hook-based mutations invalidate the affected active queries; bulk operations retain their existing reconciliation. | Real mutation/cache test. This does not claim every direct call automatically reloads a form or that generic Retry can resolve a version conflict. |

**Fresh local verification:** 250 backend tests pass both with test-created tables and with an Alembic-migrated disposable PostgreSQL 16 database. The migrated run records 88.05% total coverage; item/order route coverage passes the 70% gates. All 152 mobile tests pass, TypeScript is clean and backend Ruff is clean. Mobile lint reports zero errors and one pre-existing `builder.tsx` effect-dependency warning. The synthetic API walkthrough records 89 steps with zero expectation mismatches, and every registered operation is documented (47/47; 44 under `/api/v1`). `python-jose` 3.5.0 is installed in the test environment and the dependency compatibility check passes. These are local results, with email and Groq mocked; they do not establish a deployed revision or device behavior.

**Release and recovery constraints:**

- Install an APK built from these mobile changes **and deploy the matching backend** before using Start Fresh/Replace All. Older backends ignore unknown query parameters and cannot enforce the new reset guards. Existing installed APKs retain their old behavior.
- The backup is local inventory/category JSON, not a complete database backup or a transactional point-in-time snapshot. Resets remain a sequence of API calls and can partially complete. Changed/new records are preserved or reported as failures; stock/order rules are not redesigned. Do not promise that the whole reset is atomic.
- No schema migration is added here. The existing `0007`–`0010` deployment gate below still applies, including old/new writer overlap and backup/restore preparation.
- Already changed names/contact details are not repaired automatically; correcting historical values requires the owner to confirm the intended text.
- Server logout revocation can fail offline. Existing access JWTs still expire normally (A-14); this change does not introduce a deny-list or change token lifetimes.
- Other audit findings and product decisions remain in [API traceability](API_TRACEABILITY.md#known-application-issues-found-while-tracing). These targeted fixes do not close all 35 findings.
- Real microphone recognition, Android native APK/AAB compilation, Groq calls, Render/Neon settings, production backup restore and target-scale load remain outside local automated verification.

## Original hardening scope

> 8 October 2026 safety follow-up: targeted code fixes are local, tested changes after the earlier audit. Deployment and real-device acceptance remain separate. [Current changes and remaining scope](BACKEND_HARDENING.md#safety-follow-up-8-october-2026).

> **Status (7 October 2026):** this is the dated record of the 23 September 2026 change set; its findings and test results below are kept as written. Since then the changes were **committed and pushed** on 6 October 2026 in `07847a4` on branch `feature/backend-hardening-ai-voice-agent-foundation` (head `03cfebb` on 7 Oct), together with migrations `0008`–`0010`, the read-only voice assistant and API audit fixes. The branch is **not merged**: `main` is `835fad3` and ends at migration `0006`. The owner reported deploying `b1c8dd7` to staging on 7 Oct 2026 (not re-checked); production's commit and database revision are NOT VERIFIED. What changed after this record is summarised under [Later changes (October 2026)](#later-changes-october-2026); current behaviour is described in the [Complete developer guide](CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md) and [API traceability](API_TRACEABILITY.md).
>
> *Re-checked on 8 October 2026* against the working tree (`03cfebb` plus uncommitted documentation): the release gate, the deferred-work list and the later-changes table were corrected where the code or the provider documentation differs; the 23 September findings stay as written.
>
> *Earlier status (23 September 2026):* corrected after that day's documentation audit (local notes, not published). The backend changes existed only in the local working tree; they had not been committed, pushed, deployed or run against a live database.

**In short:** this change set fixes session, order-number and data-safety problems found by the backend audit at commit `bb868cc`. It keeps the existing architecture, data and app behaviour. It includes one database migration, `0007_session_order_safety`, that **cannot be rolled back automatically**. That migration — now shipped together with `0008`–`0010` — must reach production only through the [release gate](#release-gate-for-migration-0007) below.

## Scope and assumptions

The implementation follows the backend audit at commit `bb868cc` and the owner's revised scope:

- a single-developer Android application;
- initially hundreds or thousands of users;
- a planning target of up to 10,000 accounts and perhaps 100–1,000 simultaneously active users.

Data preservation and existing workflows take priority. The numbers above are planning assumptions, not measured capacity guarantees. "Active users" is not the same as "simultaneous requests".

**What did not change:**

- The architecture is still one FastAPI application with PostgreSQL. No microservices, queues, Redis, new hosting service or dependency upgrade was introduced.
- No screen components, stock calculation formulas, reorder thresholds, order status transition rules, PDF layouts or ordinary request/response field names were changed.
- Existing IDs and historical rows are retained.

## Implemented protections

The last column maps each change to the ID used in the earlier backend audit (`docs/backend-audit/REPORT.md`, a private local note that is not published).

| Area | What changed | Compatibility: what stays the same, and what to expect | Audit ID |
| --- | --- | --- | --- |
| Recovery email | The profile API rejects attempts to replace or add a recovery email. Ordinary name, username and phone edits still work. | Matches the Android app, whose email field is already read-only with a "contact support" instruction. No new email-change UI or password prompt. A future self-service flow remains deferred, as requested. | ID-A1 |
| Credential recovery (sessions) | New column `users.session_version`, a per-user "session generation" number. New token pairs are signed with it, and authentication and refresh compare it with the database. Login, refresh, password recovery and sensitive account changes are serialized on the user's row (a row lock, so two of them cannot interleave). Changing a password clears stale reset and deletion links. | Existing tokens without the claim count as generation zero, so deploying alone does not sign anyone out. A password change or reset deliberately invalidates older sessions, including the current device's old tokens. Existing account records and inventory survive. | ID-A2 |
| Single-use challenges (email links) | Password reset looks up an indexed SHA-256 digest of the token and locks the row. Email verification is one conditional update. Deletion confirmation and cancellation coordinate on the same user row. | Existing links, HTML confirmation pages and response contracts remain. Reusing the same link concurrently no longer succeeds twice. | ID-A3, ID-A5 |
| Verification policy | The login rule "verify your email first" now also applies to every bearer-token request and to token refresh. | The condition is unchanged: `REQUIRE_EMAIL_VERIFICATION` is true **and** email sending is configured (`MAIL_PASSWORD`). The registration response keeps its shape; the Android registration flow already discards those tokens until verification. **Effect on installed apps:** existing sessions of unverified email accounts will receive 403 `EMAIL_NOT_VERIFIED` after deployment. The Android client then clears its credentials at the next refresh, and the user must verify before logging in again. Check how many active accounts are unverified before release. | ID-A4 |
| Mobile session recovery | One shared refresh promise settles every waiting caller, on success or failure, with a 30-second refresh timeout. Temporary failures keep the stored credentials; definitive "invalid session" responses clear them. A late failure from an old token reuses the newer token. | No new UI. Authentication failures still lead to the login screen. Temporary outages no longer strand requests or immediately discard credentials that could still work. | ID-A6 |
| Public order numbers | An atomic, persistent per-day counter (`order_number_counters`) replaces COUNT-based allocation. The `ORD-YYYYMMDD-NNNN` format is kept. The migration seeds each day's counter from the highest existing numeric suffix. | Existing public and UUID IDs and order snapshots are not rewritten. Gaps, deletions and account deletion do not reset the counter. | B01 |
| Order deletion | The SQL `DELETE` that actually removes the order checks the owner and that the current status permits deletion. | The existing deletion rules for pending and declined orders stay intact. A stale request can no longer erase an order that was applied at the same time. | B02 |
| Duplicate names | Transaction-scoped PostgreSQL advisory locks (named locks released when the transaction ends) serialize create and rename checks per owner and entity type. Existence queries tolerate duplicates that already exist. | No automatic merge, rename, deletion or uniqueness migration over existing data. Normal API writes cannot race this check, but direct SQL or import paths still need a reviewed uniqueness policy. This protects the application path only. | B03 |
| Complete order history | The existing mobile `getAll()` service follows bounded pages of 100 records. Server ordering has a stable ID tie-breaker. | The same screen receives the same response shape, including older actionable orders. The fetch length is bounded by the first response's total. Concurrent inserts or deletes still follow ordinary offset-pagination semantics and are resolved by a later refresh. | B05 |
| Activity labels and read cost | Derived category activity labels are cut to their storage width; the full category name is kept. Category list and count reads no longer eagerly load unused item collections. | Category records, counts and stock behaviour are preserved. This covers B06's category-label case and the unnecessary read fan-out; other order-input bounds are unchanged. | B06 |
| Logging and privacy | Account-action tokens are removed from server access-log URLs, and query values are suppressed there. SQL parameters are hidden. Exceptions keep their type and code locations but not their values or local variables. Sentry scrubs request data, exception values, locals and span data, and its configuration disables request-body capture. | Diagnostic detail is deliberately reduced to protect data. Deletion logs keep user IDs without email or name. Proxy/platform log retention and actual Sentry behaviour still need verification on a real deployment. | OP-01, CORE-01 (application and server configuration level) |
| Schema and testing | CI runs the tests against a real Alembic-built schema. ORM quantity and identity checks and audit indexes were aligned with the migrations. | The new model constraints already existed in the migrated schema; no new quantity rule is imposed on live rows. Remaining limiter and lifespan test gaps are listed under deferred work. | CORE-03 |
| Delivery | CI uses Python 3.12, matching the image. The shell entrypoint execs Gunicorn directly after expanding the port. Online Alembic runners share a transaction advisory lock with a bounded lock wait. The deploy-hook request fails on HTTP errors and has a timeout. | Worker count and hosting intent stay the same. Full container/platform shutdown and verification of the deployed revision are not claimed. *(8 Oct 2026: this is the branch's workflow; until the merge, a push to `main` still runs `main`'s older workflow, with Python 3.11, a route gate of 39 and a `curl -s` hook call that cannot fail the job.)* | OP-02, OP-04; parts of OP-03, OP-06 |

## Database migration `0007_session_order_safety`

**What it does.** The migration follows `0006_order_item_qty_positive` and is purely additive:

- one non-null integer column, `users.session_version`, defaulting to zero;
- one small table, `order_number_counters`, seeded by reading existing order IDs;
- three non-unique indexes on the stored token digests (email verification, password reset, account deletion).

It does **not** delete, merge, renumber or update existing application records. Normal application writes still do their intended work after deployment.

**How it was tested.** The populated-migration test builds the actual previous revision and inserts records into **all eight application tables**. These include duplicate category names, stock and version values, order snapshots, applied and pending order history, activity, audit data and refresh sessions. It then upgrades. Afterwards every existing table's row count and complete-record fingerprint match, except for the newly added session-version field. The next order number continues after the highest previous suffix instead of using the row count.

This is synthetic evidence. It is not a backup of your live data, and it does not guarantee against operational error.

## Release gate for migration 0007

> **Applies to `0007`–`0010` (7 October 2026).** The four migrations ship together on the feature branch, so this gate now covers all of them. Differences from the original steps: expect `alembic current` = `0010_order_local_id_unique` after the release (and `0006_order_item_qty_positive` before it); `0010` briefly takes a `SHARE` lock on `orders` (blocking order writes while its index is built); add order-create retries and the assistant to the staging checks. **Preserve the existing staging database**: do not run the one-way `0007`–`0010` on it as an experiment, because a database that has run `0007` cannot be moved back automatically. Instead, stage the candidate on an isolated fresh database **and** verify the `0006` → `0010` upgrade on a populated synthetic legacy database (fresh-schema tests alone do not prove that a legacy upgrade is safe); then run the E2E checks with a preview APK. (The owner reported deploying `b1c8dd7` to staging on 7 Oct 2026; whether staging's database already passed `0007` is NOT VERIFIED.) A redrawn diagram is [release-gate-0007-0010.svg](diagrams/release-gate-0007-0010.svg); the same steps are in the [Complete developer guide, F5](CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md#f5-database-migrations-and-the-0007-0010-release-gate).

**Merging to `main` can be a production deployment.** `vitaltrack-backend/render.yaml` describes the production service on branch `main` (whether Render actually reads it as a Blueprint is NOT VERIFIED), and every container runs `alembic upgrade head` before Gunicorn starts. If Render auto-deploy is on, a merge deploys immediately, independent of GitHub Actions, unless the service is set to deploy only after checks pass. Separately, the CI `deploy-backend` job calls the Render deploy hook on every push to `main` once both test jobs pass, if the `RENDER_DEPLOY_HOOK` secret is set. Auto-deploy and the secret are dashboard/GitHub settings that cannot be verified from the repository.

**Why a plain merge is unsafe for this migration:**

- `0007` refuses to downgrade, so the schema change cannot be undone by redeploying an older image. Such an image cannot even start against the upgraded database: its `alembic upgrade head` does not know the newer revision, so its entrypoint exits and Render keeps the running version.
- Render deploys with zero downtime, so old and new instances overlap for a while.
- During that overlap, the old COUNT-based allocator can hand out an `ORD-…` number that the new counter will allocate later. The resulting unique-key error also rolls back the counter increment, so order creation can keep failing for all users for the rest of that day.

![Historical (23 Sep 2026) release gate for migration 0007 alone: prepare (auto-deploy off and the CI deploy hook disabled, stage the candidate, back up), release (cut over in a maintenance window; re-seed the counter only if writes could not be paused), then check logs, monitor and re-enable auto-deploy.](diagrams/release-gate.svg)

*Historical figure (23 September 2026, `0007` only). For the current branch (`0007`–`0010`) use [release-gate-0007-0010.svg](diagrams/release-gate-0007-0010.svg) and the note above.*

**Steps:**

1. **Before merging:**
   - Switch auto-deploy off for production and staging.
   - Make sure the merge cannot trigger the CI deploy hook (for example remove the `RENDER_DEPLOY_HOOK` secret until the window).
   - Record the deployed commit and the output of `alembic current`.
   - Confirm which database and revision you are targeting.
2. **Stage the candidate:**
   - Deploy the candidate commit to staging, either as a manual deploy of that commit or by temporarily pointing the staging service at the candidate branch.
   - Run the [E2E Verification Guide](../CAREKOSH_E2E_VERIFICATION_GUIDE.html) with representative, sanitized data. Cover:
     - login and verification;
     - profile save;
     - category and item edits;
     - stock version conflicts;
     - order creation, status changes, application and deletion;
     - older order history (the Orders tab list and each order card's Ordered/Received/Applied timeline);
     - PDF export;
     - *(added 7 Oct 2026)* order creation retried with the same `localId` (must return the same order), and the read-only assistant (typed questions; microphone on a real phone).
3. **Back up:**
   - Take a production backup or provider restore point.
   - Rehearse the restore on a separate database.
   - Never run test fixtures against the real database.
4. **Cut over in a declared maintenance window:**
   - Make sure no instance of the old release can serve writes before the new release starts. The old COUNT allocator and the new counter must never write at the same time. Render documents Maintenance Mode (paid web services; public requests get 503 while the instance keeps running); a suspended service refuses deploy-hook deploys, and deploying while suspended is not documented, so confirm the exact method in Render's current documentation.
   - Deploy the reviewed commit.
   - Before reopening traffic, confirm the commit shown by Render, `alembic current` = `0007_session_order_safety` (for the current branch: `0010_order_local_id_unique`), `/live` and `/health`.
   - Note that the online migration lock only coordinates new migration runners. It does not stop old application writers or pre-patch migration processes.
5. **If writes could not be fully paused:** run this idempotent re-seed (safe to repeat) on the confirmed production database. Run it after the backup, once the old instance is gone and before normal use:

   ```sql
   INSERT INTO order_number_counters (day, last_value)
   SELECT substring(order_id from 5 for 8), max(substring(order_id from 14)::bigint)
   FROM orders
   WHERE order_id ~ '^ORD-[0-9]{8}-[0-9]{4,18}$'
   GROUP BY 1
   ON CONFLICT (day) DO UPDATE
     SET last_value = GREATEST(order_number_counters.last_value, EXCLUDED.last_value);
   ```

6. **Verify logs and privacy:**
   - Check real container access and error logs, reverse-proxy logs and telemetry, using synthetic account-action tokens.
   - Application redaction does not retroactively erase historical logs or configure the hosting edge.
7. **Monitor:**
   - Watch errors, database connections and lock waits, order-create failures and authentication recovery.
   - Validate a few real app workflows with a controlled test account before broad rollout.
8. **Re-enable auto-deploy** only after verification.

Confirm each Render control used here in Render's current documentation: the auto-deploy trigger, a manual deploy of a specific commit, and suspend/resume.

**Rollback.** This migration deliberately refuses an automatic downgrade: dropping the session generation or the counter history could undo security protections or allow order numbers to be reused. Keep the additive schema during any reviewed application rollback. (*7 Oct 2026:* `0008`–`0010` do have downgrade functions — they drop the assistant tables/columns and the `local_id` index — but they are untested, and the chain still stops at `0007`.)

An old application image ignores the generation checks and would reintroduce the original defects; in practice an image from before `0007` does not start at all against the upgraded database (see above), so a rollback image must be built from a commit that contains every applied revision file. Rollback is therefore **not** a substitute for validating credential and numbering behaviour. Restoring a database backup can also discard writes made after that backup; no automatic restore is included.

No production migration, deployment, backup change, secret rotation or remote probe was performed in this implementation.

## Verification

> **Re-run on 7 October 2026 (current branch `03cfebb`):** 242 backend tests passed with `--migrated-schema` on Python 3.12.13 and a disposable local PostgreSQL 16.14 (coverage 88%; `items.py` 96%, `orders.py` 91%); the route gate passed at **44**; Ruff was clean; 121 mobile tests passed; `tsc --noEmit` was clean; ESLint reported 0 errors and 3 warnings. CI run 37583748644 (manual dispatch on `03cfebb`) matched, with mypy at 23 advisory errors. Evidence: documentation-audit-2026-10-07/evidence (local review reference; not published). **Re-run on 8 October 2026** against a disposable local PostgreSQL 16 database: 242 backend tests passed (88%), the route gate passed at 44, Ruff was clean, the 89-step API walkthrough matched, 121 mobile tests passed, `tsc` was clean and ESLint reported 0 errors and 1 warning (two unused imports had been removed). No CI run was checked on 8 October. The numbers below are the 23 September record and are kept as written.

- The original **134 tests passed** after the initial changes.
- **152 backend tests passed in 14.78 seconds** using Python 3.12.13, PostgreSQL 16.14 and `pytest tests/ --migrated-schema`. This includes all original tests and the new safety and migration regressions. The documentation audit re-ran the suite on Python 3.11.10 with PostgreSQL 16.14 and also got 152 passed.
- **8 mobile API tests passed.** They cover concurrent refresh success and failure, transient outage recovery, timeout, a late 401, reaching order 101, and rejecting a failed later page instead of presenting incomplete history.
- Full mobile TypeScript checking and ESLint over the changed service and test files passed.
- Ruff over backend app/tests/scripts passed, and the shell syntax, CI YAML and whitespace checks passed.
- The API route gate remains **39** routes. The coverage run passed both 70% gates: items **91.12%**, orders **89.89%**. Coverage is supporting evidence, not proof that every interleaving is safe.
- Mypy remains advisory: **7 typing errors remain in 5 files on pre-existing code paths**, down from the audit baseline of 10. No new logging-module type error remains.
- No native Android device run, Docker image execution, live Sentry event or representative load test was performed. The usual functional device check is still required before release.

The first local test attempt could not connect because the temporary PostgreSQL restart used its default port. No fixture changes reached a database in that attempt. The isolated port and data directory were then corrected and checked before the successful runs. Two harness issues in the new tests (cached PostgreSQL statistics during lock observation, and the log-capture level) were fixed before the concurrency and privacy tests passed. They were not production incidents.

## Deliberately deferred work

- **Self-service email changes:** deferred at the owner's request. Support-side changes still require a defined owner-verification process; no support or admin endpoint was added.
- **Null-clearing semantics and the extreme quantity boundary (B04, B07):** these need a coordinated product/client contract. This patch does not reinterpret existing stock maths, clamp historical stock, or change edit-form payload semantics. *(Later: see below — items now clear optional fields on explicit `null`; categories and the profile still ignore `null`.)*
- **Order-create retry deduplication (B08):** this needs a stable operation key across the actual retry workflow. A fresh random key on every button press would not solve it. The new counter does not make order creation idempotent (safe to retry); a retry after a lost response can still create a second order. *(Later: addressed by migration `0010` and `localId` — see below.)*
- **Database name uniqueness:** existing duplicates are preserved. Normal API writes are serialized, but a future database constraint needs a reviewed duplicate-resolution plan and must not silently combine stock.
- **Dependency maintenance:** package versions were deliberately left unchanged in this compatibility-focused patch. The audit's advisory records remain relevant. Coherent upgrades and image scanning should be a separate, tested change before broader exposure.
- **Rate limits:** rate limiting is best effort: five auth routes, counters in memory per worker process, reset on restart; an open finding about how clients are identified is tracked privately. Settle the hosting and quota requirements before choosing edge enforcement or shared storage. Do not claim quotas are global across workers.
- **Live backups, restore objectives, monitoring and release gates:** these need actual hosting evidence. The safer deploy-hook request does not prove that a particular revision deployed successfully; no endpoint reports the deployed commit or migration revision. Limiter, lifespan and image tests and deployment verification can be added in a bounded follow-up.

## Later changes (October 2026)

Added after this record, on the same feature branch (`07847a4`, `b1c8dd7`, `03cfebb`; not merged, 7 Oct 2026):

| Change | Where | Effect |
| --- | --- | --- |
| Assistant consent and usage tables | migrations `0008_ai_consent_usage`, `0009_ai_provider_scopes`; `app/api/v1/ai.py` | Five `/api/v1/ai/*` routes (44 under `/api/v1` in total). AI is off unless the server's `AI_*` settings are set; the assistant reads inventory but never writes it — its only writes are `ai_consents` and `ai_usage` rows. |
| Order-create retry safety (B08) | migration `0010_order_local_id_unique`; `create_order` | A request with a `localId` already used by that user returns the existing order in its current state (200), even if the new payload differs. Concurrent duplicates hit the partial unique index and return the winner. Requests without `localId` (older builds) are still never deduplicated. |
| Explicit `null` clears optional item fields (B04, items only) | `PUT /api/v1/items/{id}` uses `model_fields_set` | `{"brand": null}` clears the brand; omitted fields stay unchanged; required fields ignore `null`. Category updates and profile updates still ignore `null`. |
| Request body limits (all routes; stricter for AI) | `AIBodyLimit` middleware in `app/main.py` | Bodies over 2 MB (12 KB for assistant JSON, 900 KB for the disabled audio upload) are rejected before the handler runs. |
| TanStack Query reconnect | mobile `QueryProvider.tsx` | Regaining connectivity now refetches stale queries. |

Application issues found while tracing the current code (not fixed by documentation) are listed in [API traceability — known issues](API_TRACEABILITY.md#known-application-issues-found-while-tracing).

## Growing beyond the current scale

First measure representative request rates, per-user data size, latency and error targets, query cost and pool saturation. Keep the monolith, bounded queries, transactions and migrations while those measurements justify it. Increase hosting resources or introduce shared infrastructure only for an observed requirement. Nothing in this patch demonstrates support for 1,000 simultaneous requests.
