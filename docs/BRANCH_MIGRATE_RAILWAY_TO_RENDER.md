# Branch: migrate/railway-to-render

> **Complete record** of every change made in this branch, why it was made, what challenges were encountered during testing, and what solutions worked.

---

## Branch Purpose

Migrate VitalTrack's backend infrastructure from Railway (expired free trial) to Render (free forever) + Neon PostgreSQL (free forever). Total monthly cost after migration: **$0**.

**Created from:** `main` branch
**Date:** March 2026
**Trigger:** Railway free trial expired, no budget for paid tier

---

## All Changes Made

### 1. Frontend URL Updates (Railway → Render)

#### `vitaltrack-mobile/eas.json`
**Lines changed:** 25, 36 (preview and production `EXPO_PUBLIC_API_URL`)

| Before | After |
|--------|-------|
| `https://vitaltrack-production.up.railway.app` | `https://vitaltrack-api.onrender.com` |

**Why:** This URL is baked into APK/AAB at EAS build time. Every HTTP request from the mobile app goes to this URL. The `development` profile was NOT changed — it correctly points to `http://localhost:8000`.

#### `vitaltrack-mobile/package.json`
**Line changed:** 8 (`start:prod` script)

| Before | After |
|--------|-------|
| `cross-env EXPO_PUBLIC_API_URL=https://vitaltrack-production.up.railway.app expo start --clear` | `cross-env EXPO_PUBLIC_API_URL=https://vitaltrack-api.onrender.com expo start --clear` |

**Why:** Dev convenience script for running Expo locally against the production backend.

**Also updated in this file (by `npx expo install --fix`):**
- `expo`: `^54.0.31` → `~54.0.33`
- `expo-router`: `~6.0.21` → `~6.0.23`

These were flagged by `npx expo install --check` as outdated for SDK 54 compatibility.

---

### 2. CI/CD Pipeline Update

#### `.github/workflows/ci.yml`
**Lines changed:** 207-247 (entire `deploy-backend` job replaced)

| Aspect | Before (Railway) | After (Render) |
|--------|-----------------|----------------|
| Job name | "Deploy Backend to Railway" | "Deploy Backend to Render" |
| Secret | `RAILWAY_TOKEN` | `RENDER_DEPLOY_HOOK` |
| Deploy method | `npm i -g @railway/cli && railway up --service vitaltrack-api --detach` | `curl -s "$RENDER_DEPLOY_HOOK"` |

**Why:** Railway uses a proprietary CLI that requires `RAILWAY_TOKEN`. Render uses a simple HTTP deploy hook (a URL you POST to). Render also auto-deploys from GitHub pushes, so this CI job is a backup trigger.

---

### 3. Infrastructure Config

#### `vitaltrack-backend/render.yaml`
**Full rewrite.** Fixed env var names to match `config.py`:

| Before (Wrong) | After (Correct) |
|----------------|-----------------|
| `JWT_SECRET_KEY` | `SECRET_KEY` |
| `JWT_REFRESH_SECRET_KEY` | Removed (not in config.py) |
| `env: docker` | `runtime: docker` |
| No `rootDir` | `rootDir: ./vitaltrack-backend` |
| No `region` | `region: singapore` |
| No `plan` | `plan: free` |
| `fromDatabase` reference | `sync: false` (Neon is external) |

---

### 4. Neon SSL Compatibility (3 backend files)

#### `vitaltrack-backend/app/core/config.py`
**What:** Added query parameter stripping to `ensure_asyncpg_driver` validator.

```python
# Added before URL format conversion:
if "?" in v:
    v = v.split("?")[0]
```

**Why:** Neon provides `postgresql://...?sslmode=require&channel_binding=require`. The asyncpg driver throws `TypeError: connect() got an unexpected keyword argument 'sslmode'` because it doesn't accept these as URL params. SSL must be passed via `connect_args` instead.

#### `vitaltrack-backend/app/core/database.py`
**What:** Added conditional SSL `connect_args` to `create_async_engine`.

```python
_connect_args = {"ssl": True} if settings.ENVIRONMENT == "production" else {}
engine = create_async_engine(..., connect_args=_connect_args)
```

**Why:** asyncpg's `connect_args={"ssl": True}` is the correct way to enable SSL. The `ENVIRONMENT` check ensures local Docker dev (which uses unencrypted localhost PostgreSQL) continues to work.

#### `vitaltrack-backend/alembic/env.py`
**What:** Same SSL `connect_args` pattern added to `async_engine_from_config`.

**Why:** Alembic creates its own engine, separate from `database.py`. Without this, `alembic upgrade head` (run on every deploy by `docker-entrypoint.sh`) fails with the same `sslmode` error.

---

### 5. Expo Go Fix

