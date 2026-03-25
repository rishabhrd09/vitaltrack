# Railway to Render + Neon Migration Guide

> **Complete documentation of VitalTrack's backend migration from Railway to Render + Neon PostgreSQL.**

---

## 1. Migration Summary

| Detail | Value |
|--------|-------|
| **Date** | March 2026 |
| **Reason** | Railway free trial expired; no budget for paid tier |
| **From** | Railway (backend hosting) + Railway PostgreSQL (database) |
| **To** | Render free tier (backend hosting) + Neon free tier (PostgreSQL database) |
| **Total cost after migration** | $0/month, free forever |
| **Frontend/CI files changed** | 3 (`eas.json`, `package.json`, `ci.yml`) |
| **Backend files changed** | 3 (`config.py`, `database.py`, `alembic/env.py` — Neon SSL fix only) |
| **Infrastructure files changed** | 1 (`render.yaml`) |
| **Business logic changes** | **ZERO** |

---

## 2. Why Almost Zero Business Logic Changes Were Needed

VitalTrack follows the **12-Factor App** methodology. All configuration is loaded from environment variables via `pydantic-settings` in `app/core/config.py`. This means the application doesn't care *where* it runs — it only cares about the values in its environment.

### The `ensure_asyncpg_driver` Validator

The `DATABASE_URL` field validator in `config.py` handles any PostgreSQL URL format automatically:

```python
@field_validator("DATABASE_URL", mode="before")
@classmethod
def ensure_asyncpg_driver(cls, v):
    if isinstance(v, str):
        # Strip query parameters (e.g., ?sslmode=require from Neon)
        if "?" in v:
            v = v.split("?")[0]
        # Convert to asyncpg format
        if v.startswith("postgresql://") and "+asyncpg" not in v:
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql+asyncpg://", 1)
    return v
```

### The `docker-entrypoint.sh` Parser

The entrypoint script parses any `DATABASE_URL` format using `sed` to extract host, port, database name, etc. It works with Railway, Render, Neon, or any other provider.

### The Mobile API URL

`vitaltrack-mobile/services/api.ts` reads the backend URL from `EXPO_PUBLIC_API_URL`, which is baked into the app at build time via `eas.json`:

```typescript
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
```

### Environment Variable Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                  ENVIRONMENT VARIABLE FLOW                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  BACKEND:                                                               │
│                                                                         │
│  Render Dashboard                                                       │
│  (DATABASE_URL, SECRET_KEY, etc.)                                       │
│         │                                                               │
│         ▼                                                               │
│  Docker Container (env vars injected by Render)                         │
│         │                                                               │
│         ▼                                                               │
│  docker-entrypoint.sh (parses DATABASE_URL, runs migrations)            │
│         │                                                               │
│         ▼                                                               │
│  pydantic-settings / config.py (validates, converts URL format)         │
│         │                                                               │
│         ▼                                                               │
│  SQLAlchemy engine (connects with SSL via connect_args)                 │
│                                                                         │
│                                                                         │
│  FRONTEND:                                                              │
│                                                                         │
│  eas.json (EXPO_PUBLIC_API_URL)                                         │
│         │                                                               │
│         ▼                                                               │
│  EAS Build (bakes URL into APK/AAB)                                     │
│         │                                                               │
│         ▼                                                               │
│  process.env.EXPO_PUBLIC_API_URL                                        │
│         │                                                               │
│         ▼                                                               │
│  services/api.ts → every HTTP request                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### The Only Non-Trivial Change: Neon SSL Compatibility

The asyncpg driver (used by SQLAlchemy async) does **not** accept SSL-related query parameters in the URL (like `?sslmode=require`). Neon includes these by default. The fix:

1. **Strip query params** from `DATABASE_URL` in `config.py`
2. **Pass SSL via `connect_args={"ssl": True}`** in `database.py` and `alembic/env.py`
3. **Only in production** — local Docker dev doesn't use SSL

This is a driver compatibility fix, not a business logic change.

---

## 3. Exact Changes Made

### Task 1: `vitaltrack-mobile/eas.json` (2 URL replacements)

