# CareKosh Goal 10 Launch Readiness Runbook

Last updated: 2026-06-16

Scope: production operations and Play launch readiness only. This runbook does
not change database schema, API behavior, auth semantics, inventory/order flows,
mobile UI, EAS API targets, or backend runtime behavior.

## Checkout And Merge Facts

- Historical implementation branch: `ops/launch-readiness-runbook`.
- Original Goal 10 base: PR #46 merge commit `30e3ad2`, also `main` and
  `origin/main` after remote refresh on 2026-06-15.
- Current merged state as of 2026-06-16: PR #47 merged `0b19763`; `main` and
  `origin/main` are at merge commit `1f73699`.
- Render blueprint already sets `healthCheckPath: /live`.
- Backend liveness endpoint: `GET /live`, process-only, no database probe.
- Backend readiness endpoint: `GET /health`, runs a database `SELECT 1` probe
  with a 2 second timeout and returns `503` when the DB probe fails.
- Preview APK target remains `https://vitaltrack-api-staging.onrender.com`.
- Production AAB target remains `https://vitaltrack-api.onrender.com`.
- Production AAB automation is still disabled in `.github/workflows/ci.yml`
  with `if: false`; production AABs are manual until the Play track is ready.

## Official References Checked

- Neon backup overview: https://neon.com/docs/manage/backups
- Neon restore window: https://neon.com/docs/introduction/restore-window
- Neon instant restore: https://neon.com/docs/introduction/branch-restore
- Neon pg_dump backup: https://neon.com/docs/manage/backup-pg-dump
- Google Play testing requirements: https://support.google.com/googleplay/android-developer/answer/14151465
- Google Play internal/closed testing setup: https://support.google.com/googleplay/android-developer/answer/9845334
- Android App Bundles: https://developer.android.com/guide/app-bundle
- Google Play target API requirements: https://developer.android.com/google/play/requirements/target-sdk
- Render health checks: https://render.com/docs/health-checks
- Render free instance behavior: https://render.com/docs/free
- Render uptime practices: https://render.com/docs/uptime-best-practices
- Render notifications: https://render.com/docs/notifications
- Render log streams: https://render.com/docs/log-streams
- Render rollbacks: https://render.com/docs/rollbacks

## Backup And Restore Runbook

### Ownership

- Primary owner: `rishabhrd09`.
- Backup owner: assign before launch.
- Evidence owner: the person performing each drill updates
  `docs/LAUNCH_READINESS_EVIDENCE_GOAL_10.md`.

### Recovery Targets

| Path | RPO | RTO | Use When |
| --- | --- | --- | --- |
| Neon instant restore / PITR | Within configured restore window | Target 30 minutes for operator decision plus restore | Recent destructive write, bad deploy, accidental data loss |
| `pg_dump -Fc` archive | Up to 24 hours once nightly backups are active | Target 2 hours | Neon project/branch disaster, restore to separate project, compliance archive |

### Neon PITR Policy

- Configure the Neon restore window to at least 7 days before real launch when
  the project is on a plan that supports it.
- If still on the Neon Free plan, record the Free plan limitation explicitly:
  the restore window is 6 hours and capped by Neon history limits. Do not claim
  7 day PITR until the plan actually supports it.
- Use Neon Time Travel Assist or equivalent read-only historical query tooling
  to identify the restore point before restoring.
- Never run an instant restore against production until the incident owner has
  approved the exact timestamp, branch, and user impact.

Critical Neon restore behavior:

- Instant restore is an overwrite, not a merge.
- Current data and schema on the target branch are replaced by the selected
  point in time.
- All databases on the selected Neon branch are restored, not only one database.
- Existing connections to the selected branch are interrupted temporarily.
- Neon creates an automatic backup branch for the pre-restore state, but that is
  a safety net, not a reason to skip approval.

### pg_dump Backup Policy

