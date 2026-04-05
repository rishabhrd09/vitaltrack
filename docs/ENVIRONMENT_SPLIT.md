# VitalTrack — Environment Split Documentation

> **Last updated:** April 2, 2026
> **Branch:** `feature/production_staging_database`
> **Author:** VitalTrack team

---

## Table of Contents

1. [Overview & Purpose](#1-overview--purpose)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Environment Matrix](#3-environment-matrix)
4. [How It Works — Technical Flow](#4-how-it-works--technical-flow)
5. [What Changed (Code)](#5-what-changed-code)
6. [Platform Configuration (Manual Steps Done)](#6-platform-configuration-manual-steps-done)
7. [Verification Commands](#7-verification-commands)
8. [Troubleshooting](#8-troubleshooting)
9. [FAQ](#9-faq)

---

## 1. Overview & Purpose

### What is the environment split?

The environment split separates **staging** (testing) and **production** (real users) into completely independent pipelines. Each environment has its own:

- Backend API service (separate Render service)
- Database (separate Neon database)
- Secret key (tokens from one environment cannot work on the other)

This ensures that **test data never pollutes real user data** and that **untested changes never reach real users**.

### Why was this needed before Play Store submission?

Before submitting to Google Play, we need confidence that:

1. The production database contains only real user data
2. Beta testing and Google reviewer activity stays isolated
3. Database migrations can be tested safely before running on production

### Three risks of a single environment

| # | Risk | What could happen |
|---|------|-------------------|
| 1 | **Google reviewer pollution** | Google Play reviewers create test accounts and fake inventory data during review. With a single environment, this junk data pollutes the same database real users see. |
| 2 | **Beta tester data corruption** | Internal testers experimenting with edge cases (deleting all items, creating thousands of orders) could corrupt data or cause performance issues that affect real users. |
| 3 | **Untested migration damage** | A database migration with a bug (wrong column type, dropped table) would destroy production data with no way to test it first. With staging, migrations run there first — if they break, production is untouched. |

---

## 2. Architecture Diagram

### BEFORE: Single environment (dangerous)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BEFORE (Single Environment)                  │
│                                                                     │
│  Preview APK (testers)  ──┐                                         │
│                           ├──►  vitaltrack-api.onrender.com         │
│  Production AAB (users) ──┘    (ENVIRONMENT=production)             │
│                                        │                            │
│                                        ▼                            │
│                                   Neon: neondb                      │
│                              (all data mixed together)              │
│                                                                     │
│  ⚠ Test data + real data in the same database                       │
│  ⚠ Broken migration = production down                               │
└─────────────────────────────────────────────────────────────────────┘
```

### AFTER: Split environments (safe)

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
│  Neon: vitaltrack_staging          ← Test data lives here           │
│                                                                     │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│                                                                     │
│  Production AAB (real users)                                        │
│       │                                                             │
│       ▼                                                             │
│  vitaltrack-api.onrender.com                                        │
│  (ENVIRONMENT=production)                                           │
│       │                                                             │
│       ▼                                                             │
│  Neon: neondb                      ← Real user data lives here     │
│                                                                     │
│  ✅ Complete isolation between test and production data              │
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
│  localhost:8000 (Docker container)                                   │
│  (ENVIRONMENT=development)                                          │
│       │                                                             │
│       ▼                                                             │
│  Local Docker PostgreSQL                                            │
│  (no SSL needed — connection never leaves your machine)             │
│                                                                     │
│  ✅ Fast iteration, no cloud dependency                             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Environment Matrix

| Environment | Backend URL | Database | Mobile Build | SSL | Email Verify | ENV Value |
|---|---|---|---|---|---|---|
| Development | `localhost:8000` | Local Docker PostgreSQL | Expo Go | OFF | OFF | `development` |
| Testing (CI) | GitHub Actions runner | Temporary PostgreSQL | N/A | OFF | N/A | `testing` |
| Staging | `vitaltrack-api-staging.onrender.com` | Neon: `vitaltrack_staging` | Preview APK | ON | OFF | `staging` |
| Production | `vitaltrack-api.onrender.com` | Neon: `neondb` | Production AAB | ON | ON | `production` |

---

## 4. How It Works — Technical Flow

### 4.1 pydantic-settings and config.py

The backend reads **all configuration from environment variables** automatically. There is no hardcoded config file with database passwords or URLs. Here's a simplified view of how it works:

```python
# app/core/config.py (simplified)
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/vitaltrack"
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    REQUIRE_EMAIL_VERIFICATION: bool = False
    # ... other settings

    class Config:
        env_file = ".env"  # Optional: read from .env file locally

settings = Settings()
```

**How it works:** When the app starts, `pydantic-settings` automatically reads every field from the system environment variables. If `DATABASE_URL` is set in the environment, it overrides the default. This means the same code runs everywhere — only the environment variables change.

### 4.2 eas.json build-time configuration

In `eas.json`, each build profile (development, preview, production) can specify environment variables under the `"env"` key:

```json
"preview": {
  "env": {
    "EXPO_PUBLIC_API_URL": "https://vitaltrack-api-staging.onrender.com"
  }
}
```

**Critical concept:** `EXPO_PUBLIC_API_URL` is **baked into the APK at compile time**. When EAS Build creates the preview APK, it hardcodes this URL into the JavaScript bundle. The URL **cannot be changed at runtime** — you would need to create a new build.

This is why:
- Preview APK → always talks to staging backend
- Production AAB → always talks to production backend
- There is zero chance of mixing them up after the build

### 4.3 docker-entrypoint.sh auto-migration

The `docker-entrypoint.sh` script runs Alembic migrations automatically on every container start:

```bash
# Inside docker-entrypoint.sh (simplified)
alembic upgrade head   # Apply all pending migrations
uvicorn app.main:app   # Then start the server
```

**What this means for staging:** When the staging Render service starts (or restarts), it automatically runs `alembic upgrade head` against the `vitaltrack_staging` database. This creates all tables and applies all migrations — you don't need to manually run any SQL.

The first time the staging service started after DATABASE_URL was pointed at the new `vitaltrack_staging` database, Alembic saw an empty database and applied every migration from the beginning, creating all tables automatically.

### 4.4 12-Factor App principle

The [12-Factor App](https://12factor.net/) methodology states:

> **Same codebase, same Docker image runs everywhere. Only environment variables change.**

VitalTrack follows this principle:
- The **exact same Docker image** deployed to production is also deployed to staging
- The only difference is the environment variables (DATABASE_URL, SECRET_KEY, ENVIRONMENT, etc.)
- Adding a new environment (e.g., QA, demo) requires zero code changes — just set up a new Render service with appropriate env vars

### 4.5 SSL toggle pattern

```python
# OLD (allowlist — dangerous):
_connect_args = {"ssl": True} if settings.ENVIRONMENT == "production" else {}

# NEW (denylist — safe):
_connect_args = {"ssl": True} if settings.ENVIRONMENT not in ("development", "testing") else {}
```

**Why the change matters:**

- **Allowlist (`== "production"`):** Only production gets SSL. If you add a new environment like "staging", you must remember to update this line. Forgetting means staging connects without SSL — credentials travel unencrypted over the internet.
- **Denylist (`not in ("development", "testing")`):** SSL is ON by default for everything. Only explicitly local environments (development on your machine, testing in CI) skip it. If you add a "qa" or "demo" environment tomorrow, it automatically gets SSL with no code changes.

The denylist pattern is **safer by default** — new environments are protected automatically.

### 4.6 JWT and SECRET_KEY

The `SECRET_KEY` is used to **sign and verify JWT (JSON Web Token) authentication tokens**. Think of it as a stamp:

1. **Login:** When a user logs in, the backend creates a JWT token and "stamps" it with the SECRET_KEY
2. **API requests:** On every subsequent request, the user sends this token. The backend checks the stamp — if the SECRET_KEY matches, the token is valid
3. **Cross-environment protection:** Staging and production have **different** SECRET_KEYs. This means:
   - A token created on staging **cannot** authenticate on production (wrong stamp)
   - A token created on production **cannot** authenticate on staging (wrong stamp)
   - Even if someone intercepts a staging token, it's useless on production

**Where the key lives:**
- Set as an environment variable in Render dashboard → Environment Variables → `SECRET_KEY`
- Read automatically by `pydantic-settings` into `settings.SECRET_KEY`
- Used by the auth code (`app/core/auth.py`) to encode/decode JWTs
- You never type it in code — it only exists in the Render dashboard

### 4.7 Why Neon requires SSL

Neon databases are hosted in the cloud and accessed **over the public internet**. Without SSL:

- Your database password travels in plain text across the internet
- Query data (user emails, inventory records) is visible to anyone monitoring the network
- A man-in-the-middle could intercept and modify queries

**Local Docker PostgreSQL doesn't need SSL** because the connection goes from your app container to the database container on the same machine — the data never leaves `localhost`. There is no network to eavesdrop on.

---

## 5. What Changed (Code)

### Files changed

#### 1. `vitaltrack-mobile/eas.json` — Preview URL → staging

```diff
 "preview": {
   "env": {
-    "EXPO_PUBLIC_API_URL": "https://vitaltrack-api.onrender.com"
+    "EXPO_PUBLIC_API_URL": "https://vitaltrack-api-staging.onrender.com"
   }
 }
```

The production profile remains unchanged at `https://vitaltrack-api.onrender.com`.

#### 2. `vitaltrack-backend/app/core/database.py` — SSL toggle fix

```diff
-# SSL is required for Neon (production) but not for local Docker PostgreSQL
-_connect_args = {"ssl": True} if settings.ENVIRONMENT == "production" else {}
+# SSL required for Neon (staging + production) but not for local Docker or CI
+_connect_args = {"ssl": True} if settings.ENVIRONMENT not in ("development", "testing") else {}
```

#### 3. `vitaltrack-backend/alembic/env.py` — Same SSL toggle fix

```diff
-    # SSL is required for Neon (production) but not for local Docker PostgreSQL
-    _connect_args = {"ssl": True} if settings.ENVIRONMENT == "production" else {}
+    # SSL required for Neon (staging + production) but not for local Docker or CI
+    _connect_args = {"ssl": True} if settings.ENVIRONMENT not in ("development", "testing") else {}
```

#### 4. `vitaltrack-mobile/package.json` — Added `start:staging` convenience script

```diff
 "start:prod": "cross-env EXPO_PUBLIC_API_URL=https://vitaltrack-api.onrender.com expo start --clear",
+"start:staging": "cross-env EXPO_PUBLIC_API_URL=https://vitaltrack-api-staging.onrender.com expo start --clear",
```

### Files NOT changed (and why)

| File | Why no changes needed |
|------|----------------------|
| `app/core/config.py` | Already reads `ENVIRONMENT` from env vars — no hardcoded values |
| `Dockerfile` | Same image for all environments (12-Factor) |
| `docker-compose.yml` | Only used for local development — unaffected |
| `docker-entrypoint.sh` | Already runs `alembic upgrade head` generically — works for any database |
| All models (`app/models/`) | Database schema is environment-agnostic |
| All schemas (`app/schemas/`) | Request/response shapes don't change per environment |
| All API routes (`app/api/`) | Business logic is environment-agnostic |
| Migration files (`alembic/versions/`) | Migrations are applied to whatever database is configured — no changes needed |
| CI workflow (`.github/workflows/`) | CI uses `ENVIRONMENT=testing` which was already handled |
| All mobile source code (`app/`, `components/`, etc.) | The app reads `EXPO_PUBLIC_API_URL` at runtime — no source changes needed |

---

## 6. Platform Configuration (Manual Steps Done)

These steps were completed manually via web dashboards. They are documented here for reference.

### 6.1 Neon — Created staging database

1. Opened the Neon dashboard → SQL Editor
2. Ran:
   ```sql
   CREATE DATABASE vitaltrack_staging OWNER neondb_owner;
   ```
3. The new database is on the same Neon project/branch, so it shares the same connection endpoint but uses a different database name in the connection string

### 6.2 Render — Created staging service

1. Created a new **Web Service** named `vitaltrack-api-staging`
2. Connected to the same GitHub repo, same branch
3. Same Dockerfile, same build/start commands
4. Set **8 environment variables:**

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | `postgresql+asyncpg://...@.../vitaltrack_staging` | Points to `vitaltrack_staging` database (NOT `neondb`) |
| `SECRET_KEY` | *(unique random value)* | **Different from production** — ensures JWT isolation |
| `ENVIRONMENT` | `staging` | Triggers SSL, but not email verification |
| `CORS_ORIGINS` | `["*"]` | Wildcard is fine for a mobile app (no browser CORS concerns) |
| `REQUIRE_EMAIL_VERIFICATION` | `false` | Allows testers to register without email verification |
| `MAIL_PASSWORD` | *(app password)* | For sending emails if needed |
| `MAIL_FROM` | `noreply@vitaltrack.app` | Sender address |
| `FRONTEND_URL` | *(staging URL)* | Used in email templates for links |

### 6.3 Expo/EAS — No dashboard changes needed

EAS Build reads the `env` block from `eas.json` at build time. No changes are needed in the Expo dashboard.

---

## 7. Verification Commands

### Health checks

```bash
# Staging health check
curl -s https://vitaltrack-api-staging.onrender.com/health | python -m json.tool

# Expected output:
# {
#     "status": "healthy",
#     "environment": "staging",
#     "database": "connected"
# }

# Production health check
curl -s https://vitaltrack-api.onrender.com/health | python -m json.tool

# Expected output:
# {
#     "status": "healthy",
#     "environment": "production",
#     "database": "connected"
# }
```

### Registration test (staging only)

```bash
# Register a test user on staging
curl -s -X POST https://vitaltrack-api-staging.onrender.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "TestPass123!",
    "full_name": "Test User"
  }' | python -m json.tool
```

### Database isolation proof

After registering a test user on staging, verify it does NOT exist on production:

```bash
# Try to login with the staging test user on production — should fail
curl -s -X POST https://vitaltrack-api.onrender.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "TestPass123!"
  }'

# Expected: 401 Unauthorized (user doesn't exist on production)
```

---

## 8. Troubleshooting

### "database": "disconnected" in health check

**Cause:** The `DATABASE_URL` environment variable is wrong or the Neon database is unavailable.

**Fix:**
1. Check Render dashboard → Environment Variables → `DATABASE_URL`
2. Verify the connection string has the correct database name (`vitaltrack_staging` for staging, `neondb` for production)
3. Verify the Neon project is active (not suspended due to inactivity)
4. Check that the password in the connection string matches the Neon dashboard

### Wrong environment name shown in health check

**Cause:** The `ENVIRONMENT` variable is misspelled or not set.

**Fix:**
1. Check Render dashboard → Environment Variables → `ENVIRONMENT`
2. Must be exactly `staging` or `production` (lowercase, no quotes, no spaces)
3. After fixing, trigger a manual deploy in Render

### JWT token from staging works on production (or vice versa)

**This should NOT happen.** If it does:

**Cause:** Both environments have the same `SECRET_KEY`.

**Fix:**
1. Generate a new unique SECRET_KEY for staging: `python -c "import secrets; print(secrets.token_urlsafe(64))"`
2. Update the SECRET_KEY in the staging Render service
3. Trigger a manual deploy — all existing staging tokens will be invalidated

### Preview APK is hitting production backend

**Cause:** The APK was built before the `eas.json` change, or LAN/tunnel mode is overriding the URL.

**Fix:**
1. Rebuild the preview APK: `eas build --profile preview --platform android`
2. Install the new APK on the test device
3. Remember: the URL is baked in at build time — old APKs will forever point to the old URL

### Alembic migration fails on staging

**Cause:** Usually a migration incompatibility or a connection issue.

**Fix:**
1. Check the Render logs for the staging service (Render dashboard → Logs)
2. Look for the Alembic error message
3. If it's a migration error, fix the migration locally and push
4. If it's a connection error, verify DATABASE_URL (see "disconnected" above)
5. You can run migrations manually against staging if needed:
   ```bash
   DATABASE_URL="<staging-url>" ENVIRONMENT=staging alembic upgrade head
   ```

---

## 9. FAQ

### Will production data be lost?

**No.** This change does not touch production at all. The production Render service, database, and env vars are completely unchanged. The only code change affecting production is the SSL toggle, which was already ON for production (`== "production"` → `not in ("development", "testing")` — production is not in either of those, so SSL stays ON).

### Does this cost anything?

**$0 additional.** Neon free tier includes multiple databases on the same project. Render free tier allows multiple web services. The staging service uses the same free resources.

### Do I need to run Alembic manually on the staging database?

**No.** The `docker-entrypoint.sh` script runs `alembic upgrade head` automatically on every deploy. When the staging service first started with the new `DATABASE_URL`, Alembic ran all migrations and created every table automatically.

### Is the staging database empty?

**Yes.** The staging database starts completely empty. When Alembic runs, it creates all tables but no data rows. You (or testers) will need to register new accounts and create test data. This is by design — staging should not contain production data copies.

### What about cold starts?

Render free-tier services sleep after 15 minutes of inactivity. The first request after sleep will take 30-60 seconds while the container spins up, runs migrations, and starts the server. Subsequent requests are fast. This affects both staging and production independently.

### Do I need to change anything in the Expo dashboard?

**No.** EAS Build reads configuration from `eas.json` in the repository. The Expo/EAS dashboard does not need any changes for the environment split.

### Is CORS `["*"]` (wildcard) safe for the staging backend?

**Yes.** CORS (Cross-Origin Resource Sharing) is a browser security feature. Mobile apps (React Native) do not enforce CORS — they make direct HTTP requests. The wildcard CORS setting has zero security impact for a mobile-only API. Even for production, `["*"]` is acceptable when the API is consumed exclusively by a mobile app.
