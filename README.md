# CareKosh

> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. Earlier dated test/release claims retain their original scope. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](docs/VOICE_INVENTORY_AND_ORDER_DRAFTS.md).

> **Status (7 October 2026):** Checked against branch `feature/backend-hardening-ai-voice-agent-foundation` at commit `03cfebb`. `main` and tag `v1.0.0` are still `835fad3`: migrations up to `0006`, no `/api/v1/ai/*` routes. The feature branch adds migrations `0007`–`0010` (head `0010_order_local_id_unique`), five `/api/v1/ai/*` routes (47 routes in total: 44 under `/api/v1` plus `/`, `/health` and `/live`) and the read-only voice assistant. It has no pull request yet. On 7 Oct 2026 the backend suite (242 tests) and the mobile suite (121 tests) passed locally. What staging and production run today is NOT VERIFIED. Earlier note (23 Sept 2026): head `0007`, 152 backend tests; both figures are now out of date.
>
> **Start here:** [Complete developer guide](docs/CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md) (main onboarding entry) · [API traceability](docs/API_TRACEABILITY.md) (every endpoint) · [Documentation home](docs/INDEX.html) · Documentation audit, 7 Oct 2026 (local review reference; not published) · [Backend hardening notes](docs/BACKEND_HARDENING.md).

> Home ICU medical inventory management for family caregivers. Never run out of a life-critical supply.