- Format: custom archive via `pg_dump -Fc --no-owner --no-acl`.
- Schedule:
  - Nightly after public launch.
  - Manual backup before any risky production data operation.
  - Manual backup before a Play launch day backend release.
- Storage location: private encrypted object storage bucket or equivalent
  operator-controlled secure storage named `carekosh-prod-postgres-backups`.
  Do not store dumps in GitHub, EAS, Render logs, local Downloads, or chat.
- Retention:
  - Daily dumps: 14 days.
  - Weekly dumps: 8 weeks.
  - Monthly launch snapshots: 6 months for the first production release window.
- Access:
  - Primary owner and backup owner only.
  - Credentials live in the password manager, not in repo files or shell history.
- Filename pattern:
  `carekosh-prod-postgres-YYYYMMDD-HHMMSSZ.dump`.
- Evidence:
  - Record dump timestamp, source branch/database, target disposable branch, row
    count sanity checks, and restore command exit status.
  - Never paste database URLs, tokens, dump file contents, user emails, or raw
    provider responses into evidence.

### Disposable Restore Drill

Run this drill only against a disposable Neon project or disposable Neon branch.
Do not run it against production. Do not run it against long-lived staging unless
the staging owner explicitly confirms the branch can be overwritten.

The script's target-URL guard is a guardrail against mistakes, not a boundary
against a determined operator. A deliberate operator can still craft a URL that
restores onto a protected database. The guard exists to catch a fat-fingered
paste of a production URL, not to make the tool safe to point anywhere. Operator
judgment, not the guard, is the real boundary.

**Do not point this tool at any real Neon target (production or staging).** The
disposable-safety checks validate the *effective* connection target, including
libpq query parameters (see below), but they remain a mistake-catcher, not a
hard boundary. Use a disposable project, disposable branch (renamed off
`neondb`), or a local throwaway Postgres only.

Connection-string query parameters are validated, not ignored. libpq honors
`?host=`, `?hostaddr=`, `?port=`, `?dbname=`, and `?service=` in the URL and
lets them **override** the host/port/database parsed from the netloc/path, so a
guard that read only the netloc/path could be bypassed by smuggling the real
target into the query (e.g. a decoy `...@scratch.example.com/scratchdb` with a
hidden `?host=ep-prod-real&dbname=neondb`). The script now:
- computes the *effective* host(s) and database (query parameter overrides the
  netloc/path) and runs the disposable-marker, protected-database/word, and
  multi-host checks against those effective values, so a `?host=` or
  `?dbname=neondb` override is what gets validated — not the decoy surface;
- rejects any target carrying `?hostaddr=` or `?service=`, which name a target
  (a raw IP / an opaque external service file) the policy cannot reason about;
- surfaces the query string in the redacted evidence/command log (masking only
  credential parameters such as `password`), so a smuggled `?host=`/`?dbname=`
  cannot be hidden from the audit trail.

1. Create a disposable Neon **project** with a visible name containing
   `restore-drill` or `disposable`. Prefer a disposable project (or local
   throwaway Postgres) over a Neon branch: a default Neon branch keeps the
   database name `neondb`, which the script always rejects, so a plain branch
   cannot be used as the target without renaming its database.
2. Create or choose a disposable target database/host whose connection URL
   carries a strong marker such as `disposable`, `restore-drill`,
   `restore_drill`, or `scratch` **in the host or database name** — a marker in
   the username alone is no longer accepted. The script refuses:
   - unmarked long-lived database names such as `neondb`, `vitaltrack`, or names
     containing `prod`, `production`, `staging`, `main`, or `live`;
   - hosts containing those environment words or any fragment listed in
     `CAREKOSH_RESTORE_DENY_HOSTS` (see below);
   - multi-host / libpq failover URLs (a comma in the host list, or a
     comma-separated `?host=`/`?port=` list), because a disposable-looking decoy
     host can otherwise hide the real production host;
   - URLs whose `?host=`/`?dbname=` query parameters override the netloc/path
     onto a protected host or database (the checks run against the effective
     target), or that carry `?hostaddr=`/`?service=` at all. Point the URL host
     and database directly at the disposable target; only non-targeting query
     parameters such as `?sslmode=require` are accepted.