#### `vitaltrack-mobile/app.json`
**What:** Added `"updates": { "enabled": false }`.

**Why:** The `expo-updates` package was installed but no `updates` config existed. Expo Go tried to fetch OTA updates from Expo's servers, found nothing, and crashed with "failed to download remote update". Disabling updates tells Expo Go to load the bundle directly from Metro.

---

### 6. Documentation

#### `docs/RAILWAY_TO_RENDER_MIGRATION.md` (NEW — 494 lines)
Comprehensive migration guide covering: summary, 12-Factor App explanation, exact changes, Neon SSL fix, platform setup, free tier limitations, env var reference, future migration guide, rollback plan.

#### `docs/DEPLOYMENT_GUIDE.md`
Added migration notice at top pointing to the new migration doc.

#### `docs/DEVOPS_AND_ARCHITECTURE.md`
Added migration notice at top noting Railway references should be read as Render.

#### `docs/TECHNICAL_CHALLENGES.md`
Added 5 new challenges (9-13) documenting all the Expo Go / local testing issues encountered during this branch.

#### `docs/BRANCH_MIGRATE_RAILWAY_TO_RENDER.md` (NEW — this file)
This document.

---

## Files NOT Changed (and why)

| File | Why No Change |
|------|---------------|
| `app/core/security.py` | Reads `SECRET_KEY` from env — platform-agnostic |
| `app/main.py` | Reads all config from `settings` object |
| `Dockerfile` | Standard Docker build — works on any platform |
| `docker-entrypoint.sh` | Parses any `DATABASE_URL` via sed |
| `docker-compose.yml` | Local dev only — never deployed |
| `services/api.ts` | Reads `EXPO_PUBLIC_API_URL` baked at build time |
| All route files (`app/api/v1/*`) | Pure business logic |
| All model files (`app/models/*`) | SQLAlchemy models — engine-agnostic |
| All schema files (`app/schemas/*`) | Pydantic schemas — pure validation |
| All store files (`store/*`) | Zustand state — no platform reference |
| `requirements.txt` | No new dependencies needed |

---

## Challenges Encountered During Local Testing

### Challenge A: Expo Go Crashes — "Unable to Download Remote Update"

**When:** First attempt to run the app on phone via Expo Go after code changes.

**Error:** `Something went wrong. Fatal error: failed to download remote update`

**Debugging steps tried:**
1. Wi-Fi connection method — same error
2. `npx expo start --tunnel` — failed (ngrok service down)
3. `npx expo start --lan` — same error
4. Updated Expo packages (`npx expo install --fix`) — didn't help
5. USB debugging with `adb reverse` — same error

**Root cause:** `expo-updates` package in `package.json` with no `updates` config in `app.json`. Expo Go tried to fetch updates from a non-existent URL.

**Fix:** Added `"updates": { "enabled": false }` to `app.json`.

**Time spent:** ~40 minutes debugging before identifying root cause.

---

### Challenge B: Phone Can't Reach PC (Wi-Fi Method Failed)

**When:** Trying to test on phone via same Wi-Fi network.

**Symptom:** Phone browser showed "Site unreachable" when accessing `http://192.168.1.8:8000/health`.

**Debugging steps:**
1. Confirmed same Wi-Fi network — yes
2. Confirmed backend running (`curl localhost:8000/health` worked on PC)
3. Confirmed correct IP (`ipconfig | findstr IPv4` → `192.168.1.8`)

**Root cause:** Windows Firewall blocking inbound connections on port 8000.

**Fix applied:**
```powershell
New-NetFirewallRule -DisplayName "VitalTrack Backend 8000" -Direction Inbound -Port 8000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Expo Metro 8081" -Direction Inbound -Port 8081 -Protocol TCP -Action Allow
```

**Ultimately not used:** Even after firewall fix, Wi-Fi connection had issues. Switched to USB method.

---

### Challenge C: Ngrok Tunnel Service Down

**When:** Trying `npx expo start --tunnel` as alternative to Wi-Fi.

**Error:** `CommandError: failed to start tunnel — remote gone away`

**Root cause:** Ngrok's relay service was experiencing an outage.

**Resolution:** Abandoned tunnel approach. Used USB debugging instead.

---

### Challenge D: Stale ADB Device Blocking Tunnel

**When:** Before tunnel service outage, first tunnel attempt.

**Error:** `adb.exe: device 'ZD2225Y8DK' not found — Cannot start tunnel URL because adb reverse failed`

**Root cause:** ADB remembered a previously connected device that was no longer attached. Expo tried to run `adb reverse` for it and failed.

**Fix:** `adb kill-server && adb start-server` — cleared stale device references.

---

### Challenge E: Expo Go Auto-Update Destroys Itself

