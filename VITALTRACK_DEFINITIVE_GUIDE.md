# 🏥 VitalTrack: The Definitive Guide

**Version:** 4.0 | **Last Updated:** January 28, 2026 | **Status:** Production-Ready

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Prerequisites](#2-prerequisites)
3. [Local Development](#3-local-development)
4. [Cloud Deployment](#4-cloud-deployment)
5. [Mobile Build & Release](#5-mobile-build--release)
6. [CI/CD Pipeline](#6-cicd-pipeline)
7. [Troubleshooting](#7-troubleshooting)
8. [Quick Reference](#8-quick-reference)

---

## 1. Project Overview

### What is VitalTrack?

A **medical inventory management system** for families managing home ICU care—helping caregivers track life-critical supplies.

### Architecture

```
📱 Mobile App                    🖥️ Backend API
─────────────                    ──────────────
React Native + Expo              FastAPI + Python
TypeScript                       PostgreSQL
Zustand (State)                  SQLAlchemy 2.0
        │                              │
        └──────── REST API ────────────┘
```

### Project Structure

```
vitaltrack/
├── vitaltrack-backend/          # FastAPI Backend
│   ├── app/api/v1/              # 34 API endpoints
│   ├── docker-compose.yml       # Docker config
│   └── requirements.txt
├── vitaltrack-mobile/           # React Native App
│   ├── app/                     # Expo Router screens
│   ├── eas.json                 # EAS Build config
│   └── package.json
├── .github/workflows/deploy.yml # CI/CD Pipeline
├── setup-local-dev.bat          # Windows setup
└── setup-local-dev.sh           # Mac/Linux setup
```

### Tech Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Mobile | React Native + Expo | SDK 54 |
| Backend | FastAPI + PostgreSQL | 3.12 / 16 |
| Auth | JWT (dual-token) | Argon2 hashing |

---

## 2. Prerequisites

### Required Software

| Tool | Version | Verify |
|------|---------|--------|
| Node.js | 20+ | `node -v` |
| Docker Desktop | Latest | `docker --version` |
| Git | Any | `git --version` |

```bash
# Install build tools
npm install -g expo-cli eas-cli
```

### Required Accounts

| Account | URL | Purpose |
|---------|-----|---------|
| Expo | expo.dev | App builds |
| GitHub | github.com | Code & CI/CD |
| Railway | railway.app | Backend hosting |
| Play Console | play.google.com/console | App distribution ($25) |

---

## 3. Local Development

### Step 1: Start Backend

```bash
cd vitaltrack-backend
docker-compose up --build
```

Wait for: `Database tables created/verified`

Verify: http://localhost:8000/health

### Step 2: Start Frontend

```bash
cd vitaltrack-mobile
npm install
npx expo start --clear
```

### Step 3: Connect Phone to Backend

**Run the setup script (from project root):**

```bash
# Windows
setup-local-dev.bat

# Mac/Linux
./setup-local-dev.sh
```

This auto-detects your IP and creates `vitaltrack-mobile/.env`.

**Then restart frontend:**
```bash
npx expo start --clear
```

### Step 4: Test

1. Scan QR with Expo Go
2. Tap "Create Account"
3. Register → If successful, you're connected!

---

## 4. Cloud Deployment

### Deploy Backend to Railway

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOU/vitaltrack.git
   git push -u origin main
   ```

2. **Create Railway Project:**
   - Go to railway.app → New Project → Deploy from GitHub
   - Select your repo, set root: `vitaltrack-backend`
   - Add PostgreSQL database (Railway auto-sets DATABASE_URL)

3. **Set Environment Variables:**
   | Variable | Value |
   |----------|-------|
   | `SECRET_KEY` | `openssl rand -hex 32` |
   | `ENVIRONMENT` | `production` |
   | `CORS_ORIGINS` | `["*"]` |

4. **Get Your URL:**
   Settings → Networking → Generate Domain
   Example: `https://vitaltrack-api.up.railway.app`

---

## 5. Mobile Build & Release

### Update eas.json

Replace `YOUR_RAILWAY_URL` with your actual Railway URL:

```json
{
  "build": {
    "preview": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://YOUR_RAILWAY_URL.up.railway.app"
      }
    },
    "production": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://YOUR_RAILWAY_URL.up.railway.app"
      }
    }
  }
}
```

### Build Preview APK (Testing)

```bash
cd vitaltrack-mobile
eas login
eas build --profile preview --platform android
```

**Test everything before production!**

### Build Production AAB

```bash
eas build --profile production --platform android
```

### Submit to Play Store

1. Create app in Play Console
2. Upload AAB file
3. Complete store listing
4. Submit for review

---

## 6. CI/CD Pipeline

### How It Works

```
Push to main → test-backend → test-frontend → deploy-backend + build-mobile
```

### Required GitHub Secrets

| Secret | Source |
|--------|--------|
| `EXPO_TOKEN` | expo.dev → Account → Access Tokens |
| `RAILWAY_TOKEN` | railway.app → Account → Tokens |

### The asyncpg Fix

The workflow uses this DATABASE_URL (note the `+asyncpg`):

```yaml
DATABASE_URL: postgresql+asyncpg://test:test@localhost:5432/test_db
```

**Why?** VitalTrack uses async SQLAlchemy, which requires the `asyncpg` driver. Without it, SQLAlchemy tries to use `psycopg2` (not installed) and fails.

---

## 7. Troubleshooting

| Issue | Solution |
|-------|----------|
| "Network request failed" | Phone & PC must be on same WiFi |
| "No module named psycopg2" | DATABASE_URL must have `+asyncpg` |
| Docker won't start | Ensure Docker Desktop is running |
| EAS build fails | Check `eas.json` syntax, run `eas whoami` |

---

## 8. Quick Reference

### Essential Commands

```bash
# Backend
cd vitaltrack-backend
docker-compose up --build      # Start
docker-compose logs -f api     # View logs
docker-compose down            # Stop

# Frontend
cd vitaltrack-mobile
npm install                    # Install deps
npx expo start --clear         # Start dev

# Build
eas build --profile preview --platform android    # Test APK
eas build --profile production --platform android # Play Store AAB
```

### Key URLs

| Resource | URL |
|----------|-----|
| Local API Docs | http://localhost:8000/docs |
| Expo Dashboard | https://expo.dev |
| Railway | https://railway.app |

---

## Summary Flow

```
1. LOCAL DEV
   docker-compose up → npm install → npx expo start → setup script

2. DEPLOY BACKEND
   Push to GitHub → Railway → Set env vars → Get URL

3. BUILD MOBILE
   Update eas.json with Railway URL → eas build preview → Test → eas build production

4. PUBLISH
   Upload AAB to Play Store → Submit for review
```

**Total Time:** 6-8 hours (spread over days)

---

*This guide is self-contained. Follow it start to finish for a production app on the Play Store.*
