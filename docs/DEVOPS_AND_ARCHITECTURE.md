# CareKosh: DevOps, Architecture & CI/CD — The Long-Form Companion

> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. Earlier dated test/release claims retain their original scope. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](VOICE_INVENTORY_AND_ORDER_DRAFTS.md).


> 8 October 2026 safety follow-up: targeted code fixes are local, tested changes after the earlier audit. Deployment and real-device acceptance remain separate. [Current changes and remaining scope](BACKEND_HARDENING.md#safety-follow-up-8-october-2026).

> **Status (re-checked 8 October 2026; reviewed 7 October 2026):** this long-form companion was checked against branch `feature/backend-hardening-ai-voice-agent-foundation` at `03cfebb` (pushed, **not merged**; `main` is `835fad3`), plus uncommitted documentation. The migration head on that branch is `0010_order_local_id_unique` (`main` ends at `0006`); releasing it needs the staging-first [release gate](BACKEND_HARDENING.md#release-gate-for-migration-0007), a restorable backup and a brief write pause. On 7 Oct 2026 the backend suite (242 tests) and the mobile suite (121 tests) passed locally and in CI run 37583748644; on 8 Oct 2026 both were re-run locally against a disposable PostgreSQL 16 database with the same counts. mypy, Trivy and Expo Doctor remain advisory or suppressed. Deployed revisions and provider settings are NOT VERIFIED. Main onboarding guide: [Complete developer guide](CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md); every endpoint: [API traceability](API_TRACEABILITY.md); audit summary: 7 Oct 2026 documentation audit (local review reference; not published).
>
> *Earlier status (23 September 2026):* the local head was `0007_session_order_safety`, CI ran 152 backend cases plus eight mobile API tests, and nothing was deployed. Dated counts and provider observations further down (for example the 2026-05-04 summary box) are historical unless marked current.

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
│  │  (Expo RN)  │───▶│  Actions    │───▶│  (Docker)   │───▶│ (PostgreSQL) │    │
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
│  (Python 3.12)        │  ◀── slowapi (in-memory, per-worker rate limits)
│                       │  ◀── pydantic-settings (env-driven config)
└──────────┬────────────┘
           │
           │ SQLAlchemy 2.0 async + asyncpg
           ▼
┌───────────────────────┐
│  PostgreSQL (Neon)    │  ◀── ACID, UUID PKs, async connection pool
│  (Singapore region)   │  ◀── Separate DBs per env (PR #2)
└───────────────────────┘
```

Neon's region, PostgreSQL version and database layout are as documented, not verified; CI and local Docker use PostgreSQL 16.

The server-first pattern (PR #8) is the key architectural decision. Mobile is **not** offline-first: React Query caches server responses, mutations round-trip before updating UI, and there is no local domain store or offline write queue. This removed an entire class of sync-related bugs (see `docs/TECHNICAL_CHALLENGES.md` #15, #17).

*Nuance (checked 7 Oct 2026):* the React Query cache **is** persisted to AsyncStorage (key `carekosh-query-cache`, cleared at login and logout, busted when the app version changes) so the last-known data can be shown after a restart. That copy is a display cache: nothing is written to it first and nothing in it is replayed to the server. Voice-assistant preferences are also kept in AsyncStorage per account.

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

**Explicitly not used:** `redux`, `redux-persist`, AsyncStorage as a source of truth for domain data, a hand-rolled `services/sync.ts`. All of those existed pre-PR #8 and were removed in the server-first refactor. (AsyncStorage is used again for the persisted *display* cache and voice preferences, as described above.)

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
| Email | Brevo HTTP API helper (`httpx`) | SMTP-era dependencies/config remain, but current sends go through Brevo REST over HTTPS |
| Server | Gunicorn + 2 Uvicorn workers | Production ASGI setup (`Dockerfile` CMD; `docker-entrypoint.sh` adds the `$PORT` bind). *Earlier versions of this table said 4 workers; the image runs 2.* |
| Rate limit | `slowapi`, in-memory per worker process | Five auth routes only; counters reset on restart and are not shared between workers, so treat limits as best effort. An open finding about client identification is tracked privately. |

### Database

| Component | Choice | Why |
|---|---|---|
| Engine | PostgreSQL (16 in CI and local Docker; Neon's version not verified) | ACID, JSON, battle-tested |
| Hosting | Neon (documented: Singapore) | Serverless; the live plan is not verified |
| Migrations | Alembic 1.14 | Applied automatically by `docker-entrypoint.sh` on container start |

### DevOps

| Component | Purpose |
|---|---|
| GitHub | Source + workflows |
| GitHub Actions | CI + deploy-hook trigger |
| Render | Backend Docker hosting (prod + staging) |
| Neon | Managed Postgres (documented: two DBs on one project) |
| Expo EAS | APK / AAB builds |
| Docker | Reproducible local + prod runtime |
| Trivy | Advisory CVE scan on every PR (CRITICAL + HIGH) until the existing dependency baseline is fixed |

---

## 3. CI/CD Pipeline Deep Dive

### `.github/workflows/ci.yml`

```
Triggers:
  pull_request → main
  push         → main
  workflow_dispatch

Jobs:
  test-backend        ruff + pytest --migrated-schema + route gate (exactly 44 /api/v1 routes)
                      + 70% coverage floor for items.py/orders.py, Postgres 16 service container
  typecheck-backend-advisory
                      mypy advisory baseline (23 errors on 7 Oct 2026; never fails the run)
  test-frontend       Node 20: npm install --legacy-peer-deps, carekosh-voice autolinking check,
                      tsc --noEmit, npm test (121 tests), eslint (errors fail, warnings pass);
                      expo-doctor output ignored (|| echo)
  security-scan-advisory
                      Trivy advisory (CRITICAL + HIGH, fs vuln scan)
  pr-check            PR summary job — needs both test jobs (not a required
                      check: the ruleset read on 7 Oct 2026 requires no status checks)
  deploy-backend      requests $RENDER_DEPLOY_HOOK (curl GET, --fail, 30 s) on push to main,
                      only if that secret is set
  build-preview       eas build --profile preview — on every PR run while the PR
                      carries the 'build-apk' label ('skip-apk' has no effect)
  build-production    eas build --profile production — CURRENTLY DISABLED (if: false)
```

### Trigger matrix

```
EVENT                        │ WHAT RUNS
─────────────────────────────┼────────────────────────────────────────────
Push to feature branch       │ Nothing, unless the branch has an open PR
(no open PR to main)         │ to main: then it is a PR run (next row)
                             │
Open PR → main, or push to   │ test-backend, test-frontend,
its branch                   │
                             │ typecheck-backend-advisory,
                             │ security-scan-advisory,
                             │ pr-check
                             │ + build-preview IF PR has label 'build-apk'
                             │
Label PR 'build-apk'         │ adding any label starts a new run (the workflow
                             │ listens for the 'labeled' event); build-preview
                             │ runs after both test jobs pass
                             │
Merge → main                 │ test-backend, test-frontend,
                             │ typecheck-backend-advisory,
                             │ deploy-backend (calls the Render hook only if
                             │ the secret is set)
                             │ Render auto-deploy may also rebuild services
                             │ connected to main (NOT VERIFIED).
                             │ build-production stays disabled.
                             │
Manual run                   │ test-backend, test-frontend,
(workflow_dispatch)          │ typecheck-backend-advisory; never deploys
```

This matrix describes this branch's `ci.yml`. A push to `main` runs the workflow file in the pushed commit, so until this branch merges, `main` runs its older version: Python 3.11, route gate 39, and a deploy hook called with `curl -s`, which cannot fail the job.

### Job dependencies

```yaml
deploy-backend:
  needs: [test-backend, test-frontend]
build-preview:
  needs: [test-backend, test-frontend]
```

Don't deploy broken code. If a test job fails, the `deploy-backend` job does not run, so CI does not call the deploy hook. That is the only thing CI blocks:

- Render's own auto-deploy (if it is on for a service) watches the branch, not CI, and can start before or regardless of the test result. Whether it is on is a dashboard setting (NOT VERIFIED).
- GitHub's ruleset `protect-main` requires a pull request but **no** status checks (checked through the API on 7 Oct 2026), so a PR with red CI can still be merged. Read every job, including the advisory ones, before merging.

### Why `build-production` is gated off

AAB builds consume an EAS credit and pressure the Play Store release cadence. Until release engineering is formalised, production AABs are built **manually** from laptop:

```bash
npm install -g eas-cli          # the EAS CLI is a separate global tool (or use: npx eas-cli@latest …)
cd vitaltrack-mobile
eas build --profile production --platform android
# then, after QA:
eas submit --profile production --platform android
```

*Earlier versions of this block used `npx eas …`; the npm package that provides the `eas` command is `eas-cli`.*

Re-enabling the CI job is a one-line change (`if: false` → `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`, as the comment in `ci.yml` says); as written it would build but not submit. Don't flip it without agreeing a version-bump/changelog policy.

---

## 4. Deployment Architecture

### Backend on Render

```
┌───────────────────────────────────────────────────────────────────────┐
│                        RENDER DEPLOYMENT                              │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Push to main → hook (if set) or auto-deploy (if on; NOT VERIFIED)   │
│  → production service (vitaltrack-backend/render.yaml: branch main;  │
│  staging is configured only in the dashboard) → build Dockerfile:    │
│                                                                       │
│  docker-entrypoint.sh                                                 │
│    1. Parse DATABASE_URL for host + port (unless DATABASE_HOST set;   │
│       a URL without :port falls back to localhost:5432)               │
│    2. pg_isready loop: 30 tries, 2 s apart, then continues anyway     │
│    3. alembic upgrade head (exit 1 on failure: container stops)       │
│    4. exec gunicorn -w 2 -k uvicorn.workers.UvicornWorker app.main:app│
│       --bind 0.0.0.0:$PORT (8000 if unset)                            │
│                                                                       │
│  Container runtime                                                    │
│    FastAPI routes under /api/v1/                                      │
│      /auth/*, /categories/*, /items/*, /orders/*, /activities, /ai/* │
│      (44 route objects on this branch; 39 on main, which has no /ai) │
│      No /sync/* route surface; mobile is server-first REST only       │
│    Docker HEALTHCHECK and Render healthCheckPath: /live (no DB check)│
│    /health runs SELECT 1 (2 s) → 503 if the database is unreachable  │
│    (docker-compose.yml's local healthcheck uses /health)             │
│    Non-root user: appuser (UID 1000)                                  │
│                                                                       │
│  URLs                                                                 │
│    Prod:    https://api.carekosh.com                                  │
│    Staging: https://staging-api.carekosh.com                          │
│                                                                       │
│  Env vars (set in Render dashboard):                                 │
│    SECRET_KEY, DATABASE_URL, ENVIRONMENT, CORS_ORIGINS, FRONTEND_URL, │
│    MAIL_PASSWORD, MAIL_FROM, REQUIRE_EMAIL_VERIFICATION, SENTRY_DSN   │
│    Optional assistant settings (all off by default): AI_ENABLED,     │
│    AI_DATA_CONTROLS_REVIEWED, GROQ_API_KEY, limits — see .env.example │
│                                                                       │
│  TLS: terminated by Render (protocol versions NOT VERIFIED here)     │
│  Cold start: ~30–60 s after 15 min idle applied to the free tier     │
│  (historical observation); render.yaml now requests the Starter plan │
│  — the live plan per service is NOT VERIFIED                          │
└───────────────────────────────────────────────────────────────────────┘
```

### Mobile builds on Expo EAS

```
┌───────────────────────────────────────────────────────────────────────┐
│                        EAS BUILD                                      │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  eas.json profiles:                                                   │
│    development  APK   http://localhost:8000          dev client;      │
│                       needs expo-dev-client (not installed yet)      │
│    preview      APK   https://staging-api.carekosh.com                │
│                       channel 'preview'              beta testing     │
│    production   AAB   https://api.carekosh.com                        │
│                       channel 'production'           Play Store       │
│                       autoIncrement versionCode                       │
│                       submit track: internal                          │
│                                                                       │
│  Trigger:                                                             │
│    preview: CI job build-preview on a PR labelled 'build-apk'        │
│             (`eas build --profile preview --no-wait`) or by hand     │
│    production: by hand from a clean checkout (CI job disabled)       │
│    Artifacts hosted on expo.dev                                       │
│  Over-the-air updates are disabled (updates.enabled: false), so      │
│  every JS or native change needs a new APK/AAB install.              │
└───────────────────────────────────────────────────────────────────────┘
```

`EXPO_PUBLIC_API_URL` is baked into the JS bundle at build time — you cannot flip a preview APK to production at runtime. This is deliberate: preview builds only ever call the staging API. Which database that API uses is the staging service's own setting (NOT VERIFIED).

### Backend platform migration guide

The backend is intentionally portable. The runtime is a Docker image, startup is
`docker-entrypoint.sh`, and operational behavior comes from environment
variables read by `app/core/config.py`. Render is the current host, not a hard
requirement.

#### What can host it?

| Option | Fit |
|---|---|
| Render paid | Smallest change from today; removes free-tier sleep without changing app architecture |
| Fly.io, Railway, DigitalOcean App Platform, AWS Lightsail | Good managed/VPS-style options if you want fewer cold-start surprises |
| Hetzner / generic VPS | Fine when you are comfortable owning Docker, systemd/restarts, TLS, firewall, backups, and OS patching |
| MacBook / home server | Useful for local demos or temporary internal testing; not recommended for Play Store production because uptime, network, TLS, IP changes, and physical power/network failure become your problem |

#### Files and settings touched by a host move

| Surface | Current file | What changes |
|---|---|---|
| Backend image | `vitaltrack-backend/Dockerfile` | Usually unchanged; build this image on the new host |
| Backend startup | `vitaltrack-backend/docker-entrypoint.sh` | Usually unchanged; still waits for DB, runs Alembic, then starts Gunicorn/Uvicorn |
| Runtime config | `vitaltrack-backend/app/core/config.py` | No code change expected; set env vars on the new host |
| Render IaC | `vitaltrack-backend/render.yaml` | Remove/replace if leaving Render, or keep as historical Render config |
| Mobile build URLs | `vitaltrack-mobile/eas.json` | Change `preview.env.EXPO_PUBLIC_API_URL` and/or `production.env.EXPO_PUBLIC_API_URL` if the public API hostname changes |
| Mobile URL guards | `vitaltrack-mobile/app.config.js` | Update `PREVIEW_API_URL` / `PRODUCTION_API_URL`, or builds will fail when EAS uses the new URL |
| Local scripts | `vitaltrack-mobile/package.json` | Update `start:staging` / `start:prod` convenience URLs |
| API client | `vitaltrack-mobile/services/api.ts` | Usually unchanged; it reads `EXPO_PUBLIC_API_URL` and appends `/api/v1` |
| CI deploy hook | `.github/workflows/ci.yml` | Replace the `deploy-backend` Render hook logic with the new host's deploy command or API call |

Runtime env vars to recreate on the new host:

```text
DATABASE_URL
SECRET_KEY
ENVIRONMENT
CORS_ORIGINS
REQUIRE_EMAIL_VERIFICATION
MAIL_PASSWORD
MAIL_FROM
FRONTEND_URL
SENTRY_DSN                       # optional
AI_* and GROQ_API_KEY            # optional; only if the assistant's online understanding is enabled
```

Keep `DATABASE_URL` pointed at the right database (documented today as
`vitaltrack_staging` vs `neondb`), keep `SECRET_KEY` different per environment, and make
`FRONTEND_URL` match the backend auth base URL that serves email links.

#### GitHub secrets during migration

Keep `EXPO_TOKEN`; it belongs to EAS builds, not Render. Replace
`RENDER_DEPLOY_HOOK` if the backend leaves Render.

Examples:

| New host | Example repo secrets |
|---|---|
| VPS / self-managed Docker | `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` |
| Fly.io | `FLY_API_TOKEN` |
| Railway | `RAILWAY_TOKEN` |
| DigitalOcean | `DIGITALOCEAN_ACCESS_TOKEN` |

Do not commit provider tokens, SSH keys, database URLs, or API keys. Store them
as GitHub Actions secrets and provider-side environment variables.

#### Custom API domains

Use the stable public API hostnames for mobile builds, operator smoke tests,
and monitoring:

```text
https://api.carekosh.com
https://staging-api.carekosh.com
```

Those DNS records point at Render today (as documented; not verified). If you later move to Fly.io, Railway,
DigitalOcean, Hetzner, or Lightsail, repoint DNS instead of rebuilding every
installed mobile binary. Avoid baking provider hostnames into mobile builds; a
public API hostname change requires updating `eas.json`, updating
`app.config.js`, rebuilding the AAB/APK, and waiting for users to install the
new version.

#### Launch timing verdict

*Recommendation written while production ran on the free tier; `render.yaml` now requests the paid Starter plan, and the live plan is not verified.* The Render free-tier cold-start/server-call issue is technically hosting/ops
work, so it can be fixed after a Play Store deployment. It is still not a good
idea to wait: Play reviewers and first users may hit login, verification, or
inventory timeouts and conclude the app is broken. Minimum before Play review:
move production to paid Render or provide an equivalent reliable uptime /
keep-warm strategy with monitor evidence. Staging can remain cheaper while
production gets the reliability budget.

---

## 5. DevOps Mental Model

### 1. Secrets aren't in the code

A fresh GitHub Actions runner has no credentials. It only knows your repo secrets. The CI YAML reads them via `${{ secrets.RENDER_DEPLOY_HOOK }}` etc.

> **Rule.** Never hardcode a secret. If a fork somehow lands, it must not be able to deploy to your infrastructure.

### 2. Warnings vs errors

| Type | Meaning |
|---|---|
| Error | The run fails and `deploy-backend` does not run. A merge is not blocked: the ruleset read on 7 Oct 2026 requires no status checks. |
| Warning | Pipeline continues. Code works but is dirty. |
| Info | FYI only. |

Treat warnings as technical debt. Fix when there's slack, but don't block a release on style.

### 3. Why some jobs skip

```yaml
security-scan-advisory:   # only on PRs — catching issues before they merge
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
| `RENDER_DEPLOY_HOOK` | Render service → **Settings → Deploy Hook** | `deploy-backend` job (requests the URL with `curl` after a push to `main` once both test jobs pass) |
| `EXPO_TOKEN` | An access token created on expo.dev (account settings → access tokens) | `build-preview` and (if enabled) `build-production` |

### Step-by-step

```bash
# 1. Render deploy hook
# Dashboard → vitaltrack-api → Settings → Deploy Hook → copy URL

# 2. Expo token
# expo.dev → account settings → Access tokens → create a token
# (the project's Expo CLI, 54.0.25, has no token command)
# copy the token shown

# 3. GitHub
# https://github.com/rishabhrd09/vitaltrack/settings/secrets/actions
#   New repository secret
#     Name: RENDER_DEPLOY_HOOK
#     Value: (paste Render hook URL)
#   New repository secret
#     Name: EXPO_TOKEN
#     Value: (paste Expo token)
```

### Verifying

`deploy-backend` runs only on a push to `main` (its condition is `github.ref == 'refs/heads/main' && github.event_name == 'push'`), so a manual `workflow_dispatch` run does not call the hook. Since the `protect-main` ruleset (as read on 7 Oct 2026) requires a pull request, the hook is exercised by merging a reviewed PR — which can deploy production, so do it only for a change you intend to release. The hook sends no commit, so Render deploys the latest commit on its branch.

*Earlier versions of this guide suggested an empty commit pushed straight to `main`; the ruleset now rejects direct pushes.*

After a merge, Actions → `deploy-backend` should show the hook request accepted. An accepted hook request is not proof of a healthy deployment: check the commit Render actually deployed, `/live`, `/health` and, for a migration, `alembic current`.

### Note on `railway.toml`

Historical. The `railway.toml` file that existed pre-PR #1 was deleted with the migration. `vitaltrack-backend/render.yaml` is the successor production service spec. The staging service is still dashboard-managed, as documented in `docs/STAGING_DEPLOY_DIAGNOSIS.html`.

---

## 7. Database Architecture

### Core Schema

> **Corrected 7 October 2026.** The earlier version of this sketch listed `icon`/`color` columns on `categories` (they do not exist), a foreign key from `order_items.item_id` to `items` (there is none — order lines keep snapshots so history survives item deletion), `jti` as the `refresh_tokens` primary key (the key is `id`; `jti` is unique), and `before`/`after` audit columns (they are `old_values`/`new_values`). It also predated `session_version`, the order counter, `local_id` uniqueness and the assistant tables. The sketch below matches a schema dump taken after migrating an empty database to `0010` on 7 Oct 2026 (evidence (local review reference; not published); diagram: [database-erd.svg](diagrams/database-erd.svg)); a fresh dump on 8 Oct 2026 had the same tables, columns, constraints and indexes. Primary keys are UUID strings (`VARCHAR(36)`) generated by the server.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DATABASE SCHEMA (simplified)                   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  users                              items                              │
│  ─────────────────────              ─────────────────────              │
│  id             UUID PK             id             UUID PK             │
│  email          UNIQUE, nullable    user_id        FK → users          │
│  username       UNIQUE, nullable    category_id    FK → categories     │
│  CHECK email OR username present    name           (not unique in DB)  │
│  name, phone                        quantity       INT CHECK >= 0      │
│  hashed_password (Argon2)           minimum_stock  INT                 │
│  session_version INT (0007)         version        INT (optimistic)    │
│  is_active, is_email_verified       image_uri      TEXT? (phone file)  │
│  email_verification_token (sha256)  is_critical, is_active             │
│  password_reset_token (sha256, 1 h) supplier/brand/notes/purchase_link │
│  deletion_token (sha256, 24 h)      created_at / updated_at            │
│  last_login, created_at                                                │
│                                                                        │
│  categories                         orders                             │
│  ─────────────────────              ─────────────────────              │
│  id             UUID PK             id             UUID PK             │
│  user_id        FK → users          user_id        FK → users          │
│  name           (not unique in DB)  order_id       ORD-YYYYMMDD-NNNN,  │
│  description                                       UNIQUE              │
│  display_order  INT                 local_id       UNIQUE per user     │
│  is_default     BOOL                               when set (0010)     │
│  local_id                           status         VARCHAR (enum names)│
│                                     total_items, total_units           │
│  refresh_tokens                     exported/ordered/received/         │
│  ─────────────────────              applied/declined _at timestamps    │
│  id             UUID PK                                                │
│  jti            UNIQUE              order_items                        │
│  user_id        FK → users          ─────────────────────              │
│  is_revoked, expires_at             id             UUID PK             │
│  device_name, ip_address,           order_id       FK → orders         │
│  user_agent                         item_id        plain id, NO FK     │
│                                     name, unit, quantity (> 0) and     │
│  order_number_counters (0007)       stock/supplier snapshot fields     │
│  ─────────────────────                                                 │
│  day            YYYYMMDD PK         audit_log                          │
│  last_value     BIGINT              ─────────────────────              │
│  (no user link; survives deletion)  id, user_id FK → users             │
│                                     entity_type, entity_id, action     │
│  activity_logs                      old_values / new_values  JSONB     │
│  ─────────────────────              created_at                         │
│  id, user_id FK → users                                                │
│  action (enum name), item_name      ai_consents (0008/0009)            │
│  item_id, order_id (plain, no FK)   ─────────────────────              │
│  details, created_at                user_id PK + FK → users            │
│                                     version, accepted, scopes JSON     │
│  ai_usage (0008/0009)                                                  │
│  ─────────────────────                                                 │
│  id, user_id FK → users, kind, provider, status, reserved_microusd,   │
│  token/audio counts, created_at, expires_at                            │
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
0006_order_item_qty_positive          20260623_…       CHECK (order_items.quantity > 0)
── feature branch only (not on main, 7 Oct 2026) ──────────────────────────────
0007_session_order_safety             20260923_…       users.session_version, order_number_counters,
                                                        token-digest indexes; downgrade refused
0008_ai_consent_usage                 20260924_…       ai_consents, ai_usage
0009_ai_provider_scopes               20261006_…       ai_consents.scopes, ai_usage.provider
0010_order_local_id_unique            20261006_…       UNIQUE (user_id, local_id) WHERE local_id
                                                        IS NOT NULL; brief SHARE lock on orders
```

The chain is linear: `alembic heads` shows one head. File-name dates are not the revision order; `down_revision` is.

Every FK from a domain table to `users` has `ondelete="CASCADE"` at the DB level (ten foreign keys at `0010` — eight to `users`, plus `items → categories` and `order_items → orders` — all cascading); the matching ORM relationships carry `cascade="all, delete-orphan"`. Account deletion loads the user without its collections and lets PostgreSQL's cascade remove the rows. PR #13 audited every FK before building the email-confirmed deletion flow — see `docs/PHASE2_ACCOUNT_DELETION.md`. `order_number_counters` has no user link and is kept, so order numbers are never reused.

### Order status flow

```
pending ──▶ ordered ──▶ partially_received ──▶ received ──▶ stock_updated
   │          │                                ▲
   │          └────────────────────────────────┘
   ├──────▶ received
   └──────▶ declined (terminal)
```

`POST /api/v1/orders/{id}/apply` is a transactional endpoint that moves `received → stock_updated` and increments item quantities atomically (items locked in id order; each order line raises its item's `version` by one and writes one audit row, so a repeated item gets two). It is the only path that changes several items' quantities in one transaction. (Deleting a category also removes its items in one transaction.) `PATCH …/status` cannot set `stock_updated`; the generic status endpoint rejects that move.

The phone offers only part of this machine: "Have you received the order?" (pending → received) and "Update Stock" (apply). `ordered`, `partially_received` and `declined` are reachable through the API only, and `partially_received` stores no per-line quantities — applying always adds every line's full quantity.

### Database-architect thinking

| Decision | Why |
|---|---|
| UUID primary keys | Originally for client-generated IDs (pre-PR #8). Today the server generates every id (UUID strings in `VARCHAR(36)`); client-sent `orderId` values are ignored. Still useful for logs/debug and non-guessable URLs |
| `version` column on `items` | Optimistic concurrency; 409 with `{server_version, server_quantity}` (PR #9) |
| `CHECK (quantity >= 0)` | Inventory cannot go negative — enforced in DB, not just app code |
| `audit_log` table | Before/after JSON for item create/update/stock/delete (including items removed with a category and items changed by an order apply) and order delete. It does not record password resets, logins or profile changes, and no API route exposes it |
| Per-user filtering on every query | Defence in depth; even a leaked token can't read another tenant |
| `is_default` on categories | Backend rejects deletion of default categories; custom category deletion remains user-scoped |
| Separate DBs per environment | Test data cannot pollute production (PR #2). The databases are separate by configuration; the live targets are NOT VERIFIED here |
| `local_id` unique per user on `orders` (0010) | Makes order creation retry-safe: the same request repeated returns the existing order |
| Daily `order_number_counters` row (0007) | Order numbers are allocated atomically and never reused, even after deletion |

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
│  marked is_revoked=true (PR #12) AND users.session_version goes up      │
│  (0007), so existing access tokens fail on their next use as well.      │
│  User must re-login everywhere.                                         │
│                                                                          │
│  Logout revokes only the refresh token it is given; the access token    │
│  stays valid until it expires (≤ 30 min). Replaying a rotated refresh   │
│  token returns 401 but does not revoke the newer token.                 │
└──────────────────────────────────────────────────────────────────────────┘
```

### Security layers

| Layer | Protection |
|---|---|
| Transport | HTTPS terminated by Render (protocol versions NOT VERIFIED); database TLS outside development/testing |
| Authentication | JWT HS256, access 30m, refresh 30d, rotated on use |
| Session invalidation | Password change/reset revokes all refresh tokens (PR #12) and bumps `session_version` (0007), which invalidates outstanding access tokens too |
| Password storage | Argon2 with bcrypt fallback for legacy rows (passlib) |
| Rate limiting | 3 registrations/hr, 5 logins/min, 3 forgot-password/hr, 3 resend-verify/hr, 5 reset/hr — rate limiting is best effort: five auth routes, counters in memory per worker process, reset on restart; an open finding about how clients are identified is tracked privately |
| Enumeration resistance | Uniform response from `/auth/resend-verification` (PR #12) |
| Destructive actions | Two-step, email-confirmed — account deletion (PR #13; link valid 24 h; opening it only shows a page, the button deletes) and password reset (link valid **1 h**). *Earlier versions of this table gave 24 h for both.* |
| Reset-page rendering | Password reset URL token is escaped into a DOM `data-token` attribute; inline JavaScript reads it from the DOM instead of receiving raw query-string interpolation |
| Input validation | Pydantic v2 on every endpoint |
| SQL injection | Parameterised via SQLAlchemy |
| Secrets | Render dashboard env vars; repo secrets in GitHub Actions only |
| Config guardrails | Startup outside development/testing refuses the public placeholder `SECRET_KEY` (every environment refuses keys under 32 characters); production also refuses an empty `FRONTEND_URL`. Wildcard CORS rejection is deferred until real browser origins are known |

### Password reset safety model

Password reset has two separate safety boundaries:

1. **Server-side token safety.** The email contains the raw reset token, but the
   database stores only `SHA-256(raw_token)` with an expiry. When the user
   submits a new password, the backend hashes the submitted token, compares it
   with the stored hash, clears the reset token on success, and revokes every
   refresh token for that user.

2. **Browser rendering safety.** The reset form is backend-rendered HTML, so the
   query-string token must not be inserted as raw JavaScript source. The safe
   pattern is:

```html
<div id="form-container" data-token="escaped token here">
```

```js
const token = document.getElementById('form-container').dataset.token;
body: JSON.stringify({ token, new_password: password });
```

This preserves the existing `POST /auth/reset-password` request body while
preventing reflected-token XSS. A crafted token such as
`abc'");</script><script>alert(1)</script>` should render as escaped HTML data,
not as executable script.

A successful manual probe is intentionally boring: a normal token URL and a
malicious-token URL both show the same CareKosh reset form. The user should not
see a popup, broken layout, or different password-reset flow. The difference is
only in the rendered source: the malicious characters are escaped as data in the
DOM attribute and are never placed raw inside script code.

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
ruff check app/ tests/ scripts/
# WARNING: the test fixtures drop and recreate tables. Point DATABASE_URL at a
# disposable LOCAL database whose name contains "test" — never staging/production.
# Recipe: CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md, Part E1.
pytest tests/ -q --migrated-schema --cov=app --cov-report=term-missing --cov-report=json
python scripts/check_api_routes.py --expected 44     # 39 on main
python scripts/check_file_coverage.py coverage.json --threshold 70 --file app/api/v1/items.py --file app/api/v1/orders.py
mypy app/ --ignore-missing-imports   # advisory until the current baseline is fixed

# Frontend
cd vitaltrack-mobile
npx tsc --noEmit
npm test              # 121 Node test-runner tests (7 Oct 2026; same on 8 Oct)
npm run lint          # eslint . (ESLint 8, .eslintrc.js)
npx expo-doctor       # advisory; CI ignores its exit code
```

### Git workflow

```bash
git checkout -b feature/my-feature
# edits...
git push origin feature/my-feature
# → open PR → CI runs → read every job → review → merge
# Merging to main can deploy production (hook if its secret is set; Render
# auto-deploy if on, NOT VERIFIED). For migrations 0007–0010, first stage the
# candidate on an isolated database (preserve staging; verify a populated
# synthetic 0006 → 0010 upgrade): see the BACKEND_HARDENING.md release gate.
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
│            + advisory mypy and Trivy baselines                       │
│                                                                      │
│  Flow:     Code → PR → CI (blocking tests + advisory scans)          │
│            → merge → can deploy (hook if set / auto-deploy if on)    │
│            → verify deployed commit, /live, /health, alembic current │
│                                                                      │
│  Secrets:  RENDER_DEPLOY_HOOK, EXPO_TOKEN                        │
│                                                                      │
│  Status on 2026-05-04 (historical): PR #34 merged, all 5 migrations   │
│                  applied, prod + staging healthy. Cold-start UX layer │
│                  shipped in audit/cold-start-mutation-ux branch.     │
│  Status on 2026-10-08: feature branch at 03cfebb (head 0010) not     │
│                  merged; deployed states NOT VERIFIED.               │
└──────────────────────────────────────────────────────────────────────┘
```

*Last reviewed: 2026-10-08 (re-checked against the working tree: `03cfebb` plus uncommitted documentation). Previous reviews: 2026-10-07 (documentation audit; corrections marked in place), 2026-09-23, 2026-05-04 (post audit/cold-start-mutation-ux merge). Original: 2026-04-19.*

> **Note from May 2026 (historical; the files below still exist on 8 Oct 2026):** the audit/cold-start-mutation-ux branch
> added a feedback layer that's not yet woven into the main narrative above —
> `MutationResultDialog`, consolidated `StatusPill` (replacing
> `ConnectionStatusPill` + `SavingStatusPill`, both deleted), `safeBack`
> helper, hook-level dispatch in `useServerMutations.ts`, fire-and-forget
> mutations via `mutateAsync().then()`, and a `react-native-toast-message`
> dependency. The DevOps surface (CI / Render / Neon) is unchanged; this is
> a pure mobile-runtime UX layer.