**When:** Pressing `a` in Expo terminal to open on Android device.

**What happened:**
1. Expo detected phone had v54.0.6, recommended v54.0.7
2. Prompted "Install recommended version?" — accepted
3. Expo **uninstalled** v54.0.6 first
4. Failed to install v54.0.7: `java.io.IOException: not enough space`
5. Phone now had NO Expo Go

**Fix:** Freed phone storage, reinstalled Expo Go from Play Store.

**Lesson:** Always decline minor version auto-updates if phone storage is low. v54.0.6 is compatible with SDK 54.

---

### Challenge F: ADB Port Mapping Corruption — 404 on All API Calls

**When:** After Expo Go was reinstalled and app loaded successfully.

**Symptom:** App UI rendered, but login and registration returned 404. Metro logs showed `[API] Status: 404` for POST `/auth/login` and `/auth/register`.

**Confusion:** The endpoints worked via curl from PC (`curl localhost:8000/api/v1/auth/login` returned proper error), but the phone got 404.

**Debugging:**
```bash
adb reverse --list
# Revealed:
# tcp:8000 → tcp:8081   ← WRONG!
# tcp:8081 → tcp:8081   ← correct
```

**Root cause:** Port 8000 on the phone was mapped to Metro (8081) instead of the backend (8000). Every API call from the app hit Metro's HTTP server, which returned 404 for API routes.

**Fix:**
```bash
adb reverse --remove-all
adb reverse tcp:8000 tcp:8000
adb reverse tcp:8081 tcp:8081
```

**Lesson:** Always run `adb reverse --list` to verify mappings. Always `--remove-all` before setting new ones. Stale/incorrect mappings persist across Expo restarts.

---

## What Eventually Worked (The Winning Setup)

After all the challenges above, here's the exact sequence that successfully ran the app:

```bash
# 1. Start Docker backend
cd vitaltrack-backend
docker compose up --build -d
# Wait for "Uvicorn running" in logs

# 2. Verify backend
curl http://localhost:8000/health
# → {"status":"healthy","database":"connected"}

# 3. Set up USB connection
adb devices                          # Confirm phone shows as "device"
adb reverse --remove-all             # Clear stale mappings
adb reverse tcp:8000 tcp:8000        # Backend
adb reverse tcp:8081 tcp:8081        # Metro bundler
adb reverse --list                   # Verify both mappings

# 4. Set .env for localhost
cd ../vitaltrack-mobile
echo EXPO_PUBLIC_API_URL=http://localhost:8000 > .env

# 5. Start Expo
npx expo start --localhost --clear
# When prompted to update Expo Go → say NO
# Press 'a' to open on Android

# 6. Test on phone
# Register → Login → Create items → Create orders → Logout → Login
# All worked. Sync pushed 42 operations, all succeeded.
```

**Key factors that made it work:**
- `"updates": { "enabled": false }` in `app.json` — prevents OTA crash
- `--localhost` flag — forces Metro to bind to localhost only
- `adb reverse` with correct port mappings — routes phone traffic through USB
- `--clear` flag — ensures fresh Metro cache picks up `.env` changes
- Saying **NO** to Expo Go auto-update — prevents storage-related uninstall disaster

---

## Summary of All Changed Files

```
FRONTEND / CI (URL replacements):
  vitaltrack-mobile/eas.json              ← 2 URLs: Railway → Render
  vitaltrack-mobile/package.json          ← 1 URL + expo version bumps
  vitaltrack-mobile/package-lock.json     ← Auto-updated by npm
  vitaltrack-mobile/app.json              ← Added updates.enabled: false
  .github/workflows/ci.yml               ← Deploy job: Railway CLI → Render hook

BACKEND (Neon SSL compatibility):
  vitaltrack-backend/app/core/config.py   ← Strip ?sslmode=require from DATABASE_URL
  vitaltrack-backend/app/core/database.py ← Add connect_args={"ssl": True} for production
  vitaltrack-backend/alembic/env.py       ← Add connect_args={"ssl": True} for production

INFRASTRUCTURE:
  vitaltrack-backend/render.yaml          ← Fix env var names to match config.py

DOCUMENTATION:
  docs/RAILWAY_TO_RENDER_MIGRATION.md     ← NEW: comprehensive migration guide
  docs/BRANCH_MIGRATE_RAILWAY_TO_RENDER.md ← NEW: this document
  docs/DEPLOYMENT_GUIDE.md                ← Migration notice added at top
  docs/DEVOPS_AND_ARCHITECTURE.md         ← Migration notice added at top
  docs/TECHNICAL_CHALLENGES.md            ← 5 new challenges (9-13) added

TOTAL: 14 files modified/created
BUSINESS LOGIC CHANGES: ZERO
```

---

*Created: March 2026*
