# CareKosh — Environment Split (Staging vs Production)

> **Companion to `CAREKOSH_ENVIRONMENT_ARCHITECTURE.html`** at the repo root. This markdown version goes deeper on the operational side: Neon console walkthroughs, Render env var matrix, verification commands, and troubleshooting.
>
> **Last updated:** 2026-04-19
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

Staging and production run as **independent pipelines**. Each has:

- Its own Render Web Service
- Its own Neon database (on the same Neon project)
- Its own `SECRET_KEY` (so JWTs from one environment cannot authenticate on the other)
- Its own `CORS_ORIGINS`, `FRONTEND_URL`, and email config

The mobile preview APK hits staging; the Play Store AAB hits production. Test data cannot pollute production; untested migrations can't destroy real user data.

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
│                           ├──▶  vitaltrack-api.onrender.com         │
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

### After (split — safe)

```
┌─────────────────────────────────────────────────────────────────────┐
│                       AFTER (Split Environments)                    │
│                                                                     │
│  Preview APK (testers)                                              │
│       │                                                             │
│       ▼                                                             │
│  vitaltrack-api-staging.onrender.com                                │
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
│  vitaltrack-api.onrender.com                                        │
│  (ENVIRONMENT=production)                                           │
│       │                                                             │
│       ▼                                                             │
│  Neon DB: neondb                      ← Real data lives here        │
│                                                                     │
│  Complete isolation between test and production data.               │
└─────────────────────────────────────────────────────────────────────┘
```

### Development (local)

```
┌─────────────────────────────────────────────────────────────────────┐
│                       DEVELOPMENT (Local)                           │
│                                                                     │
│  Expo Go (developer's phone)                                        │
│       │                                                             │
│       ▼                                                             │
│  localhost:8000 (Docker container)                                  │
│  (ENVIRONMENT=development)                                          │
│       │                                                             │
│       ▼                                                             │
│  Local Docker PostgreSQL 16                                         │
│  (no SSL — the connection never leaves your machine)                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Environment Matrix

| Environment | Backend URL | Database | Mobile build | SSL | Email verify | `ENVIRONMENT` |
|---|---|---|---|---|---|---|
| Development | `localhost:8000` (Docker) | Local Postgres 16 (Docker) | Expo Go | OFF | OFF | `development` |
| Testing (CI) | GitHub Actions runner | Postgres 16 service container | N/A | OFF | N/A | `testing` |
| Staging | `vitaltrack-api-staging.onrender.com` | Neon: `vitaltrack_staging` | Preview APK | ON | OFF (by default) | `staging` |
| Production | `vitaltrack-api.onrender.com` | Neon: `neondb` | Production AAB | ON | ON | `production` |

Both `staging` and `production` live on Neon in Singapore and use TLS. Both Render services watch `main` and auto-deploy on push.

---

## 4. How It Works — Technical Flow

### 4.1 `pydantic-settings` and `config.py`

The backend reads all configuration from environment variables — no hardcoded secrets, no per-env config files. Simplified:

```python
# vitaltrack-backend/app/core/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "CareKosh API"
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/carekosh"
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    REQUIRE_EMAIL_VERIFICATION: bool = False
    MAIL_FROM: str = "noreply@carekosh.com"
    # … plus production validators added in PR #12
```

At startup, `pydantic-settings` reads every field from the process environment. The same image runs in every environment — only the env vars differ.

### 4.2 `eas.json` build-time configuration

`EXPO_PUBLIC_API_URL` is **baked into the JS bundle at compile time**. You cannot change it at runtime — a new build is required.

```json
{
  "development": { "env": { "EXPO_PUBLIC_API_URL": "http://localhost:8000" } },
  "preview":     { "env": { "EXPO_PUBLIC_API_URL": "https://vitaltrack-api-staging.onrender.com" } },
  "production":  { "env": { "EXPO_PUBLIC_API_URL": "https://vitaltrack-api.onrender.com" } }
}
```

Consequences:
- Preview APK → always staging
- Production AAB → always production
- Impossible to accidentally mix them after build

### 4.3 `docker-entrypoint.sh` auto-migration

```bash
# vitaltrack-backend/docker-entrypoint.sh (simplified)
# 1. Parse DATABASE_URL → extract host + port
# 2. pg_isready loop (30× retries)
# 3. alembic upgrade head
# 4. exec gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app
```

When the staging service first boots with `DATABASE_URL` pointed at `vitaltrack_staging`, Alembic sees an empty DB and runs every migration from scratch, creating all tables automatically. No manual SQL required.

> **Known quirk.** If `DATABASE_URL` resolves late, `pg_isready` spends its first ~30 attempts polling `localhost:5432` before the real Neon URL takes over. Cosmetic; the container still comes up healthy. Don't alarm on it.

### 4.4 Twelve-Factor compliance

Per [12factor.net](https://12factor.net/): *"Same codebase, same image runs everywhere. Only environment variables change."*

CareKosh follows the pattern:
- Identical Docker image deployed to both environments
- Only env vars differ
- Adding a new environment (QA, demo, etc.) requires zero code changes — just a new Render service with appropriate env vars

### 4.5 SSL toggle pattern

```python
# Before — allowlist (fragile)
_connect_args = {"ssl": True} if settings.ENVIRONMENT == "production" else {}

