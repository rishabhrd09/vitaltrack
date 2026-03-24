# Deployment Guide

> **⚠️ MIGRATION NOTICE (March 2026):** VitalTrack's backend has migrated from Railway to **Render (free tier) + Neon PostgreSQL (free tier)**. The Railway instructions below are preserved for historical reference. For current deployment setup, see **[RAILWAY_TO_RENDER_MIGRATION.md](./RAILWAY_TO_RENDER_MIGRATION.md)**.

> **Complete guide** for deploying VitalTrack to production.

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   MOBILE USERS                    CLOUD INFRASTRUCTURE                       │
│   ┌─────────────┐                                                           │
│   │  Play Store │                 ┌─────────────────────────────────┐       │
│   │  (Android)  │                 │         RAILWAY                  │       │
│   └──────┬──────┘                 │  ┌───────────────────────────┐  │       │
│          │                        │  │    FastAPI Backend        │  │       │
│          │  Download AAB          │  │    (Docker Container)     │  │       │
│          ▼                        │  │    https://api.vitaltrack │  │       │
│   ┌─────────────┐                 │  └────────────┬──────────────┘  │       │
│   │  VitalTrack │  API Requests   │               │                 │       │
│   │  Mobile App │◄───────────────►│  ┌────────────▼──────────────┐  │       │
│   │  (Expo)     │                 │  │    PostgreSQL 16          │  │       │
│   └─────────────┘                 │  │    (Managed Database)     │  │       │
│                                   │  └───────────────────────────┘  │       │
│                                   └─────────────────────────────────┘       │
│                                                                              │
│   BUILD PIPELINE                                                            │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                    │
│   │   GitHub    │───►│   GitHub    │───►│  EAS Build  │                    │
│   │   (Code)    │    │   Actions   │    │  (Expo)     │                    │
│   └─────────────┘    └─────────────┘    └─────────────┘                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 1: Backend Deployment (Railway)

### Step 1: Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Create new project

### Step 2: Add PostgreSQL Database
1. In Railway project, click "New"
2. Select "Database" → "PostgreSQL"
3. Wait for provisioning (~1 min)
4. Copy `DATABASE_URL` from Variables tab

### Step 3: Deploy Backend Service
1. Click "New" → "GitHub Repo"
2. Select `vitaltrack` repository
3. Set root directory: `vitaltrack-backend`
4. Add environment variables:

```env
DATABASE_URL=<from step 2>
SECRET_KEY=<generate: openssl rand -hex 32>
ENVIRONMENT=production
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=30
CORS_ORIGINS=https://your-domain.com
```

### Step 4: Configure Domain
1. Go to Settings → Networking
2. Generate domain or add custom domain
3. Enable HTTPS (automatic)

### Step 5: Verify Deployment
```bash
curl https://your-api.railway.app/health
# Expected: {"status":"healthy"}

curl https://your-api.railway.app/docs
# Should load Swagger UI
```

---

## Part 2: Mobile App Deployment (EAS Build)

