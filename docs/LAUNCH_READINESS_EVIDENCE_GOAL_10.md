# Goal 10 Launch Readiness Evidence

Last updated: 2026-06-16

This file records non-secret operational evidence for Goal 10. Do not paste
passwords, tokens, database URLs, smoke account emails, raw provider responses,
or user data here.

## Branch And Base

| Check | Result |
| --- | --- |
| Branch | `ops/launch-readiness-runbook` |
| Working tree before original Goal 10 edits | Clean |
| Working tree at Goal 11 start | Dirty with Goal 10 docs/evidence/scripts and email/auth redaction changes; no files staged |
| Base after `git fetch origin` | `HEAD == main == origin/main == 30e3ad2103e088f86391998b4c261d64b1386730` |
| PR #46 merge present | Yes, `30e3ad2 Merge pull request #46 from rishabhrd09/mobile/playstore-release-hardening` |

## Manual Health Verification

| Date | Target | Endpoint | Result | Evidence |
| --- | --- | --- | --- | --- |
| 2026-06-15 | Production | `/live` | 200, `status=healthy`, `database=not_checked`, 214 ms | `docs/evidence/production-health-smoke-20260615.json` |
| 2026-06-15 | Production | `/health` | 200, `status=healthy`, `database=connected`, 1104 ms | `docs/evidence/production-health-smoke-20260615.json` |
| 2026-06-15 | Staging | `/live` | 200, `status=healthy`, `database=not_checked`, 345 ms | `docs/evidence/staging-health-smoke-20260615.json` |
| 2026-06-15 | Staging | `/health` | 200, `status=healthy`, `database=connected`, 500 ms | `docs/evidence/staging-health-smoke-20260615.json` |
| 2026-06-16 | Production | `/live` | 200, `status=healthy`, `database=not_checked`, 194 ms | `docs/evidence/production-health-smoke-goal11-20260616.json` |
| 2026-06-16 | Production | `/health` | 200, `status=healthy`, `database=connected`, 997 ms | `docs/evidence/production-health-smoke-goal11-20260616.json` |
| 2026-06-16 | Staging warm | `/live` | 200, `status=healthy`, `database=not_checked`, 150 ms | `docs/evidence/staging-health-smoke-goal11-warm-20260616.json` |
| 2026-06-16 | Staging warm | `/health` | 200, `status=healthy`, `database=connected`, 426 ms | `docs/evidence/staging-health-smoke-goal11-warm-20260616.json` |
| 2026-06-16 | Staging rerun | `/live` | 200, `status=healthy`, `database=not_checked`, 163 ms | `docs/evidence/staging-health-smoke-goal11-rerun-20260616.json` |
| 2026-06-16 | Staging rerun | `/health` | 200, `status=healthy`, `database=connected`, 1179 ms | `docs/evidence/staging-health-smoke-goal11-rerun-20260616.json` |
| 2026-06-16 | Production transient rerun | `/live` | Timed out at 90 seconds | `docs/evidence/production-health-smoke-goal11-rerun-20260616.json` |
| 2026-06-16 | Production transient rerun | `/health` | 503, `status=unhealthy`, `database=unavailable`, 36099 ms | `docs/evidence/production-health-smoke-goal11-rerun-20260616.json` |
| 2026-06-16 | Production recovery rerun | `/live` | 200, `status=healthy`, `database=not_checked`, 296 ms | `docs/evidence/production-health-smoke-goal11-rerun2-20260616.json` |
| 2026-06-16 | Production recovery rerun | `/health` | 200, `status=healthy`, `database=connected`, 500 ms | `docs/evidence/production-health-smoke-goal11-rerun2-20260616.json` |
| 2026-06-16 | Production sample 3 | `/live` | 200, `status=healthy`, `database=not_checked`, 295 ms | `docs/evidence/production-health-smoke-goal11-sample3-20260616.json` |
| 2026-06-16 | Production sample 3 | `/health` | 200, `status=healthy`, `database=connected`, 288 ms | `docs/evidence/production-health-smoke-goal11-sample3-20260616.json` |
| 2026-06-16 | Production sample 4 | `/live` | 200, `status=healthy`, `database=not_checked`, 142 ms | `docs/evidence/production-health-smoke-goal11-sample4-20260616.json` |
| 2026-06-16 | Production sample 4 | `/health` | 200, `status=healthy`, `database=connected`, 794 ms | `docs/evidence/production-health-smoke-goal11-sample4-20260616.json` |
| 2026-06-16 | Staging sample 3 | `/live` | 200, `status=healthy`, `database=not_checked`, 145 ms | `docs/evidence/staging-health-smoke-goal11-sample3-20260616.json` |
| 2026-06-16 | Staging sample 3 | `/health` | 200, `status=healthy`, `database=connected`, 605 ms | `docs/evidence/staging-health-smoke-goal11-sample3-20260616.json` |

