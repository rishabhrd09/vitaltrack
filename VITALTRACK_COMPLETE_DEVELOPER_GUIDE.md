# VitalTrack: Complete Developer Guide

## Professional Development Workflow - From Clone to Production

**Version:** 6.0 | **Last Updated:** January 29, 2026 | **Status:** Production-Ready

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Prerequisites](#2-prerequisites)
3. [Getting the Code](#3-getting-the-code)
4. [Local Development Setup](#4-local-development-setup)
5. [Professional Git Workflow](#5-professional-git-workflow)
6. [Making Changes](#6-making-changes)
7. [Pull Request Process](#7-pull-request-process)
8. [CI/CD Pipeline](#8-cicd-pipeline)
9. [Branch Protection Setup](#9-branch-protection-setup)
10. [Cloud Deployment](#10-cloud-deployment)
11. [Mobile Builds](#11-mobile-builds)
12. [Play Store Submission](#12-play-store-submission)
13. [Troubleshooting](#13-troubleshooting)
14. [Quick Reference](#14-quick-reference)

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
│   React Native + Expo SDK 54                 FastAPI + Python 3.11          │
│   TypeScript                                 PostgreSQL 16                  │
│   Zustand (State)                            SQLAlchemy 2.0 (Async)         │
│   Expo Router                                JWT + Argon2 (Auth)            │
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
├── vitaltrack-backend/           # FastAPI Backend (36 Python files)
│   ├── app/api/v1/               # 34 API endpoints
│   ├── app/models/               # SQLAlchemy models
│   ├── app/schemas/              # Pydantic schemas
│   ├── docker-compose.yml        # Local development
│   └── requirements.txt
├── vitaltrack-mobile/            # React Native App (40 TypeScript files)
│   ├── app/                      # Expo Router screens
│   ├── services/                 # API client
│   ├── store/                    # Zustand state
│   ├── app.json                  # Expo config
│   └── eas.json                  # EAS Build config
├── CONTRIBUTING.md               # Contribution guidelines
├── setup-local-dev.sh            # Mac/Linux setup
└── setup-local-dev.bat           # Windows setup
```

---

## 2. Prerequisites

### Required Software

| Tool | Version | Verify | Install |
|------|---------|--------|---------|
| Docker Desktop | Latest | `docker --version` | docker.com |
| Node.js | 20+ | `node -v` | nodejs.org |
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
| Expo | Mobile builds | Stage 11 |
| Railway | Backend hosting | Stage 10 |
| Play Console | App distribution | Stage 12 |

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
# origin    https://github.com/YOUR_USERNAME/vitaltrack.git (fetch)
# origin    https://github.com/YOUR_USERNAME/vitaltrack.git (push)
# upstream  https://github.com/rishabhrd09/vitaltrack.git (fetch)
# upstream  https://github.com/rishabhrd09/vitaltrack.git (push)
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
copy .env.example .env    # Windows
# OR: cp .env.example .env  # Mac/Linux
docker-compose up --build
```

**Wait for:** `Database tables created/verified`

**Verify:** http://localhost:8000/health

### Step 3: Start Frontend (Terminal 2)

```bash
cd vitaltrack-mobile
npm install --legacy-peer-deps
npx expo start --clear
# Note: You will see "deprecated" warnings. This is normal for React Native.
# Note: You may be asked to log in to Expo/EAS on first run. Use your Expo account.
```

### Step 4: Test on Phone

1. Install **Expo Go** app
2. Connect phone to **same WiFi**
3. Scan QR code
4. Create account → See Dashboard = Success!

---

## 5. Professional Git Workflow

### IMPORTANT: Never Push Directly to Main

In professional development, you **never** push directly to the `main` branch. Instead:

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

## 6. Making Changes

### Step-by-Step Process

#### Step 1: Sync with Main

```bash
# Make sure you're on main
git checkout main

# Get latest changes
git pull origin main

# If you're a contributor, also sync with upstream
git fetch upstream
git merge upstream/main
```

#### Step 2: Create Feature Branch

```bash
# Create and switch to new branch
git checkout -b feature/your-feature-name

# Example:
git checkout -b feature/add-expiry-notification
```

#### Step 3: Make Changes

Work on your code! The frontend hot-reloads automatically.

#### Step 4: Test Locally

```bash
# Backend changes: restart docker
docker-compose down
docker-compose up --build

# Frontend changes: auto-reload (just save file)

# Full test: create account, add items, verify sync
```

#### Step 5: Commit Changes

```bash
# Stage changes
git add .

# Commit with conventional message
git commit -m "feat(items): add expiry date notification"
```

#### Step 6: Push Branch

```bash
# Push to GitHub
git push origin feature/your-feature-name
```

---

## 7. Pull Request Process

### Creating a Pull Request

1. **Go to GitHub** → Your repository
2. Click **"Compare & pull request"** (appears after push)
3. **Fill in the PR template:**

```markdown
## Description
Add expiry date notifications for items nearing expiration.

## Type of Change
- [x] 🚀 Feature (new functionality)

## Changes Made
- Added notification service for expiry dates
- Created settings screen for notification preferences
- Added background task to check expiry dates daily

## Testing
- [x] Tested locally with Expo Go
- [x] Tested with Docker backend
- [x] Added unit tests for notification logic

## Checklist
- [x] Code compiles without errors
- [x] Self-reviewed the code
- [x] Added tests
- [x] Updated documentation
- [x] Branch is up to date with main
```

4. **Request reviewers** (if required)
5. **Submit PR**

### What Happens After PR is Created

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AFTER PR IS CREATED                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   1. CI/CD AUTOMATICALLY RUNS                                                │
│      ┌────────────────────────────────────────────────────────────────┐     │
│      │  test-backend                                                   │     │
│      │  ├── Install dependencies                                       │     │
│      │  ├── Run linting (Ruff)                                         │     │
│      │  ├── Run type check                                             │     │
│      │  └── Run tests → ✅ PASS or ❌ FAIL                            │     │
│      │                                                                 │     │
│      │  test-frontend                                                  │     │
│      │  ├── Install dependencies                                       │     │
│      │  ├── TypeScript check                                           │     │
│      │  └── ESLint check → ✅ PASS or ❌ FAIL                         │     │
│      │                                                                 │     │
│      │  security-scan                                                  │     │
│      │  └── Trivy vulnerability scan                                   │     │
│      └────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│   2. CODE REVIEW                                                             │
│      • Reviewers are notified (CODEOWNERS)                                   │
│      • Reviewer examines code changes                                        │
│      • Reviewer leaves comments or approves                                  │
│                                                                              │
│   3. MERGE REQUIREMENTS                                                      │
│      All must be true:                                                       │
│      - All CI checks pass                                                   │
│      ☑️ At least 1 approval from reviewer                                    │
│      ☑️ No merge conflicts                                                   │
│      ☑️ Branch is up to date with main                                       │
│                                                                              │
│   4. MERGE                                                                   │
│      Click "Squash and merge" → Changes go to main                          │
│                                                                              │
│   5. AUTO-DEPLOYMENT (after merge)                                           │
│      • Backend deploys to Railway                                            │
│      • Production AAB builds                                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### If CI Fails

1. Check the **Actions** tab for error details
2. Fix the issues locally
3. Push the fix:

```bash
git add .
git commit -m "fix: resolve linting errors"
git push origin feature/your-feature-name
```

CI will re-run automatically.

### If Reviewer Requests Changes

1. Make the requested changes
2. Commit and push
3. Reply to review comments
4. Request re-review

---

## 8. CI/CD Pipeline

### Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CI/CD PIPELINE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ON PULL REQUEST                           ON MERGE TO MAIN                 │
│   ─────────────────                         ────────────────                 │
│                                                                              │
│   ┌─────────────────┐                       ┌─────────────────┐             │
│   │  test-backend   │──┐                    │  test-backend   │──┐          │
│   └─────────────────┘  │                    └─────────────────┘  │          │
│                        │                                         │          │
│   ┌─────────────────┐  │                    ┌─────────────────┐  │          │
│   │  test-frontend  │──┼──► PR Ready        │  test-frontend  │──┤          │
│   └─────────────────┘  │                    └─────────────────┘  │          │
│                        │                                         │          │
│   ┌─────────────────┐  │                                         │          │
│   │  security-scan  │──┘                                         │          │
│   └─────────────────┘                                            │          │
│                                                                  ▼          │
│   ┌─────────────────┐                       ┌─────────────────┐             │
│   │  build-preview  │                       │  deploy-backend │             │
│   │  (APK for test) │                       │  (Railway)      │             │
│   └─────────────────┘                       └─────────────────┘             │
│                                                      │                       │
│                                                      ▼                       │
│                                             ┌─────────────────┐             │
│                                             │  build-prod     │             │
│                                             │  (AAB for Store)│             │
│                                             └─────────────────┘             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Required GitHub Secrets

| Secret | Source | Purpose |
|--------|--------|---------|
| `EXPO_TOKEN` | expo.dev → Account → Access Tokens | Mobile builds |
| `RAILWAY_TOKEN` | railway.app → Account → Tokens | Backend deployment |

### Adding Secrets

1. Go to GitHub repository → **Settings**
2. Click **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret

---

## 9. Branch Protection Setup

### CRITICAL: Protect Your Main Branch

Without branch protection, anyone can push directly to main. Set up protection rules:

### Step-by-Step Setup

1. **Go to Repository Settings**
   - GitHub → Your repo → **Settings** → **Branches**

2. **Add Branch Protection Rule**
   - Click **"Add branch protection rule"**
   - Branch name pattern: `main`

3. **Enable These Settings:**

   ```
   - Require a pull request before merging
      - Require approvals: 1
      - Dismiss stale pull request approvals when new commits are pushed
   
   - Require status checks to pass before merging
      - Require branches to be up to date before merging
      Add status checks:
        - test-backend
        - test-frontend
   
   - Require conversation resolution before merging
   
   - Do not allow bypassing the above settings
   
   - Allow force pushes (keep UNCHECKED)
   - Allow deletions (keep UNCHECKED)
   ```

4. **Click "Create"**

### Result

After enabling branch protection:

- `git push origin main` -> **REJECTED**
- Create PR -> Pass checks -> Get review -> Merge -> **ALLOWED**

---

## 10. Cloud Deployment

### Deploy Backend to Railway

#### Step 1: Create Railway Project

1. Go to https://railway.app
2. **New Project** → **Deploy from GitHub**
3. Select your repository
4. Set **Root Directory:** `vitaltrack-backend`

#### Step 2: Add PostgreSQL

1. Click **"+ New"** → **Database** → **PostgreSQL**
2. Railway auto-sets `DATABASE_URL` (no manual config needed)

#### Step 3: Set Environment Variables

| Variable | Value |
|----------|-------|
| `SECRET_KEY` | `openssl rand -hex 32` |
| `ENVIRONMENT` | `production` |
| `CORS_ORIGINS` | `["*"]` |

#### Step 4: Get Your URL

Settings → Networking → Generate Domain

Example: `https://vitaltrack-api.up.railway.app`

---

## 11. Mobile Builds

### CRITICAL: Update app.json First

```bash
cd vitaltrack-mobile

# Initialize EAS for YOUR account
eas login
eas init
```

Update `app.json`:

```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "YOUR-PROJECT-ID-FROM-EAS-INIT"
      }
    },
    "owner": "YOUR-EXPO-USERNAME"
  }
}
```

Update `eas.json`:

```json
{
  "build": {
    "preview": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://YOUR-RAILWAY-URL.up.railway.app"
      }
    },
    "production": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://YOUR-RAILWAY-URL.up.railway.app"
      }
    }
  }
}
```

### Build Commands

```bash
# Preview APK (for testing)
eas build --profile preview --platform android

# Production AAB (for Play Store)
eas build --profile production --platform android
```

---

## 12. Play Store Submission

### Prerequisites

- [ ] Google Play Developer account ($25)
- [ ] Production AAB built
- [ ] App assets (icons, screenshots)

### Submission Steps

1. Create app in Play Console
2. Upload AAB
3. Complete store listing
4. Set content rating
5. Submit for review

---

## 13. Troubleshooting

### Common Issues

| Problem | Solution |
|---------|----------|
| "Network request failed" | Same WiFi for phone & computer |
| CI fails on PR | Check Actions tab for details |
| Can't push to main | Use feature branch + PR |
| EAS build fails | Run `eas init`, update app.json |
| Docker won't start | Start Docker Desktop app |
| `docker-entrypoint.sh` error | Fix: 1. Use LF line endings (not CRLF)<br>2. Ensure `#!/bin/sh` shebang<br>3. File must be executable |

### Debug Commands

```bash
# Backend logs
docker-compose logs -f api

# Frontend with verbose output
npx expo start --clear

# Check Git remotes
git remote -v

# Check branch
git branch -a
```

---

## 14. Quick Reference

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
| Local API | http://localhost:8000/docs |
| GitHub Actions | github.com/YOUR_REPO/actions |
| Expo Dashboard | expo.dev |
| Railway | railway.app |

### Complete Checklist

```
SETUP (One-time)
□ Fork/clone repository
□ Run setup-local-dev script
□ Test Docker + Expo Go locally

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

**This is how real-world companies work!**

---

*Happy coding!*
