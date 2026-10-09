# CareKosh — Environment Split (Staging vs Production)

> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. Earlier dated test/release claims retain their original scope. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](VOICE_INVENTORY_AND_ORDER_DRAFTS.md).


> 8 October 2026 safety follow-up: targeted code fixes are local, tested changes after the earlier audit. Deployment and real-device acceptance remain separate. [Current changes and remaining scope](BACKEND_HARDENING.md#safety-follow-up-8-october-2026).

> **Status (re-checked 8 October 2026 against the working tree: `03cfebb` plus uncommitted documentation; first re-checked 7 October 2026):** Code facts re-checked against branch `feature/backend-hardening-ai-voice-agent-foundation` (`03cfebb`); `main` is `835fad3`. Most of this guide describes Render, Neon and Expo dashboard state, which was **not** re-checked and is NOT VERIFIED. Owner-reported on 7 Oct 2026 (not independently verified): the staging service was switched to the feature branch and deployed `b1c8dd7`. If so, the staging database is at migration `0010`, and migration `0007` cannot be downgraded. Earlier note (23 Sept 2026): head `0007`, 152 backend tests — now out of date (head `0010`; 242 backend and 121 mobile tests passed locally on 7 Oct, and again on 8 Oct against a disposable PostgreSQL 16 database). Current behaviour: [complete developer guide](CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md) · [API traceability](API_TRACEABILITY.md) · [documentation home](INDEX.html) · [backend hardening](BACKEND_HARDENING.md).

> **Companion to `CAREKOSH_ENVIRONMENT_ARCHITECTURE.html`** at the repo root. This markdown version goes deeper on the operational side: Neon console walkthroughs, Render env var matrix, verification commands, and troubleshooting.
>
> **First written:** 2026-04-19 (the status note above is newer)
> **Originating branch:** `feature/production_staging_database` (PR #2)

---

## Table of Contents

1. [Overview & Purpose](#1-overview--purpose)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Environment Matrix](#3-environment-matrix)
4. [How It Works — Technical Flow](#4-how-it-works--technical-flow)
5. [What Changed in the Code](#5-what-changed-in-the-code)
6. [Platform Configuration (Render + Neon)](#6-platform-configuration-render--neon)
7. [Verification Commands](#7-verification-commands)
8. [Troubleshooting](#8-troubleshooting)
9. [FAQ](#9-faq)

---

## 1. Overview & Purpose

### What the split is

Staging and production run as **independent pipelines**. As documented (live settings NOT VERIFIED), each has:

- Its own Render Web Service
- Its own Neon database (on the same Neon project)
- Its own `SECRET_KEY` (so JWTs from one environment cannot authenticate on the other)
- Its own `CORS_ORIGINS`, `FRONTEND_URL`, and email config

The current `preview` profile embeds the staging API URL; the `production` profile embeds the production URL, including when that AAB is submitted to Play's internal track. Play track names do not select the backend. Test data stays separate only when the services point at distinct databases; verify that configuration. Schema changes still need CI, staging smoke, backup/restore and a release gate. Migration `0007_session_order_safety` is one-way: returning to `main`'s pre-0007 image requires a compatible database restore, not an Alembic downgrade. Such a restore loses writes made after its recovery point.

### Why it mattered before Play Store submission

Pre-split, everything pointed at one database. Three risks:

| # | Risk | Scenario |
|---|------|----------|
| 1 | Google reviewer pollution | Play Store reviewers register fake accounts during review → junk rows in the same DB as real users |
| 2 | Beta tester data corruption | Internal testers exercising edge cases (delete all, create thousands of orders) → performance regressions affect real users |
| 3 | Untested migration damage | A migration with a bug (wrong column type, dropped table) destroys prod data with no way to test first |

The split addresses all three at the same time.

---

## 2. Architecture Diagram

### Before (single environment — dangerous)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BEFORE (Single Environment)                  │
│                                                                     │
│  Preview APK (testers)  ──┐                                         │
│                           ├──▶  api.carekosh.com                    │
│  Production AAB (users) ──┘     (ENVIRONMENT=production)            │
│                                          │                          │
│                                          ▼                          │
│                                    Neon: neondb                     │
│                                (test + real data mixed)             │
│                                                                     │
│  Test data and real data share the same rows.                       │
│  A broken migration takes prod down.                                │
└─────────────────────────────────────────────────────────────────────┘
```

### After (documented split; live configuration not verified)

```
┌─────────────────────────────────────────────────────────────────────┐
│                       AFTER (Split Environments)                    │
│                                                                     │
│  Preview APK (testers)                                              │
│       │                                                             │
│       ▼                                                             │
│  staging-api.carekosh.com                                           │
│  (ENVIRONMENT=staging)                                              │
│       │                                                             │
│       ▼                                                             │
│  Neon DB: vitaltrack_staging          ← Test data lives here        │
│                                                                     │
│  ───────────────────────────────────────────────────────────────── │
│                                                                     │
│  Production AAB (real users)                                        │
│       │                                                             │
│       ▼                                                             │
│  api.carekosh.com                                                   │
│  (ENVIRONMENT=production)                                           │
│       │                                                             │
│       ▼                                                             │
│  Neon DB: neondb                      ← Real data lives here        │
│                                                                     │
│  Separate rows; a shared Neon branch restore affects both DBs.       │
└─────────────────────────────────────────────────────────────────────┘
```

The isolation is by database name on one Neon branch (as documented): a Neon branch restore rewinds both databases, so confirm the layout before any restore.

### Development (local)

```
┌─────────────────────────────────────────────────────────────────────┐
│                       DEVELOPMENT (Local)                           │
│                                                                     │
│  Expo Go (developer's phone)                                        │
│       │                                                             │
│       ▼                                                             │
│  Laptop API:8000 (LAN, or localhost with adb reverse)                │
│  (ENVIRONMENT=development)                                          │
│       │                                                             │
│       ▼                                                             │
│  Local Docker PostgreSQL 16                                         │
│  (local Docker network; TLS is not explicitly required)             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Environment Matrix

| Environment | Backend URL | Database | Mobile build | SSL | Email verify | `ENVIRONMENT` |
|---|---|---|---|---|---|---|
| Development | Laptop API via LAN, or `localhost:8000` with ADB reverse | Local Postgres 16 (Docker) | Expo Go (voice needs a native build: the preview APK, which calls staging, or a development build once `expo-dev-client` is installed) | Not forced; driver default | OFF in effect (`docker-compose.dev.yml` sets `true`, but it is enforced only when `MAIL_PASSWORD` is set) | `development` |
| Testing (CI) | GitHub Actions runner | Postgres 16 service container | N/A | Not forced; driver default | N/A | `testing` |
| Staging | `staging-api.carekosh.com` | Neon: `vitaltrack_staging` | Preview APK | ON | ON for launch-like staging | `staging` |
| Production | `api.carekosh.com` | Neon: `neondb` | Production AAB | ON | ON | `production` |

Both hosted databases are documented as using Neon in Singapore; the live host and region are NOT VERIFIED. The code requires verified TLS whenever `ENVIRONMENT` is not `development` or `testing`. Earlier docs said both Render services watch `main`; staging is dashboard-managed outside `render.yaml`. Its historical root-directory filter is documented in `STAGING_DEPLOY_DIAGNOSIS.html`; its current settings are NOT VERIFIED. `render.yaml` names `main` for production. The owner reports switching staging to the feature branch on 7 Oct 2026. Live branches, database targets and auto-deploy settings still need dashboard confirmation.

---

## 4. How It Works — Technical Flow

### 4.1 `pydantic-settings` and `config.py`

The backend reads all configuration from environment variables — no hardcoded secrets, no per-env config files. Simplified:

```python
# vitaltrack-backend/app/core/config.py
from pydantic_settings import BaseSettings
from pydantic import SecretStr

class Settings(BaseSettings):
    APP_NAME: str = "CareKosh API"
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = "<local-database-url>"
    SECRET_KEY: SecretStr = SecretStr("CHANGE-THIS-IN-PRODUCTION-MIN-32-CHARS-LONG-RANDOM-STRING")
    REQUIRE_EMAIL_VERIFICATION: bool = False
    MAIL_FROM: str = "noreply@carekosh.com"
    # … plus validators added in PR #12 and later
```

(7 Oct 2026: the earlier snippet showed `SECRET_KEY: str = "dev-secret-key-change-in-production"`; the real default is the `SecretStr` placeholder above. It is accepted only for local development and tests: on the feature branch it is refused whenever `ENVIRONMENT` is not `development` or `testing`, on `main` only in production.)

At startup, `pydantic-settings` reads every field from the process environment, and also from a `.env` file in the working directory if one exists (environment variables win). The Docker images do not contain `.env` (`.dockerignore` excludes it). The same image runs in every environment — only the env vars differ.

### 4.2 `eas.json` build-time configuration

`EXPO_PUBLIC_API_URL` is **baked into the JS bundle at compile time**. You cannot change it at runtime — a new build is required.

```json
{
  "development": { "env": { "EXPO_PUBLIC_API_URL": "http://localhost:8000" } },
  "preview":     { "env": { "EXPO_PUBLIC_API_URL": "https://staging-api.carekosh.com" } },
  "production":  { "env": { "EXPO_PUBLIC_API_URL": "https://api.carekosh.com" } }
}
```

Consequences:
- With the current profiles, preview embeds the staging URL and production embeds the production URL.
- The installed artifact keeps its embedded URL; a server deploy alone does not change it. This app disables OTA updates.
- `app.config.js` rejects a non-empty, incorrect URL for these profiles. An empty URL bypasses that guard and `services/api.ts` falls back to localhost (known configuration defect).
- Android cleartext is enabled for the development profile, a localhost URL or the explicit `CAREKOSH_ALLOW_ANDROID_CLEARTEXT=true` override. Confirm the resolved build configuration before release.

### 4.3 `docker-entrypoint.sh` auto-migration

```bash
# vitaltrack-backend/docker-entrypoint.sh (simplified)
# 1. Parse DATABASE_URL → extract host + port
# 2. pg_isready loop (30× retries)
# 3. alembic upgrade head
# 4. exec "$@" (the Dockerfile CMD starts gunicorn)
```

For an empty target database, Alembic applies all revisions and creates the schema. For an existing target, it applies revisions after its recorded head. Changing `DATABASE_URL` neither copies existing rows nor guarantees that a populated legacy upgrade is safe.

> **Startup wait behavior (corrected 7 Oct 2026).** The entrypoint parses `DATABASE_URL` with `sed` before the `pg_isready` loop. The host pattern needs an explicit `:port` after the host. If the URL has no port — Neon's default connection strings usually omit it — the host falls back to `localhost` and the port to `5432`, `pg_isready` fails 30 times (about 60 s), and the script continues with a warning. `alembic upgrade head` then connects with the real `DATABASE_URL`, so the deploy still works, only slower. Earlier text said the fallback was not expected on normal deploys; that holds only when the URL includes a port. Whether the live Render URLs include one is NOT VERIFIED: look for `Extracted HOST:` in the deploy log.

### 4.4 Twelve-Factor compliance

The [Twelve-Factor App](https://12factor.net/config) (factor III, Config) recommends one codebase for every deploy, with the configuration that varies between deploys stored in environment variables rather than in code. (An earlier version of this guide put a sentence in quotation marks here that does not appear on 12factor.net.)

CareKosh supports the pattern:
- The same production Docker image can run in staging and production with different environment variables. Whether the live services use identical images is NOT VERIFIED.
- Another backend environment can normally reuse the application code, with its own service, database, secrets and deployment configuration.
- A mobile build for a new API URL also needs a build profile and any matching URL-guard changes; infrastructure configuration is separate from business logic.

### 4.5 SSL toggle pattern

```python
# Before — allowlist (fragile)
_connect_args = {"ssl": True} if settings.ENVIRONMENT == "production" else {}

# After — denylist (safe default)
_connect_args = {"ssl": True} if settings.ENVIRONMENT not in ("development", "testing") else {}
```

**Why the change matters:**
- **Earlier allowlist:** only `production` explicitly requires verified TLS. Other values leave TLS negotiation to asyncpg's default (`prefer`, or `PGSSLMODE` if set), so encryption and certificate verification are not guaranteed by this toggle.
- **Current toggle:** every value except `development` and `testing` passes `ssl=True`, requiring certificate and hostname verification. Local/testing omit the argument; they do not explicitly disable TLS.

Same toggle is applied in `app/core/database.py` and `alembic/env.py`.

### 4.6 JWT and `SECRET_KEY`

`SECRET_KEY` signs and verifies the HS256 JWT. Think of it as a stamp:

1. **Login** — backend creates a JWT and stamps it with `SECRET_KEY`.
2. **Request** — backend decodes the JWT and verifies the stamp matches.
3. **Cross-environment protection** — configure different keys for staging and production. A staging token then fails production signature validation. Whether the live keys differ is NOT VERIFIED; authentication also checks the user and, on the feature branch, `session_version`.

```
Recommended: staging SECRET_KEY ≠ production SECRET_KEY
       │                        │
       └─ signs staging JWT     └─ signs production JWT
           (rejected on prod)       (rejected on staging)
```

Store deployment secrets in the provider's secret configuration. For local testing use synthetic secrets, never production values. Never commit them.

### 4.7 Why Neon requires SSL

TLS encrypts query traffic and verified certificates authenticate the server. PostgreSQL's authentication method also matters: SCRAM exchanges a proof rather than sending a plaintext password, but it does not encrypt the subsequent queries. The application explicitly requires verified TLS for hosted environments.

Local Compose connects containers through a Docker network, not the host's localhost socket. Its PostgreSQL and pgAdmin ports are currently published on all host interfaces with development credentials. Use a trusted local environment and restrict those ports; the absence of a TLS requirement does not make that exposure safe.

---

## 5. What Changed in the Code

### Files changed in PR #2

#### `vitaltrack-mobile/eas.json` — preview URL → staging

```diff
 "preview": {
   "env": {
-    "EXPO_PUBLIC_API_URL": "https://api.carekosh.com"
+    "EXPO_PUBLIC_API_URL": "https://staging-api.carekosh.com"
   }
 }
```

#### `vitaltrack-backend/app/core/database.py` — SSL toggle

```diff
-# SSL required for Neon (production) but not for local Docker
-_connect_args = {"ssl": True} if settings.ENVIRONMENT == "production" else {}
+# SSL required for Neon (staging + production) but not for local Docker or CI
+_connect_args = {"ssl": True} if settings.ENVIRONMENT not in ("development", "testing") else {}
```

#### `vitaltrack-backend/alembic/env.py` — same toggle

(Identical change.)

#### `vitaltrack-mobile/package.json` — convenience script

```diff
 "start:prod": "cross-env EXPO_PUBLIC_API_URL=https://api.carekosh.com expo start --clear",
+"start:staging": "cross-env EXPO_PUBLIC_API_URL=https://staging-api.carekosh.com expo start --clear",
```

### Files deliberately NOT changed

| File | Why |
|------|-----|
| `app/core/config.py` | Already reads `ENVIRONMENT` from env — no hardcoded values |
| `Dockerfile` | Same image for all environments (12-Factor) |
| `docker-compose.yml` | Local development only |
| `docker-entrypoint.sh` | `alembic upgrade head` is generic |
| `app/models/*` | Schema is environment-agnostic |
| `app/schemas/*` | Payload shapes don't vary by env |
| `app/api/*` | Business logic is env-agnostic |
| `alembic/versions/*` | Migrations apply to whatever DB is configured |
| `.github/workflows/*` | CI already set `ENVIRONMENT=testing` |
| Mobile `app/`, `components/`, etc. | `services/api.ts` reads `EXPO_PUBLIC_API_URL`, whose value is inlined into the bundle at build time |

---

## 6. Platform Configuration (Render + Neon)

These steps were done manually via the web dashboards; documented here so they can be reproduced.

### 6.1 Neon — create staging database

1. Neon dashboard → SQL Editor (on the existing project).
2. Run:
   ```sql
   CREATE DATABASE vitaltrack_staging OWNER neondb_owner;
   ```
3. The new DB shares the same Neon project/branch, so the connection host is identical — only the database name in the connection string changes.

#### Neon dashboard reading guide

The Neon Console can look confusing because this project uses the existing Neon
root/default branch, which the Console labels `production`, while keeping two
separate Postgres databases inside that branch. This matches Neon's hierarchy:
a project contains branches, and each branch can contain multiple databases
([Neon object hierarchy](https://neon.com/docs/manage/overview),
[Neon databases](https://neon.com/docs/manage/databases)).

Read the dashboard in this order:

1. **Project:** `vitaltrack`.
2. **Branch:** `production`. This is the Neon branch/container label. It does
   not by itself mean you are looking at CareKosh production app data.
3. **Database dropdown:**
   - `vitaltrack_staging` = staging/test data. Use this when validating preview
     APK smoke-test users, inventory, categories, orders, and activity.
   - `neondb` = production data. Use this only for production checks.
4. **Render `DATABASE_URL`:** this is what the running backend actually uses.
   `vitaltrack-api-staging` must end in `/vitaltrack_staging`; `vitaltrack-api`
   must end in `/neondb`.

During preview APK validation, create a uniquely named staging test user or
item, then confirm it appears under `vitaltrack_staging` and does **not** appear
as a new row under `neondb`. Historical rows in `neondb` from older manual
production testing are not a staging-split failure. Do not wipe production rows
casually; clean them only before real production/internal Play testing, after a
backup/snapshot and after confirming they are disposable test records.

### 6.2 Render — create staging service

1. New **Web Service** named `vitaltrack-api-staging`.
2. Connect to the same GitHub repo, same `main` branch. (As set up in April 2026. On 7 Oct 2026 the owner reports switching staging to `feature/backend-hardening-ai-voice-agent-foundation`; NOT VERIFIED here.)
3. Same Dockerfile, same default build/start commands (entrypoint does the work).
4. Set env vars (see table below).

#### Render env vars — staging

| Variable | Value | Notes |
|---|---|---|
| `ENVIRONMENT` | `staging` | Triggers SSL on Neon; no HSTS header and no production-only `FRONTEND_URL` check. Feature branch: the `SECRET_KEY` placeholder is refused here too |
| `DATABASE_URL` | `postgresql+asyncpg://...@.../vitaltrack_staging` | DB name is `vitaltrack_staging`, NOT `neondb`. Use Neon's direct host, not a `-pooler` one: the app sends `statement_timeout` as a start-up parameter, which the pooler rejects. URL-encode reserved password characters normally; the local A-27 fix handles percent signs in Alembic configuration |
| `SECRET_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(32))"` output | **Must differ from production** |
| `CORS_ORIGINS` | `["*"]` | Wildcard is fine for a mobile-only API (no browser CORS concerns) |
| `REQUIRE_EMAIL_VERIFICATION` | `true` | Matches launch-like staging; use local development if testers need no-email registration |
| `MAIL_USERNAME` | legacy SMTP username | Unused by current Brevo HTTP API send path |
| `MAIL_PASSWORD` | Brevo HTTP API key | Required for launch-like staging email verification/reset/deletion flows |
| `MAIL_FROM` | `noreply@carekosh.com` | |
| `MAIL_SERVER` | legacy SMTP-era key | Current send path uses Brevo HTTP API over 443 |
| `MAIL_PORT` | legacy SMTP-era key | Current send path uses Brevo HTTP API over 443 |
| `MAIL_STARTTLS` | legacy SMTP-era key | Current send path uses Brevo HTTP API over 443 |
| `MAIL_SSL_TLS` | `false` | |
| `FRONTEND_URL` | `https://staging-api.carekosh.com/api/v1/auth` | Used in email link templates |
| `AI_*`, `GROQ_API_KEY` (feature branch) | unset = off | Only if the voice assistant's optional Groq text understanding is being piloted on staging; see [VOICE_AGENT_SETUP.md](VOICE_AGENT_SETUP.md). Live values NOT VERIFIED |

These values describe the intended configuration (April–June 2026 docs). The live staging environment was not re-checked on 7 or 8 Oct 2026.

#### Render env vars — production

Same set. Differences:

| Variable | Production value |
|---|---|
| `ENVIRONMENT` | `production` |
| `DATABASE_URL` | `postgresql+asyncpg://...@.../neondb` |
| `SECRET_KEY` | A **different** 32+ char random value (not starting with `CHANGE-THIS`); `render.yaml` asks Render to generate it (`generateValue: true`) |
| `CORS_ORIGINS` | currently `["*"]` per `render.yaml`. **No validator rejects `"*"` in production today** because no real browser/admin origins are configured yet. Tighten only after those origins are known. |
| `REQUIRE_EMAIL_VERIFICATION` | `true` |
| `FRONTEND_URL` | `https://api.carekosh.com/api/v1/auth` — PR #12 validator requires non-empty in prod |

### 6.3 Expo/EAS — no dashboard changes needed

For the API URLs in the current profiles, EAS Build reads the `env` block from `eas.json`. Account access, signing credentials and any other EAS environment values still need to be configured; this section does not verify those dashboard settings.

### 6.4 Backend platform migration checklist

Render is the current backend host, but the backend is not locked to Render.
The Docker image, entrypoint, Alembic migrations, and pydantic env config are
portable to any host that can run a Python Docker container and reach Postgres.

#### Current public API domains

Use the custom domains for mobile builds, smoke tests, and monitoring:

| Environment | Public URL |
|---|---|
| Staging | `https://staging-api.carekosh.com` |
| Production | `https://api.carekosh.com` |

With stable domains, moving from Render to another host is mostly DNS plus
provider env-var/deploy-secret changes. Avoid provider hostnames in mobile
builds: if the public API URL changes, every APK/AAB must be rebuilt because
`EXPO_PUBLIC_API_URL` is baked into the bundle.

#### Migration steps

1. Pick the host.
   Render paid is the smallest change. Fly.io, Railway, DigitalOcean App
   Platform, Hetzner, AWS Lightsail, or another VPS/managed Docker host are all
   viable. A MacBook or home server can work for demos, but should not be the
   Play Store production backend because uptime, public TLS, IP stability,
   power, OS patching, and monitoring become fragile.
2. Recreate the runtime env vars on the new host:
   `DATABASE_URL`, `SECRET_KEY`, `ENVIRONMENT`, `CORS_ORIGINS`,
   `REQUIRE_EMAIL_VERIFICATION`, `MAIL_PASSWORD`, `MAIL_FROM`,
   `FRONTEND_URL`, plus `SENTRY_DSN` and any `AI_*` / `GROQ_API_KEY`
   settings that are in use. Set `PORT` if the host expects a port other
   than 8000 (the entrypoint binds Gunicorn to `0.0.0.0:${PORT:-8000}`).
3. Build/run `vitaltrack-backend/Dockerfile`; keep
   `vitaltrack-backend/docker-entrypoint.sh` as the startup path so DB wait and
   `alembic upgrade head` still run before Gunicorn/Uvicorn.
4. Replace Render-specific deployment wiring:
   - `vitaltrack-backend/render.yaml` becomes historical or is replaced by the
     new provider's config.
   - `.github/workflows/ci.yml` `deploy-backend` stops using
     `RENDER_DEPLOY_HOOK` and uses the new host's deploy mechanism.
5. Update mobile URL wiring if the public hostnames change:
   - `vitaltrack-mobile/eas.json`: `preview.env.EXPO_PUBLIC_API_URL` and
     `production.env.EXPO_PUBLIC_API_URL`.
   - `vitaltrack-mobile/app.config.js`: `PREVIEW_API_URL` and
     `PRODUCTION_API_URL` guards.
   - `vitaltrack-mobile/package.json`: `start:staging` and `start:prod`
     convenience scripts.
   - `vitaltrack-mobile/services/api.ts` usually stays unchanged because it
     reads `EXPO_PUBLIC_API_URL`.
6. Rebuild affected mobile artifacts. Preview APK and production AAB keep the
   API URL they were built with.

#### GitHub secrets

Secrets referenced by the repository (live values and presence NOT VERIFIED):

| Secret | Keep/change |
|---|---|
| `EXPO_TOKEN` | Keep. EAS still needs it for preview/production builds. |
| `RENDER_DEPLOY_HOOK` | Replace if leaving Render. |

Examples for other hosts:

| Host style | Example secrets |
|---|---|
| VPS/self-managed Docker | `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` |
| Fly.io | `FLY_API_TOKEN` |
| Railway | `RAILWAY_TOKEN` |
| DigitalOcean | `DIGITALOCEAN_ACCESS_TOKEN` |

Never paste real secret values into docs, PRs, or evidence files.

#### Play launch timing

The current Render cold-start/server-call issue is technically an operations
choice, not a mobile product blocker in code. It can be fixed after Play
deployment. The safer recommendation is to fix it before Play review: reviewers
and first users may interpret 30-60 second login or inventory timeouts as a
broken app. Minimum before Play review is paid Render or another reliable
production uptime/keep-warm strategy with evidence; staging can stay on a
cheaper setup.

(7 Oct 2026) `render.yaml` now declares the production service on plan
`starter`, a paid always-on plan, with a comment that it removes free-tier
spin-down. Whether the live service matches, and which plan staging uses, is
NOT VERIFIED. Note also that ordinary app API calls have no client-side
timeout; only specific calls (token refresh, the startup profile check,
health probes, assistant calls) have one.

---

## 7. Verification Commands

### Health checks

```bash
# Staging
curl -s https://staging-api.carekosh.com/health | python -m json.tool
# Expected:
# {
#   "status": "healthy",
#   "version": "1.0.0",
#   "environment": "staging",
#   "database": "connected",
#   "timestamp": "2026-..."
# }

# Production
curl -s https://api.carekosh.com/health | python -m json.tool
# Expected:
# {
#   "status": "healthy",
#   "version": "1.0.0",
#   "environment": "production",
#   "database": "connected",
#   "timestamp": "2026-..."
# }

# /health is a readiness check: it actively runs a database probe and returns
# 503 with database="unavailable" when that probe fails. Render should use
# /live for process liveness so database outages do not trigger restart loops.
curl -s https://api.carekosh.com/live | python -m json.tool
```

`version` comes from the `APP_VERSION` setting (default `1.0.0`), so neither probe identifies the deployed commit. A successful authenticated `GET /api/v1/ai/capabilities` confirms that endpoint's response contract. An unauthenticated 401 only detects the AI middleware behavior: it also rejects unknown paths under `/api/v1/ai/`, so it does not prove that an endpoint exists. Use the deployment history for the exact commit and an operator's `alembic current` check for the schema revision.

### Registration smoke test (staging only)

`/register` is limited to 3 requests per hour (best-effort, in memory per worker), so repeated runs can return 429.

```bash
curl -s -X POST https://staging-api.carekosh.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "TestPass123!",
    "name": "Test User"
  }' | python -m json.tool
```

### Isolation check

First have the operator confirm that the two services' database URLs select different databases, without recording their passwords. Use a uniquely named, disposable staging test account. If database access is authorized, a read-only lookup can confirm its ID exists in staging and not in production. Do not use a production login attempt as proof: a 401 alone does not establish database isolation, and a successful login creates session/activity rows. A shared Neon branch restore can still rewind both databases even when their rows are separate.

---

## 8. Troubleshooting

### `/health` returns 503 or times out

`/health` actively probes the database. A `503` with `database="unavailable"`
means the app process is alive but the readiness probe failed. A timeout or
connection error can also come from the client's network, a cold start, a proxy or the process; it does not identify the cause on its own:

- Check Render → service → Environment Variables → `DATABASE_URL`.
- Verify the DB name matches (`vitaltrack_staging` for staging, `neondb` for production).
- Check the Neon branch state: computes scale to zero and wake automatically, but on the Free plan inactive branches can be archived.
- Verify the password in the connection string matches Neon's current one (rotating the Neon password requires updating Render).
- For DB-side detail beyond the readiness probe, use the Neon dashboard's monitoring panel.

### Wrong `environment` value in `/health`

- `ENVIRONMENT` is misspelled or missing. Must be exactly `staging` or `production` (lowercase, no quotes, no spaces).
- Trigger a manual deploy after fixing.

### A staging JWT authenticates on production

Investigate both the signing configuration and database target. Accepting the same signed token suggests matching keys, but authentication also needs a matching user and session generation. Do not assume a 401 proves separate databases. If keys are shared, configure a different staging key and redeploy; existing staging tokens will be invalidated.

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Preview APK is hitting production

- The APK was built before the `eas.json` change, or
- A dev server override (`EXPO_PUBLIC_API_URL` in `.env`) is in play during LAN/tunnel testing.

Fix: rebuild with the current `eas.json`:

```bash
cd vitaltrack-mobile
eas build --profile preview --platform android   # EAS CLI (eas-cli); or: npx eas-cli@latest build …
```

Never use `npx eas …`: the npm package `eas` is unrelated to Expo.

Remember: `EXPO_PUBLIC_API_URL` is compile-time. An old APK will forever hit the URL it was built with.

### Alembic migration fails on staging

- Render → staging service → Logs — look for the Alembic error.
- Migration bug: fix locally, push, redeploy.
- Connection bug: see "`/health` returns 503 or times out" above.
- Manual apply if needed:
  ```bash
  DATABASE_URL="<staging-url>" ENVIRONMENT=staging SECRET_KEY="<any 32+ char value that is not the CHANGE-THIS placeholder>" alembic upgrade head
  ```
  (7 Oct 2026) `alembic/env.py` loads the app settings, and on the feature branch the settings refuse the placeholder `SECRET_KEY` whenever `ENVIRONMENT=staging`, so the command needs a `SECRET_KEY` value. On the feature branch, migrations also take an advisory lock and a 30 s `lock_timeout`, so two concurrent runs wait for each other instead of colliding (`main` has no such lock).
- The manual command applies one-way migrations: run it only on a database you have decided to upgrade. Preserve the existing staging database; test candidates on an isolated database first.
- Before upgrading any shared database past `0006`: migration `0007` cannot be downgraded. Take a restorable backup first; see [BACKEND_HARDENING.md](BACKEND_HARDENING.md).
- `Can't locate revision 0010_order_local_id_unique` (or `0007`–`0009`) at startup means the database was upgraded by the feature branch and the service now runs older code such as `main`. The container exits because `alembic upgrade head` fails. Deploy the feature branch again, or restore the database from a backup taken before the upgrade.

### Staging is "up" but all auth returns 401

Likely `SECRET_KEY` was rotated — all existing tokens are now invalid. Expected; users log in again. (Feature branch: a password change or reset also bumps the user's `session_version`, which makes that user's existing tokens return 401.)

---

## 9. FAQ

### Will production data be lost by this split?

No. PR #2 did not touch the production DB. The SSL toggle was already `True` for production (`== "production"` → `not in ("development", "testing")` — production is in neither, so SSL stays on).

### Does this cost anything?

**$0 additional** (as of April 2026). Neon free tier allows multiple databases on one project. Render free tier allows multiple web services, but its 750 free instance hours per month are shared by the whole workspace. (7 Oct 2026: `render.yaml` now declares the production service on the paid `starter` plan; live plans and costs are NOT VERIFIED.)

### Do I need to run Alembic manually on staging?

No. `docker-entrypoint.sh` runs `alembic upgrade head` on every deploy. When staging first started with the new `DATABASE_URL`, Alembic applied every migration against the empty `vitaltrack_staging` DB automatically. If the migration fails, the container exits and the new deploy does not start. Remember that this also applies one-way migrations such as `0007` the moment a service deploys the branch that contains them.

### Is the staging database empty?

It started empty (April 2026); since then testers have registered accounts and test data, so preserve it rather than wiping it. By design, staging should not contain production data copies.

### What about cold starts?

Render free-tier services sleep after ~15 minutes idle. The first request after sleep takes 30–60 seconds while the container boots + runs migrations + starts gunicorn. Subsequent requests are fast. Staging and production sleep independently. (7 Oct 2026: this applies only to services on the free plan. `render.yaml` declares production on the paid `starter` plan; live plans are NOT VERIFIED.)

A keep-alive monitor (UptimeRobot or similar) can point at `/live` on a 5-minute interval to keep the service warm without coupling liveness to database readiness. On the free plan, 750 instance hours per workspace cover only about one always-on service a month; after that Render suspends free services until the month ends. Use `/health` when you specifically want database-backed readiness.

### Do I need Expo dashboard changes?

No. EAS Build reads `eas.json` from the repo. Nothing to change in the Expo dashboard.

### Is `CORS_ORIGINS=["*"]` safe for staging?

Native mobile requests do not enforce browser CORS. The wildcard still permits browser scripts from any origin to read responses allowed by the CORS policy; it is not authentication or authorization. The app sets `allow_credentials=False` with a wildcard. Assess browser clients separately, and keep ownership/authentication checks regardless of CORS.

An earlier draft of this doc said PR #12 "rejects `*` at startup in production" — that's not accurate. PR #12 added validators for `SECRET_KEY` (no placeholder) and `FRONTEND_URL` (must be set), but no CORS production-rejection. The actual production `render.yaml` ships `CORS_ORIGINS: '["*"]'`. Tightening is intentionally deferred until real browser/admin origins are known; native mobile requests are not governed by browser CORS.

### How do I add a fourth environment (QA, demo, etc.)?

The backend normally reuses the same application code with a separate service, database, secrets and deployment configuration. The TLS toggle (§4.5) requires verified TLS for a new environment value such as `qa`. A mobile build also needs an `eas.json` profile and matching build guards where applicable. Validate migrations and smoke tests before treating the new environment as ready.

---

*Original: 2026-04-19. Last reviewed: 2026-05-04 against PR #34.*

> **Re-audit notes (2026-05-04):**
> 1. The earlier "PR #12 rejects `*` in production" claim was incorrect — see corrections inline in §4.5 / §6.2 / §FAQ.
> 2. Superseded by Goal 6: `/health` now probes the database and returns `503` when readiness fails. `/live` is the process-only liveness endpoint for Render and keep-alive monitors.
> 3. Email transport is now Brevo's HTTP REST API over port 443, not SMTP/STARTTLS. The `MAIL_SERVER` / `MAIL_PORT` / `MAIL_STARTTLS` config keys still exist for legacy compatibility, but `app/utils/email.py` does not use them for sending.
> 4. The mobile app gained a cold-start UX layer (`MutationResultDialog`, `StatusPill`, `safeBack`, `mutationFeedback`, `react-native-toast-message`) on the audit/cold-start-mutation-ux branch merged 2026-05-04. None of that touches environment / DB / Render config; the env-split surface is unchanged.

> **Re-audit notes (2026-10-07, code at `03cfebb`; dashboards not re-checked):**
> 1. §4.1 snippet showed a wrong `SECRET_KEY` default; corrected to the `SecretStr` placeholder, with the feature-branch rule that refuses it outside development/testing (which also affects manual `alembic` runs with `ENVIRONMENT=staging`, §8).
> 2. §4.3 "localhost fallback is not expected on normal deploys" was only true for URLs with an explicit port; corrected (checked by running the entrypoint's `sed` patterns on sample URLs).
> 3. Added the one-way migration `0007` warnings, the owner-reported staging switch to the feature branch (7 Oct, not independently verified), the `render.yaml` `starter` plan, and the fact that `/health` cannot identify the deployed commit.
> 4. §8 "see 'disconnected' above" pointed to a section that no longer exists; now points to the `/health` 503 entry.

> **Re-audit notes (2026-10-08, working tree `03cfebb` plus uncommitted documentation; dashboards not re-checked):**
> 1. §4.4 quoted a sentence that does not appear on 12factor.net; replaced with a paraphrase of factor III.
> 2. §8 used `npx eas build`; the npm package `eas` is unrelated — use `eas` from eas-cli or `npx eas-cli@latest`.
> 3. Added: Neon pooled hosts reject the app's `statement_timeout` start-up parameter; a `%` in `DATABASE_URL` stops Alembic; one Neon branch restore rewinds both databases; Render's free hours are per workspace; Neon "project suspended" replaced by compute scale-to-zero and Free-plan branch archiving; staging is no longer empty and should be preserved.
> 4. Final follow-up: distinguish default TLS negotiation from explicitly verified TLS, Docker networking from localhost, intended settings from live evidence, the empty-URL guard gap, and an AI middleware 401 from proof that a route exists. Replaced the production-login isolation recipe with an operator-controlled read-only check.
