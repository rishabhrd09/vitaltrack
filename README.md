# CareKosh

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
- Raises "needs attention" alerts for low / out-of-stock / expiring items
- Manages orders end-to-end (pending → ordered → received → applied to stock)
- Maintains an audit log of every stock change
- Keeps caregivers aligned through server-backed reads/writes and query revalidation (server-first; no offline merge conflicts)

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
| CI/CD | GitHub Actions · blocking backend tests/Ruff/route/coverage gates · advisory mypy/Trivy baselines · Render deploy hook |
| Email | Brevo HTTP API for transactional email; SMTP config keys remain from the Mailtrap/SMTP era |

### Architecture

CareKosh is **server-first**, not offline-first. The backend is the single source of truth; the mobile app surfaces write errors explicitly rather than queuing them. Optimistic concurrency control (a `version` column on `items`, HTTP 409 on stale updates) handles concurrent edits. See [CAREKOSH_DEVELOPER_GUIDE.md §1](CAREKOSH_DEVELOPER_GUIDE.md#1-architecture-overview) for the rationale.

---

## End-to-end map

Mobile screens call `vitaltrack-mobile/services/api.ts`, which reads `EXPO_PUBLIC_API_URL` from the active Expo/EAS profile and sends JSON to the FastAPI app. The backend mounts `/api/v1/auth`, `/categories`, `/items`, `/orders`, and `/activities`; `/health` and `/live` are root-level operational endpoints. PostgreSQL on Neon is the source of truth. The mobile app keeps auth tokens in SecureStore and a read-only TanStack Query display cache in AsyncStorage; it does not queue offline writes or push cached data back to the server.

Environment routing:

| Runtime | Backend | Database | Notes |
|---|---|---|---|
| Local Expo / dev APK | `http://localhost:8000` by default, or LAN/ADB override | local Docker Postgres | development profile allows local cleartext HTTP |
| Preview APK | `https://vitaltrack-api-staging.onrender.com` | Neon staging database | built by EAS preview profile; PR label `build-apk` can trigger CI build |
| Production AAB | `https://vitaltrack-api.onrender.com` | Neon production database | manual EAS/Play flow today; CI production AAB job is disabled |

Deployment routing: PRs run blocking backend/frontend gates, with mypy and Trivy advisory. Merging to `main` triggers the backend deploy job; when `RENDER_DEPLOY_HOOK` is configured, CI POSTs that Render hook, and Render's own GitHub auto-deploy can also rebuild connected services. The Docker entrypoint waits for Postgres, applies Alembic, then launches Gunicorn/Uvicorn. Mobile production release remains manual until the disabled `build-production` job is intentionally re-enabled.

---

## Quick start

```bash
git clone https://github.com/rishabhrd09/vitaltrack.git && cd vitaltrack

# Backend
cd vitaltrack-backend
cp .env.example .env                       # edit SECRET_KEY
docker compose -f docker-compose.dev.yml up --build -d
# Alembic migrations auto-run via docker-entrypoint.sh

# Mobile (new terminal)
cd ../vitaltrack-mobile
npm install --legacy-peer-deps
npx expo start --clear
```

Scan the QR with Expo Go. Create an account and start tracking inventory.

Full setup, env vars, and troubleshooting: **[CAREKOSH_DEVELOPER_GUIDE.md](CAREKOSH_DEVELOPER_GUIDE.md)**.

---

## Documentation

### Canonical guides (repo root)

| Document | Purpose |
|---|---|
| [CAREKOSH_DEVELOPER_GUIDE.md](CAREKOSH_DEVELOPER_GUIDE.md) | Architecture, setup, env vars, API, schema, auth, CI/CD, troubleshooting |
| [CAREKOSH_ROADMAP.md](CAREKOSH_ROADMAP.md) | PR history, current status, Play Store launch checklist, v1.1 plans |

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
| [docs/CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md](docs/CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md) | Extended deep-dive (the developer guide's long-form companion) |
| [docs/DEVOPS_AND_ARCHITECTURE.md](docs/DEVOPS_AND_ARCHITECTURE.md) | Why we chose what we chose; hosting, DB, auth, CI rationale |
| [docs/ENVIRONMENT_SPLIT.md](docs/ENVIRONMENT_SPLIT.md) | Neon + Render per-environment operational detail |
| [docs/EMAIL_VERIFICATION_GUIDE.md](docs/EMAIL_VERIFICATION_GUIDE.md) | Full auth email flow — verification, password reset, deletion |
| [docs/EXPO_AND_PLAY_STORE_GUIDE.md](docs/EXPO_AND_PLAY_STORE_GUIDE.md) | EAS + Play Console launch setup |
| [docs/PLAY_STORE_RELEASE_HARDENING_GOAL_9.md](docs/PLAY_STORE_RELEASE_HARDENING_GOAL_9.md) | Goal 9 Android/Play Store privacy, permissions, backup, reviewer, and Data Safety notes |
| [docs/LAUNCH_READINESS_RUNBOOK_GOAL_10.md](docs/LAUNCH_READINESS_RUNBOOK_GOAL_10.md) | Goal 10/11 backup, restore, smoke, rollback, monitoring-template, and incident runbook |
| [docs/LAUNCH_READINESS_EVIDENCE_GOAL_10.md](docs/LAUNCH_READINESS_EVIDENCE_GOAL_10.md) | Non-secret launch-readiness evidence: restore drill, smoke runs, coverage, cold-start, remaining gaps |
| [docs/TECHNICAL_CHALLENGES.md](docs/TECHNICAL_CHALLENGES.md) | Post-mortems — bugs found and fixed |
| [docs/PROJECT_LEARNINGS_AND_JOURNEY.md](docs/PROJECT_LEARNINGS_AND_JOURNEY.md) | The full narrative — migrations, decisions, PRs #1–#13 plus June launch-readiness goals |
| [docs/PHASE1_AUTH_HARDENING.md](docs/PHASE1_AUTH_HARDENING.md) | PR #12 change summary — auth hardening |
| [docs/PHASE2_ACCOUNT_DELETION.md](docs/PHASE2_ACCOUNT_DELETION.md) | PR #13 change summary — account deletion + Profile screen |

---

## Project status

Feature-complete for v1; preparing for Play Store closed testing. See [CAREKOSH_ROADMAP.md](CAREKOSH_ROADMAP.md) for the full launch checklist.

---

## Key technical decisions

- **Migrated from offline-first to server-first (PRs #4–#8).** Offline editing of life-critical inventory creates merge conflicts with real-world consequences. A server-first design eliminates the conflict class; OCC handles the last remaining race.
- **Cache persistence stores a read-only snapshot of TanStack Query data to AsyncStorage (PR #16).** Unlike the old offline-first architecture, cached data is never pushed to the server — mutations always go server-first. Cache is cleared on both logout and login for shared-device privacy, and a schema `buster` tied to the app version auto-invalidates stale snapshots on upgrade. Kill switch (`ENABLE_CACHE_PERSISTENCE`) in `providers/QueryProvider.tsx` for instant rollback.
- **Skeleton screens + cold-start auto-retry (PRs #15, #16).** First-launch and post-idle waits are covered by animated skeleton placeholders (matching each screen's layout) and, on login, an auto-retry loop that health-checks the server every 5 s (max 12 attempts) with a Cancel button — replacing the static "server is starting up" text.
- **Migrated hosting from Railway to Render (PR #1).** Render's Docker web services, deploy hooks, and Neon integration were a better fit than Railway's per-service pricing.
- **Rebranded VitalTrack → CareKosh (PRs #10, #11) without renaming directories.** User-visible only — internal paths kept stable to avoid breaking Render service URLs, EAS config references, and historical PR links.
- **Removed unused backend `/sync/*` endpoints after deleting mobile sync.** The app remains server-first; mutations use the normal REST endpoints and cached data is never pushed back.
- **Backend quality gates now protect the server contract.** CI blocks on Ruff, pytest, exact `/api/v1` route count `39`, and per-file coverage floors for `items.py` and `orders.py`. `mypy` and Trivy stay advisory until their existing baselines are cleaned up.

---

## License

Private / unreleased. All rights reserved.