3. Set `CAREKOSH_RESTORE_DENY_HOSTS` to your real long-lived endpoint host
   fragments (comma-separated), e.g. the production and staging Neon endpoint
   host IDs like `ep-prod-xxxxxxxx`. The built-in denylist cannot know your
   deployment's actual Neon endpoint, so this env var is what blocks a raw
   production-host paste whose endpoint contains no obvious environment word.
4. Confirm no app service points at the disposable target.
5. Export a direct connection string for the source database and a direct
   connection string for the disposable target.
6. Run a dry run first:

   ```bash
   cd vitaltrack-backend
   CAREKOSH_PGDUMP_SOURCE_URL="$SOURCE_DATABASE_URL" \
   CAREKOSH_RESTORE_TARGET_URL="$DISPOSABLE_TARGET_DATABASE_URL" \
   CAREKOSH_RESTORE_DENY_HOSTS="$PROD_AND_STAGING_NEON_HOST_FRAGMENTS" \
   python scripts/restore_drill.py \
     --target-description "disposable restore-drill Neon project" \
     --dry-run
   ```

7. Run the actual drill only after the dry run prints the expected redacted
   commands:

   ```bash
   cd vitaltrack-backend
   CAREKOSH_PGDUMP_SOURCE_URL="$SOURCE_DATABASE_URL" \
   CAREKOSH_RESTORE_TARGET_URL="$DISPOSABLE_TARGET_DATABASE_URL" \
   CAREKOSH_RESTORE_DENY_HOSTS="$PROD_AND_STAGING_NEON_HOST_FRAGMENTS" \
   python scripts/restore_drill.py \
     --target-description "disposable restore-drill Neon project" \
     --confirm-disposable-target \
     --output ../docs/evidence/restore-drill-YYYYMMDD.json
   ```

8. Verify the restored target manually:
   - `alembic_version` exists.
   - Expected application tables exist.
   - Row counts are plausible for the selected source.
   - No production app service is connected to the disposable target.
9. Delete the disposable branch/project after evidence is recorded, unless it is
    being kept briefly for incident review.

## Launch Checklist

### Backend Deploy

- Confirm branch is clean: `git status --short --branch`.
- Confirm `HEAD`, `main`, and `origin/main` alignment when starting from main:
  `git rev-parse HEAD main origin/main`.
- Confirm CI backend tests, frontend typecheck/lint, and required PR checks pass.
- Confirm no migration or schema change is included in this Goal 10 branch.
- Confirm `vitaltrack-backend/render.yaml` still uses `healthCheckPath: /live`.
- Confirm required Render env vars exist for production and staging:
  `DATABASE_URL`, `SECRET_KEY`, `ENVIRONMENT`, `CORS_ORIGINS`,
  `REQUIRE_EMAIL_VERIFICATION`, `MAIL_PASSWORD`, `MAIL_FROM`, `FRONTEND_URL`.
- Confirm GitHub secrets:
  `RENDER_DEPLOY_HOOK` if using deploy hook backup, `EXPO_TOKEN` for EAS builds.
- After merge, watch GitHub Actions and Render Events until deploy is live.
- Run post-deploy checks from this runbook before inviting testers.

### Mobile Preview APK

- Add the `build-apk` PR label only when a real device preview APK is needed.
- Confirm preview APK was built with profile `preview`.
- Confirm preview APK target is staging:
  `https://vitaltrack-api-staging.onrender.com`.
- Install on a real Android device.
- Smoke:
  - App launches.
  - Login works with staging smoke account.
  - Inventory list loads.
  - Cold-start UI is acceptable if Render is waking.
  - Logout clears user-visible session state.
- Do not use production user accounts in preview APK.

### Production AAB And Play Internal Testing