**Lines changed:** `preview.env.EXPO_PUBLIC_API_URL` and `production.env.EXPO_PUBLIC_API_URL`

| Before (Railway) | After (Render) |
|---|---|
| `https://vitaltrack-production.up.railway.app` | `https://vitaltrack-api.onrender.com` |

**Why:** This URL is baked into the APK/AAB at EAS build time. It flows: `eas.json` → EAS Build → `process.env.EXPO_PUBLIC_API_URL` → `services/api.ts` line 9 → every HTTP request.

**NOT changed:** The `development` profile — it correctly points to `http://localhost:8000`.

---

### Task 2: `vitaltrack-mobile/package.json` (1 URL replacement)

**Line changed:** `scripts.start:prod`

| Before | After |
|---|---|
| `cross-env EXPO_PUBLIC_API_URL=https://vitaltrack-production.up.railway.app expo start --clear` | `cross-env EXPO_PUBLIC_API_URL=https://vitaltrack-api.onrender.com expo start --clear` |

**Why:** Dev convenience script for running Expo locally while pointing at the production backend.

---

### Task 3: `.github/workflows/ci.yml` (deploy job replacement)

**What changed:** The entire `deploy-backend` job was replaced.

| Aspect | Before (Railway) | After (Render) |
|---|---|---|
| Job name | "Deploy Backend to Railway" | "Deploy Backend to Render" |
| Secret checked | `RAILWAY_TOKEN` | `RENDER_DEPLOY_HOOK` |
| Deploy mechanism | `railway up --service vitaltrack-api --detach` | `curl -s "$RENDER_DEPLOY_HOOK"` |
| CLI installation | `npm i -g @railway/cli` | Not needed (just curl) |

**Why:** Railway used its proprietary CLI. Render uses a simple HTTP deploy hook URL. Render also auto-deploys when connected to GitHub, so this CI job is a backup/visibility mechanism.

---

### Task 4: `vitaltrack-backend/render.yaml` (infrastructure config)

**What changed:** Complete rewrite to match actual `config.py` variable names.

| Before | After |
|---|---|
| `JWT_SECRET_KEY` (wrong) | `SECRET_KEY` (matches config.py) |
| `JWT_REFRESH_SECRET_KEY` (wrong) | Removed (not in config.py) |
| `fromDatabase` reference | `sync: false` (Neon is external) |
| `env: docker` | `runtime: docker` |
| No `rootDir` | `rootDir: ./vitaltrack-backend` |
| No `region` | `region: singapore` |
| No `plan` | `plan: free` |

---

### Task 5: `vitaltrack-backend/app/core/config.py` (query param stripping)

**What changed:** The `ensure_asyncpg_driver` validator now strips query parameters before converting the URL format.

**Added code:**
```python
# Strip query parameters (e.g., ?sslmode=require from Neon)
if "?" in v:
    v = v.split("?")[0]
```

**Why:** Neon provides `postgresql://...?sslmode=require&channel_binding=require`. The asyncpg driver throws `TypeError: connect() got an unexpected keyword argument 'sslmode'` if these are left in the URL.

---

### Task 6: `vitaltrack-backend/app/core/database.py` (SSL connect_args)

**What changed:** Added `connect_args={"ssl": True}` to the `create_async_engine` call, conditionally for production only.

**Added code:**
```python
_connect_args = {"ssl": True} if settings.ENVIRONMENT == "production" else {}
```

**Why:** This is the correct way to enable SSL with asyncpg. URL query params like `?sslmode=require` are for libpq (psycopg2), not asyncpg.

---

### Task 7: `vitaltrack-backend/alembic/env.py` (SSL connect_args)

**What changed:** Added `connect_args={"ssl": True}` to the `async_engine_from_config` call, conditionally for production only.

**Why:** Alembic uses its own engine creation, separate from `database.py`. Without this, `alembic upgrade head` (run by `docker-entrypoint.sh` on every deploy) fails with the same `sslmode` error.

---

## 4. Files That Did NOT Change and Why