### Prerequisites
1. [Expo account](https://expo.dev/signup)
2. EAS CLI: `npm install -g eas-cli`
3. Login: `eas login`

### Step 1: Configure EAS

`vitaltrack-mobile/eas.json`:
```json
{
  "cli": {
    "version": ">= 7.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://staging-api.vitaltrack.app"
      }
    },
    "production": {
      "autoIncrement": true,
      "android": {
        "buildType": "app-bundle"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api.vitaltrack.app"
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./credentials/google-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

### Step 2: Build Preview APK (Testing)
```bash
cd vitaltrack-mobile
eas build --profile preview --platform android
```

Download APK from Expo dashboard and test on device.

### Step 3: Build Production AAB
```bash
eas build --profile production --platform android
```

### Step 4: Submit to Play Store
```bash
eas submit --platform android
```

---

## Part 3: Play Store Setup

### Required Assets

| Asset | Specifications |
|-------|---------------|
| App Icon | 512 × 512 px, PNG, 32-bit with alpha |
| Feature Graphic | 1024 × 500 px, PNG or JPEG |
| Phone Screenshots | 1080 × 1920 px min, 2-8 images |

### Store Listing Content

**App Name:** `VitalTrack - Medical Inventory`

**Short Description (80 chars):**
```
Track medical supplies for home ICU care. Never run out of critical items.
```

**Full Description:**
```
VitalTrack helps families managing home ICU setups track life-critical medical supplies.

FEATURES:
• Track inventory by category (oxygen, medication, consumables)
• Low stock and emergency backup alerts
• Order management with PDF export
• Works offline - syncs when connected
• Secure cloud backup

DESIGNED FOR:
• Families managing home ICU care
• Caregivers tracking medical supplies
• Anyone needing reliable inventory tracking

Your data is encrypted and secure. Create an account to sync across devices.
```

### Data Safety Declaration
- Data collected: Email, name (for account)
- Data shared: None
- Data encrypted: Yes (in transit and at rest)
- Data deletion: Available on request

---

## Part 4: CI/CD Pipeline

### GitHub Actions Workflow

The pipeline is already configured in `.github/workflows/ci.yml`:

```
Push to feature branch → Create PR → CI Tests Run
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    │                                           │
              Tests Pass                                  Tests Fail
                    │                                           │
                    ▼                                           ▼
            PR Ready for Review                          Fix Issues
                    │
                    ▼
            Merge to main
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
  Deploy Backend          Build Production
  (Railway)               (EAS Build)
```

### Required Secrets

Configure in GitHub → Settings → Secrets:

| Secret | Description |
|--------|-------------|
| `RAILWAY_TOKEN` | Railway API token |
| `EXPO_TOKEN` | Expo access token |

### Getting Tokens

**Railway Token:**
1. Go to Railway dashboard
2. Account Settings → Tokens
3. Create new token

**Expo Token:**
1. Go to expo.dev
2. Settings → Access Tokens
3. Create new token

---

## Part 5: Environment Configuration

### Production Environment Variables

**Backend (Railway):**
```env
DATABASE_URL=postgresql://...
SECRET_KEY=<64-char-hex-string>
ENVIRONMENT=production
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=30
CORS_ORIGINS=*
```

**Mobile (EAS):**
```env
EXPO_PUBLIC_API_URL=https://api.vitaltrack.railway.app
```

---

## Deployment Checklist

### Pre-Deployment
```
□ All tests passing locally
□ TypeScript compiles without errors
□ No lint errors
□ API tested with Swagger UI
□ Mobile app tested on device
□ Environment variables configured
□ Secrets added to GitHub
```

### Backend Deployment
```
□ Railway project created
□ PostgreSQL database provisioned
□ Backend service deployed
□ Environment variables set
□ Health check passing
□ API docs accessible
```

### Mobile Deployment
```
□ EAS configured
□ Preview APK tested
□ Production AAB built
□ Play Store listing complete
□ Screenshots uploaded
□ Data safety form complete
□ App submitted for review
```

### Post-Deployment
```
□ Production API health check
□ Create test account on production
□ Verify sync working
□ Monitor error logs
□ Set up alerts
```

---

## Rollback Procedures

### Backend Rollback (Railway)
1. Go to Railway dashboard
2. Deployments → Select previous deployment
3. Click "Redeploy"

### Mobile Rollback
1. Go to Play Console
2. Release management → App releases
3. Create new release with previous version
4. Or: Halt current rollout

---

## Monitoring

### Railway Monitoring
- Built-in logs: Railway dashboard → Deployments → Logs
- Metrics: CPU, Memory, Network in dashboard

### Error Tracking (Recommended)
Add Sentry for production error tracking:

```bash
# Backend
pip install sentry-sdk

# Mobile
npx expo install sentry-expo
```

---

## Cost Estimates

| Service | Free Tier | Production |
|---------|-----------|------------|
| Railway | $5/month credit | ~$10-20/month |
| EAS Build | 30 builds/month | $99/month (Pro) |
| Play Store | One-time $25 | $25 |

---

## Quick Commands

```bash
# Build preview APK
eas build --profile preview --platform android

# Build production AAB
eas build --profile production --platform android

# Submit to Play Store
eas submit --platform android

# Check Railway deployment
railway logs

# Run database migrations (Railway)
railway run alembic upgrade head
```
