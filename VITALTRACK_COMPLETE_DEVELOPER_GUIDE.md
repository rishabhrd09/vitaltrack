# VitalTrack: Complete Developer Guide

## Professional Development Workflow - From Clone to Production

**Version:** 7.1 | **Last Updated:** January 30, 2026 | **Status:** Production-Ready

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Prerequisites](#2-prerequisites)
3. [Getting the Code](#3-getting-the-code)
4. [Local Development Setup](#4-local-development-setup)
5. [Network Connectivity (CRITICAL)](#5-network-connectivity-critical)
6. [Professional Git Workflow](#6-professional-git-workflow)
7. [Making Changes](#7-making-changes)
8. [Pull Request Process](#8-pull-request-process)
9. [CI/CD Pipeline](#9-cicd-pipeline)
10. [Branch Protection Setup](#10-branch-protection-setup)
11. [Cloud Deployment](#11-cloud-deployment)
12. [Mobile Builds](#12-mobile-builds)
13. [Play Store Submission](#13-play-store-submission)
14. [Troubleshooting](#14-troubleshooting)
15. [Quick Reference](#15-quick-reference)

---

## 1. Introduction

### What is VitalTrack?

VitalTrack is a **medical inventory management system** for families managing home ICU care. It helps caregivers track life-critical medical supplies with an anxiety-reducing, minimalist interface.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VITALTRACK ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│     MOBILE APP                                 BACKEND API                  │
│   ─────────────                              ──────────────                 │
│   React Native + Expo                        FastAPI + Python 3.12 (Docker image pinned)          │
│   (SDK pinned in package.json)               PostgreSQL 16                  │
│   TypeScript                                 SQLAlchemy 2.0 (Async)         │
│   Zustand (State)                            JWT + Argon2 (Auth)            │
│   Expo Router                                SlowAPI (Rate Limiting)        │
│                                                                             │
│                         34 REST API Endpoints                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Project Structure

```
vitaltrack/
├── .github/
│   ├── workflows/ci.yml          # CI/CD Pipeline
│   ├── CODEOWNERS                # Code review requirements
│   └── pull_request_template.md  # PR template
├── vitaltrack-backend/           # FastAPI Backend
│   ├── app/api/v1/               # 34 API endpoints
│   ├── app/models/               # SQLAlchemy models
│   ├── app/schemas/              # Pydantic schemas
│   ├── docker-compose.yml        # Local development
│   ├── docker-entrypoint.sh      # Container startup script
│   └── requirements.txt
├── vitaltrack-mobile/            # React Native App
│   ├── app/                      # Expo Router screens
│   ├── services/                 # API client
│   ├── store/                    # Zustand state
│   ├── app.json                  # Expo config
│   └── eas.json                  # EAS Build config
├── setup-local-dev.sh            # Mac/Linux setup
└── setup-local-dev.bat           # Windows setup
```

---

## 2. Prerequisites

### Required Software

| Tool | Version | Verify | Install |
|------|---------|--------|---------|
| Docker Desktop | Latest | `docker --version` | docker.com |
| Node.js | 20 LTS+ (tested with 20 & 22) | `node -v` | nodejs.org |
| Git | Any | `git --version` | git-scm.com |
| EAS CLI | Latest | `eas --version` | `npm install -g eas-cli` |

### Install Global Tools

```bash
# Only EAS CLI should be global
npm install -g eas-cli

# Verify
eas --version
```

### ⚠️ Important: Expo CLI Model (2025+)

| Tool | Install Globally? | How to Use |
|------|-------------------|------------|
| `expo-cli` | ❌ NO (deprecated) | Use `npx expo` instead |
| `eas-cli` | ✅ YES | `eas build`, `eas submit` |

**Why `npx expo` instead of global `expo`?**
- Ensures correct version for your project's SDK
- Avoids "works on my machine" issues
- CI/CD consistent behavior
- No version drift between team members

### Required Accounts

| Account | Purpose | When Needed |
|---------|---------|-------------|
| GitHub | Code hosting | Immediately |
| Expo | Mobile builds | Section 12 |
| Railway | Backend hosting | Section 11 |
| Play Console | App distribution | Section 13 |

---

## 3. Getting the Code

### For External Contributors (Fork First)

```bash
# 1. Fork on GitHub: https://github.com/rishabhrd09/vitaltrack
#    Click "Fork" button

# 2. Clone YOUR fork
git clone https://github.com/YOUR_USERNAME/vitaltrack.git
cd vitaltrack

# 3. Add upstream remote
git remote add upstream https://github.com/rishabhrd09/vitaltrack.git

# 4. Verify remotes
git remote -v
```

### For Repository Collaborators

```bash
git clone https://github.com/rishabhrd09/vitaltrack.git
cd vitaltrack
```

---

## 4. Local Development Setup

### Step 1: Run Setup Script

```bash
# Windows
setup-local-dev.bat

# Mac/Linux
chmod +x setup-local-dev.sh
./setup-local-dev.sh
```

This creates `vitaltrack-mobile/.env` with your IP address.

### Step 2: Start Backend (Terminal 1)

```bash
cd vitaltrack-backend

# Copy environment file (if exists)
copy .env.example .env    # Windows
# OR: cp .env.example .env  # Mac/Linux

# Start Docker containers
docker-compose up --build
```

> **Note:** On newer Docker versions, you may use `docker compose` (without hyphen) instead of `docker-compose`. Both work.

**Wait for:** `Database tables created/verified`

> **Note:** Database schema is created automatically via Alembic migrations on startup.

**Verify Backend:** Open http://localhost:8000/health in your browser

Example response (your actual response may vary slightly):
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "environment": "development",
  "database": "connected"
}
```

### Step 3: Start Frontend (Terminal 2)

```bash
cd vitaltrack-mobile
npm install --legacy-peer-deps
npx expo start --clear
```

> **Note:** Always use `npx expo`, never global `expo` command.

### Step 4: Test on Phone

1. Install **Expo Go** app on your phone
2. Connect phone to **same WiFi** as your computer
3. Scan QR code from Expo terminal
4. Create account → See Dashboard = Success!

**⚠️ If you see "Network request failed", go to Section 5 IMMEDIATELY.**

---

## 5. Network Connectivity (CRITICAL)

### The Problem

Your mobile app needs to reach your PC's backend over WiFi. This frequently fails due to **WiFi Isolation** (your router blocking device-to-device traffic) or Windows Firewall.

### Solution A: Use ngrok (RECOMMENDED - Immediate Fix)

This is the **easiest and most reliable solution**. It bypasses all local network restrictions (WiFi isolation, firewalls) by creating a public tunnel.

1.  **Install ngrok:**
    ```bash
    npm install -g ngrok
    ```

2.  **Start your backend normally:**
    ```bash
    cd vitaltrack-backend
    docker-compose up
    ```

3.  **Start the tunnel (in a new terminal):**
    ```bash
    ngrok http 8000
    ```
    *Copy the URL it gives you (e.g., `https://abc-123.ngrok.io`)*

4.  **Update Mobile Config:**
    Edit `vitaltrack-mobile/.env`:
    ```env
    EXPO_PUBLIC_API_URL=https://abc-123.ngrok.io
    ```

5.  **Restart Expo:**
    ```bash
    npx expo start --clear
    ```

### Solution B: Windows Firewall Rule (Long-Term Fix)

If you cannot use ngrok, you must configure your local network permissions. This requires that your Router **does not have AP Isolation enabled**.

1.  **Run PowerShell as Administrator.**
2.  **Execute this command:**
    ```powershell
    netsh advfirewall firewall add rule name="VitalTrack API Port 8000" dir=in action=allow protocol=TCP localport=8000
    ```
3.  **Test connection from phone browser:** `http://YOUR_PC_IP:8000/health`

### Required App Configuration

Ensure `vitaltrack-mobile/app.json` has:

```json
{
  "expo": {
    "android": {
      "usesCleartextTraffic": true
    }
  }
}
```

> **Note:** This setting is required only for HTTP (non-HTTPS) local development. When using ngrok (HTTPS), this is not strictly required but doesn't hurt to have.

This allows HTTP (non-HTTPS) connections on Android.

---

## 6. Professional Git Workflow

### IMPORTANT: Never Push Directly to Main

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PROFESSIONAL DEVELOPMENT WORKFLOW                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   main (protected) ═══════════════════════════════════════════════════════  │
│         │                                                     ▲              │
│         │                                                     │              │
│         │ 1. Create feature branch                           7. Merge PR    │
│         ▼                                                     │              │
│   feature/add-scanner ────────────────────────────────────────┤              │
│         │                                                     │              │
│         │ 2. Make changes locally                             │              │
│         │ 3. Test with Docker + Expo Go                       │              │
│         │ 4. Commit changes                                   │              │
│         │ 5. Push branch to GitHub                            │              │
│         │ 6. Create Pull Request ─────────────────────────────┤              │
│         │                                                     │              │
│         │    ┌─────────────────────────────┐                  │              │
│         │    │ AUTOMATED CI/CD CHECKS      │                  │              │
│         │    │ ✓ Backend tests             │                  │              │
│         │    │ ✓ Frontend tests            │                  │              │
│         │    │ ✓ Type checking             │                  │              │
│         │    │ ✓ Linting                   │                  │              │
│         │    │ ✓ Security scan             │                  │              │
│         │    └─────────────────────────────┘                  │              │
│         │                                                     │              │
│         │    ┌─────────────────────────────┐                  │              │
│         │    │ CODE REVIEW                 │                  │              │
│         │    │ • Reviewer examines code    │                  │              │
│         │    │ • Comments/suggestions      │                  │              │
│         │    │ • Approval required         │                  │              │
│         │    └─────────────────────────────┘                  │              │
│         │                                                     │              │
│         └─────────────────────────────────────────────────────┘              │
│                                                                              │
│   AFTER MERGE TO MAIN:                                                       │
│   • Backend auto-deploys to Railway                                          │
│   • Production AAB builds automatically                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Branch Naming Convention

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feature/` | New features | `feature/barcode-scanner` |
| `fix/` | Bug fixes | `fix/login-crash` |
| `hotfix/` | Urgent fixes | `hotfix/payment-error` |
| `docs/` | Documentation | `docs/api-guide` |
| `refactor/` | Code cleanup | `refactor/auth-module` |

---

## 7. Making Changes

### Step-by-Step Process

#### Step 1: Sync with Main

```bash
git checkout main
git pull origin main
```

#### Step 2: Create Feature Branch

```bash
git checkout -b feature/your-feature-name
```

#### Step 3: Make Changes

Work on your code! The frontend hot-reloads automatically.

#### Step 4: Test Locally

```bash
# Backend changes: restart docker
docker-compose down
docker-compose up --build

# Frontend changes: auto-reload (just save file)
```

#### Step 5: Commit Changes

```bash
git add .
git commit -m "feat(items): add expiry date notification"
```

#### Step 6: Push Branch

```bash
git push origin feature/your-feature-name
```

---

## 8. Pull Request Process

### Creating a Pull Request

1. Go to GitHub → Your repository
2. Click **"Compare & pull request"**
3. Fill in the PR template
4. Request reviewers
5. Submit PR

### What Happens After PR is Created

1. **CI/CD automatically runs** tests
2. **Code review** by team members
3. **Merge** after approval
4. **Auto-deployment** to production

---

## 9. CI/CD Pipeline

### Pipeline Flow

```
ON PULL REQUEST                    ON MERGE TO MAIN
─────────────────                  ────────────────

┌─────────────────┐                ┌─────────────────┐
│  test-backend   │                │  test-backend   │
└────────┬────────┘                └────────┬────────┘
         │                                  │
┌────────┴────────┐                ┌────────┴────────┐
│  test-frontend  │                │  test-frontend  │
└────────┬────────┘                └────────┬────────┘
         │                                  │
┌────────┴────────┐                         ▼
│  security-scan  │                ┌─────────────────┐
│                 │                │  deploy-backend │
└─────────────────┘                └────────┬────────┘
                                            │
                                   ┌────────┴────────┐
                                   │  build-prod     │
                                   │  (AAB for Store)│
                                   └─────────────────┘
```

### Required GitHub Secrets

| Secret | Source | Purpose |
|--------|--------|---------|
| `EXPO_TOKEN` | expo.dev → Account → Access Tokens | Mobile builds |
| `RAILWAY_TOKEN` | railway.app → Account → Tokens | Backend deployment |

---

## 10. Branch Protection Setup

### Enable Branch Protection

1. GitHub → Settings → Branches
2. Add rule for `main`
3. Enable:
   - Require pull request before merging
   - Require status checks (test-backend, test-frontend)
   - Require conversation resolution

---

## 11. Cloud Deployment

### Deploy Backend to Railway

1. Go to https://railway.app
2. **New Project** → **Deploy from GitHub**
3. Select repository, set **Root Directory:** `vitaltrack-backend`
4. Add PostgreSQL (Railway auto-sets `DATABASE_URL`)
5. Set environment variables:

| Variable | Value |
|----------|-------|
| `SECRET_KEY` | Generate with `openssl rand -hex 32` |
| `ENVIRONMENT` | `production` |
| `CORS_ORIGINS` | `["*"]` (restrict to specific domains in production) |

6. Get your URL from Settings → Networking

---

## 12. Mobile Builds

### Setup EAS

```bash
cd vitaltrack-mobile
eas login
eas init
```

Update `app.json` with your projectId and owner.

### Build Commands

```bash
# Preview APK (for testing)
eas build --profile preview --platform android

# Production AAB (for Play Store)
eas build --profile production --platform android
```

---

## 13. Play Store Submission

### Prerequisites

- Google Play Developer account ($25)
- Production AAB built
- App assets (icons, screenshots)

### Steps

1. Create app in Play Console
2. Upload AAB
3. Complete store listing
4. Set content rating
5. Submit for review

---

## 14. Troubleshooting

### Network Issues

| Problem | Solution |
|---------|----------|
| "Network request failed" on phone | **USE NGROK (Section 5)** |
| Phone browser can't reach PC | ngrok fixes this. Alternatively, check router AP isolation. |
| Works on PC, fails on phone | ngrok fixes this. |
| QR code won't scan | Try `npx expo start --tunnel` |

### Docker Issues

| Problem | Solution |
|---------|----------|
| `docker-entrypoint.sh: no such file or directory` | File has Windows CRLF line endings. Open in VS Code, change to LF (bottom-right), save |
| Container keeps restarting | Check logs: `docker logs vitaltrack-api` |
| Database connection failed | Wait for PostgreSQL to be ready, check `docker logs vitaltrack-db` |

### Build Issues

| Problem | Solution |
|---------|----------|
| CI fails on PR | Check Actions tab for details |
| Can't push to main | Use feature branch + PR |
| EAS build fails | Run `eas init`, update app.json |
| npm install fails | Use `npm install --legacy-peer-deps` |

### Debug Commands

```bash
# Backend logs
docker-compose logs -f api

# Check containers
docker ps

# Frontend with cache clear
npx expo start --clear

# Check your IP
ipconfig  # Windows
ifconfig  # Mac/Linux
```

---

## 15. Quick Reference

### Daily Development Workflow

```bash
# 1. Start fresh
git checkout main
git pull origin main

# 2. Create feature branch
git checkout -b feature/my-feature

# 3. Start backend
cd vitaltrack-backend && docker-compose up --build

# 4. Start frontend (new terminal)
cd vitaltrack-mobile && npx expo start --clear

# 5. Make changes, test locally

# 6. Commit
git add .
git commit -m "feat: your feature description"

# 7. Push
git push origin feature/my-feature

# 8. Create PR on GitHub

# 9. Wait for CI + review

# 10. Merge PR → Auto-deploys!
```

### Key URLs

| Resource | URL |
|----------|-----|
| Local API Docs | http://localhost:8000/docs |
| Local Health Check | http://localhost:8000/health |
| GitHub Actions | github.com/YOUR_REPO/actions |
| Expo Dashboard | expo.dev |
| Railway | railway.app |

### Quick Network Test

```bash
# 1. Use ngrok (Recommended)
ngrok http 8000
# Update .env -> Restart Expo

# 2. OR Test from PC browser
http://YOUR_IP:8000/health
```

### Complete Checklist

```
SETUP (One-time)
□ Clone repository
□ Run setup-local-dev script
□ Start Docker backend
□ Verify http://localhost:8000/health works
□ **Setup ngrok for mobile testing**
□ Start Expo and test on phone

EVERY FEATURE
□ git checkout main && git pull
□ git checkout -b feature/name
□ Make changes
□ Test locally
□ git commit -m "feat: description"
□ git push origin feature/name
□ Create PR on GitHub
□ Wait for CI to pass
□ Get code review approval
□ Merge PR

DEPLOYMENT (One-time)
□ Add GitHub secrets (EXPO_TOKEN, RAILWAY_TOKEN)
□ Set up branch protection rules
□ Deploy backend to Railway
□ Update eas.json with Railway URL
□ Run eas init
□ Update app.json with projectId/owner

RELEASE
□ Merge PR to main
□ Backend auto-deploys
□ Build production AAB
□ Submit to Play Store
```

---

## Summary

This guide implements **professional development practices**:

1. **Never push directly to main** - Always use feature branches
2. **Pull Requests required** - All changes reviewed before merge
3. **CI/CD gates** - Tests must pass before merge allowed
4. **Branch protection** - Enforced at repository level
5. **Auto-deployment** - After merge, production updates automatically
6. **Network troubleshooting** - Prioritizes generic tunneling (ngrok) for reliability

---

*Happy coding!*
