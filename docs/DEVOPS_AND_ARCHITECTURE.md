# VitalTrack: DevOps, Architecture & CI/CD Guide

> **Complete technical reference for understanding the infrastructure, deployment pipeline, and technology decisions behind VitalTrack.**

---

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Technology Stack](#technology-stack)
3. [CI/CD Pipeline Deep Dive](#cicd-pipeline-deep-dive)
4. [Deployment Architecture](#deployment-architecture)
5. [DevOps Mental Model](#devops-mental-model)
6. [Setting Up Secrets](#setting-up-secrets)
7. [Database Architecture](#database-architecture)
8. [Security Considerations](#security-considerations)

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           VITALTRACK ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │   Mobile    │     │   GitHub    │     │   Railway   │     │  PostgreSQL │   │
│  │  (Expo/RN)  │────▶│  Actions    │────▶│   (Docker)  │────▶│  (Database) │   │
│  └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘   │
│        │                   │                    │                    │          │
│        │                   │                    │                    │          │
│        ▼                   ▼                    ▼                    ▼          │
│   User Device         CI/CD Tests         FastAPI Server        Data Layer     │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### The Data Flow

```
User Action (Mobile App)
        │
        ▼
┌───────────────────┐
│  React Native UI  │  ◀── Zustand State Management
│  (TypeScript)     │  ◀── Offline-First with AsyncStorage
└────────┬──────────┘
         │
         │ HTTP/HTTPS (REST API)
         ▼
┌───────────────────┐
│  FastAPI Backend  │  ◀── JWT Authentication
│  (Python 3.11)    │  ◀── Rate Limiting
└────────┬──────────┘
         │
         │ SQLAlchemy ORM (Async)
         ▼
┌───────────────────┐
│   PostgreSQL 16   │  ◀── ACID Transactions
│   (Railway)       │  ◀── UUID Primary Keys
└───────────────────┘
```

---

## Technology Stack

### Frontend (Mobile)

| Component | Technology | Why This Choice |
|-----------|------------|-----------------|
| **Framework** | React Native + Expo | Cross-platform, fast development, OTA updates |
| **Language** | TypeScript | Type safety, better DX, catch errors early |
| **State** | Zustand | Lightweight, no boilerplate, great DevTools |
| **Navigation** | Expo Router | File-based routing, deep linking support |
| **Storage** | AsyncStorage + SecureStore | Offline data + encrypted credentials |
| **HTTP Client** | Native Fetch | No extra dependencies |

### Backend (API)

| Component | Technology | Why This Choice |
|-----------|------------|-----------------|
| **Framework** | FastAPI | Async, auto-docs, type hints, fast |
| **Language** | Python 3.11 | Mature ecosystem, easy to maintain |
| **ORM** | SQLAlchemy 2.0 (Async) | Type-safe queries, migrations |
| **Auth** | JWT (python-jose) | Stateless, scalable, industry standard |
| **Validation** | Pydantic v2 | Auto-serialization, schema validation |
| **Server** | Uvicorn | ASGI, async support, production-ready |

### Database

| Component | Technology | Why This Choice |
|-----------|------------|-----------------|
| **Engine** | PostgreSQL 16 | ACID, JSON support, rock-solid |
| **Hosting** | Railway | Managed, auto-backups, easy scaling |
| **Migrations** | Alembic | Version-controlled schema changes |
| **Driver** | asyncpg | Async PostgreSQL, high performance |

### DevOps & Infrastructure

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Source Control** | GitHub | Code storage, collaboration |
| **CI/CD** | GitHub Actions | Automated testing & deployment |
| **Backend Hosting** | Railway | Container deployment, auto-scaling |
| **Mobile Builds** | Expo EAS | Cloud APK/AAB builds |
| **Containerization** | Docker | Consistent environments |
| **Security Scanning** | Trivy | Vulnerability detection |

---

## CI/CD Pipeline Deep Dive

### What is CI/CD?

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        YOUR CODE JOURNEY                                │
│                                                                         │
│   Developer PC  ──→  GitHub  ──→  CI Pipeline  ──→  Production         │
│   (git push)         (stores)     (tests/builds)   (deployed app)      │
└─────────────────────────────────────────────────────────────────────────┘
```

- **CI (Continuous Integration)**: Automatically test code when pushed
- **CD (Continuous Deployment)**: Automatically deploy when tests pass

### DevOps Mindset

> "How do I automate everything between my laptop and production so humans don't make mistakes?"

### Pipeline Triggers

```
┌──────────────────┬─────────────────────────────────────────────────────┐
│  EVENT           │  WHAT RUNS                                          │
├──────────────────┼─────────────────────────────────────────────────────┤
│  Push to main    │  Tests → Deploy (if secrets exist)                  │
│  Pull Request    │  Tests + Security Scan + Preview Build (for review) │
│  Manual Trigger  │  You choose what to run                             │
└──────────────────┴─────────────────────────────────────────────────────┘
```

### Pipeline Jobs Explained

```yaml
# File: .github/workflows/ci.yml

# 1. BACKEND TESTS (Always runs)
test-backend:
  - Install Python dependencies
  - Run Ruff linter (code quality)
  - Run MyPy (type checking)
  - Verify API imports work
  - Check 30+ endpoints exist

# 2. FRONTEND TESTS (Always runs)
test-frontend:
  - Install Node dependencies
  - Run TypeScript compiler (npx tsc --noEmit)
  - Run ESLint (code quality)
  - Verify Expo app builds

# 3. SECURITY SCAN (Only on Pull Requests)
security-scan:
  if: github.event_name == 'pull_request'
  - Run Trivy vulnerability scanner
  - Check for known CVEs in dependencies

# 4. DEPLOY BACKEND (Only on push to main)
deploy-backend:
  if: github.ref == 'refs/heads/main'
  needs: [test-backend, test-frontend]  # Must pass first
  - Deploy to Railway using RAILWAY_TOKEN

# 5. BUILD PRODUCTION AAB (Only on push to main)
build-production:
  if: github.ref == 'refs/heads/main'
  - Build Android App Bundle using Expo EAS
  - Ready for Play Store upload
```

### The Complete Flow Visualization

```
                           YOUR WORKFLOW
                               │
        ┌──────────────────────┴──────────────────────┐
        │                                              │
   [Push to main]                              [Pull Request]
        │                                              │
        ▼                                              ▼
 ┌──────────────┐                            ┌──────────────┐
 │ Backend Tests│                            │ Backend Tests│
 │ Frontend Tests│                           │ Frontend Tests│
 └──────┬───────┘                            └──────┬───────┘
        │                                           │
        │                                    ┌──────┴───────┐
        │                                    │ Security Scan │
        │                                    │ Preview APK   │
        │                                    └──────┬───────┘
        │                                           │
        ▼                                           ▼
 ┌──────────────┐                            ┌──────────────┐
 │ Deploy to    │                            │ PR Ready to  │
 │ Railway      │                            │ Merge Gate   │
 │ Build AAB    │                            └──────────────┘
 └──────────────┘                                   │
        │                                           │
        ▼                                           ▼
   PRODUCTION                                  MERGE ALLOWED
```

### Understanding Job Dependencies

```yaml
jobs:
  test-backend:    # Runs immediately
  test-frontend:   # Runs immediately (parallel with backend)
  
  deploy-backend:
    needs: [test-backend, test-frontend]  # Waits for both tests
    
  build-production:
    needs: [test-backend, test-frontend]  # Waits for both tests
```

**Why?** Never deploy broken code. If tests fail, deployment is blocked.

---

## Deployment Architecture

### Backend Deployment (Railway)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         RAILWAY DEPLOYMENT                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  GitHub Push ──→ GitHub Actions ──→ Railway CLI ──→ Docker Build       │
│                                                                         │
│  Railway runs:                                                          │
│  ┌─────────────────────────────────────────────────────┐               │
│  │  Docker Container                                    │               │
│  │  ┌─────────────────────────────────────────────────┐│               │
│  │  │  Uvicorn Server (ASGI)                          ││               │
│  │  │  ├── FastAPI Application                        ││               │
│  │  │  │   ├── /api/v1/auth/*                        ││               │
│  │  │  │   ├── /api/v1/categories/*                  ││               │
│  │  │  │   ├── /api/v1/items/*                       ││               │
│  │  │  │   ├── /api/v1/orders/*                      ││               │
│  │  │  │   └── /api/v1/sync/*                        ││               │
│  │  │  └── PostgreSQL Connection Pool                 ││               │
│  │  └─────────────────────────────────────────────────┘│               │
│  └─────────────────────────────────────────────────────┘               │
│                                                                         │
│  Environment Variables: DATABASE_URL, SECRET_KEY, etc.                  │
│  Auto-HTTPS: Railway provides SSL certificate                           │
│  URL: https://vitaltrack-backend.up.railway.app                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Mobile Build (Expo EAS)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EXPO EAS BUILD                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  GitHub Actions ──→ Expo EAS Cloud ──→ Build Artifact                  │
│                                                                         │
│  Build Types:                                                           │
│  ┌─────────────────────────────────────────────────────┐               │
│  │  Preview (development)                               │               │
│  │  ├── APK file                                       │               │
│  │  ├── Downloadable from Actions artifacts            │               │
│  │  └── For internal testing                           │               │
│  ├─────────────────────────────────────────────────────┤               │
│  │  Production (release)                                │               │
│  │  ├── AAB file (Android App Bundle)                  │               │
│  │  ├── Signed with upload key                         │               │
│  │  └── Ready for Play Store                           │               │
│  └─────────────────────────────────────────────────────┘               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## DevOps Mental Model

### 1. The "Secrets" Concept

```
┌─────────────────────────────────────────────────────────────────────────┐
│  GitHub Actions Runner (Fresh VM)                                       │
│                                                                         │
│   ❌ No access to your Railway account                                  │
│   ❌ No access to your Expo account                                     │
│   ❌ No passwords, no keys                                              │
│                                                                         │
│   ✅ UNLESS you store them as "Secrets" in GitHub Settings             │
└─────────────────────────────────────────────────────────────────────────┘
```

**Your pipeline checks:**

```yaml
deploy-to-railway:
  if: secrets.RAILWAY_TOKEN != ''  # Only deploy if token exists
```

**DevOps Thinking:**

> "Never hardcode secrets in code. Store them in GitHub Secrets. This way, even if someone forks your repo, they can't deploy to YOUR Railway."

### 2. Understanding Warnings vs Errors

```
┌─────────────┬────────────────────────────────────────────────────────────┐
│  TYPE       │  IMPACT                                                    │
├─────────────┼────────────────────────────────────────────────────────────┤
│  ❌ Error   │  Pipeline STOPS. Code is broken. Cannot merge/deploy.     │
│  ⚠️ Warning │  Pipeline CONTINUES. Code works but could be better.      │
│  ℹ️ Info    │  Just FYI. Purely informational.                          │
└─────────────┴────────────────────────────────────────────────────────────┘
```

**DevOps Thinking:**

> "Warnings are technical debt. The code runs, but it's messy. Fix them when you have time, but don't block the release for style issues."

### 3. Why Some Jobs Skip

```yaml
# Security Scan - Only on PRs
security-scan:
  if: github.event_name == 'pull_request'  # ← CONDITION

# Preview APK - Only on PRs  
build-preview:
  if: github.event_name == 'pull_request'  # ← CONDITION

# Production Build - Only on push to main
build-production:
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

**DevOps Logic:**

> "Security scans are expensive (time + compute). Run them on PRs so the developer sees issues BEFORE merging. Don't waste resources scanning code that's already in main."

---

## Setting Up Secrets

### Required Secrets for Full Deployment

| Secret Name | Where to Get | Purpose |
|-------------|--------------|---------|
| `RAILWAY_TOKEN` | Railway Dashboard → Account → Tokens | Deploy backend |
| `EXPO_TOKEN` | `npx expo token:create` | Build mobile app |

### Step-by-Step Guide

```bash
# 1. Get Railway Token
# Go to: https://railway.app/account/tokens
# Click "Create Token" → Copy it

# 2. Get Expo Token
npx expo login                    # Login to Expo account
npx expo token:create             # Create access token
# Copy the token displayed

# 3. Add to GitHub
# Go to: https://github.com/YOUR_USERNAME/vitaltrack/settings/secrets/actions
# Click "New repository secret"
# Add:
#   Name: RAILWAY_TOKEN
#   Value: (paste railway token)
# Add:
#   Name: EXPO_TOKEN
#   Value: (paste expo token)
```

### Verifying Secrets Work

After adding secrets, push any change to `main`:

```bash
git commit --allow-empty -m "test: trigger deployment"
git push origin main
```

Check GitHub Actions → Deploy job should now actually deploy!

---

## Database Architecture

### Schema Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATABASE SCHEMA                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐            │
│  │    users     │     │  categories  │     │    items     │            │
│  ├──────────────┤     ├──────────────┤     ├──────────────┤            │
│  │ id (UUID)    │◀───┐│ id (UUID)    │◀───┐│ id (UUID)    │            │
│  │ email        │    ││ user_id (FK) │    ││ user_id (FK) │            │
│  │ username     │    ││ name         │    ││ category_id  │            │
│  │ hashed_pass  │    ││ icon         │    ││ name         │            │
│  │ is_active    │    ││ color        │    ││ quantity     │            │
│  │ created_at   │    │└──────────────┘    ││ is_critical  │            │
│  └──────────────┘    │                     │└──────────────┘            │
│         │            │                     │       │                    │
│         │            │                     │       │                    │
│         ▼            │                     │       ▼                    │
│  ┌──────────────┐    │               ┌─────┴──────────────┐            │
│  │refresh_tokens│    │               │      orders        │            │
│  ├──────────────┤    │               ├────────────────────┤            │
│  │ jti (UUID)   │    └───────────────│ id (UUID)          │            │
│  │ user_id (FK) │                    │ user_id (FK)       │            │
│  │ is_revoked   │                    │ status             │            │
│  │ expires_at   │                    │ total_items        │            │
│  └──────────────┘                    └────────────────────┘            │
│                                              │                          │
│                                              ▼                          │
│                                      ┌──────────────┐                   │
│                                      │ order_items  │                   │
│                                      ├──────────────┤                   │
│                                      │ id (UUID)    │                   │
│                                      │ order_id(FK) │                   │
│                                      │ item_id (FK) │                   │
│                                      │ quantity     │                   │
│                                      └──────────────┘                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Database Architect's Thinking

| Decision | Reasoning |
|----------|-----------|
| **UUID primary keys** | Enables offline-first sync without ID conflicts |
| **`local_id` column** | Maps mobile-generated IDs to server IDs |
| **Soft deletes** | `is_active=False` instead of DELETE for sync |
| **`updated_at` timestamps** | Powers conflict resolution in sync |
| **User isolation** | All queries filter by `user_id` automatically |

---

## Security Considerations

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       JWT AUTHENTICATION FLOW                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. User logs in with email/password                                    │
│                    │                                                    │
│                    ▼                                                    │
│  2. Server validates credentials against hashed password                │
│                    │                                                    │
│                    ▼                                                    │
│  3. Server generates JWT pair:                                          │
│     ┌─────────────────┐  ┌─────────────────┐                           │
│     │  Access Token   │  │  Refresh Token  │                           │
│     │  (30 min TTL)   │  │  (30 day TTL)   │                           │
│     └─────────────────┘  └─────────────────┘                           │
│                    │                                                    │
│                    ▼                                                    │
│  4. Mobile stores tokens in SecureStore (encrypted)                     │
│                    │                                                    │
│                    ▼                                                    │
│  5. Each API request includes: Authorization: Bearer <access_token>     │
│                    │                                                    │
│                    ▼                                                    │
│  6. When access token expires, refresh token gets new pair              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Security Layers

| Layer | Protection |
|-------|------------|
| **Transport** | HTTPS (TLS 1.3) via Railway |
| **Authentication** | JWT with refresh token rotation |
| **Password Storage** | bcrypt with salt (Passlib) |
| **Rate Limiting** | 5 login attempts/minute, 3 registrations/hour |
| **Input Validation** | Pydantic schemas reject malformed input |
| **SQL Injection** | Parameterized queries via SQLAlchemy ORM |
| **Secrets** | Environment variables, never in code |

---

## Quick Reference Commands

### Local Development

```bash
# Backend
cd vitaltrack-backend
docker-compose -f docker-compose.dev.yml up --build

# Frontend (with USB debugging)
cd vitaltrack-mobile
adb reverse tcp:8000 tcp:8000
npx expo start --clear
```

### Run Tests Locally

```bash
# Backend linting
cd vitaltrack-backend
pip install ruff mypy
ruff check app/
mypy app/ --ignore-missing-imports

# Frontend type check
cd vitaltrack-mobile
npx tsc --noEmit
npx eslint . --ext .ts,.tsx
```

### Git Workflow

```bash
# Feature branch workflow (recommended)
git checkout -b feature/my-feature
# ... make changes ...
git push origin feature/my-feature
# Create PR on GitHub → Triggers full CI with security scan

# Direct to main (quick fixes only)
git add .
git commit -m "fix: description"
git push origin main
# Triggers tests + deploy
```

---

## Monitoring & Debugging

### Check GitHub Actions

1. Go to [GitHub Actions](https://github.com/rishabhrd09/vitaltrack/actions)
2. Click on a workflow run
3. View job logs for each step
4. Check "Annotations" for warnings/errors

### Check Railway Logs

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and view logs
railway login
railway logs
```

### Check Expo Build Status

1. Go to [Expo Dashboard](https://expo.dev)
2. Select your project
3. View build history and logs

---

## Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    VITALTRACK INFRASTRUCTURE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Frontend: React Native + Expo + TypeScript + Zustand                   │
│  Backend:  FastAPI + Python + SQLAlchemy + PostgreSQL                   │
│  DevOps:   GitHub Actions + Railway + Expo EAS + Docker                 │
│                                                                         │
│  Flow: Code → Push → Test → Deploy → Monitor                            │
│                                                                         │
│  Secrets needed:                                                        │
│    • RAILWAY_TOKEN (backend deployment)                                 │
│    • EXPO_TOKEN (mobile builds)                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

*Last Updated: February 2026*