## Script Safety Verification

| Date | Script | Command | Result |
| --- | --- | --- | --- |
| 2026-06-15 | `scripts/smoke_api.py` | `python3 vitaltrack-backend/scripts/smoke_api.py --target staging --output docs/evidence/staging-health-smoke-20260615.json` | Passed after network permission; no authenticated checks run |
| 2026-06-15 | `scripts/smoke_api.py` | `python3 vitaltrack-backend/scripts/smoke_api.py --target production --allow-production --output docs/evidence/production-health-smoke-20260615.json` | Passed after network permission; no authenticated checks run |
| 2026-06-15 | `scripts/cold_start_load_smoke.py` | `python3 vitaltrack-backend/scripts/cold_start_load_smoke.py --target staging --requests 12 --concurrency 3 --output docs/evidence/staging-cold-start-load-20260615.json` | Passed after network permission |
| 2026-06-15 | `scripts/restore_drill.py` | `python3 vitaltrack-backend/scripts/restore_drill.py --target-description "disposable restore-drill Neon branch" --dry-run --output docs/evidence/restore-drill-dry-run-20260615.json` | Dry run passed; commands redacted |
| 2026-06-15 | `scripts/restore_drill.py` | Local temp Postgres source DB to local temp disposable target DB with `--confirm-disposable-target` | Actual restore passed; evidence in `docs/evidence/restore-drill-local-disposable-20260615.json` |
| 2026-06-15 | Production smoke guard | `python3 vitaltrack-backend/scripts/smoke_api.py --target production` | Refused without `--allow-production` |
| 2026-06-15 | Restore confirmation guard | `python3 vitaltrack-backend/scripts/restore_drill.py --target-description "disposable restore-drill Neon branch"` | Refused without `--confirm-disposable-target` |
| 2026-06-16 | Restore target URL guard | Dry run with target DB `neondb` and disposable description | Refused because the target URL itself was not disposable-safe |
| 2026-06-16 | Restore marked target URL guard | Dry run with target DB `carekosh_restore_drill_target` | Passed with redacted commands |
| 2026-06-16 | Guarded actual restore drill | Local temp Postgres source DB to local temp disposable target DB after target URL guard was added | Actual restore passed; evidence in `docs/evidence/restore-drill-local-disposable-guarded-20260616.json` |
| 2026-06-16 | Goal 11 guarded actual restore drill | Local temp Postgres source DB to local temp disposable target DB after multi-host/deny-host/username-marker tests were in place | Actual restore passed; evidence in `docs/evidence/restore-drill-local-disposable-goal11-20260616.json` |
| 2026-06-16 | Restore query-parameter guard | Dry run with target `...@decoy-scratch.example.com/scratchdb?host=ep-prod-real&dbname=neondb` | Refused (exit 2): effective `dbname=neondb` is protected and effective host carries no disposable marker — the libpq query-parameter bypass is closed |
| 2026-06-16 | Security tests | `tests/test_security.py` plus email diagnostic log-redaction test against temporary local Postgres on Python 3.11 | Covered in full-suite rerun; `tests/test_security.py::TestRestoreDrillGuards` now includes the query-parameter override cases (`?host=`, `?dbname=neondb`, `?hostaddr=`, `?service=`, multi-host `?host=`, redact surfacing, and a legitimate `?sslmode=require`-only target) |
| 2026-06-15 | New Python scripts | `python3 -m py_compile ...` | Passed |
| 2026-06-15 | New Python scripts | `uvx --from ruff==0.8.4 ruff check ...` | Passed |
| 2026-06-16 | Backend whitespace gate | `git diff --check` | Passed |
| 2026-06-16 | Backend lint gate | `uvx --from ruff==0.8.4 ruff check vitaltrack-backend/app/ vitaltrack-backend/tests/ vitaltrack-backend/scripts/` | Passed |
| 2026-06-16 | Backend test and coverage gate | Python 3.11 temporary dependency env against disposable local Postgres; `python -m pytest tests/ -q --cov=app --cov-report=term-missing --cov-report=json` from `vitaltrack-backend` | 123 passed; total coverage 85% |
| 2026-06-16 | API route-count gate | `python scripts/check_api_routes.py --expected 39` from `vitaltrack-backend` | Passed; 39 `/api/v1` route objects |
| 2026-06-16 | Per-file coverage gate | `python scripts/check_file_coverage.py coverage.json --threshold 70 --file app/api/v1/items.py --file app/api/v1/orders.py` from `vitaltrack-backend` | Passed; `items.py` 90.85%, `orders.py` 87.43% |
| 2026-06-16 | Mobile lint | `npm run lint` from `vitaltrack-mobile` | Passed with 0 errors and 5 existing warnings |
| 2026-06-16 | Mobile TypeScript | `npx tsc --noEmit` from `vitaltrack-mobile` | Passed |
| 2026-06-16 | Mobile release config check | Evaluated `app.config.js` for preview and production profiles | Preview and production both returned `usesCleartextTraffic=false` |
| 2026-06-16 | Secrets/PII scan | Targeted scans across docs, backend, mobile, and `.github` | No live key pattern found; tracked local dev sender/provider identifiers were replaced with environment placeholders; remaining high-signal matches were false positives in words/package names |
| 2026-06-16 | Production read-only smoke | `python3 vitaltrack-backend/scripts/smoke_api.py --target production --allow-production --timeout 90 --output docs/evidence/production-health-smoke-goal11-20260616.json` | Passed; only `GET /live` and `GET /health` were run |
| 2026-06-16 | Staging warm read-only smoke | `python3 vitaltrack-backend/scripts/smoke_api.py --target staging --output docs/evidence/staging-health-smoke-goal11-warm-20260616.json` | Passed; only `GET /live` and `GET /health` were run |
| 2026-06-16 | Staging cold-start/load smoke | `python3 vitaltrack-backend/scripts/cold_start_load_smoke.py --target staging --requests 12 --concurrency 3 --output docs/evidence/staging-cold-start-load-goal11-20260616.json` | Mixed: first `/live` timed out at 90 seconds, first `/health` passed, and all 12 warm probes passed |
| 2026-06-16 | Staging read-only smoke rerun | `python3 vitaltrack-backend/scripts/smoke_api.py --target staging --timeout 90 --output docs/evidence/staging-health-smoke-goal11-rerun-20260616.json` | Passed; only `GET /live` and `GET /health` were run |
| 2026-06-16 | Staging cold-start/load smoke rerun | `python3 vitaltrack-backend/scripts/cold_start_load_smoke.py --target staging --requests 12 --concurrency 3 --output docs/evidence/staging-cold-start-load-goal11-rerun-20260616.json` | Passed; first `/live` 264 ms, first `/health` 431 ms, all 12 warm probes passed |
| 2026-06-16 | Production read-only smoke rerun | `python3 vitaltrack-backend/scripts/smoke_api.py --target production --allow-production --timeout 90 --output docs/evidence/production-health-smoke-goal11-rerun-20260616.json` | Failed transiently; `/live` timed out and `/health` returned 503 `database=unavailable` |
| 2026-06-16 | Production read-only smoke recovery rerun | `python3 vitaltrack-backend/scripts/smoke_api.py --target production --allow-production --timeout 90 --output docs/evidence/production-health-smoke-goal11-rerun2-20260616.json` | Passed immediately after the transient failure; only `GET /live` and `GET /health` were run |
| 2026-06-16 | Production read-only samples 3 and 4 | `python3 vitaltrack-backend/scripts/smoke_api.py --target production --allow-production --timeout 90 --output docs/evidence/production-health-smoke-goal11-sample{3,4}-20260616.json` | Both passed; only `GET /live` and `GET /health` were run |
| 2026-06-16 | Staging read-only sample 3 | `python3 vitaltrack-backend/scripts/smoke_api.py --target staging --timeout 90 --output docs/evidence/staging-health-smoke-goal11-sample3-20260616.json` | Passed; only `GET /live` and `GET /health` were run |

