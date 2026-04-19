# CareKosh: DevOps, Architecture & CI/CD — The Long-Form Companion

> **Scope.** This is the narrative reference: the *why* behind infrastructure decisions, how the pipeline is stitched together, and how to debug it when it breaks. For a short, operational summary, see repo-root `CAREKOSH_DEVELOPER_GUIDE.md` §1. For interactive diagrams, see `CAREKOSH_ENVIRONMENT_ARCHITECTURE.html` and `carekosh_architecture_diagrams.html` at the repo root.

CareKosh (formerly VitalTrack; rebranded in PR #10/#11) moved from Railway to Render + Neon in PR #1 `migrate/railway-to-render`. All references below describe the current state unless marked *historical*.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Technology Stack](#2-technology-stack)
3. [CI/CD Pipeline Deep Dive](#3-cicd-pipeline-deep-dive)
4. [Deployment Architecture](#4-deployment-architecture)
5. [DevOps Mental Model](#5-devops-mental-model)
6. [Setting Up Secrets](#6-setting-up-secrets)
7. [Database Architecture](#7-database-architecture)
8. [Security Considerations](#8-security-considerations)
9. [Quick Reference](#9-quick-reference)

---

## 1. System Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                          CAREKOSH ARCHITECTURE                                 │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────────┐    │
│  │   Mobile    │    │   GitHub    │    │   Render    │    │    Neon      │    │
│  │  (Expo RN)  │───▶│  Actions    │───▶│  (Docker)   │───▶│ (Postgres 16)│    │
│  └─────────────┘    └─────────────┘    └─────────────┘    └──────────────┘    │
│        │                  │                  │                   │             │
│        ▼                  ▼                  ▼                   ▼             │
│   User device        CI/CD tests        FastAPI server      Data layer         │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

### The Data Flow

```
User action (Mobile App)
        │
        ▼
┌───────────────────────┐
│  React Native UI      │  ◀── @tanstack/react-query v5 (server state)
│  (TypeScript, Expo)   │  ◀── zustand v4 (UI state only — auth, theme)
│                       │  ◀── expo-secure-store (tokens, encrypted)
└──────────┬────────────┘
           │
           │ HTTPS (REST, Bearer JWT)
           ▼
┌───────────────────────┐
│  FastAPI Backend      │  ◀── JWT HS256 (30m access, 30d refresh, rotation)
│  (Python 3.12)        │  ◀── slowapi (proxy-aware rate limit, PR #1 fix)
│                       │  ◀── pydantic-settings (env-driven config)
└──────────┬────────────┘
           │
           │ SQLAlchemy 2.0 async + asyncpg
           ▼
┌───────────────────────┐
│  PostgreSQL 16 (Neon) │  ◀── ACID, UUID PKs, async connection pool
│  (Singapore region)   │  ◀── Separate DBs per env (PR #2)
└───────────────────────┘
```

The server-first pattern (PR #8) is the key architectural decision. Mobile is **not** offline-first: React Query caches server responses, mutations round-trip before updating UI, and no AsyncStorage-backed domain store exists. This removed an entire class of sync-related bugs (see `docs/TECHNICAL_CHALLENGES.md` #15, #17).

---

## 2. Technology Stack

### Frontend (Mobile)

| Component | Choice | Why |
|---|---|---|
| Framework | React Native + Expo SDK 54 | Cross-platform, managed native deps, EAS Build |
| Language | TypeScript | Type safety catches most regressions early |
| Routing | `expo-router` v6 | File-based routes, typed links, deep linking |
| Server state | `@tanstack/react-query` v5 | Cache, retries, stale/gc, reads + mutations |
| UI state | `zustand` v4 | Small stores for auth session, theme, ephemeral UI flags |
| Secure storage | `expo-secure-store` | Encrypted keystore for JWT access/refresh |
| HTTP | Native `fetch` wrapped in `services/api.ts` | No extra deps; central place for 401 refresh & error copy |

**Explicitly not used:** `redux`, `redux-persist`, `@react-native-async-storage/async-storage` for domain data, a hand-rolled `services/sync.ts`. All of those existed pre-PR #8 and were removed in the server-first refactor.

### Backend (API)

| Component | Choice | Why |
|---|---|---|
| Framework | FastAPI 0.115 | Async, auto-docs, pydantic integration |
| Language | Python 3.12 | Matches the Dockerfile base |
| ORM | SQLAlchemy 2.0 (async) | Typed queries, supports asyncpg |
| DB driver | asyncpg | Fast, native async, works with Neon |
| Validation | Pydantic v2 | Request/response schemas, config |
| Auth | JWT **HS256** (symmetric) | One secret, rotated on refresh |
| Password hashing | Argon2 (+ bcrypt fallback via passlib) | OWASP recommended |
| Email | `fastapi-mail` (SMTP), Brevo HTTP API helper | Mailtrap in dev, Brevo in staging/prod |
| Server | Gunicorn + Uvicorn workers (4) | Production ASGI setup (see `docker-entrypoint.sh`) |
| Rate limit | `slowapi` with proxy-aware `key_func` | Survives Render's edge, swallows storage errors |

### Database

| Component | Choice | Why |
|---|---|---|
| Engine | PostgreSQL 16 | ACID, JSON, battle-tested |
| Hosting | Neon (Singapore) | Serverless, free tier fits our scale |
| Migrations | Alembic 1.14 | Applied automatically by `docker-entrypoint.sh` on container start |

### DevOps

| Component | Purpose |
|---|---|
| GitHub | Source + workflows |
| GitHub Actions | CI + deploy-hook trigger |
| Render | Backend Docker hosting (prod + staging) |
| Neon | Managed Postgres (two DBs on one project) |
| Expo EAS | APK / AAB builds |
| Docker | Reproducible local + prod runtime |
| Trivy | CVE scan on every PR (CRITICAL + HIGH) |

---

## 3. CI/CD Pipeline Deep Dive

### `.github/workflows/ci.yml`

```
Triggers:
  pull_request → main
  push         → main
  workflow_dispatch

Jobs:
  test-backend        pytest + ruff + mypy, Postgres 16 service container
  test-frontend       tsc --noEmit, eslint, expo-doctor
  security-scan       Trivy (CRITICAL + HIGH, fs scan)
  pr-check            merge gate — requires tests + security + label
  deploy-backend      POST $RENDER_DEPLOY_HOOK_URL on push to main
  build-preview       eas build --profile preview — requires PR label 'build-apk'
  build-production    eas build --profile production — CURRENTLY DISABLED (if: false)
```

### Trigger matrix

```
EVENT                        │ WHAT RUNS
─────────────────────────────┼────────────────────────────────────────────
Push to feature branch       │ Nothing
                             │
Open PR → main               │ test-backend, test-frontend, security-scan,
                             │ pr-check
                             │ + build-preview IF PR has label 'build-apk'
                             │
Label PR 'build-apk'         │ build-preview runs on next commit / rerun
                             │
Merge → main                 │ test-backend, test-frontend, security-scan,
                             │ deploy-backend (POSTs Render hook)
                             │ Render also auto-deploys main independently,
                             │ so the hook is redundant but harmless.
                             │ build-production stays disabled.
```

### Job dependencies

```yaml
deploy-backend:
  needs: [test-backend, test-frontend]
build-preview:
  needs: [test-backend, test-frontend]
```

Don't deploy broken code. If tests fail, deploy is blocked.

### Why `build-production` is gated off

AAB builds consume an EAS credit and pressure the Play Store release cadence. Until release engineering is formalised, production AABs are built **manually** from laptop:

```bash
cd vitaltrack-mobile
npx eas build --profile production --platform android
# then, after QA:
npx eas submit --profile production
```

Re-enabling the CI job is a one-line change (`if: false` → `if: github.ref == 'refs/heads/main'`). Don't flip it without agreeing a version-bump/changelog policy.

---

## 4. Deployment Architecture

### Backend on Render

```
┌───────────────────────────────────────────────────────────────────────┐
│                        RENDER DEPLOYMENT                              │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  GitHub push → Render (watches main) → build Dockerfile → boot:      │
│                                                                       │
│  docker-entrypoint.sh                                                 │
│    1. Parse DATABASE_URL for host + port                              │
│    2. pg_isready loop (30x retries; 30 failures vs localhost:5432    │
│       before Neon URL takes over is a known quirk — harmless)         │
│    3. alembic upgrade head                                            │
│    4. exec gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app│
│                                                                       │
│  Container runtime                                                    │
│    FastAPI routes under /api/v1/                                      │
│      /auth/*, /categories/*, /items/*, /orders/*, /sync/* (legacy)   │
│    Healthcheck: /health                                               │
│    Non-root user: appuser (UID 1000)                                  │
│                                                                       │
│  URLs                                                                 │
│    Prod:    https://vitaltrack-api.onrender.com                       │
│    Staging: https://vitaltrack-api-staging.onrender.com               │
│                                                                       │
│  Env vars (set in Render dashboard):                                 │
│    SECRET_KEY, DATABASE_URL, ENVIRONMENT, CORS_ORIGINS, FRONTEND_URL, │
│    MAIL_USERNAME, MAIL_PASSWORD, MAIL_FROM, MAIL_SERVER, MAIL_PORT,   │
│    MAIL_STARTTLS, MAIL_SSL_TLS, REQUIRE_EMAIL_VERIFICATION            │
│                                                                       │
│  SSL: automatic via Render (TLS 1.3)                                  │
│  Cold start: ~30–60 s after 15 min idle (free tier)                   │
└───────────────────────────────────────────────────────────────────────┘
```

### Mobile builds on Expo EAS

```
┌───────────────────────────────────────────────────────────────────────┐
│                        EAS BUILD                                      │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  eas.json profiles:                                                   │
│    development  APK   http://localhost:8000          for hot reload   │
│    preview      APK   https://vitaltrack-api-staging.onrender.com     │
│                       channel 'preview'              beta testing     │
│    production   AAB   https://vitaltrack-api.onrender.com             │
│                       channel 'production'           Play Store       │
│                       autoIncrement versionCode                       │
│                       submit track: internal                          │
│                                                                       │
│  Trigger:                                                             │
│    GitHub Actions → `eas build --non-interactive` on EAS servers     │
│    Artifacts hosted on expo.dev CDN                                   │
└───────────────────────────────────────────────────────────────────────┘
```

`EXPO_PUBLIC_API_URL` is baked into the JS bundle at build time — you cannot flip a preview APK to production at runtime. This is deliberate: preview traffic can never reach production data.

---

## 5. DevOps Mental Model

### 1. Secrets aren't in the code

A fresh GitHub Actions runner has no credentials. It only knows your repo secrets. The CI YAML reads them via `${{ secrets.RENDER_DEPLOY_HOOK_URL }}` etc.

> **Rule.** Never hardcode a secret. If a fork somehow lands, it must not be able to deploy to your infrastructure.

### 2. Warnings vs errors

| Type | Meaning |
|---|---|
| Error | Pipeline fails. Cannot merge / deploy. |
| Warning | Pipeline continues. Code works but is dirty. |
| Info | FYI only. |

Treat warnings as technical debt. Fix when there's slack, but don't block a release on style.

### 3. Why some jobs skip

```yaml
security-scan:   # only on PRs — catching issues before they merge
  if: github.event_name == 'pull_request'

build-preview:   # only when the reviewer explicitly wants an APK
  if: github.event_name == 'pull_request' &&
      contains(github.event.pull_request.labels.*.name, 'build-apk')

build-production:  # currently disabled
  if: false
```

Security scans and EAS builds cost time + quota. Run them where they matter.

---

## 6. Setting Up Secrets

### Required repo secrets

| Secret | Source | Used by |
|---|---|---|
| `RENDER_DEPLOY_HOOK_URL` | Render service → **Settings → Deploy Hook** | `deploy-backend` job (POSTs URL on push) |
| `EXPO_TOKEN` | `npx expo token:create` | `build-preview` and (if enabled) `build-production` |

### Step-by-step

```bash
# 1. Render deploy hook
# Dashboard → vitaltrack-api → Settings → Deploy Hook → copy URL

# 2. Expo token
npx expo login
npx expo token:create
# copy the token shown

# 3. GitHub
# https://github.com/rishabhrd09/vitaltrack/settings/secrets/actions
#   New repository secret
#     Name: RENDER_DEPLOY_HOOK_URL
#     Value: (paste Render hook URL)
#   New repository secret
#     Name: EXPO_TOKEN
#     Value: (paste Expo token)
```

### Verifying

```bash
git commit --allow-empty -m "chore: trigger deploy"
git push origin main
```

Watch Actions → `deploy-backend` should hit the Render hook and come back 200.

### Note on `railway.toml`

Historical. The `railway.toml` file that existed pre-PR #1 was deleted with the migration. `render.yaml` at the repo root is the successor, though the Render services are manually configured and `render.yaml` is documentation-only at the moment.

---

## 7. Database Architecture

### Core Schema

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DATABASE SCHEMA (simplified)                   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  users                              items                              │
│  ─────────────────────              ─────────────────────              │
│  id             UUID PK             id             UUID PK             │
│  email          TEXT UNIQUE         user_id        UUID FK → users     │
│  username       TEXT UNIQUE?        category_id    UUID FK → categories│
│  name           TEXT                name           TEXT                │
│  hashed_password TEXT               quantity       INT (CHECK >= 0)    │
│  is_active      BOOL                minimum_stock  INT                 │
│  is_email_verified BOOL             version        INT    (OCC, #9)    │
│  verification_token / _expires      image_uri      TEXT? (file://)     │
│  password_reset_token / _expires    is_critical    BOOL                │
│  deletion_token / _expires  (#13)   created_at     TIMESTAMPTZ         │
│  created_at     TIMESTAMPTZ         updated_at     TIMESTAMPTZ         │
│                                                                        │
│  categories                         orders                             │
│  ─────────────────────              ─────────────────────              │
│  id             UUID PK             id             UUID PK             │
│  user_id        UUID FK → users     user_id        UUID FK → users     │
│  name           TEXT                status         ENUM (see below)    │
│  icon           TEXT                total_items    INT                 │
│  color          TEXT                created_at     TIMESTAMPTZ         │
│  is_default     BOOL                                                   │
│                                     order_items                        │
│                                     ─────────────────────              │
│  refresh_tokens                     id             UUID PK             │
│  ─────────────────────              order_id       UUID FK → orders    │
│  jti            UUID PK             item_id        UUID FK → items     │
│  user_id        UUID FK → users     quantity       INT                 │
│  is_revoked     BOOL                                                   │
│  expires_at     TIMESTAMPTZ         audit_log                          │
│                                     ─────────────────────              │
│                                     id             UUID PK             │
│                                     user_id        UUID FK → users     │
│                                     entity_type    TEXT                │
│                                     entity_id      UUID                │
│                                     action         TEXT                │
│                                     before / after JSONB               │
│                                     created_at     TIMESTAMPTZ         │
└────────────────────────────────────────────────────────────────────────┘
```

### Migration timeline (Alembic)

```
0001_initial                          20260117_000000  Base schema
0002_add_username                     20260124_…       Optional username for login
0003_email_verification               20260125_…       is_email_verified + tokens
0004_version_audit_log_quantity_check 20260406_…       OCC version col + audit_log +
                                                        CHECK (quantity >= 0)
0005_account_deletion_token_fields    20260419_…       deletion_token + expires (PR #13)
```

Every FK from a domain table to `users` has `ondelete="CASCADE"` at the DB level; the matching ORM relationships carry `cascade="all, delete-orphan"`. PR #13 audited every FK before building the email-confirmed deletion flow — see `docs/PHASE2_ACCOUNT_DELETION.md`.

### Order status flow

```
pending ──▶ ordered ──▶ received ──▶ stock_updated
   │
   └──────▶ declined (terminal)
```

`POST /api/v1/orders/{id}/apply` is a transactional endpoint that moves `received → stock_updated` and increments item quantities atomically. This is the ONLY path that mutates multiple items in one SQL transaction.

### Database-architect thinking

| Decision | Why |
|---|---|
| UUID primary keys | Enable client-generated IDs (pre-PR #8 reason — still good for logs/debug) |
| `version` column on `items` | Optimistic concurrency; 409 with `{server_version, server_quantity}` (PR #9) |
| `CHECK (quantity >= 0)` | Inventory cannot go negative — enforced in DB, not just app code |
| `audit_log` table | Forensic record for sensitive mutations (delete, apply, reset) |
| Per-user filtering on every query | Defence in depth; even a leaked token can't read another tenant |
| `is_default` on categories | "Default" categories are client-protected; backend has no enforcement |
| Separate DBs per environment | Test data cannot pollute production (PR #2) |

---

## 8. Security Considerations

### Auth flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       JWT AUTHENTICATION FLOW                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. User submits email/username + password                               │
│         │                                                                │
│         ▼                                                                │
│  2. Backend verifies via passlib (Argon2)                               │
│         │                                                                │
│         ▼                                                                │
│  3. Backend returns JWT pair (HS256)                                    │
│         ┌────────────────┐   ┌────────────────┐                          │
│         │ Access token   │   │ Refresh token  │                          │
│         │ 30 min TTL     │   │ 30 days, JTI in│                          │
│         │                │   │ refresh_tokens │                          │
│         └────────────────┘   └────────────────┘                          │
│         │                                                                │
│         ▼                                                                │
│  4. Mobile stores pair in expo-secure-store (encrypted keystore)        │
│         │                                                                │
│         ▼                                                                │
│  5. Every API call: Authorization: Bearer <access>                       │
│         │                                                                │
│         ▼                                                                │
│  6. On 401, client calls POST /auth/refresh with refresh token          │
│         Backend rotates: old JTI → is_revoked=true, mints new pair      │
│                                                                          │
│  On password change / reset: ALL refresh tokens for the user are        │
│  marked is_revoked=true (PR #12). User must re-login everywhere.        │
└──────────────────────────────────────────────────────────────────────────┘
```

### Security layers

| Layer | Protection |
|---|---|
| Transport | HTTPS (TLS 1.3) via Render |
| Authentication | JWT HS256, access 30m, refresh 30d, rotated on use |
| Session invalidation | Password change/reset revokes all refresh tokens (PR #12) |
| Password storage | Argon2 with bcrypt fallback for legacy rows (passlib) |
| Rate limiting | 3 registrations/hr, 5 logins/min, 3 forgot-password/hr, 3 resend-verify/hr, 5 reset/hr |
| Enumeration resistance | Uniform response from `/auth/resend-verification` (PR #12) |
| Destructive actions | Two-step, email-confirmed, 24 h TTL — account deletion (PR #13), password reset |
| Input validation | Pydantic v2 on every endpoint |
| SQL injection | Parameterised via SQLAlchemy |
| Secrets | Render dashboard env vars; repo secrets in GitHub Actions only |
| Config guardrails | Production startup refuses weak `SECRET_KEY`, empty `FRONTEND_URL`, `CORS_ORIGINS=*` (PR #12) |

---

## 9. Quick Reference

### Local development

```bash
# Backend
cd vitaltrack-backend
docker compose -f docker-compose.dev.yml up --build

# Frontend (USB debugging is the most reliable path)
cd vitaltrack-mobile
adb reverse tcp:8000 tcp:8000
adb reverse tcp:8081 tcp:8081
npx expo start --localhost --clear
```

See `docs/LOCAL_TESTING_COMPLETE_GUIDE.md` and `docs/USB_ADB_REVERSE_GUIDE.md` for detail.

### Run tests locally

```bash
# Backend
cd vitaltrack-backend
ruff check app/
mypy app/ --ignore-missing-imports
pytest

# Frontend
cd vitaltrack-mobile
npx tsc --noEmit
npx eslint . --ext .ts,.tsx
npx expo-doctor
```

### Git workflow

```bash
git checkout -b feature/my-feature
# edits...
git push origin feature/my-feature
# → open PR → CI runs → review → squash-merge → Render auto-deploys
```

See `docs/GIT_WORKFLOW_GUIDE.md` for commit style, fork workflow, and branch-protection rules.

### Monitoring & debugging

- **GitHub Actions** — https://github.com/rishabhrd09/vitaltrack/actions
- **Render** — Dashboard → service → Logs. No CLI needed for read-only debugging.
- **Expo builds** — https://expo.dev → project → Builds

---

## Summary

```
┌──────────────────────────────────────────────────────────────────────┐
│                  CAREKOSH INFRASTRUCTURE SUMMARY                     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Frontend: React Native + Expo SDK 54 + TypeScript                   │
│            + React Query (server state) + Zustand (UI state)         │
│                                                                      │
│  Backend:  FastAPI 0.115 + Python 3.12 + SQLAlchemy 2.0 async        │
│            + JWT HS256 + Argon2 + slowapi                            │
│                                                                      │
│  DevOps:   GitHub Actions + Render + Neon + Expo EAS + Docker        │
│            + Trivy (PR security scan)                                │
│                                                                      │
│  Flow:     Code → Push → CI (test + scan) → Deploy (Render hook)     │
│            → Render auto-deploys main → verify at /health            │
│                                                                      │
│  Secrets:  RENDER_DEPLOY_HOOK_URL, EXPO_TOKEN                        │
│                                                                      │
│  Current status: PR #13 merged, all 5 migrations applied,            │
│                  prod + staging healthy.                             │
└──────────────────────────────────────────────────────────────────────┘
```

*Last updated: 2026-04-19.*
