# CareKosh: Complete Developer Guide (Extended Deep-Dive)

> **For the canonical concise guide, see the repo-root `CAREKOSH_DEVELOPER_GUIDE.md`.** This document is the extended deep-dive: architecture reasoning, pipeline internals, and worked-example workflows. If a fact conflicts, the root guide is authoritative for the current build.

CareKosh (formerly **VitalTrack**, rebranded in PR #10/#11) is a home-ICU medical inventory tracker. The stack is React Native + Expo on the mobile side and FastAPI + PostgreSQL (Neon) on the server side, deployed to Render.

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Where Things Live](#2-where-things-live)
3. [The Three Clouds Explained](#3-the-three-clouds-explained)
4. [CI/CD Pipeline Deep Dive](#4-cicd-pipeline-deep-dive)
5. [Where Are Builds Generated?](#5-where-are-builds-generated)
6. [Complete Developer Workflow](#6-complete-developer-workflow)
7. [Step-by-Step: Your First Feature](#7-step-by-step-your-first-feature)
8. [Testing Strategies](#8-testing-strategies)
9. [Common Questions Answered](#9-common-questions-answered)

---

## 1. Architecture Overview

### The Big Picture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CAREKOSH ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   YOUR CODE                                                                 │
│   (GitHub Repository)                                                       │
│        │                                                                    │
│        │ git push                                                           │
│        ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     GITHUB ACTIONS (CI/CD)                          │   │
│   │                                                                     │   │
│   │   Tests backend + mobile, then:                                     │   │
│   │     • POST Render deploy hook (on push to main)                     │   │
│   │     • Trigger EAS Build (preview APK, gated by 'build-apk' label)  │   │
│   │     • Trigger EAS Build production (currently disabled in CI)      │   │
│   └─────────┬────────────────────────────┬──────────────────────────────┘   │
│             │                            │                                  │
│             ▼                            ▼                                  │
│   ┌──────────────────────┐     ┌───────────────────────┐                    │
│   │   RENDER + NEON      │     │   EXPO / EAS CLOUD   │                    │
│   │                      │     │                      │                    │
│   │  FastAPI (Docker)    │     │  Compiles RN → APK   │                    │
│   │  PostgreSQL (Neon)   │     │  Compiles RN → AAB   │                    │
│   │                      │     │  Hosts build artifacts│                   │
│   │  vitaltrack-api.     │     │                      │                    │
│   │  onrender.com        │     │  expo.dev/.../builds │                    │
│   │  (production)        │     │                      │                    │
│   │                      │     │                      │                    │
│   │  vitaltrack-api-     │     └─────────┬────────────┘                    │
│   │  staging.onrender.   │               │                                 │
│   │  com (staging)       │               │ Download APK/AAB               │
│   └──────────┬───────────┘               ▼                                  │
│              │                   ┌──────────────────────┐                   │
│              │                   │   USER'S PHONE       │                   │
│              │                   │                      │                   │
│              │  HTTPS API ──────▶│  CareKosh app        │                   │
│              │                   │  (Play Store or APK) │                   │
│              │                   │                      │                   │
│              └──────────────────▶│  calls Render HTTPS  │                   │
│                                  └──────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key point:** backend hosting is **Render** (migrated from Railway in PR #1 `migrate/railway-to-render`). The Render service builds the Dockerfile and runs it with Gunicorn + Uvicorn workers. PostgreSQL is hosted on **Neon** (Singapore region) on a separate service — two independent Neon databases exist, one per environment (see `docs/ENVIRONMENT_SPLIT.md`).

---

## 2. Where Things Live

### Four Cloud Services (not three — kept the original section title for continuity)

| Service | Purpose | URL | Stores |
|---------|---------|-----|--------|
| **GitHub** | Code + CI/CD | `github.com/rishabhrd09/vitaltrack` | Source, workflows, issues, PRs |
| **Render** | Backend hosting | `vitaltrack-api.onrender.com` (prod), `vitaltrack-api-staging.onrender.com` (staging) | FastAPI container |
| **Neon** | Managed PostgreSQL | `*.neon.tech` | Two DBs: `neondb` (prod), `vitaltrack_staging` (staging) |
| **Expo / EAS** | Mobile builds | `expo.dev` | APKs (dev/preview), AABs (production) |

### Important: Render ≠ Mobile App Builds

```
WRONG:   "Render builds my mobile app"
RIGHT:   "Render only hosts the BACKEND (Python/FastAPI in Docker)"
         "Expo/EAS builds the MOBILE APP (React Native → APK/AAB)"
```

The Play Store serves the user the AAB that EAS produced. Render has nothing to do with mobile distribution.

---

## 3. The Three Clouds Explained

### Cloud 1: GitHub (Code + CI/CD)

- Stores every source file in `vitaltrack-backend/` and `vitaltrack-mobile/`, plus `.github/workflows/ci.yml` (the pipeline definition).
- Runs GitHub Actions jobs on PR and push-to-main.
- Does **not** host anything at runtime — no containers, no DB, no APKs.

### Cloud 2: Render (Backend Hosting)

- Two Web Services: production + staging, each wired to its own Neon database.
- Each reads the Dockerfile in `vitaltrack-backend/`, runs the multi-stage build, runs `docker-entrypoint.sh` on startup (which runs `alembic upgrade head`, then execs `gunicorn -w 4 -k uvicorn.workers.UvicornWorker`).
- Both watch the `main` branch and auto-redeploy on merge.
- Free tier sleeps after ~15 minutes idle; first request after sleep takes 30–60 s (cold start). UptimeRobot or an equivalent keep-alive ping is typically pointed at `/health` to avoid that.

### Cloud 3: Expo / EAS (Mobile App Builds)

```
EAS = Expo Application Services

Profile        Output     Use case
─────────────  ────────   ───────────────────────────────────
development    APK        Local dev with hot reload
preview        APK        Internal/beta testing (→ staging backend)
production     AAB        Play Store (→ production backend)
```

`eas.json` profile URLs (authoritative — check `vitaltrack-mobile/eas.json`):

```json
{
  "development": { "env": { "EXPO_PUBLIC_API_URL": "http://localhost:8000" } },
  "preview":     { "env": { "EXPO_PUBLIC_API_URL": "https://vitaltrack-api-staging.onrender.com" } },
  "production":  { "env": { "EXPO_PUBLIC_API_URL": "https://vitaltrack-api.onrender.com" } }
}
```

`EXPO_PUBLIC_API_URL` is **baked into the JS bundle at build time**. You cannot flip a preview APK to production at runtime — build a new one.

---

## 4. CI/CD Pipeline Deep Dive

### `.github/workflows/ci.yml` triggers

```
pull_request → main     (test-backend, test-frontend, security-scan, pr-check,
                         build-preview if PR labeled "build-apk")
push → main             (test-backend, test-frontend, security-scan, deploy-backend)
workflow_dispatch       (manual run, any branch)
```

### Jobs

| Job | Purpose |
|-----|---------|
| `test-backend` | pytest + ruff + mypy against Postgres 16 service container |
| `test-frontend` | `tsc --noEmit` + `eslint` + `expo-doctor` |
| `security-scan` | Trivy filesystem scan for CRITICAL + HIGH vulns |
| `pr-check` | Merge gate — requires tests + security passing |
| `deploy-backend` | `curl -X POST $RENDER_DEPLOY_HOOK_URL` on push to main |
| `build-preview` | `eas build --profile preview --platform android`, only runs when the PR has the `build-apk` label |
| `build-production` | `eas build --profile production` — **currently disabled via `if: false`** until mobile release cadence is established |

Both Render services are also individually configured to auto-deploy when `main` receives a push — the CI hook is an extra guarantee, not the only trigger.

### Trigger Matrix

```
ACTION                        │ WHAT RUNS
──────────────────────────────┼─────────────────────────────────────────────
Push to feature branch        │ Nothing (no PR, not main)
                              │
Create PR → main              │ test-backend, test-frontend, security-scan,
                              │ pr-check. build-preview only if labeled.
                              │
PR labeled 'build-apk'        │ build-preview runs (APK → EAS)
                              │
Merge PR to main              │ test-backend, test-frontend, security-scan,
(or push direct to main)      │ deploy-backend (POSTs Render hook). Render
                              │ also auto-deploys independently.
                              │ build-production is disabled (if: false).
```

### Why `build-preview` is label-gated

EAS builds are a paid resource on the free tier (30/month). Building an APK on every single PR would burn through that quickly. The `build-apk` label lets the reviewer explicitly opt-in when the PR actually needs physical device testing.

---

## 5. Where Are Builds Generated?

### The key answer

GitHub Actions doesn't build the APK. It **asks EAS to build it**. The binary is produced on Expo's servers.

```
GitHub Actions                   Expo/EAS Cloud
───────────────                  ──────────────
  │                                 │
  │ 1. npx eas build                │
  │    --profile preview            │
  │    --platform android           │
  │    --non-interactive            │
  │                                 │
  │ 2. Command dispatches ─────────▶│
  │                                 │
  │                                 │ 3. EAS pulls source, installs deps,
  │                                 │    runs Gradle, signs APK.
  │                                 │
  │                                 │ 4. Stores APK on Expo CDN.
  │                                 │
  │ 5. Build URL + logs ◀───────────│
```

### Finding your builds

**Web**: https://expo.dev → your project → **Builds** tab.

**CLI**:
```bash
cd vitaltrack-mobile
npx eas build:list
```

**GitHub Actions logs**: the `build-preview` job prints a URL of the form `https://expo.dev/accounts/.../builds/<uuid>` in its final step.

---

## 6. Complete Developer Workflow

### Golden rule

> Never push directly to `main`. Always: feature branch → PR → review → merge.

`main` is branch-protected — tests + security scan + approval are required before merge.

### Complete flow

```
STEP 1 — Create feature branch
  git checkout main
  git pull origin main
  git checkout -b feature/add-export-button

STEP 2 — Make code changes
  Edit files in vitaltrack-backend/ or vitaltrack-mobile/.

STEP 3 — Local testing (required before push)
  Terminal 1:
    cd vitaltrack-backend
    docker compose -f docker-compose.dev.yml up --build
  Terminal 2:
    cd vitaltrack-mobile
    npx expo start --clear
  Scan QR with Expo Go on your phone and exercise the change end-to-end.

STEP 4 — Commit & push
  git add .
  git commit -m "feat: add export button to inventory screen"
  git push origin feature/add-export-button
  (Pushing a feature branch does NOT trigger CI.)

STEP 5 — Open PR
  GitHub → "Compare & pull request" → fill in body → submit.
  CI starts: backend tests, frontend tests, security scan, pr-check.
  If you want an APK for device testing, apply the `build-apk` label.

STEP 6 — Wait for CI (~5–10 min without APK, +15 min with APK)
  All required checks must be green before merge.

STEP 7 — Download preview APK (if labeled)
  expo.dev → CareKosh → Builds → latest preview → download/install.
  Preview APKs point at STAGING backend — safe to exercise any flow.

STEP 8 — Review
  Address feedback, push fix-up commits, CI re-runs automatically.

STEP 9 — Merge to main
  "Squash and merge" is the house style.
  Triggers: backend+frontend tests, security scan, deploy-backend hook.
  Render auto-redeploys both production and staging (staging from main
  head same as production — if you want environment divergence, you need
  a release branch strategy).

STEP 10 — Verify production
  curl https://vitaltrack-api.onrender.com/health
  (expect {"status":"healthy","environment":"production"})
```

See `docs/GIT_WORKFLOW_GUIDE.md` for the commit-message convention and fork workflow.

---

## 7. Step-by-Step: Your First Feature

### Scenario: add a "Clear All" button to Inventory

```bash
git clone https://github.com/rishabhrd09/vitaltrack.git
cd vitaltrack

git checkout main
git pull origin main

git checkout -b feature/clear-all-button
```

Edit `vitaltrack-mobile/app/(tabs)/inventory.tsx`. Because we're server-first (PR #8), any mutation should go through `useServerMutations` and invalidate React Query caches — not touch an AsyncStorage-backed store.

Local test:

```bash
# Terminal 1
cd vitaltrack-backend
docker compose -f docker-compose.dev.yml up --build

# Terminal 2
cd vitaltrack-mobile
npm install --legacy-peer-deps
npx expo start --clear
# Scan QR with Expo Go
```

Commit and PR:

```bash
git add .
git commit -m "feat: add clear-all button to inventory"
git push origin feature/clear-all-button
```

Open the PR on GitHub. If you want a preview APK, add the `build-apk` label. Wait for green checks, get a review, squash-merge.

---

## 8. Testing Strategies

### Testing Pyramid

```
         ▲
        /│\   E2E / manual (preview APK on a real device)
       / │ \  - Full user flows
      /──┼──\ - 5–10 critical scenarios
     /   │   \
    /────┼────\ Integration tests (CI/CD)
   /     │     \ - API endpoint tests with Postgres service container
  /──────┼──────\ - Frontend component tests
 /       │       \ Unit tests (CI/CD)
/────────┼────────\ - Pure function, utility, schema tests
```

### When to test what

| Test type | When | How | Where |
|---|---|---|---|
| Unit tests | Every PR | `pytest` / component tests | GitHub Actions |
| Integration tests | Every PR | pytest with postgres:16 service | GitHub Actions |
| Preview APK test | Before merge of user-visible changes | Manual | Your phone |
| Production test | After merge | Manual smoke | Production app |

### Preview APK checklist

```
[ ] App launches without crash on cold open
[ ] New feature works end-to-end
[ ] Existing critical flows (login, register, add item, create order) unbroken
[ ] Network error behaviour — airplane mode, then return — doesn't wipe data
[ ] Error messages match the copy spec (see services/api.ts status switch)
[ ] Logout works on first tap (no double-tap required)
```

---

## 9. Common Questions Answered

### Q1. "I pushed to my feature branch but nothing happened."

Correct. CI runs on **pull request** and **push to main**, not on feature-branch pushes. Open a PR to see the full pipeline.

### Q2. "Where do I download the preview APK?"

Three ways:
- https://expo.dev → project → Builds
- `npx eas build:list` in `vitaltrack-mobile/`
- The `build-preview` job log in GitHub Actions

Remember, the job only runs if the PR has the `build-apk` label.

### Q3. "CI passed but I can't find the APK."

If the PR isn't labeled `build-apk`, the build-preview job never ran. Apply the label and push a trivial commit (or re-run the workflow) to trigger it.

### Q4. "APK vs AAB?"

| Format | Use | Install |
|---|---|---|
| APK | Dev/preview | Direct sideload (`adb install` or downloaded file) |
| AAB | Play Store | Upload to Play Console — Google generates device-specific APKs |

### Q5. "My PR tests passed but Render didn't deploy."

Expected. The `deploy-backend` job runs only on pushes to `main`. Render is also wired to auto-deploy `main` independently, so once the PR is merged the deploy fires twice (safe — idempotent).

### Q6. "How do I test backend changes before merge?"

Two options:
1. **Local Docker** — `docker-compose -f docker-compose.dev.yml up --build`. This is the normal path.
2. **Staging** — merge the backend change, wait for Render to auto-deploy staging, exercise via the preview APK. This is the "smoke on real infrastructure" path before you cut a production release.

Preview APKs talk to the **staging** backend, not production — PR #2 split the environments specifically so testing wouldn't pollute real data.

### Q7. "Can I run CI manually?"

Yes: Actions → workflow → **Run workflow** → pick branch.

### Q8. "What if CI fails?"

Click the failing job, read the log, fix locally, push. CI re-runs automatically on the PR.

---

## Quick Reference Card

```
START NEW FEATURE
  git checkout main && git pull && git checkout -b feature/<name>

LOCAL DEV
  cd vitaltrack-backend && docker compose -f docker-compose.dev.yml up --build
  cd vitaltrack-mobile && npx expo start --clear

COMMIT & PUSH
  git add . && git commit -m "feat: <desc>" && git push origin HEAD

FIND PREVIEW APK
  expo.dev → CareKosh → Builds → Download
  (label the PR 'build-apk' to trigger the build)

CHECK BACKEND
  curl https://vitaltrack-api.onrender.com/health
  curl https://vitaltrack-api-staging.onrender.com/health

MANUAL BUILD FROM LAPTOP
  cd vitaltrack-mobile
  npx eas build --profile preview --platform android

IMPORTANT URLS
  GitHub repo       https://github.com/rishabhrd09/vitaltrack
  Production API    https://vitaltrack-api.onrender.com
  Staging API       https://vitaltrack-api-staging.onrender.com
  Expo builds       https://expo.dev/accounts/<username>/projects/carekosh-mobile/builds
  Render dashboard  https://dashboard.render.com
  Neon dashboard    https://console.neon.tech
```

---

## Glossary

| Term | Meaning |
|------|---------|
| CI | Continuous Integration — automated testing on every change |
| CD | Continuous Deployment — automated release on merge |
| PR | Pull Request — request to merge a branch into `main` |
| APK | Android Package — installable app file (sideload) |
| AAB | Android App Bundle — Play Store submission format |
| EAS | Expo Application Services — build + submit cloud |
| Render | Container hosting platform (replaced Railway in PR #1) |
| Neon | Managed serverless Postgres |
| Expo Go | Development client app for running React Native in dev mode |
| Server-first | Architectural pattern where server is source of truth for domain data, caches are read-through via React Query (PR #8) |

---

**Further reading:**
- Root `CAREKOSH_DEVELOPER_GUIDE.md` — concise single-page reference
- `docs/DEVOPS_AND_ARCHITECTURE.md` — longer narrative on the why
- `docs/ENVIRONMENT_SPLIT.md` — staging/production isolation
- `docs/LOCAL_TESTING_COMPLETE_GUIDE.md` — troubleshooting local setup
- `docs/GIT_WORKFLOW_GUIDE.md` — commit message style, fork workflow, branch protection
- `docs/EMAIL_VERIFICATION_GUIDE.md` — Brevo + verification flow
- `docs/PHASE1_AUTH_HARDENING.md` · `docs/PHASE2_ACCOUNT_DELETION.md` — retrospective change logs

*Last updated: 2026-04-19.*