## Restore Drill Evidence

Status: actual `pg_dump`/`pg_restore` drill passed against a temporary local
Postgres source database and a temporary local disposable target database. The
target was named `carekosh_restore_disposable_target`, the restore evidence was
written with redacted URLs, and the temporary cluster was stopped after the
check. The drill was repeated on 2026-06-16 after the target URL guard was
added, then repeated again for Goal 11 with the current multi-host,
deny-host, username-marker, and redaction tests in place.

Post-restore verification:

- `alembic_version.version_num` returned `goal10_guarded_restore_drill` in the
  guarded 2026-06-16 drill.
- `carekosh_restore_probe` row count returned `1`.
- `carekosh_restore_probe.label` returned `source row after guard`, proving the
  disposable target's pre-restore row was overwritten by the source backup.
- Goal 11 drill evidence:
  `docs/evidence/restore-drill-local-disposable-goal11-20260616.json`.
- Goal 11 post-restore verification returned
  `alembic_version.version_num=goal11_restore_drill`,
  `carekosh_restore_probe` row count `1`, and probe label
  `source row goal11`, proving the disposable target's pre-restore row was
  overwritten by the source backup.

Disposable Neon branch/project credentials are still required before a real Neon
branch drill can be executed. Do not use production or long-lived staging as the
restore target.