# After — denylist (safe default)
_connect_args = {"ssl": True} if settings.ENVIRONMENT not in ("development", "testing") else {}
```

**Why the change matters:**
- **Allowlist:** only `production` gets SSL. Any new environment (e.g., `staging`) accidentally connects without SSL — credentials travel plain-text over the internet.
- **Denylist:** SSL is on by default. Only explicitly local environments (`development`, `testing`) skip it. A future `qa` or `demo` environment gets SSL automatically.

Same toggle is applied in `app/core/database.py` and `alembic/env.py`.

### 4.6 JWT and `SECRET_KEY`

`SECRET_KEY` signs and verifies the HS256 JWT. Think of it as a stamp:

1. **Login** — backend creates a JWT and stamps it with `SECRET_KEY`.
2. **Request** — backend decodes the JWT and verifies the stamp matches.
3. **Cross-environment protection** — staging and production have **different** `SECRET_KEY`s. A token from staging cannot authenticate on production.

```
staging SECRET_KEY   ≠   production SECRET_KEY
       │                        │
       └─ signs staging JWT     └─ signs production JWT
           (rejected on prod)       (rejected on staging)
```

Store it only in the Render dashboard env vars. Never commit it. Never type it in code.

### 4.7 Why Neon requires SSL

Neon runs in the public cloud and you access it over the public internet. Without SSL:
- Password travels in plain text
- Query data (emails, inventory) is visible to anyone on the path
- MITM can inject or modify queries

Local Docker PostgreSQL doesn't need SSL because the connection goes from app container to DB container on the same host — never leaves `localhost`.

---

## 5. What Changed in the Code

### Files changed in PR #2

#### `vitaltrack-mobile/eas.json` — preview URL → staging

```diff
 "preview": {
   "env": {
-    "EXPO_PUBLIC_API_URL": "https://vitaltrack-api.onrender.com"
+    "EXPO_PUBLIC_API_URL": "https://vitaltrack-api-staging.onrender.com"
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
 "start:prod": "cross-env EXPO_PUBLIC_API_URL=https://vitaltrack-api.onrender.com expo start --clear",
+"start:staging": "cross-env EXPO_PUBLIC_API_URL=https://vitaltrack-api-staging.onrender.com expo start --clear",
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
| Mobile `app/`, `components/`, etc. | Reads `EXPO_PUBLIC_API_URL` at runtime |

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

### 6.2 Render — create staging service

1. New **Web Service** named `vitaltrack-api-staging`.
2. Connect to the same GitHub repo, same `main` branch.
3. Same Dockerfile, same default build/start commands (entrypoint does the work).
4. Set env vars (see table below).

#### Render env vars — staging

| Variable | Value | Notes |
|---|---|---|
| `ENVIRONMENT` | `staging` | Triggers SSL on Neon; not prod guardrails |
| `DATABASE_URL` | `postgresql+asyncpg://...@.../vitaltrack_staging` | DB name is `vitaltrack_staging`, NOT `neondb` |
| `SECRET_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(32))"` output | **Must differ from production** |
| `CORS_ORIGINS` | `["*"]` | Wildcard is fine for a mobile-only API (no browser CORS concerns) |
| `REQUIRE_EMAIL_VERIFICATION` | `false` | Allows testers to register without email verification |
| `MAIL_USERNAME` | Brevo SMTP user | Optional in staging if email flows aren't being tested |
| `MAIL_PASSWORD` | Brevo API key | |
| `MAIL_FROM` | `noreply@carekosh.com` | |
| `MAIL_SERVER` | `smtp-relay.brevo.com` | |
| `MAIL_PORT` | `587` | |
| `MAIL_STARTTLS` | `true` | |
| `MAIL_SSL_TLS` | `false` | |
| `FRONTEND_URL` | `https://vitaltrack-api-staging.onrender.com/api/v1/auth` | Used in email link templates |

#### Render env vars — production

Same set. Differences:

| Variable | Production value |
|---|---|
| `ENVIRONMENT` | `production` |
| `DATABASE_URL` | `postgresql+asyncpg://...@.../neondb` |
| `SECRET_KEY` | A **different** 32+ char random value (not starting with `CHANGE-THIS`) |
| `CORS_ORIGINS` | `["https://carekosh.com","https://app.carekosh.com"]` — PR #12 validator rejects `"*"` in prod |
| `REQUIRE_EMAIL_VERIFICATION` | `true` |
| `FRONTEND_URL` | `https://vitaltrack-api.onrender.com/api/v1/auth` — PR #12 validator requires non-empty in prod |

### 6.3 Expo/EAS — no dashboard changes needed

EAS Build reads the `env` block from `eas.json` in the repo at build time. No action in the Expo dashboard.

---

## 7. Verification Commands

### Health checks

```bash
# Staging
curl -s https://vitaltrack-api-staging.onrender.com/health | python -m json.tool
# Expected:
# {
#   "status": "healthy",
#   "environment": "staging",
#   "database": "connected"
# }

# Production
curl -s https://vitaltrack-api.onrender.com/health | python -m json.tool
# Expected:
# {
#   "status": "healthy",
#   "environment": "production",
#   "database": "connected"
# }
```

### Registration smoke test (staging only)

```bash
curl -s -X POST https://vitaltrack-api-staging.onrender.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "TestPass123!",
    "name": "Test User"
  }' | python -m json.tool
```

### Isolation proof

After registering a test user on staging, confirm it does NOT exist on production:

```bash
curl -s -X POST https://vitaltrack-api.onrender.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "testuser@example.com",
    "password": "TestPass123!"
  }'
# Expected: 401 — user doesn't exist on production
```

---

## 8. Troubleshooting

### `"database": "disconnected"` in `/health`

- Check Render → service → Environment Variables → `DATABASE_URL`.
- Verify the DB name matches (`vitaltrack_staging` for staging, `neondb` for production).
- Verify the Neon project is not suspended due to inactivity.
- Verify the password in the connection string matches Neon's current one (rotating the Neon password requires updating Render).

### Wrong `environment` value in `/health`

- `ENVIRONMENT` is misspelled or missing. Must be exactly `staging` or `production` (lowercase, no quotes, no spaces).
- Trigger a manual deploy after fixing.

### A staging JWT authenticates on production

**Should never happen.** If it does:
- Both environments have the same `SECRET_KEY`.
- Fix: generate a new unique key for staging, set it in Render, redeploy. All existing staging tokens are invalidated.

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Preview APK is hitting production

- The APK was built before the `eas.json` change, or
- A dev server override (`EXPO_PUBLIC_API_URL` in `.env`) is in play during LAN/tunnel testing.

Fix: rebuild with the current `eas.json`:

```bash
cd vitaltrack-mobile
npx eas build --profile preview --platform android
```

Remember: `EXPO_PUBLIC_API_URL` is compile-time. An old APK will forever hit the URL it was built with.

### Alembic migration fails on staging

- Render → staging service → Logs — look for the Alembic error.
- Migration bug: fix locally, push, redeploy.
- Connection bug: see "disconnected" above.
- Manual apply if needed:
  ```bash
  DATABASE_URL="<staging-url>" ENVIRONMENT=staging alembic upgrade head
  ```

### Staging is "up" but all auth returns 401

Likely `SECRET_KEY` was rotated — all existing tokens are now invalid. Expected; users log in again.

---

## 9. FAQ

### Will production data be lost by this split?

No. PR #2 did not touch the production DB. The SSL toggle was already `True` for production (`== "production"` → `not in ("development", "testing")` — production is in neither, so SSL stays on).

### Does this cost anything?

**$0 additional.** Neon free tier allows multiple databases on one project. Render free tier allows multiple web services. Both staging services reuse free quota.

### Do I need to run Alembic manually on staging?

No. `docker-entrypoint.sh` runs `alembic upgrade head` on every deploy. When staging first started with the new `DATABASE_URL`, Alembic applied every migration against the empty `vitaltrack_staging` DB automatically.

### Is the staging database empty?

Yes. It starts empty. You or testers register accounts and populate test data. By design — staging should not contain production data copies.

### What about cold starts?

Render free-tier services sleep after ~15 minutes idle. The first request after sleep takes 30–60 seconds while the container boots + runs migrations + starts gunicorn. Subsequent requests are fast. Staging and production sleep independently.

A keep-alive monitor (UptimeRobot or similar) pointed at `/health` on a 5-minute interval keeps the services warm.

### Do I need Expo dashboard changes?

No. EAS Build reads `eas.json` from the repo. Nothing to change in the Expo dashboard.

### Is `CORS_ORIGINS=["*"]` safe for staging?

Yes. CORS is a browser security feature. React Native / native mobile apps do not enforce CORS — they make direct HTTP requests. The wildcard has zero security impact on a mobile-only API.

For **production**, PR #12 rejects `"*"` at startup. The rationale is defence in depth — if anyone ever points a browser-based admin tool at the production API, CORS must be restricted. Staging is explicitly not production and doesn't need the same guardrail.

### How do I add a fourth environment (QA, demo, etc.)?

Zero code changes needed. Create a new Neon DB, a new Render service, set its env vars (ENVIRONMENT, DATABASE_URL, SECRET_KEY, MAIL_*), done. The SSL toggle (§4.5) will pick it up automatically. If you want a mobile build pointing at it, add a new profile to `eas.json`.

---

*Last updated: 2026-04-19.*