| File | Why No Change Needed |
|------|---------------------|
| `app/core/security.py` | Reads `SECRET_KEY` from env — no platform reference |
| `app/main.py` | Reads all config from `settings` object — platform-agnostic |
| `Dockerfile` | Standard Docker build — works on any platform that runs containers |
| `docker-entrypoint.sh` | Parses any `DATABASE_URL` format via `sed` — already universal |
| `docker-compose.yml` | Local development only — never deployed to any platform |
| `services/api.ts` | Reads `EXPO_PUBLIC_API_URL` baked at build time — no hardcoded URL |
| `app/api/v1/auth.py` | Pure business logic — no platform dependency |
| `app/api/v1/categories.py` | Pure business logic |
| `app/api/v1/items.py` | Pure business logic |
| `app/api/v1/orders.py` | Pure business logic |
| `app/api/v1/sync.py` | Pure business logic |
| `app/api/deps.py` | Dependency injection — platform-agnostic |
| `app/models/*.py` | SQLAlchemy models — database engine agnostic |
| `app/schemas/*.py` | Pydantic schemas — pure data validation |
| `app/utils/*.py` | Utility functions — no platform references |
| `requirements.txt` | No new dependencies needed |
| `alembic/versions/*.py` | Migration files — only `env.py` needed the SSL fix |

---

## 5. New Platform Setup Guide

### Step 1: Create Neon Database