Required evidence after the drill:

- Disposable target name contained `disposable`.
- Source and target database URLs were redacted in all notes.
- `pg_dump` custom archive created successfully.
- `pg_restore` completed successfully against the disposable target.
- `alembic_version` and expected probe table were verified.
- Row count sanity checks were recorded without user data.
- Disposable target was removed when the temporary Postgres cluster stopped.

## Monitor Configuration Evidence

Status: monitor template added at
`docs/monitoring/carekosh-uptime-monitors.example.yml`.

Before launch, record:

- Monitor provider.
- Production `/live` monitor link or screenshot.
- Production `/health` monitor link or screenshot.
- Alert destination.
- Alert recipient.
- Test alert result.

## Scope Gate Evidence

Scope status: clean for Goal 10/11 launch-readiness work, with one intentional
non-runtime dev-config redaction.

Changed areas:

- Goal 10/11 docs, monitor template, and redacted evidence under `docs/`.
- Standalone ops scripts under `vitaltrack-backend/scripts/`.
- Restore-drill and email/auth log-redaction tests under `vitaltrack-backend/tests/`.
- Email/auth diagnostic log redaction in `vitaltrack-backend/app/api/v1/auth.py`
  and `vitaltrack-backend/app/utils/email.py`.
- Local development Docker Compose email placeholders in
  `vitaltrack-backend/docker-compose.dev.yml`; this is not Render runtime
  config and is only a tracked local-dev PII/provider-identifier cleanup.

Out-of-scope surfaces checked:

- No schema or Alembic migration files changed.
- No inventory/order behavior files changed.
- No mobile UI files changed.
- No EAS target files changed.
- No Render runtime config changed; `vitaltrack-backend/render.yaml` still uses
  `healthCheckPath: /live`.
- Search for `restore_drill`, `smoke_api`, and `cold_start_load_smoke` across
  backend runtime code, Dockerfiles, Render config, CI, and mobile found no
  runtime imports or invocations.