- Build production AAB manually until CI production build is intentionally
  re-enabled:

  ```bash
  cd vitaltrack-mobile
  eas build --profile production --platform android
  ```

- Confirm production AAB target is production:
  `https://vitaltrack-api.onrender.com`.
- Confirm Android App Bundle upload is used for Play release.
- Confirm version code increments.
- Confirm Play App Signing is configured.
- Confirm Google Play app access instructions include smoke credentials and
  free-tier cold-start notes.
- Confirm Data Safety answers match `docs/PLAY_STORE_RELEASE_HARDENING_GOAL_9.md`.
- For a newly created personal developer account, complete the required closed
  testing path before production access: at least 12 opted-in testers for 14
  continuous days, then apply for production access in Play Console.
- Use internal testing for trusted smoke first, then closed testing for the
  required tester window if the account is subject to it.

### Smoke Account

- Create one staging smoke account for automated and preview APK checks.
- Create one production smoke account only when production smoke is ready.
- Store smoke credentials in the password manager or local environment only:
  `CAREKOSH_SMOKE_IDENTIFIER` and `CAREKOSH_SMOKE_PASSWORD`.
- Do not commit smoke credentials.
- The smoke account may contain a small, fake inventory set such as one category
  and one item. Never use real patient, caregiver, supplier, or phone data.
- Rotate the smoke password after sharing with Play reviewers or external
  testers.

### Rollback Decision

Rollback backend if:

- `/live` fails for more than 2 consecutive external checks after deploy.
- `/health` fails and Neon status or Render logs indicate deploy-caused DB
  readiness failure.
- Login fails for the smoke account due to server errors.
- Inventory list fails for the smoke account due to server errors.
- Error rate, user reports, or Render logs show a launch-blocking regression.

Do not rollback backend for:

- A known Render free-tier cold start that recovers within the expected window.
- A single smoke account credential mistake.
- Play Console review delay or tester opt-in delay.

Mobile bad release decision:

- There is no true Play Store rollback equivalent for installed users.
- Halt or pause the rollout in Play Console when possible.
- Build and upload a fixed AAB with a higher version code.
- Keep backend compatibility with the bad mobile version if users may already
  have it installed.

### Post-Deploy Verification

- `GET /live` production returns `200` with `database: "not_checked"`.
- `GET /health` production returns `200` with `database: "connected"`.
- Render Events show latest deploy live.
- Render Logs show no repeated startup exception, DB readiness failure, or raw
  secret leakage.
- Neon dashboard shows no unusual connection or compute errors.
- Brevo dashboard shows no unexpected auth or bounce spike.
- Smoke script evidence is saved without tokens, passwords, DB URLs, or emails.
- Play Console internal testers can install the expected version.

## Monitoring Plan

Use `docs/monitoring/carekosh-uptime-monitors.example.yml` as the monitor
template. Translate it into UptimeRobot, Better Stack, or another lightweight
monitoring service.

Minimum monitors:

- Production `/live`: every 5 minutes, timeout 15 seconds, alert after 2
  consecutive failures. This is process liveness and can also keep a Render free
  service warm.
- Production `/health`: every 5 minutes, timeout 15 seconds, alert after 2
  consecutive failures. This checks database readiness.
- Staging `/live` and `/health`: every 10 minutes during active launch work,
  timeout 15 seconds, alert after 2 consecutive failures.
- Synthetic login plus inventory list:
  - Default to staging.
  - Run after deploys and before Play submission.
  - Production run is manual or explicitly scheduled with a dedicated smoke
    account; it creates login/session/activity traces by design.
- Register and order-apply:
  - Staging synthetic only, or tightly controlled manual production smoke using
    the smoke account.
  - Do not run broad production register/order-apply synthetics; they create
    junk users, orders, activity rows, and inventory changes.

Render free-tier expectation:

- Free web services spin down after 15 minutes without inbound traffic.
- First request after spin-down can take about 1 minute while the service spins
  back up.
- Treat a one-off slow first request as cold-start behavior if the next checks
  pass. Treat repeated failures or long warm latency as an incident.
