# CareKosh Developer Guide

> Home ICU medical inventory management app for family caregivers.
> Single source of truth for architecture, setup, workflow, and operations.

**Repo layout:** `vitaltrack-backend/` (FastAPI) · `vitaltrack-mobile/` (React Native + Expo) · `docs/` (removed — see this file instead)

> The `vitaltrack-*` directory names are legacy from the pre-rebrand period. The product name is **CareKosh**. Do not rename the directories — Render service paths, EAS config, and git history depend on them.

---

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

CareKosh is **server-first**. The mobile app treats the backend as the source of truth and renders whatever the server returns. There is no offline queue, no sync reconciliation, and no local persistence of business data.

### Server-first, not offline-first

```
┌──────────────────┐       HTTPS / JSON       ┌────────────────────┐
│  Mobile (Expo)   │ ◄───────────────────────►│   FastAPI backend  │
│                  │                          │                    │
│  TanStack Query  │  ── GET /items ──────►   │  /auth, /items,    │
│  (server cache)  │  ◄── 200 + rows ──       │  /orders, /cats,   │
│                  │                          │  /activities       │
│  Zustand         │  ── PATCH /stock ────►   │                    │
│  (UI state only) │  ◄── 200 / 409 ──        │  SQLAlchemy async  │
│                  │                          │   ▼                │
│  SecureStore     │                          │  PostgreSQL (Neon) │
│  (auth tokens)   │                          └────────────────────┘
└──────────────────┘
```

**Why server-first:** Medical inventory must reflect truth across caregivers and devices. Offline editing creates merge conflicts on life-critical stock counts. Server-first eliminates the conflict class entirely. Optimistic concurrency (`version` column on `items`, HTTP 409 on stale updates) handles the single remaining race: two caregivers editing the same item at the same instant.

**What this means in practice:**
- Mobile needs network for any write. The app surfaces errors explicitly rather than queuing.
- `@tanstack/react-query` handles caching, revalidation, and optimistic UI. No `redux-persist`, no AsyncStorage-based persistence of domain data.
- `zustand` holds **UI state only** (current modal, initialized flag). `store/useAppStore.ts` is intentionally ~61 lines.
- Auth tokens live in `expo-secure-store` (hardware-backed keystore on Android), not AsyncStorage.

### Legacy sync endpoints