## CORS Decision

Current launch decision: keep the existing Render blueprint value
`CORS_ORIGINS='["*"]'` for this Goal 10/11 branch. The FastAPI app treats a
wildcard origin as allow-all with credentials disabled, which matches mobile
token-in-header usage and avoids changing web-origin policy during launch
readiness. Tightening CORS to explicit origins remains a later production
hardening decision, not part of this branch.

## Mobile And Play Evidence

Verified locally:

- `npm run lint` passed with 0 errors and 5 existing warnings.
- `npx tsc --noEmit` passed.
- Preview profile target is staging:
  `https://vitaltrack-api-staging.onrender.com`.
- Production profile target is production:
  `https://vitaltrack-api.onrender.com`.
- Evaluating `app.config.js` for preview and production returned
  `usesCleartextTraffic=false`.
- `vitaltrack-mobile/app.json` sets `android.allowBackup=false` and
  `android.versionCode=1`.
- `vitaltrack-mobile/eas.json` uses APK for preview and Android App Bundle for
  production.

External evidence not faked:

- No new preview APK artifact/device smoke was produced in this Goal 11 run.
  The preview smoke checklist remains in
  `docs/PLAY_STORE_RELEASE_HARDENING_GOAL_9.md`.
- No new production AAB or Play Console upload was produced in this Goal 11 run.
- Play App Signing, privacy policy hosting, Data Safety submission, app access
  reviewer credentials, internal testing, and closed testing remain operator /
  Play Console tasks. The docs record current status instead of claiming
  completion.

## Open Launch Gates Not Claimed Complete

- Real preview APK/device staging smoke is still required after an actual
  preview APK artifact is available.
- A production AAB and Play Console upload were not created in this Goal 11 run.
- Play App Signing, hosted privacy policy, Data Safety submission, reviewer app
  access notes with real smoke credentials, internal testing, and closed testing
  need Play Console/operator evidence before launch.
- The 2026-06-16 staging cold-start run initially failed the cold `/live`
  threshold, then a rerun passed. Treat this as hosting/cold-start variability
  to resolve or explicitly accept before treating launch readiness as fully
  green.
- A 2026-06-16 production read-only rerun transiently timed out on `/live` and
  returned `/health` 503 `database=unavailable`, then three follow-up production
  read-only samples passed. Treat this as hosting/provider variability to watch
  with real monitors before launch.

## Load And Cold-Start Evidence

Status: staging cold-start/load smoke completed on 2026-06-15 and repeated for
Goal 11 on 2026-06-16. The first Goal 11 run was mixed: the first `/live`
request timed out at 90 seconds, the first `/health` request passed, and all 12
warm probes passed. A follow-up Goal 11 rerun passed all cold and warm checks.
Treat the earlier cold `/live` timeout as hosting/cold-start variability to
watch with monitors before launch.

2026-06-15 staging result:

- First `/live`: 200 in 166 ms.
- First `/health`: 200 in 545 ms.
- Warm run: 12 requests, concurrency 3, all 200.
- Warm `/live` p95: 1152 ms.
- Warm `/health` p95: 286 ms.
- Evidence: `docs/evidence/staging-cold-start-load-20260615.json`.

2026-06-16 Goal 11 staging result:

- First `/live`: timed out at 90 seconds.
- First `/health`: 200 in 1129 ms.
- Warm run: 12 requests, concurrency 3, all 200.
- Warm `/live` p95: 2292 ms.
- Warm `/health` p95: 296 ms.
- Evidence: `docs/evidence/staging-cold-start-load-goal11-20260616.json`.

2026-06-16 Goal 11 staging rerun:

- First `/live`: 200 in 264 ms.
- First `/health`: 200 in 431 ms.
- Warm run: 12 requests, concurrency 3, all 200.
- Warm `/live` p95: 2283 ms.
- Warm `/health` p95: 1300 ms.
- Evidence: `docs/evidence/staging-cold-start-load-goal11-rerun-20260616.json`.