- Free instances are not ideal for production workloads; if real users depend on
  the app, consider a paid instance or accept the launch risk explicitly.

## Smoke Scripts

Read-only health smoke:

```bash
cd vitaltrack-backend
python scripts/smoke_api.py --target staging --output ../docs/evidence/staging-smoke.json
```

Authenticated staging smoke:

```bash
cd vitaltrack-backend
CAREKOSH_SMOKE_IDENTIFIER="smoke@example.com" \
CAREKOSH_SMOKE_PASSWORD="use-password-manager" \
python scripts/smoke_api.py \
  --target staging \
  --include-authenticated \
  --output ../docs/evidence/staging-auth-smoke.json
```

Production authenticated smoke requires explicit production approval:

```bash
cd vitaltrack-backend
CAREKOSH_SMOKE_IDENTIFIER="prod-smoke@example.com" \
CAREKOSH_SMOKE_PASSWORD="use-password-manager" \
python scripts/smoke_api.py \
  --target production \
  --allow-production \
  --include-authenticated \
  --output ../docs/evidence/production-auth-smoke.json
```

Small cold-start/load smoke:

```bash
cd vitaltrack-backend
python scripts/cold_start_load_smoke.py \
  --target staging \
  --requests 12 \
  --concurrency 3 \
  --output ../docs/evidence/staging-cold-start-load.json
```

Expected thresholds for early launch:

- Cold first request to `/live`: pass if it completes within 75 seconds.
- Warm `/live` p95: pass if under 5 seconds.
- Warm `/health` p95: pass if under 10 seconds.
- Error rate: zero unexpected 5xx responses after warm-up.
- This is not an enterprise benchmark. It is a small early-user confidence check.

## Logs, Secrets, Redaction, And Retention

Never log or retain:

- Passwords, password reset tokens, email verification tokens, JWT access tokens,
  JWT refresh tokens, SecureStore values, `SECRET_KEY`, `MAIL_PASSWORD`,
  `DATABASE_URL`, Render deploy hooks, Expo tokens, Play service account keys,
  Neon API keys, Brevo API keys, or raw authorization headers.

Redact or avoid logging:

- Email addresses, usernames, phone numbers, supplier names, contact details,
  free-text inventory/order fields, image/file paths that reveal user content,
  raw API error bodies from providers, full DB URLs, provider account IDs, and
  request payloads.

Allowed operational logging:

- Endpoint names, status codes, latency buckets, environment, app version, deploy
  ID, sanitized error class, request ID or `CF-Ray`, and count summaries.

Retention policy:

- Render dashboard logs: use for short-term incident triage only.
- External log stream, when configured: retain 14 days for app logs by default.
- Incident notes: retain 90 days, with sensitive values redacted.
- Backup evidence: retain for the backup retention period, without secrets.
- Play review communications: retain as long as the release remains active.

Launch-gate review:

- Runtime Brevo email logs are redacted: the backend logs status/type level
  delivery diagnostics without recipient email addresses, raw provider response
  bodies, API keys, or email token content.

Log surfaces to inventory during launch:

- Render: service logs, Events, Metrics, deploy notifications, log streams.
- Neon: project activity, branches, backups/PITR, query/performance dashboard,
  connection errors.
- Brevo: transactional email events, bounces, suppression list, API errors.
- GitHub: Actions logs, PR checks, environment protections, repository secrets.
- EAS: build logs, build artifacts, submit logs, credentials.
- Play Console: release status, pre-launch report, testing feedback, Android
  vitals, policy/app content warnings, user feedback.

## Incident And Rollback Runbook

### Contacts

| Role | Owner | Channel |
| --- | --- | --- |
| Incident commander | `rishabhrd09` | Fill before launch |
| Backend/operator backup | Fill before launch | Fill before launch |
| Play Console owner | `rishabhrd09` | Fill before launch |
| User support contact | Fill before launch | Fill before launch |

### Dashboards