`vitaltrack-backend/app/api/v1/sync.py` still exposes `/sync/push`, `/sync/pull`, `/sync/full` from the offline-first era. **The mobile app no longer calls these endpoints** — they were dropped when the mobile `sync.ts` / `useSyncStore` were deleted in the server-first migration (PR #8, `refactor/server-first-architecture`). The backend module remains for backward compatibility and as a potential future re-sync mechanism. Do not build new features against it.

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Mobile runtime | React Native + Expo SDK 54 | `expo-router` v6 (file-based) |
| Mobile language | TypeScript 5 | strict mode |
| Server state | `@tanstack/react-query` ^5.60 | all API calls |
| UI state | `zustand` ^4.5 | UI-only, no persistence |
| Secure storage | `expo-secure-store` | refresh + access tokens |
| Backend runtime | Python 3.12 + FastAPI 0.115 | `gunicorn` + `uvicorn.workers.UvicornWorker`, 4 workers |
| ORM | SQLAlchemy 2.0 (async) + `asyncpg` | |
| Migrations | Alembic 1.14 | auto-run at container start |
| Database | PostgreSQL 16 | Neon (managed, branchable) |
| Auth | JWT (HS256) + refresh token rotation | `python-jose`, `passlib[argon2]`, `bcrypt` |
| Rate limiting | `slowapi` | per-route limits on auth |
| Email | `fastapi-mail` + `aiosmtplib` | Mailtrap (dev), Brevo (staging/prod) |
| Hosting (backend) | **Render** | Docker web service, auto-deploy on push to `main` |
| Hosting (DB) | **Neon** | separate branches for dev / staging / production |
| Hosting (mobile) | **EAS Build** | profiles: `development`, `preview`, `production` |
| CI | GitHub Actions | pytest, ruff, mypy, TypeScript, ESLint, expo-doctor, Trivy |
| Security scan | Trivy | severity CRITICAL, HIGH |

**Not used (despite what older docs claimed):** Railway, redux-persist, AsyncStorage for app data, offline sync queue, manual migration scripts.

---

## 3. Project Structure

```
vitaltrack/
├── .github/workflows/ci.yml          # 7 jobs: backend/frontend tests, trivy, pr-check, deploy, preview APK, prod AAB (disabled)
├── vitaltrack-backend/
│   ├── Dockerfile                    # multi-stage (builder → python:3.12-slim runtime, non-root user)
│   ├── docker-entrypoint.sh          # waits for DB (pg_isready × 30), runs alembic upgrade head, execs CMD
│   ├── requirements.txt              # 23 deps
│   ├── alembic/versions/             # 5 migrations (see §9)
│   └── app/
│       ├── core/
│       │   ├── config.py             # pydantic-settings, production validators
│       │   ├── security.py           # JWT encode/decode, password hashing
│       │   └── database.py           # async engine, session factory
│       ├── models/                   # SQLAlchemy models: User, Category, Item, Order, OrderItem, ActivityLog, AuditLog, RefreshToken
│       ├── schemas/                  # Pydantic I/O schemas
│       └── api/v1/
│           ├── auth.py               # 18 endpoints incl. account deletion
│           ├── items.py              # CRUD + OCC (version field, 409 on conflict)
│           ├── orders.py             # CRUD + POST /{id}/apply
│           ├── categories.py         # CRUD + /with-counts
│           ├── activity.py           # read-only activity log
│           └── sync.py               # LEGACY — unused by mobile, kept for backward compat
└── vitaltrack-mobile/
    ├── app.json / eas.json           # 3 EAS profiles: development, preview, production
    ├── package.json
    └── app/                          # expo-router file-based routing
        ├── _layout.tsx               # root Stack: (auth), (tabs), item/[id], order/create, builder, profile
        ├── (auth)/                   # login, register, forgot-password, reset-password, verify-email-pending
        ├── (tabs)/                   # dashboard (index), inventory, orders
        ├── item/[id].tsx             # item detail modal
        ├── order/create.tsx          # new order modal
        ├── builder.tsx               # bulk inventory seed modal
        └── profile.tsx               # account info + delete account + change password
    ├── store/
    │   ├── useAuthStore.ts           # 385 lines — auth state, tokens in SecureStore
    │   └── useAppStore.ts            # 61 lines — UI-only (isInitialized)
    ├── services/
    │   ├── api.ts                    # fetch-based HTTP client with token injection
    │   └── auth.ts                   # register/login/logout/requestAccountDeletion/cancelAccountDeletion
    ├── hooks/
    │   ├── useServerData.ts          # TanStack Query hooks (reads)
    │   ├── useServerMutations.ts     # TanStack mutation hooks (writes)
    │   ├── useNetworkStatus.ts
    │   └── useSeedInventory.ts
    └── components/                   # UI components
```

---

## 4. Local Development Setup

### Prerequisites

- Docker Desktop (running)
- Node.js 20+
- Python 3.12 (only if you want to run backend without Docker)
- Expo Go app on your phone (iOS or Android)

### One-shot setup

```bash
git clone https://github.com/rishabhrd09/vitaltrack.git && cd vitaltrack
./setup-local-dev.sh          # macOS/Linux
# or
setup-local-dev.bat           # Windows
```

### Backend

```bash
cd vitaltrack-backend
cp .env.example .env          # edit SECRET_KEY etc.
docker compose -f docker-compose.dev.yml up --build -d
docker compose logs -f api    # confirm "Uvicorn running on http://0.0.0.0:8000"
```

The entrypoint runs `alembic upgrade head` automatically — you do not run migrations manually.

**Health check:** `curl http://localhost:8000/health` → `{"status": "healthy"}`

### Mobile

```bash
cd vitaltrack-mobile
npm install --legacy-peer-deps
npx expo start --clear
```

Scan the QR code with Expo Go. Default `EXPO_PUBLIC_API_URL` points at `http://localhost:8000`.

**Phone on same network not reaching localhost?** Use `adb reverse tcp:8000 tcp:8000` (USB) or set `EXPO_PUBLIC_API_URL` to your machine's LAN IP.

---

## 5. Environment Configuration

### Backend env vars (`vitaltrack-backend/app/core/config.py`)

| Var | Default | Prod requirement |
|---|---|---|
| `APP_NAME` | `CareKosh API` | — |
| `APP_VERSION` | `1.0.0` | — |
| `ENVIRONMENT` | `development` | `production` |
| `DEBUG` | `False` | `False` |
| `HOST` / `PORT` | `0.0.0.0` / `8000` | set by Render |
| `DATABASE_URL` | local postgres | Neon async URL; validator auto-converts `postgresql://` → `postgresql+asyncpg://` and strips query params |
| `DATABASE_POOL_SIZE` / `_MAX_OVERFLOW` / `_POOL_TIMEOUT` | 5 / 10 / 30 | tune for Render |
| `SECRET_KEY` | — | **required**, min 32 chars, rejected if matches `CHANGE-THIS-...` placeholder |
| `JWT_ALGORITHM` | `HS256` | — |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 30 | — |
| `REFRESH_TOKEN_EXPIRE_DAYS` | 30 | — |
| `CORS_ORIGINS` | `["*"]` | comma-separated list; **never `*` in prod** |
| `RATE_LIMIT_PER_MINUTE` / `_BURST` | 60 / 10 | — |
| `MAIL_USERNAME` / `MAIL_PASSWORD` | `""` | **required for verification emails** |
| `MAIL_FROM` | `noreply@carekosh.com` | — |
| `MAIL_SERVER` | `sandbox.smtp.mailtrap.io` | Brevo SMTP in prod |
| `MAIL_PORT` | 587 | — |
| `MAIL_STARTTLS` / `_SSL_TLS` | True / False | — |
| `FRONTEND_URL` | `""` | **required in production** (used in verification & password-reset emails) |
| `EMAIL_VERIFICATION_EXPIRY_HOURS` | 24 | — |
| `PASSWORD_RESET_EXPIRY_HOURS` | 1 | — |
| `REQUIRE_EMAIL_VERIFICATION` | False | `True` in prod |

Production validators live in `config.py` — they refuse startup if `SECRET_KEY` is the placeholder, if `CORS_ORIGINS` is `*`, or if `FRONTEND_URL` is empty.

### Mobile env vars (`eas.json`)

| Profile | `EXPO_PUBLIC_API_URL` | Channel | Artifact |
|---|---|---|---|
| `development` | `http://localhost:8000` | — | APK |
| `preview` | `https://vitaltrack-api-staging.onrender.com` | `preview` | APK |
| `production` | `https://vitaltrack-api.onrender.com` | `production` | AAB (track: `internal`) |

---

## 6. CI/CD Pipeline

**File:** `.github/workflows/ci.yml`
**Triggers:** `pull_request [main]`, `push [main]`, `workflow_dispatch`

| Job | Runs on | Purpose |
|---|---|---|
| `test-backend` | PR + push | pytest (postgres:16 service), ruff lint, mypy |
| `test-frontend` | PR + push | TypeScript typecheck, ESLint, `expo-doctor` |
| `security-scan` | PR + push | Trivy filesystem scan, severity CRITICAL + HIGH |
| `pr-check` | PR only | merge gate — requires `test-backend` + `test-frontend` to pass |
| `deploy-backend` | push to `main` | POST to Render deploy hook (secret `RENDER_DEPLOY_HOOK`) |
| `build-preview` | PR only, label `build-apk` | EAS preview APK build |
| `build-production` | push to `main` | **disabled** (`if: false`) — enable when ready to ship AAB from CI |

**Label-based APK:** add the `build-apk` label to a PR and CI will run `eas build --profile preview` so reviewers can install a binary.

---

## 7. Deployment Workflow

```
┌────────────────────────────────────────────────────────────────────┐
│  developer                                                          │
│    │                                                                │
│    ├── git checkout -b feature/xyz                                 │
│    ├── commit + push                                                │
│    └── open PR → main                                               │
│                    │                                                │
│                    ▼                                                │
│  CI: test-backend + test-frontend + security-scan + pr-check       │
│                    │ (green)                                        │
│                    ▼                                                │
│  reviewer approves → merge to main                                  │
│                    │                                                │
│                    ▼                                                │
│  deploy-backend job → Render deploy hook fires                     │
│                    │                                                │
│                    ▼                                                │
│  Render: pull image → `docker-entrypoint.sh`                       │
│          ├── parse DATABASE_URL                                     │
│          ├── pg_isready (up to 60s)                                 │
│          ├── alembic upgrade head                                   │
│          └── gunicorn start                                         │
└────────────────────────────────────────────────────────────────────┘
```

**Mobile releases** are manual today:

```bash
cd vitaltrack-mobile
eas build --profile production --platform android
eas submit --profile production --platform android    # uploads AAB to Play Console internal track
```

---

## 8. API Endpoints

Base URL: `https://vitaltrack-api.onrender.com/api/v1` (prod) · `https://vitaltrack-api-staging.onrender.com/api/v1` (staging)

### Auth (`/auth`)

| Method | Path | Rate limit | Notes |
|---|---|---|---|
| POST | `/register` | 3/hr | email required, sends verification |
| POST | `/login` | 5/min | returns access + refresh |
| GET | `/verify-email` | — | HTML response for email link click |
| GET | `/verify-email/{token}` | — | JSON response (API usage) |
| POST | `/resend-verification` | 3/hr | uniform response (no enumeration) |
| POST | `/forgot-password` | 3/hr | sends reset email |
| GET | `/reset-password` | — | HTML form |
| POST | `/reset-password` | 5/hr | invalidates all refresh tokens on success |
| POST | `/refresh` | — | token rotation — old refresh revoked |
| POST | `/logout` | — | revokes refresh token |
| GET | `/me` | — | current user profile |
| PATCH | `/me` | — | update profile |
| **DELETE** | `/me` | — | **request account deletion**, sends confirmation email |
| GET | `/confirm-delete/{token}` | — | HTML confirmation page, executes deletion |
| POST | `/cancel-delete` | — | cancel a pending deletion request |
| POST | `/change-password` | — | revokes all refresh tokens |
| GET | `/email-service-status` | — | diagnostic, no auth |

### Items (`/items`)

| Method | Path | Notes |
|---|---|---|
| GET | `/items` | pagination + filters: `categoryId`, `isActive`, `isCritical`, `lowStockOnly`, `outOfStockOnly`, `search` |
| GET | `/items/stats` | aggregate counts |
| GET | `/items/needs-attention` | low / out / expired |
| GET | `/items/{id}` | — |
| POST | `/items` | create |
| PUT | `/items/{id}` | update, **OCC via `version` field, returns 409 `{server_version, server_quantity}` on conflict** |
| PATCH | `/items/{id}/stock` | quick stock change, OCC-checked |
| DELETE | `/items/{id}` | — |

### Orders (`/orders`)

| Method | Path | Notes |
|---|---|---|
| GET | `/orders` | pagination + status filter |
| GET | `/orders/{id}` | — |
| POST | `/orders` | create |
| PATCH | `/orders/{id}/status` | status flow: `pending → ordered/declined → received → stock_updated` |
| POST | `/orders/{id}/apply` | apply a `received` order to inventory stock |
| DELETE | `/orders/{id}` | only `pending` / `declined` |

### Categories (`/categories`)

| Method | Path | Notes |
|---|---|---|
| GET | `/categories` | ordered by `display_order` |
| GET | `/categories/with-counts` | includes item count |
| GET/POST/PUT/DELETE | `/categories/{id}` | DELETE cascades items |

`is_default` is a flag on each category; protection of default categories from deletion is **enforced client-side**, not on the backend.

### Activity (`/activities`)

| Method | Path | Notes |
|---|---|---|
| GET | `/activities` | `limit` param (default 50, max 200); returns action, item_name, item_id, details, order_id, created_at |

### Legacy `/sync`

`/sync/push`, `/sync/pull`, `/sync/full` exist but are not called by mobile. See §1.

---

## 9. Database Schema

### Migrations (in order)

| # | File | Summary |
|---|---|---|
| 1 | `20260117_000000_initial.py` | `users`, `categories`, `items`, `orders`, `order_items`, `refresh_tokens`, `activity_logs` |
| 2 | `20260124_add_username.py` | `users.username` (unique, nullable) |
| 3 | `20260125_add_email_verification.py` | `users.is_email_verified`, `email_verification_token`, `email_verification_expiry` |
| 4 | `20260406_add_version_audit_log_quantity_check.py` | `items.version` (OCC), new `audit_logs` table, CHECK constraint `items.quantity >= 0` |
| 5 | `20260419_add_account_deletion_token_fields.py` | `users.deletion_token`, `deletion_token_expires` |

### Cascade-on-user-delete audit (PR #13)

| Child table | FK `ondelete` | ORM cascade |
|---|---|---|
| `categories` | CASCADE | `all, delete-orphan` |
| `items` | CASCADE | `all, delete-orphan` |
| `orders` | CASCADE | `all, delete-orphan` |
| `order_items` | via `orders.id` CASCADE | handled by Order |
| `activity_logs` | CASCADE | `all, delete-orphan` |
| `refresh_tokens` | CASCADE | `all, delete-orphan` |
| `audit_logs` | CASCADE | DB-level only, no ORM relationship on User |

Both DB-level `ondelete="CASCADE"` and ORM `cascade="all, delete-orphan"` are set on every user-owned table. `DELETE FROM users WHERE id = ?` leaves no orphans.

---

## 10. Auth System

**Token model:** short-lived access JWT (30 min, HS256) + long-lived refresh token (30 days) stored in `refresh_tokens` table. Refresh tokens rotate on every `/auth/refresh` — the old token is revoked server-side.

**Password hashing:** Argon2 (via `passlib[argon2]`), with `bcrypt` as a fallback verifier for legacy hashes.

**Session revocation events** (all refresh tokens invalidated for the user):
- `POST /auth/change-password`
- `POST /auth/reset-password`
- `DELETE /auth/me` (when deletion completes)

**Email verification** (PR #12 hardening):
- Registration requires email (username alone is no longer accepted).
- If `REQUIRE_EMAIL_VERIFICATION=True`, unverified users can't log in.
- `/auth/resend-verification` returns a uniform response regardless of account state (no user enumeration).

**Account deletion** (PR #13, Play Store compliance):
1. Authenticated user calls `DELETE /auth/me`.
2. Server generates `deletion_token`, writes `deletion_token_expires` = now + 24 h, emails confirmation link.
3. User clicks link → `GET /auth/confirm-delete/{token}` → `DELETE FROM users` (cascades via §9). HTML success page rendered.
4. Alternative: user calls `POST /auth/cancel-delete` while logged in to abort.

Mobile surfaces this at `app/profile.tsx` with a swipe-down dismissable popup menu.

---

## 11. Troubleshooting

**Render cold starts (~30s)**
The free Render tier sleeps after 15 min of inactivity. First request after idle takes up to 30s. Not a bug; expected. Use `/health` to warm it before demos.

**`docker-entrypoint.sh` says "waiting for database" forever**
`DATABASE_URL` parse failure. The script splits `postgresql://user:pass@host:port/db?query` manually — if you have unescaped `@` in your password, it breaks. URL-encode the password.

**Alembic: "Can't locate revision"**
Your local DB is on a stale head. Drop the dev DB volume and let the entrypoint re-create:
```bash
docker compose down -v
docker compose up --build
```
Never do this on staging/prod.

**"Branch is 2 commits behind main"**
Normal. The Render deploy merge commit shows up on `main` but not on your feature branch. Rebase only if you have conflicts, not because GitHub shows a count.

**409 Conflict on item update**
OCC working as designed. Another client updated the item since your GET. Re-fetch, merge, retry. The response body includes `server_version` and `server_quantity` for UX.

**Expo Go can't reach `localhost:8000`**
Expo Go runs on your phone; `localhost` there = the phone. Either `adb reverse tcp:8000 tcp:8000` or point `EXPO_PUBLIC_API_URL` at your machine's LAN IP.

**"Email not received" in dev**
Dev uses Mailtrap sandbox. Log in to Mailtrap and check the inbox there — emails never reach real addresses from `development` env.

**CI `pr-check` failing but tests green**
`pr-check` depends on both `test-backend` and `test-frontend`. If either is skipped (e.g., no matching paths), `pr-check` may fail. Re-run from Actions tab.

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

- CI green (`test-backend`, `test-frontend`, `security-scan`, `pr-check`)
- At least one code-owner approval
- Rebased on latest `main` (no merge conflicts)
- Add `build-apk` label to generate a preview APK for reviewers

Merge → Render auto-deploys backend. Mobile production AAB is built manually (`eas build --profile production`).

---

*For product roadmap and PR history, see [CAREKOSH_ROADMAP.md](CAREKOSH_ROADMAP.md).*