Expected early-user thresholds:

- Cold `/live` first response: 75 seconds or less.
- Warm `/live` p95: 5 seconds or less.
- Warm `/health` p95: 10 seconds or less.
- Unexpected warm 5xx responses: zero.

## Runtime Behavior Changes

No product behavior, schema, migration, auth semantics, inventory/order flow,
mobile UI, EAS target, or Render runtime config changes were made for Goal 10/11.

Intentional runtime-observable hardening:

- Backend email/auth diagnostic logs no longer include recipient email
  addresses, raw Brevo/provider bodies, API keys, raw exception strings, or
  provider error text. User-facing responses stay generic.

Non-runtime cleanup:

- Local development Docker Compose email values now come from environment
  placeholders instead of tracked local sender/provider identifiers.

## Launch-Gate Fix Follow-Up

Resolved on 2026-06-16:

- `vitaltrack-backend/scripts/restore_drill.py` now validates the target URL
  itself, not only the human target description. It rejects long-lived/default
  target database names such as `neondb` and requires a strong disposable marker
  in the target host or database name; username markers are ignored.
- `vitaltrack-backend/scripts/restore_drill.py` now also closes a libpq
  query-parameter bypass: `?host=`, `?hostaddr=`, `?port=`, `?dbname=`, and
  `?service=` override the netloc/path connection target, so a decoy host with a
  disposable marker could previously smuggle a real prod host + `dbname=neondb`
  past the guard. The disposable-safety checks now run against the *effective*
  host(s)/database (query overrides netloc/path), `?hostaddr=`/`?service=`
  targets are rejected outright, and `redact_url` surfaces the query string
  (credentials masked) so a smuggled override cannot be hidden from evidence.
- `vitaltrack-backend/app/utils/email.py` no longer logs recipient email
  addresses or raw Brevo response bodies on send attempts/failures.

## Commit Approval Packet

Status: ready for human review and commit approval, but not committed.

Suggested commit message:

```text
Harden Goal 10 restore and email logging safeguards; finalize launch verification
```

Commit candidate includes:

- `CAREKOSH_ROADMAP.md`
- `docs/EXPO_AND_PLAY_STORE_GUIDE.md`
- `docs/LAUNCH_READINESS_RUNBOOK_GOAL_10.md`
- `docs/LAUNCH_READINESS_EVIDENCE_GOAL_10.md`
- `docs/evidence/*.json`
- `docs/monitoring/carekosh-uptime-monitors.example.yml`
- `vitaltrack-backend/app/api/v1/auth.py`
- `vitaltrack-backend/app/utils/email.py`
- `vitaltrack-backend/docker-compose.dev.yml`
- `vitaltrack-backend/scripts/cold_start_load_smoke.py`
- `vitaltrack-backend/scripts/restore_drill.py`
- `vitaltrack-backend/scripts/smoke_api.py`
- `vitaltrack-backend/tests/test_auth.py`
- `vitaltrack-backend/tests/test_security.py`

Do not commit until the reviewer accepts:

- The production transient `/live` timeout and `/health` 503 followed by three
  passing read-only samples.
- The local-only disposable restore drill evidence instead of a real Neon
  disposable project drill.
- The explicit deferral of Play Console/operator-only artifacts listed under
  "Open Launch Gates Not Claimed Complete."

Pre-commit checks to rerun if review takes more than a day:

```bash
git diff --check
uvx --from ruff==0.8.4 ruff check vitaltrack-backend/app/ vitaltrack-backend/tests/ vitaltrack-backend/scripts/
cd vitaltrack-backend && python -m pytest tests/ -q --cov=app --cov-report=term-missing --cov-report=json
cd vitaltrack-backend && python scripts/check_api_routes.py --expected 39
cd vitaltrack-backend && python scripts/check_file_coverage.py coverage.json --threshold 70 --file app/api/v1/items.py --file app/api/v1/orders.py
cd vitaltrack-mobile && npm run lint
cd vitaltrack-mobile && npx tsc --noEmit
```