1. Go to [neon.tech](https://neon.tech) and sign up (free, no credit card)
2. Create a new project (choose a region close to your Render service)
3. Copy the connection string from the dashboard
4. **IMPORTANT: Strip query parameters from the Neon connection string.** Remove everything after `?`:

```
# Neon provides:
postgresql://user:pass@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require

# You paste into Render:
postgresql://user:pass@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb
```

SSL is handled by `connect_args` in the Python code, NOT the URL.

### Step 2: Create Render Web Service

1. Go to [render.com](https://render.com) and sign up (free, no credit card)
2. Click **New** → **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name:** `vitaltrack-api`
   - **Root Directory:** `vitaltrack-backend`
   - **Runtime:** Docker
   - **Instance Type:** Free
   - **Branch:** `main`

### Step 3: Set Environment Variables on Render

In the Render dashboard → your service → **Environment**:

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | `postgresql://user:pass@host/neondb` | From Neon, **without** query params |
| `SECRET_KEY` | `<openssl rand -hex 32>` | Generate a random 64-char hex string |
| `ENVIRONMENT` | `production` | Enables SSL connect_args |
| `CORS_ORIGINS` | `["*"]` | Safe for mobile-only API |
| `REQUIRE_EMAIL_VERIFICATION` | `false` | Set to `true` when email is configured |
| `FRONTEND_URL` | `https://vitaltrack-api.onrender.com/api/v1/auth` | For email verification links |
| `MAIL_USERNAME` | (optional) | Brevo API key if email enabled |
| `MAIL_PASSWORD` | (optional) | Brevo API password if email enabled |

### Step 4: Verify Deployment

```bash
curl https://vitaltrack-api.onrender.com/health
# Expected: {"status":"healthy"}

curl https://vitaltrack-api.onrender.com/docs
# Should load Swagger UI
```

### Step 5: Update GitHub Secrets

1. Go to your GitHub repo → Settings → Secrets and variables → Actions
2. **Remove:** `RAILWAY_TOKEN` (no longer needed)
3. **Add (optional):** `RENDER_DEPLOY_HOOK` — get this from Render dashboard → your service → Settings → Deploy Hook

### Step 6: Set Up UptimeRobot (Prevent Cold Starts)

1. Go to [uptimerobot.com](https://uptimerobot.com) and sign up (free)
2. Add a new monitor:
   - **Type:** HTTP(s)
   - **URL:** `https://vitaltrack-api.onrender.com/health`
   - **Monitoring interval:** 5 minutes
3. This pings the health endpoint every 5 minutes, preventing Render from sleeping the service

---

## 6. Understanding Render Free Tier Limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| **Backend sleeps after 15 min idle** | First request after sleep takes ~60 seconds | UptimeRobot pinging every 5 min prevents sleep |
| **750 free hours/month** | Enough for 1 always-on service (24x31 = 744 hours) | Single service stays within limits |
| **No persistent disk** | Uploaded files are lost on redeploy | VitalTrack uses database storage, not disk |
| **Limited bandwidth** | 100 GB/month outbound | More than sufficient for API responses |

### Neon Free Tier Limitations

| Limitation | Value | Notes |
|------------|-------|-------|
| **Storage** | 0.5 GB | Sufficient for family/pilot use |
| **Compute hours** | 100 hours/month | Auto-suspends after 5 min idle, wakes in <1 sec |
| **Branches** | 10 | More than enough |
| **Projects** | 1 | VitalTrack uses 1 project |

Monitor your usage in the Neon dashboard as you scale. If you approach limits, consider upgrading or migrating to a different provider.

---

## 7. Environment Variables Reference

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes | (local dev URL) | PostgreSQL connection string. **Must NOT contain query params** like `?sslmode=require` — asyncpg handles SSL via `connect_args` |
| `SECRET_KEY` | Yes | (insecure default) | JWT signing key. Use `openssl rand -hex 32` to generate |
| `ENVIRONMENT` | No | `development` | Set to `production` to enable SSL connect_args |
| `CORS_ORIGINS` | No | `["*"]` | JSON array of allowed origins |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `30` | JWT access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | `30` | JWT refresh token lifetime |
| `REQUIRE_EMAIL_VERIFICATION` | No | `true` | Block login until email verified |
| `FRONTEND_URL` | No | `http://127.0.0.1:8000/api/v1/auth` | Base URL for email verification links |
| `MAIL_USERNAME` | No | `""` | Email service username (Brevo) |
| `MAIL_PASSWORD` | No | `""` | Email service password (Brevo) |
| `MAIL_FROM` | No | `noreply@vitaltrack.app` | From address for emails |
| `DATABASE_POOL_SIZE` | No | `5` | SQLAlchemy connection pool size |
| `DATABASE_MAX_OVERFLOW` | No | `10` | Max overflow connections |
| `DATABASE_POOL_TIMEOUT` | No | `30` | Connection pool timeout (seconds) |
| `DEBUG` | No | `false` | Enable SQL query logging |
| `HOST` | No | `0.0.0.0` | Server bind address |
| `PORT` | No | `8000` | Server port |

---

## 8. Neon SSL Compatibility Explained

### The Problem

Neon provides connection strings with query parameters:

```
postgresql://user:pass@host/neondb?sslmode=require&channel_binding=require
```

The `asyncpg` driver (used by SQLAlchemy async) does **not** accept `sslmode` or `channel_binding` as URL query parameters. It throws:

```
TypeError: connect() got an unexpected keyword argument 'sslmode'
```

This is because `sslmode` is a **libpq** parameter (used by `psycopg2`), not an `asyncpg` parameter. The asyncpg driver has its own SSL API.

### The Fix (3 files)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     NEON SSL COMPATIBILITY FIX                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Neon DATABASE_URL                                                      │
│  postgresql://user:pass@host/db?sslmode=require&channel_binding=require │
│         │                                                               │
│         ▼                                                               │
│  config.py: ensure_asyncpg_driver()                                     │
│  ├── Strips "?sslmode=require&channel_binding=require"                  │
│  ├── Converts "postgresql://" → "postgresql+asyncpg://"                 │
│  └── Result: postgresql+asyncpg://user:pass@host/db                     │
│         │                                                               │
│         ├──────────────────────────────┐                                │
│         ▼                              ▼                                │
│  database.py                    alembic/env.py                          │
│  create_async_engine(           async_engine_from_config(               │
│    ...,                           ...,                                  │
│    connect_args={"ssl": True}     connect_args={"ssl": True}            │
│  )                              )                                       │
│         │                              │                                │
│         ▼                              ▼                                │
│  asyncpg connects with SSL      Alembic migrations run with SSL         │
│  to Neon successfully           against Neon successfully               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Why Environment-Aware?

The SSL `connect_args` only activates when `settings.ENVIRONMENT == "production"`:

```python
_connect_args = {"ssl": True} if settings.ENVIRONMENT == "production" else {}
```

- **Production (Render + Neon):** SSL is required — Neon rejects non-SSL connections
- **Local development (Docker):** SSL is not used — the local PostgreSQL container doesn't have SSL certificates
- **CI testing:** `ENVIRONMENT=testing` — GitHub Actions uses a local PostgreSQL service without SSL

---

## 9. Future Migration Guide

If you need to migrate to another platform in the future, here's what to change:

### Files to Update

1. **`vitaltrack-mobile/eas.json`** — Update 2 `EXPO_PUBLIC_API_URL` values (preview + production)
2. **`vitaltrack-mobile/package.json`** — Update 1 `start:prod` script URL
3. **`.github/workflows/ci.yml`** — Update the `deploy-backend` job for the new platform's deploy mechanism
4. **Check SSL requirements** — If the new PostgreSQL provider needs SSL, the `connect_args` fix already handles it (just set `ENVIRONMENT=production`)

### Platform Equivalents

| Feature | Railway | Render | Koyeb | Fly.io |
|---------|---------|--------|-------|--------|
| **Free tier** | Trial only | Free forever | Free forever | Free (limited) |
| **Cold starts** | No | Yes (15 min) | No (always-on) | Yes (configurable) |
| **Docker support** | Yes | Yes | Yes | Yes |
| **Auto-deploy from GitHub** | Yes | Yes | Yes | Yes |
| **Managed PostgreSQL** | Yes (built-in) | Yes (paid) | No | Yes (paid) |
| **Deploy mechanism** | Railway CLI | Deploy hook (curl) | Deploy hook (curl) | `flyctl deploy` |
| **Credit card required** | For paid | No | No | Yes (for free tier) |
| **Free database** | With trial | No (use Neon) | No (use Neon) | No (use Neon) |

### If Considering Koyeb

Koyeb's free tier is always-on (no cold starts), making it a strong alternative to Render if cold starts become an issue. The migration would follow the same pattern: update 3 URL files + adjust the CI deploy job.

---

## 10. Rollback Plan

### Reverting to Railway

If budget allows Railway later, or if Render doesn't work out:

1. **Revert URL files:** Change `onrender.com` back to `railway.app` in `eas.json`, `package.json`
2. **Revert CI job:** Replace the Render deploy hook with the Railway CLI deploy
3. **Add payment method** to Railway — the old project configuration should still exist
4. **The SSL fix is harmless on Railway:** `connect_args={"ssl": True}` only activates when `ENVIRONMENT=production`, and Railway also uses SSL for its managed PostgreSQL — so the fix works correctly on Railway too

### Trying Koyeb Instead

1. Same 3 file changes (URLs + CI deploy job)
2. Neon database stays the same — just update `DATABASE_URL` on Koyeb's dashboard
3. No cold starts on Koyeb's free tier

### Key Point

The SSL `connect_args` fix is **provider-agnostic**. It works correctly with any managed PostgreSQL provider that requires SSL (which is nearly all of them). You never need to revert Tasks 5-7 regardless of which platform you choose.

---

## Summary of All Changes

```
FRONTEND / CI (URL replacements):
  vitaltrack-mobile/eas.json              <- 2 URLs: Railway -> Render
  vitaltrack-mobile/package.json          <- 1 URL: Railway -> Render
  .github/workflows/ci.yml               <- Deploy job: Railway CLI -> Render hook

BACKEND (Neon SSL compatibility):
  vitaltrack-backend/app/core/config.py   <- Strip ?sslmode=require from DATABASE_URL
  vitaltrack-backend/app/core/database.py <- Add connect_args={"ssl": True} for production
  vitaltrack-backend/alembic/env.py       <- Add connect_args={"ssl": True} for production

INFRASTRUCTURE:
  vitaltrack-backend/render.yaml          <- Fix env var names to match config.py

DOCUMENTATION:
  docs/RAILWAY_TO_RENDER_MIGRATION.md     <- NEW: this document
  docs/DEPLOYMENT_GUIDE.md                <- Migration notice added at top
  docs/DEVOPS_AND_ARCHITECTURE.md         <- Migration notice added at top

TOTAL: 10 files (7 modified + 1 new + 2 notices)
BUSINESS LOGIC CHANGES: ZERO
```

---

*Created: March 2026*