- Render production service: `https://dashboard.render.com`
- Neon project: `https://console.neon.tech`
- Brevo: `https://app.brevo.com`
- GitHub Actions: repository Actions tab
- EAS builds: `https://expo.dev`
- Play Console: `https://play.google.com/console`
- Provider status:
  - Render: https://status.render.com
  - Neon: https://neonstatus.com
  - Expo: https://status.expo.dev
  - Google Play Console: https://status.play.google.com

### Required Environment And Secret Checklist

Render production/staging service env vars:

- `DATABASE_URL`: Neon connection string for the correct environment.
- `SECRET_KEY`: strong random JWT signing key, different per environment.
- `ENVIRONMENT`: `production` or `staging` as appropriate.
- `CORS_ORIGINS`: current allowed origins JSON/list.
- `REQUIRE_EMAIL_VERIFICATION`: `true` for launch environments.
- `MAIL_PASSWORD`: Brevo API key.
- `MAIL_FROM`: launch sender address.
- `FRONTEND_URL`: backend auth HTML base URL for email links.

GitHub Actions secrets:

- `RENDER_DEPLOY_HOOK`: optional Render deploy hook backup path.
- `EXPO_TOKEN`: required for EAS build jobs.

Local/operator-only launch secrets:

- Play service account JSON for `eas submit`, stored outside git.
- Smoke account credentials, stored in the password manager and supplied as
  `CAREKOSH_SMOKE_IDENTIFIER` / `CAREKOSH_SMOKE_PASSWORD` only when needed.
- Neon admin/API credentials, stored outside git and used only for branch/PITR
  operations.

### SECRET_KEY Rotation

User impact warning:

- Rotating `SECRET_KEY` invalidates existing JWTs and tokenized links.
- Users will be logged out as access/refresh tokens fail.
- Outstanding email verification, password reset, and account deletion tokens may
  fail depending on signing and storage path.
- Do not rotate during launch unless the key is suspected compromised or the
  old key is known weak.

Procedure:

1. Generate a new value locally:

   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

2. Update `SECRET_KEY` in the affected Render environment only.
3. Trigger a Render redeploy.
4. Verify `/live`, `/health`, smoke login, and inventory list.
5. Announce expected logout to testers/users if the production app is live.
6. Record rotation time and reason in the incident notes. Do not record the key.

### Backend Rollback

1. Confirm whether the issue is code, configuration, Neon, Brevo, or Render.
2. If code deploy is the likely cause, open Render service Events.
3. Select the last known-good successful deploy and use Rollback.
4. Remember Render dashboard rollback disables automatic deploys to prevent the
   bad commit from redeploying.
5. Verify `/live`, `/health`, smoke login, and inventory list.
6. Keep automatic deploys disabled until the bad commit is reverted or fixed.
7. Re-enable automatic deploys only after the fix lands and verification passes.

Data caution:

- Render rollback reuses a previous deploy artifact. It does not rollback Neon
  data. If a data mutation caused the incident, use the backup/restore runbook
  and get explicit approval before any production restore.

### Mobile Bad-Release Recovery

1. Pause staged rollout or halt promotion in Play Console if available.
2. Keep backend compatible with the bad version if installed users may exist.
3. Build a fixed AAB with a higher version code.
4. Upload to internal testing first.
5. Smoke on a real Android device.
6. Promote only after app access, Data Safety, login, inventory, and cold-start
   behavior are verified.
7. For an urgent severe issue, use Play Console release controls and support
   messaging; do not expect installed users to downgrade automatically.

## Evidence Checklist

Record evidence in `docs/LAUNCH_READINESS_EVIDENCE_GOAL_10.md`:

- Branch/base/clean status.
- `/live` and `/health` manual checks.
- Smoke script output paths.
- Cold-start/load smoke output paths.
- Restore drill output path or reason the drill is pending credentials.
- Monitor configuration screenshot/link or the copied monitor settings.
- Launch/rollback checklist owner confirmation.