[![React Native](https://img.shields.io/badge/React%20Native-Expo%20SDK%2054-61DAFB?logo=react)](https://reactnative.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python%203.12-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://www.postgresql.org)
[![Hosted on Render](https://img.shields.io/badge/Hosted-Render-46e3b7?logo=render)](https://render.com)

> CareKosh was formerly released under the name **VitalTrack**. The directory names `vitaltrack-backend/` and `vitaltrack-mobile/` are legacy and intentionally unchanged — Render service paths, EAS config, and git history depend on them. All user-visible surfaces say CareKosh.

---

## What it does

Family caregivers running a home ICU for a chronically ill relative juggle dozens of consumables: tracheostomy tubes, suction catheters, feeding tube extensions, medication, etc. Running out of any one of them is a medical emergency. CareKosh is a mobile app that:

- Tracks every item with stock count, low-stock threshold, and criticality flag
- Shows a "needs attention" list for low-stock and out-of-stock items (active items only). An optional expiry date is stored and shown on each item, but expiry does not raise alerts in the current code.
- Manages orders end-to-end (pending → ordered → received → applied to stock)
- Maintains an audit log of every stock change (server-side table; not exposed through the API) and a user-visible activity feed
- Keeps caregivers aligned through server-backed reads/writes and query revalidation (server-first; no offline merge conflicts)
- Feature branch (9 Oct 2026 working tree): **Ask Care Coach** answers bounded inventory queries and prepares unsaved local order drafts. Android AudioRecord/Moonshine provides offline recognition and provisional live words; optional Groq Whisper online listening and GPT-OSS text understanding require separate consent. Only touch confirmation saves an order; voice cannot update stock. [Complete current AI voice architecture](docs/VOICE_INVENTORY_AND_ORDER_DRAFTS.md).

---

## Tech stack

| Layer | Technology |
|---|---|
| Mobile | React Native · Expo SDK 54 · TypeScript · `expo-router` |
| Server state | `@tanstack/react-query` + `@tanstack/react-query-persist-client` (AsyncStorage-backed cache persistence) |
| UI state | `zustand` (UI-only, no persistence) |
| Secure storage | `expo-secure-store` |
| Loading UX | Skeleton screens · cache-backed instant launches · cold-start auto-retry on login |
| Backend | FastAPI · SQLAlchemy 2.0 (async) · Alembic · Argon2 |
| Database | PostgreSQL 16 on [Neon](https://neon.tech) |
| Hosting | [Render](https://render.com) (backend) · [EAS Build](https://expo.dev/eas) (mobile) |
| CI/CD | GitHub Actions · failing jobs: backend tests/Ruff/route-count/coverage, frontend TypeScript/ESLint (the feature branch adds `npm test` and a voice-module autolinking check) · advisory: mypy, Trivy, expo-doctor · Render deploy hook. The `main` ruleset has no required status checks, so a red run does not technically block a merge. |
| Email | Brevo HTTP API for transactional email; SMTP config keys remain from the Mailtrap/SMTP era |

### Architecture

CareKosh is **server-first**, not offline-first. The backend is the single source of truth; the mobile app surfaces write errors explicitly rather than queuing them. Optimistic concurrency control (a `version` column on `items`, HTTP 409 on stale updates) handles concurrent edits. See [CAREKOSH_DEVELOPER_GUIDE.md §1](CAREKOSH_DEVELOPER_GUIDE.md#1-architecture-overview) for the rationale.

---

## End-to-end map

Mobile screens call `vitaltrack-mobile/services/api.ts`, which reads `EXPO_PUBLIC_API_URL` from the active Expo/EAS profile (default `http://localhost:8000`) and sends JSON to the FastAPI app. The backend mounts `/api/v1/auth`, `/categories`, `/items`, `/orders` and `/activities`; the feature branch also mounts `/api/v1/ai` (5 routes for signed-in users; accepting consent and calling a model are refused unless the server's AI flags are set, and all AI flags default to off). `/`, `/health` and `/live` are root-level operational endpoints. PostgreSQL (Neon for staging and production) is the source of truth. The mobile app keeps auth tokens in SecureStore, and a read-only TanStack Query display cache plus voice preferences in AsyncStorage; it does not queue offline writes or push cached data back to the server.

Environment routing:

| Runtime | Backend | Database | Notes |
|---|---|---|---|
| Local Expo / dev APK | `http://localhost:8000` by default, or LAN/ADB override | local Docker Postgres | development profile allows local cleartext HTTP |
| Preview APK | `https://staging-api.carekosh.com` | Neon staging database | built by EAS preview profile; PR label `build-apk` can trigger CI build |
| Production AAB | `https://api.carekosh.com` | Neon production database | manual EAS/Play flow today; CI production AAB job is disabled |

The API URLs come from `eas.json`. The hosting and database columns describe the intended setup; live Render and Neon settings are NOT VERIFIED.

Deployment routing: PRs to `main` run the backend and frontend test jobs, with mypy, Trivy and expo-doctor advisory. Pushing a feature branch alone runs nothing; CI on a feature branch needs a manual `workflow_dispatch`. The `protect-main` ruleset requires a pull request (0 approvals) and blocks force-push and deletion, but has no required status checks (GitHub API, 7 Oct 2026). A push to `main` runs the `deploy-backend` job; when the `RENDER_DEPLOY_HOOK` secret is set, it calls that hook URL with `curl`. Render's own GitHub auto-deploy may also rebuild connected services (dashboard setting, NOT VERIFIED). The Docker entrypoint waits for Postgres, applies Alembic, then launches Gunicorn/Uvicorn. Mobile production release remains manual until the disabled `build-production` job is intentionally re-enabled. Over-the-air updates are disabled (`updates.enabled: false`), so every app change needs a new APK/AAB.

---

## Quick start

```bash
git clone https://github.com/rishabhrd09/vitaltrack.git && cd vitaltrack

# Backend
cd vitaltrack-backend
cp .env.example .env                       # optional for Docker: the dev compose file sets its own SECRET_KEY
                                           # and DATABASE_URL; .env only fills MAIL_*, FRONTEND_URL and LOCAL_IP
docker compose -f docker-compose.dev.yml up --build -d
# Migrations run automatically: the dev image's entrypoint runs `alembic upgrade head`
# (the production image does the same in docker-entrypoint.sh)

# Mobile (new terminal)
cd ../vitaltrack-mobile
npm install --legacy-peer-deps
npx expo start --clear
```

Scan the QR with Expo Go. Create an account and start tracking inventory. The app calls `http://localhost:8000` unless `EXPO_PUBLIC_API_URL` is set; on a physical phone use `adb reverse tcp:8000 tcp:8000` (USB) or your computer's LAN IP. Expo Go cannot load the voice assistant's native module; voice needs an EAS-built Android APK.

Full setup, env vars, and troubleshooting: **[CAREKOSH_DEVELOPER_GUIDE.md](CAREKOSH_DEVELOPER_GUIDE.md)**.

---

## Documentation

### Start here (current, 7 Oct 2026)

| Document | Purpose |
|---|---|
| [docs/CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md](docs/CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md) | Main onboarding entry: architecture, setup, data model, request flow, voice assistant, CI/CD, release |
| [docs/API_TRACEABILITY.md](docs/API_TRACEABILITY.md) | Every endpoint, traced to its handler, tables and tests |
| [docs/INDEX.html](docs/INDEX.html) | Documentation home (open in a browser) |
| docs/documentation-audit-2026-10-07/README.md (local review reference; not published) | What the 7 Oct 2026 documentation audit checked and corrected |

### Root guides (shorter summaries)

| Document | Purpose |
|---|---|
| [CAREKOSH_DEVELOPER_GUIDE.md](CAREKOSH_DEVELOPER_GUIDE.md) | Architecture, setup, env vars, API, schema, auth, CI/CD, troubleshooting (summary; the complete guide above is the main entry) |
| [CAREKOSH_ROADMAP.md](CAREKOSH_ROADMAP.md) | PR history, status, Play Store launch checklist, v1.1 plans |

### HTML references (repo root, open in browser)

| Document | Theme | Purpose |
|---|---|---|
| `carekosh_architecture_diagrams.html` | Dark navy/teal · SVG | 5 architecture diagrams — system, auth, CI/CD, data model, screen map |
| `CAREKOSH_E2E_VERIFICATION_GUIDE.html` | Warm cream/amber | curl recipes for staging + production smoke tests |
| `CAREKOSH_ENVIRONMENT_ARCHITECTURE.html` | Warm cream/amber | dev / staging / production wiring, env var matrix, quirks |
| `CAREKOSH_BUILD_DEPLOY_FLOW.html` | Warm cream/amber | Q&A — what each trigger (PR, label, merge, eas build) produces |
| `CAREKOSH_DEPLOYMENT_STRATEGY.html` | Warm cream/amber | 4 strategies ranked, decision matrix, rollback |

### Deep-dive guides (`docs/`)

| Document | Use when |
|---|---|
| [docs/NEW_DEVELOPER_QUICKSTART.md](docs/NEW_DEVELOPER_QUICKSTART.md) | First 30 minutes — clone → run → register |
| [docs/LOCAL_TESTING_COMPLETE_GUIDE.md](docs/LOCAL_TESTING_COMPLETE_GUIDE.md) | Docker + Expo troubleshooting long-tail |
| [docs/USB_ADB_REVERSE_GUIDE.md](docs/USB_ADB_REVERSE_GUIDE.md) | Wi-Fi doesn't work — use USB |
| [docs/GIT_WORKFLOW_GUIDE.md](docs/GIT_WORKFLOW_GUIDE.md) | Branching, commits, PR flow, fork contributions |
| [docs/CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md](docs/CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md) | Main onboarding entry (see "Start here") |
| [docs/BACKEND_HARDENING.md](docs/BACKEND_HARDENING.md) | Backend safety changes (Sept 2026 onward) and the release gate for the one-way migration `0007` |
| [docs/VOICE_INVENTORY_AND_ORDER_DRAFTS.md](docs/VOICE_INVENTORY_AND_ORDER_DRAFTS.md) | Current AI voice architecture, stack, HTTP paths, consent, allowances, drafts and device checks |
| [docs/VOICE_AGENT_SETUP.md](docs/VOICE_AGENT_SETUP.md) | Current setup entry and retained hosted/Alba implementation history |
| [docs/DEVOPS_AND_ARCHITECTURE.md](docs/DEVOPS_AND_ARCHITECTURE.md) | Why we chose what we chose; hosting, DB, auth, CI rationale |
| [docs/ENVIRONMENT_SPLIT.md](docs/ENVIRONMENT_SPLIT.md) | Neon + Render per-environment operational detail |
| [docs/EMAIL_VERIFICATION_GUIDE.md](docs/EMAIL_VERIFICATION_GUIDE.md) | Full auth email flow — verification, password reset, deletion |
| [docs/EXPO_AND_PLAY_STORE_GUIDE.md](docs/EXPO_AND_PLAY_STORE_GUIDE.md) | EAS + Play Console launch setup |
| [docs/PLAY_STORE_RELEASE_HARDENING_GOAL_9.md](docs/PLAY_STORE_RELEASE_HARDENING_GOAL_9.md) | Goal 9 Android/Play Store privacy, permissions, backup, reviewer, and Data Safety notes (historical goal record, June 2026) |
| [docs/LAUNCH_READINESS_RUNBOOK_GOAL_10.md](docs/LAUNCH_READINESS_RUNBOOK_GOAL_10.md) | Goal 10/11 backup, restore, smoke, rollback, monitoring-template, and incident runbook (June 2026) |
| [docs/LAUNCH_READINESS_EVIDENCE_GOAL_10.md](docs/LAUNCH_READINESS_EVIDENCE_GOAL_10.md) | Non-secret launch-readiness evidence from June 2026: restore drill, smoke runs, coverage, cold-start, remaining gaps (historical) |
| [docs/TECHNICAL_CHALLENGES.md](docs/TECHNICAL_CHALLENGES.md) | Post-mortems — bugs found and fixed (historical) |
| [docs/PROJECT_LEARNINGS_AND_JOURNEY.md](docs/PROJECT_LEARNINGS_AND_JOURNEY.md) | The full narrative — migrations, decisions, PRs #1–#13 plus June launch-readiness goals (historical) |
| [docs/PHASE1_AUTH_HARDENING.md](docs/PHASE1_AUTH_HARDENING.md) | PR #12 change summary — auth hardening (historical) |
| [docs/PHASE2_ACCOUNT_DELETION.md](docs/PHASE2_ACCOUNT_DELETION.md) | PR #13 change summary — account deletion + Profile screen (historical) |

---

## Project status

- **Earlier (June 2026):** described as feature-complete for v1 and preparing for Play Store closed testing; `v1.0.0` was tagged at `835fad3` (`main`).
- **Current (7 Oct 2026):** the feature branch `feature/backend-hardening-ai-voice-agent-foundation` (`03cfebb`) carries backend hardening (migrations `0007`–`0010`) and the read-only voice assistant. It is not merged and has no pull request. Migration `0007` cannot be downgraded, so a database upgraded by this branch cannot go back to `main`'s schema without a restore.
- **NOT VERIFIED:** Play Console track status, the commit each Render service runs, and each database's Alembic revision.

See [CAREKOSH_ROADMAP.md](CAREKOSH_ROADMAP.md) for the launch checklist.

---

## Key technical decisions

- **Migrated from offline-first to server-first (PRs #4–#8).** Offline editing of life-critical inventory creates merge conflicts with real-world consequences. A server-first design eliminates the conflict class; OCC handles the last remaining race.
- **Cache persistence stores a read-only snapshot of TanStack Query data to AsyncStorage (PR #16).** Unlike the old offline-first architecture, cached data is never pushed to the server — mutations always go server-first. Cache is cleared on both logout and login for shared-device privacy, and a schema `buster` tied to the app version auto-invalidates stale snapshots on upgrade. Kill switch (`ENABLE_CACHE_PERSISTENCE`) in `providers/QueryProvider.tsx`; it is a code constant and over-the-air updates are disabled, so turning it off reaches installed phones only through a new build.
- **Skeleton screens + cold-start auto-retry (PRs #15, #16).** First-launch and post-idle waits are covered by animated skeleton placeholders (matching each screen's layout) and, on login, an auto-retry loop that health-checks the server every 5 s (max 12 attempts) with a Cancel button — replacing the static "server is starting up" text.
- **Migrated hosting from Railway to Render (PR #1).** Render's Docker web services, deploy hooks, and Neon integration were a better fit than Railway's per-service pricing.
- **Rebranded VitalTrack → CareKosh (PRs #10, #11) without renaming directories.** User-visible only — internal paths kept stable to avoid breaking Render service URLs, EAS config references, and historical PR links.
- **Removed unused backend `/sync/*` endpoints after deleting mobile sync.** The app remains server-first; mutations use the normal REST endpoints and cached data is never pushed back.
- **Backend quality gates protect the server contract.** The `test-backend` job fails on Ruff, pytest, an exact `/api/v1` route count, and per-file coverage floors (70%) for `items.py` and `orders.py`. The expected route count is `39` on `main` and `44` on the feature branch (five `/api/v1/ai/*` routes added). `mypy` (23 errors in the 7 Oct 2026 run) and Trivy stay advisory until their baselines are cleaned up. Because the `main` ruleset has no required status checks, these gates rely on review discipline rather than GitHub enforcement.
- **Inventory assistant with local drafts (feature branch).** Local parsers handle familiar wording; optionally consented Groq interprets unfamiliar supported requests. Voice can edit an unsaved draft, but has no order-save, stock-update, apply or supplier-send operation. Final order commitment requires touch review. Recognition and text understanding are separate choices.

---

## License

Private / unreleased. All rights reserved.
