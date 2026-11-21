# CareKosh Developer Guide

The [Complete Developer Guide](docs/CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md) and [Deployment Atlas](docs/deployment/CAREKOSH_DEPLOYMENT_ATLAS.html) are the starting points. This shorter handbook grew out of the October Android and API rollout. Dated schema excerpts and migration history below describe that rollout. For today’s operations use the [complete API inventory](docs/API_TRACEABILITY.md) and [backend README](vitaltrack-backend/README.md).

The repo contains the FastAPI service in `vitaltrack-backend/`, Android in `vitaltrack-mobile/`, the signed-in browser client in `carekosh-web/` and the public site in `carekosh-site/`. Both clients persist inventory through the same API. The November baseline is `a14b623`.

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Local Development Setup](#4-local-development-setup)
5. [Environment Configuration](#5-environment-configuration)
6. [CI/CD Pipeline](#6-cicd-pipeline)
7. [Deployment Workflow](#7-deployment-workflow)
8. [API Endpoints](#8-api-endpoints)
9. [Database Schema](#9-database-schema)
10. [Auth System](#10-auth-system)
11. [Troubleshooting](#11-troubleshooting)
12. [Contribution Workflow](#12-contribution-workflow)

---

## 1. Architecture Overview

CareKosh is **server-first**. The mobile app treats the backend as the source of truth and renders whatever the server returns. There is no offline queue and no sync reconciliation. The only business data kept on the phone is a read-only display cache (TanStack Query, persisted to AsyncStorage); it is never sent back to the server.

### Server-first, not offline-first

```
┌──────────────────┐       HTTPS / JSON       ┌────────────────────┐
│  Mobile (Expo)   │ ◄───────────────────────►│   FastAPI backend  │
│                  │                          │                    │
│  TanStack Query  │  ── GET /items ──────►   │  /auth, /items,    │
│  (server cache)  │  ◄── 200 + rows ──       │  /orders, /cats,   │
│                  │                          │  /activities, /ai  │
│  Zustand         │  ── PUT /items/{id} ─►   │                    │
│  (UI state only) │  ◄── 200 / 409 ──        │  SQLAlchemy async  │
│                  │                          │   ▼                │
│  SecureStore     │                          │  PostgreSQL (Neon) │
│  (auth tokens)   │                          └────────────────────┘
└──────────────────┘
```

**Why server-first:** Medical inventory must reflect truth across caregivers and devices. Server writes remove deferred offline-queue reconciliation, but concurrent changes still require a protocol. Edit Item now sends the version captured with its form fields, and the server rejects a stale update with 409. Active queries refetch after conflicts or uncertain network failures; a user reopens the form before another edit.

**What this means in practice:**
- Mobile needs network for any write. The app surfaces errors explicitly rather than queuing.
- `@tanstack/react-query` handles caching and revalidation. Mutations invalidate the affected queries after the server confirms; the current code makes no optimistic cache writes (`hooks/useServerMutations.ts`). Returning to the app refetches stale queries because `focusManager` is wired to AppState. On the feature branch (commit `07847a4`, Oct 2026) `onlineManager` is also wired to NetInfo, so regaining connectivity refetches stale queries too; on `main` it is not wired (`providers/QueryProvider.tsx`). The cache is now persisted to AsyncStorage via `@tanstack/query-async-storage-persister` so subsequent app launches show cached data instantly while fresh data loads in the background (PR #16). This is **not** the old offline-first architecture — the cache is strictly read-only for display. Mutations always go server-first; cache is never pushed to the server. Flow: `server → cache → screen`.
- `zustand` holds UI state (`store/useAppStore.ts`, ~61 lines) and the auth session (`store/useAuthStore.ts`, which persists the signed-in user as `vitaltrack-auth` in SecureStore); no inventory data.
- Auth tokens live in `expo-secure-store` (encrypted with the Android Keystore), not AsyncStorage. The query cache in AsyncStorage is not encrypted.
- Kill switch: `ENABLE_CACHE_PERSISTENCE` in `providers/QueryProvider.tsx` disables persistence with a one-line change. It is a code constant and over-the-air updates are disabled (`updates.enabled: false` in `app.json`), so installed apps get the change only from a new APK/AAB. (An earlier version of this guide said "no rebuild"; that was wrong.) When false, the app reverts to pure in-memory TanStack Query behaviour.

### Removed legacy sync endpoints

The former `/api/v1/sync/*` backend route surface from the offline-first era has been removed. This completes the server-first migration path started in PR #8: mobile has no `sync.ts`, no `useSyncStore`, no offline queue, and no backend reconciliation endpoint. Writes go through the normal REST endpoints (`/items`, `/categories`, `/orders`, `/orders/{id}/apply`) and either commit on the server or return an error to the app.

The `local_id` / `localId` fields remain in item, category, and order models/schemas for compatibility with existing records and client payloads. On items and categories they are metadata only; they no longer imply a sync API. On orders (feature branch, migration `0010`), `localId` is the idempotency key: the app sends one per Save press, and a repeated `POST /orders` with the same `localId` returns the existing order (200) instead of creating a duplicate, even if the repeated request's lines differ. Requests without `localId` are never deduplicated.

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Mobile runtime | React Native + Expo SDK 54 | `expo-router` v6 (file-based) |
| Mobile language | TypeScript 5 | strict mode |
| Server state | `@tanstack/react-query` ^5.60 (lockfile resolves 5.101.2) | all API calls |
| Cache persistence | `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister` | AsyncStorage-backed; `staleTime: 30s`, `gcTime: 24h`; kill switch in `QueryProvider.tsx`; buster tied to app version |
| UI and session state | `zustand` ^4.5 | UI state in memory; the auth store persists the signed-in user in SecureStore |
| Secure storage | `expo-secure-store` | refresh + access tokens |
| Backend runtime | Python 3.12 + FastAPI 0.162 / Starlette 1.10 | `gunicorn` + `app.worker.CareKoshUvicornWorker` (keeps the real socket peer), 2 workers; `DB` sessions commit before the response (`scope="function"`) |
| ORM | SQLAlchemy 2.0 (async) + `asyncpg` | |
| Migrations | Alembic 1.14 | auto-run at container start |
| Database | PostgreSQL 16 | CI and local Docker use 16; Neon (managed, branchable) hosts staging and production, and its server version is NOT VERIFIED |
| Auth | JWT (HS256) + refresh token rotation | `PyJWT` (replaced `python-jose` on 27 Oct 2026; existing tokens stay valid), `passlib[argon2]`, `bcrypt` |
| Rate limiting | `slowapi` + `limits` on shared Redis | Hosted environments require Redis (`RATE_LIMIT_STORAGE_URI`); counters are shared across workers and instances and keyed by the verified client address (IPv6 per /64). Limited routes fail closed (503) if Redis is unavailable, except the read-only `GET /ai/capabilities`. See `vitaltrack-backend/docs/BACKEND_INGRESS_SECURITY.txt`. |
| Email | Brevo v3 HTTP API via `httpx` | `MAIL_PASSWORD` stores the Brevo API key; the unused SMTP packages were removed |
| Hosting (backend) | **Render** | Docker web service. `vitaltrack-backend/render.yaml` describes the production service only (branch `main`, plan `starter`, health check `/live`, no `autoDeploy` key); the staging service exists only in the dashboard. Whether Render applies the file, and the auto-deploy settings, are NOT VERIFIED. |
| Hosting (DB) | **Neon** | separate staging and production databases (local development uses Docker Postgres); live Neon setup NOT VERIFIED |
| Hosting (mobile) | **EAS Build** | profiles: `development` (needs `expo-dev-client`, not installed), `preview`, `production` |
| CI | GitHub Actions | failing jobs: pytest, Ruff, route count, item/order coverage, TypeScript, ESLint errors (feature branch also: `npm test`, voice-module autolinking check); advisory: mypy, expo-doctor, Trivy, ESLint warnings. The `main` ruleset read on 7 Oct 2026 had no required status checks. |
| Security scan | Trivy | advisory HIGH/CRITICAL scan until the existing dependency baseline is fixed |

**Not used (despite what older docs claimed):** Railway, redux-persist, AsyncStorage as the source of truth for app data (it holds only the read-only display cache and, on the feature branch, voice preferences), offline sync queue, manual migration scripts, SMTP as the active production email transport.

---

## 3. Project Structure

```
vitaltrack/
├── .github/workflows/ci.yml          # backend/frontend tests, advisory mypy/Trivy, pr-check, deploy, preview APK, prod AAB (disabled)
├── vitaltrack-backend/
│   ├── Dockerfile                    # multi-stage (builder → python:3.12-slim runtime, non-root user)
│   ├── docker-entrypoint.sh          # waits for DB (pg_isready × 30), runs alembic upgrade head, execs CMD
│   ├── requirements.txt              # 28 direct requirements (27 exact pins + one range); transitive deps are not pinned
│   ├── alembic/versions/             # 10 migrations on the feature branch, 6 on main (see §9)
│   ├── scripts/                      # check_api_routes.py (CI route gate), check_file_coverage.py, smoke/restore/cold-start helpers
│   ├── tests/                        # pytest suite (242 tests passed on 7 and 8 Oct 2026)
│   └── app/
│       ├── core/
│       │   ├── config.py             # pydantic-settings, production validators
│       │   ├── security.py           # JWT encode/decode, password hashing
│       │   ├── database.py           # async engine, session factory
│       │   └── logging.py            # log/telemetry scrubbing (feature branch)
│       ├── models/                   # User, Category, Item, Order, OrderItem, ActivityLog, AuditLog, RefreshToken
│       │                             # + OrderNumberCounter, AIConsent, AIUsage (feature branch)
│       ├── schemas/                  # Pydantic I/O schemas
│       ├── services/                 # audit helper; feature branch adds AI guard/provider/body limit and inventory lock
│       ├── utils/                    # email.py (Brevo HTTP API), rate_limiter.py
│       └── api/v1/
│           ├── auth.py               # 18 route objects incl. account deletion
│           ├── items.py              # CRUD + OCC (version field, 409 on conflict)
│           ├── orders.py             # CRUD + POST /{id}/apply
│           ├── categories.py         # CRUD + /with-counts
│           ├── activity.py           # read-only activity log
│           └── ai.py                 # 5 read-only assistant routes (feature branch)
└── vitaltrack-mobile/
    ├── app.json / eas.json           # 3 EAS profiles: development, preview, production
    ├── package.json
    └── app/                          # expo-router file-based routing
        ├── _layout.tsx               # root Stack: (auth), (tabs), item/[id], order/create, builder, profile, search
        │                             # + assistant (transparent modal, feature branch)
        ├── (auth)/                   # login, register, forgot-password, reset-password, verify-email-pending
        ├── (tabs)/                   # dashboard (index), inventory, orders; feature branch adds the "Ask CareKosh" dock above the tabs
        ├── item/[id].tsx             # item detail screen (slides up)
        ├── order/create.tsx          # new order screen; sends one `localId` per Save press (feature branch)
        ├── builder.tsx               # bulk inventory seed modal
        ├── search.tsx                # search modal
        ├── assistant.tsx             # voice setup and typed practice (feature branch)
        └── profile.tsx               # edit name/username, read-only email, account deletion
    ├── store/
    │   ├── useAuthStore.ts           # 423 lines — auth state, tokens in SecureStore
    │   ├── useAppStore.ts            # 61 lines — UI-only (isInitialized)
    │   └── useResultDialogStore.ts   # UI-only queue for the slow-save / failure result dialog
    ├── services/
    │   ├── api.ts                    # fetch-based HTTP client with token injection
    │   ├── auth.ts                   # register/login/logout/requestAccountDeletion/cancelAccountDeletion/changePassword
    │   │                             # (no screen calls changePassword or cancelAccountDeletion today)
    │   ├── items.ts / orders.ts / categories.ts
    │   └── assistant.ts / assistantSession.ts   # /api/v1/ai client and in-memory assistant session (feature branch)
    ├── providers/QueryProvider.tsx   # TanStack Query client, persistence, focus/online managers
    ├── features/assistant/           # voice policy, preferences, readiness, recording, snapshot (feature branch)
    ├── modules/carekosh-voice/       # local Android Expo module: offline Moonshine speech recognition (feature branch)
    ├── tests/                        # node --test suites (121 tests passed on 7 and 8 Oct 2026; feature branch)
    ├── hooks/
    │   ├── useServerData.ts          # TanStack Query hooks (reads)
    │   ├── useServerMutations.ts     # TanStack mutation hooks (writes)
    │   ├── useNetworkStatus.ts
    │   ├── useSeedInventory.ts
    │   └── useDelayedPending.ts / useForceSync.ts (Help & Support "Refresh from server") / usePendingItems.ts
    └── components/                   # UI components
```

---

## 4. Local Development Setup

### Prerequisites

- Docker Desktop (running)
- Node.js 22 (`vitaltrack-mobile/.nvmrc`; Expo SDK 54 needs at least 20.19.4; the CI `test-frontend` job uses 20)
- Python 3.12 (only if you want to run backend without Docker)
- Expo Go for **SDK 54** on your phone (on Android, install the SDK 54 build from expo.dev/go; the store version follows the newest SDK). Expo Go runs everything except the voice assistant, whose native module needs an EAS-built Android `preview` APK (it talks to staging). The `development` profile cannot be built until `expo-dev-client` is installed.

### One-shot setup

```bash
git clone https://github.com/rishabhrd09/vitaltrack.git && cd vitaltrack
bash setup-local-dev.sh       # macOS/Linux (the file is not marked executable in Git)
# or
setup-local-dev.bat           # Windows
```

### Backend

```bash
cd vitaltrack-backend
cp .env.example .env          # optional with Docker: docker-compose.dev.yml sets SECRET_KEY and DATABASE_URL itself;
                              # .env only fills MAIL_*, FRONTEND_URL and LOCAL_IP (it is not copied into the image)
docker compose -f docker-compose.dev.yml up --build -d
docker compose -f docker-compose.dev.yml logs -f api    # confirm "Uvicorn running on http://0.0.0.0:8000"
```

The dev image's entrypoint (generated in `Dockerfile.dev`) runs `alembic upgrade head` automatically — you do not run migrations manually. If that migration fails, the dev container still starts the server (A-17), so read the log. With `ENVIRONMENT=development`, app startup also calls `create_tables()`, which only creates missing tables and can hide a failed migration; Alembic stays the schema authority.

**Local safety:** both compose files publish PostgreSQL (`postgres`/`postgres`) on port 5432 and pgAdmin (`admin`, only with its profile) on port 5050 on every network interface; use a trusted network. `docker compose down -v` deletes the local database volume and all its data.

**Readiness check:** `curl http://localhost:8000/health` probes the database and returns `200` with `database="connected"` only when the probe succeeds. `curl http://localhost:8000/live` is the process-only liveness check used by Render.

### Mobile

```bash
cd vitaltrack-mobile
npm install --legacy-peer-deps
npx expo start --clear
```

Scan the QR code with Expo Go. If `EXPO_PUBLIC_API_URL` is not set, `services/api.ts` falls back to `http://localhost:8000`. `setup-local-dev.sh` writes `vitaltrack-mobile/.env` with your LAN IP instead.

**Phone on same network not reaching localhost?** On the phone, `localhost` is the phone itself. Use `adb reverse tcp:8000 tcp:8000` over USB (then `http://localhost:8000` works), set `EXPO_PUBLIC_API_URL` to your machine's LAN IP (the laptop firewall must allow port 8000 on your private network), or use `http://10.0.2.2:8000` in the Android emulator.

---

## 5. Environment Configuration

### Backend env vars (`vitaltrack-backend/app/core/config.py`)

| Var | Default | Prod requirement |
|---|---|---|
| `APP_NAME` | `CareKosh API` | — |
| `APP_VERSION` | `1.0.0` | — |
| `ENVIRONMENT` | `development` | `production` |
| `DEBUG` | `False` | `False` |
| `HOST` / `PORT` | `0.0.0.0` / `8000` | used only by `python -m app.main`; the container binds `0.0.0.0:$PORT`, and Render sets only `PORT` (documented default 10000) |
| `DATABASE_URL` | local postgres | Neon async URL; validator auto-converts `postgres://` / `postgresql://` → `postgresql+asyncpg://` and strips query params; verified TLS is turned on in code when `ENVIRONMENT` is not development/testing. Use Neon's direct (not `-pooler`) URL: the app sends `statement_timeout` as a start-up parameter, which the pooler rejects. A `%` in the URL breaks Alembic (reproduced 8 Oct 2026) |
| `DATABASE_POOL_SIZE` / `_MAX_OVERFLOW` / `_POOL_TIMEOUT` | 5 / 10 / 30 | tune for Render; 2 Gunicorn workers × (5 + 10) = up to 30 connections per instance |
| `SECRET_KEY` | public placeholder `CHANGE-THIS-...` | **required**, min 32 chars. Feature branch: the placeholder is rejected whenever `ENVIRONMENT` is not development or testing (staging included). `main`: rejected only when `ENVIRONMENT=production` |
| `SENTRY_DSN` | `""` | optional; empty disables Sentry |
| `JWT_ALGORITHM` | `HS256` | — |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 30 | — |
| `REFRESH_TOKEN_EXPIRE_DAYS` | 30 | — |
| `CORS_ORIGINS` | `["*"]` | parsed from JSON or comma-separated values; production still permits `*` until real browser/admin origins are configured |
| `RATE_LIMIT_PER_MINUTE` / `_BURST` | 60 / 10 | defined in `config.py` but not read by the limiter; the per-route limits are set in code (see §8) |
| `MAIL_USERNAME` / `MAIL_PASSWORD` | `""` | `MAIL_PASSWORD` is **required for verification emails** and is used as the Brevo HTTP API key; `MAIL_USERNAME` is legacy/unused by the current send path |
| `MAIL_FROM` | `noreply@carekosh.com` | — |
| `MAIL_SERVER` | `sandbox.smtp.mailtrap.io` | legacy SMTP-era key; current production send path uses Brevo HTTP API |
| `MAIL_PORT` | 587 | — |
| `MAIL_STARTTLS` / `_SSL_TLS` | True / False | — |
| `FRONTEND_URL` | empty, which the validator turns into `http://127.0.0.1:8000/api/v1/auth` outside production | **required in production** (used in verification, password-reset and account-deletion emails); `render.yaml` sets `https://api.carekosh.com/api/v1/auth` |
| `EMAIL_VERIFICATION_EXPIRY_HOURS` | 24 | — |
| `PASSWORD_RESET_EXPIRY_HOURS` | 1 | — |
| `REQUIRE_EMAIL_VERIFICATION` | False | enforced only when `MAIL_PASSWORD` is also set. `render.yaml` sets `true` for production; the staging value is a dashboard setting (NOT VERIFIED) |
| `AI_ENABLED`, `AI_DATA_CONTROLS_REVIEWED`, `GROQ_API_KEY`, `AI_TRANSCRIBE_ENABLED`, `AI_SPEECH_ENABLED`, … (feature branch) | all off / empty | AI routes refuse consent and model calls until these are set (withdrawing consent always works and writes a row); limits default to 50 requests per user per day, 500 globally, concurrency 4 (1 per user), and the credit budget allows at most 20 interpretations per user per day; days reset at 00:00 UTC. `render.yaml` sets none of them. Full list: `.env.example` and [docs/VOICE_AGENT_SETUP.md](docs/VOICE_AGENT_SETUP.md) |

Validators live in `config.py`. `SECRET_KEY` must be at least 32 characters; the public placeholder is refused whenever `ENVIRONMENT` is not development or testing on the feature branch, and only in production on `main`. An empty `FRONTEND_URL` is refused when `ENVIRONMENT=production`. They do not reject `CORS_ORIGINS=["*"]` today; tightening CORS remains decision-blocked because the real browser/admin origins are not decided yet. CORS is enforced by browsers only; it does not restrict the Android app.

### Mobile env vars (`eas.json`)

| Profile | `EXPO_PUBLIC_API_URL` | Channel | Artifact |
|---|---|---|---|
| `development` | `http://localhost:8000` | — | debug APK (needs `expo-dev-client`, not installed) |
| `preview` | `https://staging-api.carekosh.com` | `preview` | APK |
| `production` | `https://api.carekosh.com` | `production` | AAB (track: `internal`) |

---

## 6. CI/CD Pipeline

The [backend and Android workflow](.github/workflows/ci.yml) checks pull requests to main, pushes to main and manual runs. Python 3.12 and PostgreSQL 16 exercise the API. CI checks Ruff, both pytest schema modes, 65 versioned routes and 70% coverage floors on six inventory, order and Supply Review modules. Android checks TypeScript, lint, Node tests and voice module autolinking. Read the workflow for advisory jobs and the optional `build-apk` preview label.

The [web workflow](.github/workflows/carekosh-web.yml) also checks matching paths on feature branches. Production web publishing is manual through [Release CareKosh web](.github/workflows/release-carekosh-web.yml). A successful CI run and a live deployment are separate pieces of evidence.

## 7. Deployment Workflow

Start a short-lived feature branch from current main. Test locally and open a PR. Before using a merge-first workflow, confirm the production Cloudflare Git integration and the Render native auto-deploy setting. The CI hook requires both `ENABLE_RENDER_AUTO_DEPLOY=true` and `RENDER_DEPLOY_HOOK` on a main push after tests pass. Record the merged SHA and stage that candidate on the long-lived staging branch. Run the affected user journey there. Release the staged revision only after it passes. If main advances before manual web dispatch, test the newer revision first.

Use the [deployment checklist](docs/deployment/CAREKOSH_DEPLOYMENT_ATLAS.html#change-guide) for Render, Workers and Play. Record the actual Worker deployment version, live Render SHA or Android build for each affected component. Client-only and API-only changes have distinct release steps.

## 8. API Endpoints

Base URL: `https://api.carekosh.com/api/v1` (prod) · `https://staging-api.carekosh.com/api/v1` (staging)

The November inventory contains 65 versioned operations plus GET /, /health and /live. The tables below introduce the main resource groups. Use the [complete API inventory](docs/API_TRACEABILITY.md) for web auth, AI, credentials and Supply Review.

### Auth (`/auth`)

Hosted deployments use a shared Redis store for rate limits. See [rate limiter](vitaltrack-backend/app/utils/rate_limiter.py) for storage behavior and retry headers.

| Method | Path | Rate limit | Notes |
|---|---|---|---|
| POST | `/register` | 3/hr | email required (`example.com` works in tests; `.test`/`.local` domains are rejected); a username must already be lower case (upper case → 422); returns 201 with tokens; sends the verification email in the background only when `MAIL_PASSWORD` is set |
| POST | `/login` | 5/min | returns access + refresh |
| GET | `/verify-email` | — | HTML response for email link click (`?token=`); single use |
| GET | `/verify-email/{token}` | — | JSON response (API usage); single use |
| POST | `/resend-verification` | 3/hr | uniform response (no enumeration); 503 if email is not configured |
| POST | `/forgot-password` | 3/hr | sends reset email (link valid 1 hour); 503 if email is not configured |
| GET | `/reset-password` | — | HTML form |
| POST | `/reset-password` | 5/hr | on success revokes all refresh tokens; on the feature branch it also bumps `session_version`, so existing access tokens stop working at once |
| POST | `/refresh` | — | token rotation — old refresh revoked; replaying a used refresh token gets 401; each refresh issues a fresh 30-day token (sliding session) |
| POST | `/logout` | — | needs the access token and the refresh token in the body; revokes that refresh token. The access token stays valid until it expires (≤ 30 min) |
| GET | `/me` | — | current user profile |
| PATCH | `/me` | — | update name, username, phone; `null` values are ignored, but `"phone": ""` clears the phone. An email change through this route is refused. The app's Profile screen sends only name and username |
| **DELETE** | `/me` | — | **request account deletion**, sends confirmation email (link valid 24 h); needs an email on the account (400) and email configured (503) |
| GET | `/confirm-delete/{token}` | — | HTML confirmation page only |
| POST | `/confirm-delete/{token}` | — | final account deletion after form submit |
| POST | `/cancel-delete` | — | cancel a pending deletion request (the app has no button for this; call the API) |
| POST | `/change-password` | — | revokes all refresh tokens (feature branch: also bumps `session_version`); no rate limit and no notification email; the app has no screen for this today |
| GET | `/email-service-status` | — | authenticated diagnostic; raw provider errors masked |

### Items (`/items`)

| Method | Path | Notes |
|---|---|---|
| GET | `/items` | pagination (`page`, `pageSize` 1–100, default 50; offset pages are not a snapshot) + filters (inactive items are included unless `isActive` is sent): `categoryId`, `isActive`, `isCritical`, `lowStockOnly`, `outOfStockOnly`, `search` |
| GET | `/items/stats` | aggregate counts; `pendingOrdersCount` counts orders in `pending` or `received` only. The app does not call this route: its dashboard counts are computed on the phone with its own rules |
| GET | `/items/needs-attention` | active items that are out of stock (quantity ≤ 0) or low (quantity < minimum stock); expiry dates are not checked. Not called by the current app |
| GET | `/items/{id}` | not called by the current app (it reads items from the list cache) |
| POST | `/items` | create; duplicate name (case-insensitive) → 409 |
| PUT | `/items/{id}` | update, **`version` required; OCC returns 409 `{server_version, server_quantity}` on conflict**. This is the only way the app changes a quantity by hand (Edit Item form) |
| PATCH | `/items/{id}/stock` | absolute quantity `{quantity, version}`, OCC-checked. The current app has no stock +/- control and does not call this route |
| DELETE | `/items/{id}` | no version check |

### Orders (`/orders`)

| Method | Path | Notes |
|---|---|---|
| GET | `/orders` | pagination (default 20, max 100) + status filter |
| GET | `/orders/{id}` | accepts the UUID or the public `ORD-YYYYMMDD-NNNN` id |
| POST | `/orders` | create; the server computes totals and the order number. `orderId` is required (422 if missing) but ignored. a retry with the same `localId` and matching stored fields returns 200 with the existing order. Conflicting fields return 409 |
| PATCH | `/orders/{id}/status` | status flow: `pending → ordered / received / declined`; `ordered → partially_received / received / declined`; `partially_received → received / declined`; `received → declined` before apply |
| POST | `/orders/{id}/apply` | apply a received order to stock. Repeating a successful apply returns the saved order without another stock increase |
| DELETE | `/orders/{id}` | only `pending` / `declined` |

`stock_updated` is reached only by `POST /orders/{id}/apply`; clients should not PATCH directly to that status.

For a worked example of a receipt, stock application and retry, see the [API testing guide](vitaltrack-backend/API_TESTING_GUIDE.md).

### Categories (`/categories`)

| Method | Path | Notes |
|---|---|---|
| GET | `/categories` | ordered by `display_order` |
| POST | `/categories` | create; duplicate name (case-insensitive) → 409; the body is snake_case only (`display_order`, `is_default`; camelCase keys are ignored) |
| GET | `/categories/with-counts` | includes item count |
| GET/PUT/DELETE | `/categories/{id}` | PUT ignores `null` fields; DELETE cascades items (order lines keep their snapshots) |

`is_default` is a flag on each category; deleting a default category returns 409, while custom category deletion remains user-scoped.

### Activity (`/activities`)

| Method | Path | Notes |
|---|---|---|
| GET | `/activities` | `limit` param (default 50, max 200; the dashboard asks for 20); returns `action`, `itemName`, `itemId`, `details`, `orderId`, `timestamp` (camelCase); `total` is the number of rows returned |

### AI assistant (`/ai`) — feature branch only

| Method | Path | Notes |
|---|---|---|
| GET | `/ai/capabilities` | which AI features the server allows, plus the user's consent state; reads only |
| PUT | `/ai/consent` | store or revoke consent (version `voice-2026-10-06`, scopes such as `groq_text`); accepting returns 503 while `AI_ENABLED` is false |
| POST | `/ai/interpret` | Groq text understanding of the typed or transcribed question only (no inventory, no audio). Needs `AI_ENABLED`, `AI_DATA_CONTROLS_REVIEWED`, `GROQ_API_KEY`, consent scope `groq_text` and (in the app) the per-device switch; provider timeout or network error → 504, other provider errors → 502, limits → 429; per-user and global daily limits, global concurrency 4 |
| POST | `/ai/transcribe` | optional Groq Whisper speech-to-text after separate `groq_audio` consent, fresh local `audioOptIn` and enabled server transcription capability; invoked after Stop. `CLOUD_TRANSCRIPTION_ENABLED=true`; optional Sarvam narration has a separate flag, consent and `/ai/speak` path |
| POST | `/ai/speak` | cloud speech; unreachable from this app build and off unless extra flags are set |

AI routes need a Bearer token (401 before any body is read). Request bodies are capped at 12,000 bytes for the JSON routes and 900,000 bytes for `/ai/transcribe`. These routes write only `ai_consents` and `ai_usage`, never inventory or orders. Setup: [docs/VOICE_AGENT_SETUP.md](docs/VOICE_AGENT_SETUP.md).

### Removed legacy `/sync`

No `/api/v1/sync/*` routes are mounted. The old offline-first sync module was removed after the mobile app became server-first. See §1.

---

## 9. Database Schema

### Migrations (in order)

| # | File | Summary |
|---|---|---|
| 1 | `20260117_000000_initial.py` | `users`, `categories`, `items`, `orders`, `order_items`, `refresh_tokens`, `activity_logs` |
| 2 | `20260124_add_username.py` | `users.username` (unique, nullable) |
| 3 | `20260125_add_email_verification.py` | `users.is_email_verified`, `email_verification_token`, `email_verification_expiry` |
| 4 | `20260406_add_version_audit_log_quantity_check.py` | `items.version` (OCC), new `audit_log` table, CHECK constraint `items.quantity >= 0` |
| 5 | `20260419_add_account_deletion_token_fields.py` | `users.deletion_token`, `deletion_token_expires` |
| 6 | `20260623_order_item_quantity_positive.py` (`0006_order_item_qty_positive`) | CHECK `order_items.quantity > 0` — last migration on `main` |
| 7 | `20260923_session_order_safety.py` (`0007_session_order_safety`) | feature branch: `users.session_version`, `order_number_counters` table (seeded from existing order ids), token-digest indexes. **`downgrade()` raises on purpose — one-way** |
| 8 | `20260924_ai_consent_usage.py` (`0008_ai_consent_usage`) | feature branch: `ai_consents`, `ai_usage` tables |
| 9 | `20261006_ai_provider_scopes.py` (`0009_ai_provider_scopes`) | feature branch: `ai_consents.scopes`, `ai_usage.provider` |
| 10 | `20261006_order_local_id_unique.py` (`0010_order_local_id_unique`) | feature branch: partial unique index on `orders (user_id, local_id)`; locks `orders` against writes (`SHARE`) until the whole migration transaction commits; keeps any older duplicates |

Head: `0010_order_local_id_unique` on the feature branch, `0006_order_item_qty_positive` on `main`. Upgrading an empty PostgreSQL 16 database to `0010` succeeded locally on 7 and 8 Oct 2026. At head there are 11 application tables plus `alembic_version`: `users`, `refresh_tokens`, `categories`, `items`, `orders`, `order_items`, `order_number_counters`, `activity_logs`, `audit_log`, `ai_consents`, `ai_usage`. Primary keys are 36-character UUID strings generated in Python (not the PostgreSQL `uuid` type), except the natural keys `order_number_counters.day` and `ai_consents.user_id`. Status and action enums are stored as plain text holding the upper-case enum names (for example `STOCK_UPDATED`), while the API returns lower-case values; use the upper-case names in raw SQL.

### Cascade-on-user-delete audit (PR #13, updated 7 Oct 2026)

| Child table | FK `ondelete` | ORM cascade |
|---|---|---|
| `categories` | CASCADE | `all, delete-orphan` |
| `items` | CASCADE | `all, delete-orphan` |
| `orders` | CASCADE | `all, delete-orphan` |
| `order_items` | via `orders.id` CASCADE | handled by Order |
| `activity_logs` | CASCADE | `all, delete-orphan` |
| `refresh_tokens` | CASCADE | `all, delete-orphan` |
| `audit_log` | CASCADE | DB-level only, no ORM relationship on User |
| `ai_consents`, `ai_usage` (feature branch) | CASCADE | DB-level only, no ORM relationship on User |
| `order_number_counters` (feature branch) | no user link | kept after account deletion, so order numbers are never reused |

Earlier wording said ORM cascades were set "on every user-owned table"; that is not true for `audit_log` and the AI tables. On the feature branch the account-deletion handler loads the user without its collections (`noload`) and deletes the row, so PostgreSQL's `ON DELETE CASCADE` removes the child rows; on `main` the ORM relationships load and delete the children first, and the database cascade covers the rest. Deleting a user leaves no orphaned user-owned rows; `order_number_counters` are not user-owned.

The `main` comparison was checked locally on 8 October 2026 at `835fad3`: its profile handler permits an email change without resetting verification, and its deletion-token lookup loads the model's `selectin` collections before ORM deletion. These are source-code facts about that revision, not proof of what a live service runs.

---

## 10. Auth System

**Token model:** short-lived access JWT (30 min, HS256) + long-lived refresh token (30 days) stored in `refresh_tokens` table. Refresh tokens rotate on every `/auth/refresh` — the old token is revoked server-side. Replaying a used refresh token returns 401, but the newer token is not revoked (no reuse detection). On the feature branch both tokens also carry `session_version`; every authenticated request compares it with `users.session_version`. Logout revokes only the refresh token; the access token keeps working until it expires (≤ 30 min). On the phone, tokens are stored in SecureStore.

**Password hashing:** Argon2 (via `passlib[argon2]`), with `bcrypt` as a fallback verifier for legacy hashes.

**Session revocation events** (all refresh tokens invalidated for the user; on the feature branch `session_version` is also increased, so existing access tokens stop working at once):
- `POST /auth/change-password`
- `POST /auth/reset-password`
- `POST /auth/confirm-delete/{token}` (when deletion completes, the user row and its tokens are deleted)

**Cache isolation on auth transitions (PR #16):** Both `logout()` and successful `login()` clear the TanStack Query cache from memory (`queryClient.clear()`) and from disk (`AsyncStorage.removeItem('carekosh-query-cache')`). This is belt-and-suspenders for shared family devices — if logout's clear failed (crash, force-quit), login starts fresh anyway. An `isColdStart` flag on `useAuthStore` is set when `ApiClientError.status` is `0 / 502 / 503 / 504` and drives the login screen's auto-retry loop (health-check every 5 s, max 12 attempts, cancellable). 401 / 403 never trigger retry.

**Email verification** (PR #12 hardening):
- Registration requires email (username alone is no longer accepted).
- If `REQUIRE_EMAIL_VERIFICATION=True` **and** `MAIL_PASSWORD` is set, unverified users get 403 `EMAIL_NOT_VERIFIED` at login. On the feature branch the same check also runs at refresh and on every authenticated request. With `MAIL_PASSWORD` empty the flag is not enforced.
- `/auth/resend-verification` returns a uniform response regardless of account state (no user enumeration); it returns 503 when email is not configured.
- Verification and reset links are single use. The server stores only a SHA-256 digest of each emailed token.

**Account deletion** (PR #13, Play Store compliance):
1. Authenticated user calls `DELETE /auth/me` (the account must have an email, and email must be configured).
2. Server generates a random token, stores its SHA-256 digest in `deletion_token`, writes `deletion_token_expires` = now + 24 h, and emails the confirmation link (`FRONTEND_URL/confirm-delete/<token>`).
3. User clicks link → `GET /auth/confirm-delete/{token}` renders an HTML confirmation page only.
4. User submits the form → `POST /auth/confirm-delete/{token}` → the user row is deleted and PostgreSQL cascades remove the user's rows (see §9). HTML success page rendered.
5. Alternative: `POST /auth/cancel-delete` while logged in aborts the request. The app has no button for this; use the API.

Mobile surfaces this in `app/profile.tsx`, opened from the top-right profile button's bottom-sheet menu. The screen lets users edit Name/Username via `PATCH /auth/me` (there is no phone field), keeps email read-only, and requests deletion through a native confirmation alert. While the Profile screen stays open after a deletion request, it polls `GET /auth/me` every 5 s. The app has no change-password screen.

---

## 11. Troubleshooting

**Render cold starts (~30s)**
Earlier (from March 2026, per the comment in `ci.yml`): the backend ran on Render's free tier, which sleeps after about 15 minutes idle, so the first request could take ~30 s or more. Current `render.yaml` (production service) declares plan `starter`, a paid always-on plan, with a comment that it removes free-tier spin-down. The live plan of each service, including staging, is NOT VERIFIED. If a service is on the free plan, use `/health` to warm it before demos. The login screen detects cold starts (`ApiClientError.status === 0 | 502 | 503 | 504`) and auto-retries `/health` every 5 s (up to 12 attempts) until the server wakes — no dead "Sign In" button during the wait. Ordinary API requests now have one 90 s overall deadline, including response parsing and shared-refresh/retry waits. Shorter bounds remain on refresh, startup checks, health probes and assistant calls. A timeout does not prove a write was rolled back.

**Dashboard shows stale data briefly on app launch**
Expected behavior from PR #16 cache persistence. The previous session's data displays instantly while TanStack Query refetches in the background; `staleTime` (30 s) marks data stale; a refetch trigger and successful network request are still required. If this is unwanted, set `ENABLE_CACHE_PERSISTENCE = false` in `providers/QueryProvider.tsx` (requires a new release build for installed apps).

**Cache not clearing on logout**
Check that both `queryClient.clear()` (memory) and `AsyncStorage.removeItem('carekosh-query-cache')` (disk) are called in the logout flow in `store/useAuthStore.ts`. Without both, data can linger on shared family devices until the next successful login's clear runs. The persisted cache is also discarded when `Constants.expoConfig.version` (the `buster`) changes, so bumping the app version is a nuclear option.

**Container keeps printing "waiting for database"**
- Production image (`docker-entrypoint.sh`): uses `DATABASE_HOST`/`DATABASE_PORT`, or parses them from `DATABASE_URL` with `sed`. If the URL has no explicit port (common for Neon), the parse falls back to `localhost:5432`, so `pg_isready` waits the full 30 × 2 s and then continues with a warning. `alembic upgrade head` then connects with the real `DATABASE_URL`; if that fails the container exits. It never waits forever.
- Dev image (`Dockerfile.dev`): loops on `pg_isready` against `DATABASE_HOST`/`DATABASE_PORT` (`db:5432` in `docker-compose.dev.yml`) with no time limit. Check that the `db` container is healthy.
- Earlier advice blamed an unescaped `@` in the password for the parse. The `sed` pattern takes the last `@`, so that is not the cause. The separate Alembic percent-encoding defect A-27 is fixed locally on 8 Oct 2026. URL-encode reserved password characters normally; percent signs are escaped for ConfigParser, which returns the original URL. This does not fix the entrypoint's missing-port host fallback.

**Alembic: "Can't locate revision"**
Your local DB is at a revision the checked-out code does not know. The common case now: the database was upgraded on the feature branch (`0007`–`0010`) and you switched to `main`, which stops at `0006`. `0007` cannot be downgraded, so reset the local dev volume and let the entrypoint re-create it:
```bash
docker compose -f docker-compose.dev.yml down -v      # dev stack: DELETES volume postgres_data_dev and all local data
docker compose -f docker-compose.dev.yml up --build
# or, for the production-like stack: docker compose down -v && docker compose up --build
```
Never do this on staging/prod; restore from a backup there instead.

**"Branch is 2 commits behind main"**
Normal when other pull requests merged into `main` after you branched (Render does not add commits to the repository). Rebase only if you have conflicts, not because GitHub shows a count.

**409 Conflict on item update**
OCC working as designed. Another client updated the item since your copy was loaded. The response body includes `server_version` and `server_quantity`. The updated item mutation shows the server's message and invalidates affected active queries so they refetch. Retry retains the same stale version and can get 409 again. Reopen the editor after the refetch, review current values and save again. Help & Support → "Refresh from server" remains available. Known application issues of this kind are listed in [docs/API_TRACEABILITY.md](docs/API_TRACEABILITY.md).

**Expo Go can't reach `localhost:8000`**
Expo Go runs on your phone; `localhost` there = the phone. Either `adb reverse tcp:8000 tcp:8000` (USB) or point `EXPO_PUBLIC_API_URL` at your machine's LAN IP (`http://10.0.2.2:8000` in the Android emulator).

**"Email not received" in dev**
The current email utility sends through Brevo HTTP API when `MAIL_PASSWORD` is configured; it does not route to Mailtrap SMTP. For local real-email testing, set a Brevo API key and verified `MAIL_FROM`. Otherwise leave `MAIL_PASSWORD` empty: no email is sent, and email verification is not enforced even though `docker-compose.dev.yml` sets `REQUIRE_EMAIL_VERIFICATION=true`. Forgot-password, resend-verification and account deletion return 503 in that state.

**CI `pr-check` missing or skipped**
`pr-check` runs only on pull requests and only after both `test-backend` and `test-frontend` succeed; if either fails or is cancelled, `pr-check` is skipped. `ci.yml` has no path filters, so both test jobs run on every PR. Re-run failed jobs from the Actions tab. (Earlier text suggested path filters could skip jobs; there are none.)

---

## 12. Contribution Workflow

### Branch naming

| Prefix | Purpose |
|---|---|
| `feature/` | new feature |
| `fix/` | bug fix |
| `hotfix/` | urgent prod fix |
| `docs/` | documentation |
| `refactor/` | refactor |
| `test/` | test-only |
| `chore/` | maintenance |

lowercase, hyphen-separated, short and descriptive.

### Commit convention

[Conventional Commits](https://www.conventionalcommits.org/):
```
<type>(<scope>): <description>
```
e.g. `feat(auth): add biometric login`, `fix(items): handle negative quantity edge case`.

### PR requirements

- CI green (`test-backend`, `test-frontend`, `pr-check`); advisory mypy/Trivy reviewed and not treated as clean until their baselines are fixed
- At least one code-owner approval (team rule; `.github/CODEOWNERS` exists)
- Rebased on latest `main` (no merge conflicts)
- Add `build-apk` label to generate a preview APK for reviewers

What GitHub enforces (API, 7 Oct 2026): the `protect-main` ruleset requires a pull request, blocks force-push and branch deletion, requires 0 approvals and no status checks. The first two bullets above are therefore team discipline, not technical gates.

Merge → CI/Render deploys the backend according to the configured hook and Render auto-deploy settings (live settings NOT VERIFIED). Mobile production AAB is built manually (`eas build --profile production`).

---

*For product roadmap and PR history, see [CAREKOSH_ROADMAP.md](CAREKOSH_ROADMAP.md).*
