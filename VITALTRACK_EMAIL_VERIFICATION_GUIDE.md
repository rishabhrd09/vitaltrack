# VitalTrack Email Verification: Complete Technical Guide

**Challenges, Solutions, Troubleshooting & Production Deployment**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Challenges Encountered & Resolutions](#3-challenges-encountered--resolutions)
4. [Configuration Reference](#4-configuration-reference)
5. [Local Development Setup](#5-local-development-setup)
6. [Production Deployment Guide](#6-production-deployment-guide)
7. [End-to-End User Flows](#7-end-to-end-user-flows)
8. [Troubleshooting Guide](#8-troubleshooting-guide)
9. [Command Reference](#9-command-reference)
10. [Verification Checklist](#10-verification-checklist)

---

## 1. Executive Summary

### What Was Implemented

| Feature | Status | Description |
|---------|--------|-------------|
| Email Verification Enforcement | ✅ Complete | Users cannot login until email verified |
| Brevo SMTP Integration | ✅ Complete | Production-ready email delivery |
| Verification Pending Screen | ✅ Complete | Mobile app handles unverified users gracefully |
| Resend Verification | ✅ Complete | Users can request new verification emails |
| Docker Development Setup | ✅ Complete | Full containerized local testing |

### Key Learnings

| Issue | Root Cause | Solution |
|-------|------------|----------|
| Emails not sending | Docker container had stale env vars | Rebuild with `--build` flag |
| "Sender not valid" error | Unverified sender domain | Use verified Gmail for local dev |
| Users stuck unverified | Initial email failed silently | Implemented "Resend" functionality |
| Verification link 404 | Wrong FRONTEND_URL | Must match actual backend URL |

---

## 2. Architecture Overview

### Email Verification Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        EMAIL VERIFICATION ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐    ┌──────────────┐    ┌─────────┐    ┌──────────────────┐   │
│  │  Mobile  │───▶│   FastAPI    │───▶│  Brevo  │───▶│  User's Inbox    │   │
│  │   App    │    │   Backend    │    │  SMTP   │    │  (Gmail, etc.)   │   │
│  └──────────┘    └──────────────┘    └─────────┘    └──────────────────┘   │
│       │                │                                     │              │
│       │                │                                     │              │
│       │                ▼                                     │              │
│       │         ┌──────────────┐                             │              │
│       │         │  PostgreSQL  │                             │              │
│       │         │  Database    │                             │              │
│       │         │              │                             │              │
│       │         │ is_verified  │◀────────────────────────────┘              │
│       │         │ = true       │     (User clicks link)                     │
│       │         └──────────────┘                                            │
│       │                │                                                    │
│       │                ▼                                                    │
│       └───────▶ LOGIN ALLOWED                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | File | Responsibility |
|-----------|------|----------------|
| Email Utility | `app/utils/email.py` | Constructs and sends emails via Brevo |
| Auth Endpoints | `app/api/v1/auth.py` | Registration, login enforcement, verification |
| Config | `app/core/config.py` | `REQUIRE_EMAIL_VERIFICATION` setting |
| User Model | `app/models/user.py` | `is_email_verified` field |
| Mobile Auth Store | `store/useAuthStore.ts` | Handles verification errors |
| Verification Screen | `app/(auth)/verify-email-pending.tsx` | UI for unverified users |

---

## 3. Challenges Encountered & Resolutions

### 🔴 Challenge 1: Emails Not Sending (Silent Failure)

**Symptoms:**
- Registration completed successfully (201 response)
- No email arrived in inbox
- No error messages in initial logs
- Backend appeared healthy

**Investigation:**
```bash
# Check container logs
docker logs vitaltrack-api-dev --tail 100

# Output showed:
# [EMAIL] Mail not configured. Verification token for user@email.com: abc123...
```

**Root Cause:**
Docker container was running with cached environment variables. The `.env` file had been updated, but the running container didn't have the new `MAIL_*` variables.

**Resolution:**
```bash
# WRONG - Just restarts with old env
docker-compose -f docker-compose.dev.yml restart

# CORRECT - Rebuilds and injects new env vars
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml up --build
```

**Prevention:**
Always use `--build` flag when changing environment variables.

---

### 🔴 Challenge 2: "Sender Not Valid" Error

**Symptoms:**
```
[EMAIL] ❌ Failed to send verification email to user@example.com: 
The SMTP server returned the following error: Sender noreply@vitaltrack.app is not valid
```

**Root Cause:**
Brevo requires sender email addresses to be verified. Options:
1. Verify individual email addresses (quick, for testing)
2. Verify entire domain via DNS records (production)

We tried using `noreply@vitaltrack.app` but this domain wasn't verified in Brevo.

**Resolution (Local Development):**

1. **Add verified sender in Brevo:**
   - Go to: Brevo Dashboard → **Senders & IP** → **Senders**
   - Click **"Add a sender"**
   - Enter: `rishabhdongre.rd@gmail.com`
   - Check Gmail inbox for verification email from Brevo
   - Click verification link

2. **Update configuration:**
   ```yaml
   # docker-compose.dev.yml
   MAIL_FROM=rishabhdongre.rd@gmail.com
   ```

3. **Rebuild container:**
   ```bash
   docker-compose -f docker-compose.dev.yml down
   docker-compose -f docker-compose.dev.yml up --build
   ```

**Resolution (Production):**
See Section 6 for domain verification process.

---

### 🔴 Challenge 3: Verification Link Not Working (404 Error)

**Symptoms:**
- Email received successfully
- Clicking link showed 404 or connection refused
- Link format: `http://127.0.0.1:8000/api/v1/auth/verify-email?token=...`

**Root Cause:**
`FRONTEND_URL` was set to `127.0.0.1` which:
- Works only on the same machine
- Doesn't work when clicking link on phone
- Doesn't work in Docker (different network namespace)

**Resolution:**
Use your machine's local IP address that's accessible from your phone:

```yaml
# docker-compose.dev.yml
FRONTEND_URL=http://172.25.32.1:8000/api/v1/auth
```

**How to find your local IP:**
```bash
# Windows
ipconfig | findstr "IPv4"

# macOS/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1
```

---

### 🔴 Challenge 4: Users Stuck in Unverified State

**Symptoms:**
- User registered days ago
- Initial email failed or was lost
- User cannot login (EMAIL_NOT_VERIFIED error)
- No way to get a new verification email

**Root Cause:**
Login endpoint only checks verification status but doesn't trigger new emails. This is by design (prevents email spam on every login attempt).

**Resolution:**
Implemented "Resend Verification" flow:

1. **Mobile app** catches `EMAIL_NOT_VERIFIED` error
2. **Redirects** to `verify-email-pending` screen
3. **User clicks** "Resend Verification Email" button
4. **Backend** generates new token, sends new email
5. **User** can now verify and login

**Code Flow:**
```typescript
// login.tsx
catch (err) {
    if (error.message === 'EMAIL_NOT_VERIFIED') {
        router.push({
            pathname: '/(auth)/verify-email-pending',
            params: { email: identifier.trim() }
        });
    }
}
```

---

### 🔴 Challenge 5: CORS Errors from Mobile App

**Symptoms:**
```
Access to fetch at 'http://172.25.32.1:8000/api/v1/auth/register' 
from origin 'http://localhost:8081' has been blocked by CORS policy
```

**Root Cause:**
Mobile app running on Expo uses various origins that weren't in the CORS allowlist.

**Resolution:**
Added all possible Expo origins to `CORS_ORIGINS`:

```yaml
# docker-compose.dev.yml
CORS_ORIGINS=["http://localhost:3000","http://localhost:8081","http://172.25.32.1:8081","http://192.168.1.100:8081","exp://192.168.1.100:8081"]
```

**Note:** For production, restrict to your actual domains only.

---

## 4. Configuration Reference

### Environment Variables Explained

| Variable | Purpose | Local Value | Production Value |
|----------|---------|-------------|------------------|
| `MAIL_USERNAME` | Brevo SMTP login | `a14a39001@smtp-brevo.com` | Same |
| `MAIL_PASSWORD` | Brevo SMTP key | `xsmtpsib-xxx...` | Same |
| `MAIL_FROM` | Sender email (users see this) | `rishabhdongre.rd@gmail.com` | `noreply@vitaltrack.app` |
| `MAIL_SERVER` | SMTP server address | `smtp-relay.brevo.com` | Same |
| `MAIL_PORT` | SMTP port | `587` | Same |
| `MAIL_STARTTLS` | Use TLS encryption | `true` | `true` |
| `MAIL_SSL_TLS` | Use SSL (mutually exclusive with STARTTLS) | `false` | `false` |
| `REQUIRE_EMAIL_VERIFICATION` | Enforce verification | `true` | `true` |
| `FRONTEND_URL` | Base URL for email links | `http://172.25.32.1:8000/api/v1/auth` | `https://api.vitaltrack.app/api/v1/auth` |

### Configuration Files

| Environment | File | Purpose |
|-------------|------|---------|
| Local (Docker) | `docker-compose.dev.yml` | Container environment variables |
| Local (Direct) | `.env` | Direct uvicorn execution |
| Production | Railway/Render Variables | Cloud platform secrets |

---

## 5. Local Development Setup

### Prerequisites

- Docker Desktop installed and running
- Brevo account with SMTP key
- Verified sender email in Brevo
- Android phone with Expo Go (on same WiFi)

### Step-by-Step Setup

#### Step 1: Verify Sender Email in Brevo

1. Login to [Brevo Dashboard](https://app.brevo.com)
2. Go to: **Senders & IP** → **Senders**
3. Click **"Add a sender"**
4. Enter:
   - Email: `rishabhdongre.rd@gmail.com`
   - Name: `VitalTrack`
5. Click **Save**
6. Open Gmail, find Brevo verification email
7. Click verification link

```
✓ CHECKPOINT: Sender shows "Verified" status in Brevo
```

#### Step 2: Find Your Local IP

```bash
# Windows
ipconfig | findstr "IPv4"
# Example output: IPv4 Address. . . . . : 172.25.32.1

# macOS
ifconfig | grep "inet " | grep -v 127.0.0.1

# Linux
hostname -I
```

**Save this IP** - you'll need it for `FRONTEND_URL`.

#### Step 3: Configure docker-compose.dev.yml

```yaml
# vitaltrack-backend/docker-compose.dev.yml
version: '3.8'

services:
  db:
    image: postgres:16-alpine
    container_name: vitaltrack-db-dev
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: vitaltrack
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: Dockerfile.dev
    container_name: vitaltrack-api-dev
    ports:
      - "8000:8000"
    environment:
      # Database
      - DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/vitaltrack
      
      # Security
      - SECRET_KEY=dev-secret-key-change-in-production-min-32-chars
      - ENVIRONMENT=development
      - DEBUG=true
      
      # CORS (add your phone's possible origins)
      - CORS_ORIGINS=["http://localhost:3000","http://localhost:8081","http://172.25.32.1:8081","exp://172.25.32.1:8081"]
      
      # ================================================
      # EMAIL CONFIGURATION (BREVO)
      # ================================================
      - MAIL_USERNAME=a14a39001@smtp-brevo.com
      - MAIL_PASSWORD=xsmtpsib-YOUR-ACTUAL-KEY-HERE
      - MAIL_FROM=rishabhdongre.rd@gmail.com
      - MAIL_SERVER=smtp-relay.brevo.com
      - MAIL_PORT=587
      - MAIL_STARTTLS=true
      - MAIL_SSL_TLS=false
      
      # ================================================
      # EMAIL VERIFICATION
      # ================================================
      - REQUIRE_EMAIL_VERIFICATION=true
      - FRONTEND_URL=http://172.25.32.1:8000/api/v1/auth
      # ^^^^^^^^^^^^^^^^ REPLACE WITH YOUR LOCAL IP
      
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - ./app:/app/app:ro

volumes:
  postgres_data:
```

#### Step 4: Start Services

```bash
cd vitaltrack-backend

# Stop any existing containers
docker-compose -f docker-compose.dev.yml down

# Build and start (ALWAYS use --build when changing env vars)
docker-compose -f docker-compose.dev.yml up --build
```

#### Step 5: Verify Services Running

```bash
# Check containers
docker-compose -f docker-compose.dev.yml ps

# Expected:
# NAME                   STATUS
# vitaltrack-db-dev      Up (healthy)
# vitaltrack-api-dev     Up

# Check API health
curl http://localhost:8000/health

# Check email config loaded
docker exec vitaltrack-api-dev env | grep MAIL
```

#### Step 6: Update Mobile App

```bash
# vitaltrack-mobile/.env
EXPO_PUBLIC_API_URL=http://172.25.32.1:8000
```

#### Step 7: Start Mobile App

```bash
cd vitaltrack-mobile
npx expo start
```

Scan QR with Expo Go on your phone.

```
✓ CHECKPOINT: App connects to backend, registration sends email
```

---

## 6. Production Deployment Guide

### Domain Verification (Required for Production)

For production, you need to verify your actual domain in Brevo instead of using Gmail.

#### Step 1: Add Domain in Brevo

1. Go to: **Senders & IP** → **Domains**
2. Click **"Add a domain"**
3. Enter: `vitaltrack.app` (or your domain)

#### Step 2: Add DNS Records

Brevo will provide DNS records to add:

| Type | Name | Value |
|------|------|-------|
| TXT | `@` | `brevo-code:xxxxx` |
| CNAME | `mail._domainkey` | `xxxxx.dkim.brevo.com` |

Add these to your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.)

#### Step 3: Verify Domain

1. Wait 5-10 minutes for DNS propagation
2. Click **"Verify"** in Brevo
3. Status should change to **"Verified"**

#### Step 4: Create Sender

1. Go to: **Senders** → **Add a sender**
2. Enter: `noreply@vitaltrack.app`
3. Domain is already verified, so this works immediately

### Production Environment Variables

Set these in Railway/Render:

```bash
# Core
SECRET_KEY=<generate-new-32-char-key>
ENVIRONMENT=production
DEBUG=false

# Database (auto-set by Railway)
DATABASE_URL=postgresql+asyncpg://...

# Email
MAIL_USERNAME=a14a39001@smtp-brevo.com
MAIL_PASSWORD=xsmtpsib-your-key
MAIL_FROM=noreply@vitaltrack.app
MAIL_SERVER=smtp-relay.brevo.com
MAIL_PORT=587
MAIL_STARTTLS=true
MAIL_SSL_TLS=false

# Verification
REQUIRE_EMAIL_VERIFICATION=true
FRONTEND_URL=https://api.vitaltrack.app/api/v1/auth

# CORS (restrict to your domains)
CORS_ORIGINS=["https://vitaltrack.app","https://app.vitaltrack.app"]
```

### Local vs Production Comparison

| Setting | Local Development | Production |
|---------|-------------------|------------|
| `MAIL_FROM` | `rishabhdongre.rd@gmail.com` | `noreply@vitaltrack.app` |
| `FRONTEND_URL` | `http://172.25.32.1:8000/api/v1/auth` | `https://api.vitaltrack.app/api/v1/auth` |
| `DEBUG` | `true` | `false` |
| `SECRET_KEY` | Dev key (any) | Strong random key |
| `CORS_ORIGINS` | Multiple local origins | Only production domains |

---

## 7. End-to-End User Flows

### Flow A: New User Registration

```
┌─────────────────────────────────────────────────────────────────┐
│                    NEW USER REGISTRATION                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User opens app                                               │
│     └─► Sees Login screen                                        │
│                                                                  │
│  2. User taps "Sign Up"                                          │
│     └─► Sees Registration form                                   │
│                                                                  │
│  3. User enters: email, password, name                           │
│     └─► Taps "Register"                                          │
│                                                                  │
│  4. Backend processes registration                               │
│     ├─► Creates user (is_email_verified = false)                 │
│     ├─► Generates verification token                             │
│     ├─► Sends email via Brevo                                    │
│     └─► Returns 201 Created                                      │
│                                                                  │
│  5. App shows "Check Your Email" screen                          │
│     └─► User opens Gmail                                         │
│                                                                  │
│  6. User clicks verification link                                │
│     └─► Browser opens: /api/v1/auth/verify-email?token=xxx      │
│                                                                  │
│  7. Backend verifies token                                       │
│     ├─► Sets is_email_verified = true                            │
│     └─► Shows "Email Verified!" HTML page                        │
│                                                                  │
│  8. User returns to app, logs in                                 │
│     └─► SUCCESS! Reaches dashboard                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Flow B: Unverified User Tries to Login

```
┌─────────────────────────────────────────────────────────────────┐
│                 UNVERIFIED USER LOGIN ATTEMPT                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User enters email + password                                 │
│     └─► Taps "Sign In"                                           │
│                                                                  │
│  2. Backend checks user                                          │
│     ├─► Password correct ✓                                       │
│     ├─► is_email_verified = false ✗                              │
│     └─► Returns 403 "EMAIL_NOT_VERIFIED"                         │
│                                                                  │
│  3. App catches specific error                                   │
│     └─► Redirects to "Verify Email" screen                       │
│                                                                  │
│  4. User sees options:                                           │
│     ├─► Instructions to check email                              │
│     ├─► "Resend Verification Email" button                       │
│     └─► "Back to Login" button                                   │
│                                                                  │
│  5. User clicks "Resend"                                         │
│     ├─► Backend generates NEW token                              │
│     ├─► Sends NEW email                                          │
│     └─► Shows "Email Sent!" confirmation                         │
│                                                                  │
│  6. User verifies via new link                                   │
│     └─► Returns to app, logs in successfully                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Flow C: Username-Only Registration (No Verification)

```
┌─────────────────────────────────────────────────────────────────┐
│               USERNAME-ONLY REGISTRATION                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User registers with username (no email)                      │
│     └─► Backend creates user                                     │
│                                                                  │
│  2. No email to verify                                           │
│     └─► User can login immediately                               │
│                                                                  │
│  Note: REQUIRE_EMAIL_VERIFICATION only applies to                │
│        users who provide an email address.                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Troubleshooting Guide

### Quick Diagnosis Flowchart

```
Email not working?
       │
       ▼
┌──────────────────┐     NO      ┌─────────────────────┐
│ Logs show        │────────────▶│ Rebuild container:  │
│ MAIL_USERNAME?   │             │ docker-compose up   │
└──────────────────┘             │ --build             │
       │ YES                     └─────────────────────┘
       ▼
┌──────────────────┐     NO      ┌─────────────────────┐
│ Logs show        │────────────▶│ Check MAIL_PASSWORD │
│ "Connecting to   │             │ in compose file     │
│ SMTP..."?        │             └─────────────────────┘
└──────────────────┘
       │ YES
       ▼
┌──────────────────┐     YES     ┌─────────────────────┐
│ "Sender not      │────────────▶│ Verify sender email │
│ valid" error?    │             │ in Brevo dashboard  │
└──────────────────┘             └─────────────────────┘
       │ NO
       ▼
┌──────────────────┐     YES     ┌─────────────────────┐
│ Email sent but   │────────────▶│ Check spam folder   │
│ not received?    │             │ Check Brevo logs    │
└──────────────────┘             └─────────────────────┘
       │ NO
       ▼
┌──────────────────┐     YES     ┌─────────────────────┐
│ Link 404 error?  │────────────▶│ Fix FRONTEND_URL    │
│                  │             │ Use correct IP      │
└──────────────────┘             └─────────────────────┘
```

### Common Issues & Solutions

#### Issue: "Mail not configured" in logs

**Symptom:**
```
[EMAIL] Mail not configured. Verification token for user@email.com: abc123
```

**Cause:** `MAIL_USERNAME` or `MAIL_PASSWORD` is empty or not loaded.

**Solution:**
```bash
# Check if vars are in container
docker exec vitaltrack-api-dev env | grep MAIL

# If empty, rebuild
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml up --build
```

---

#### Issue: "Sender not valid" error

**Symptom:**
```
[EMAIL] ❌ Failed to send... Sender noreply@vitaltrack.app is not valid
```

**Cause:** The email in `MAIL_FROM` is not verified in Brevo.

**Solution:**
1. Go to Brevo → Senders & IP → Senders
2. Add your sender email
3. Verify via email link
4. Update `MAIL_FROM` in docker-compose.dev.yml
5. Rebuild container

---

#### Issue: Verification link not working (phone)

**Symptom:** Clicking link on phone shows "Connection refused" or 404.

**Cause:** `FRONTEND_URL` uses `localhost` or `127.0.0.1`.

**Solution:**
```yaml
# Use your machine's actual IP (accessible from phone)
FRONTEND_URL=http://172.25.32.1:8000/api/v1/auth
```

Find IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)

---

#### Issue: CORS error from mobile app

**Symptom:**
```
Access blocked by CORS policy
```

**Cause:** Mobile app origin not in `CORS_ORIGINS`.

**Solution:**
```yaml
CORS_ORIGINS=["http://localhost:8081","http://172.25.32.1:8081","exp://172.25.32.1:8081"]
```

---

#### Issue: User stuck, can't get verification email

**Symptom:** User registered long ago, email was lost, can't login.

**Solution:**
1. User clicks "Login"
2. Gets `EMAIL_NOT_VERIFIED` error
3. App redirects to verification screen
4. User clicks "Resend Verification Email"
5. New email sent with new token

**Manual database fix (if needed):**
```bash
# Mark user as verified directly
docker exec -it vitaltrack-db-dev psql -U postgres -d vitaltrack -c \
  "UPDATE users SET is_email_verified = true WHERE email = 'user@example.com';"
```

---

#### Issue: Token expired

**Symptom:** "Invalid or expired verification token" error.

**Cause:** Verification tokens expire after 24 hours.

**Solution:**
User must request a new token via "Resend Verification Email".

---

## 9. Command Reference

### Docker Commands

```bash
# Start services (first time or after compose changes)
docker-compose -f docker-compose.dev.yml up --build

# Start services (no changes)
docker-compose -f docker-compose.dev.yml up

# Stop services
docker-compose -f docker-compose.dev.yml down

# View logs (follow mode)
docker logs vitaltrack-api-dev -f

# View last 50 log lines
docker logs vitaltrack-api-dev --tail 50

# Check environment variables in container
docker exec vitaltrack-api-dev env | grep MAIL

# Execute command in container
docker exec -it vitaltrack-api-dev bash

# Check container status
docker-compose -f docker-compose.dev.yml ps
```

### Database Commands

```bash
# Connect to PostgreSQL
docker exec -it vitaltrack-db-dev psql -U postgres -d vitaltrack

# List all users
docker exec -it vitaltrack-db-dev psql -U postgres -d vitaltrack -c \
  "SELECT id, email, is_email_verified, created_at FROM users;"

# Check specific user
docker exec -it vitaltrack-db-dev psql -U postgres -d vitaltrack -c \
  "SELECT * FROM users WHERE email = 'user@example.com';"

# Manually verify a user
docker exec -it vitaltrack-db-dev psql -U postgres -d vitaltrack -c \
  "UPDATE users SET is_email_verified = true WHERE email = 'user@example.com';"

# Delete test user (to re-register)
docker exec -it vitaltrack-db-dev psql -U postgres -d vitaltrack -c \
  "DELETE FROM users WHERE email = 'test@example.com';"

# Delete all test users
docker exec -it vitaltrack-db-dev psql -U postgres -d vitaltrack -c \
  "DELETE FROM users WHERE email LIKE '%test%';"
```

### API Testing Commands

```bash
# Health check
curl http://localhost:8000/health

# Register new user
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234!","name":"Test User"}'

# Login (should fail if not verified)
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test@example.com","password":"Test1234!"}'

# Resend verification email
curl -X POST http://localhost:8000/api/v1/auth/resend-verification \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

### Mobile Commands

```bash
# Start Expo
cd vitaltrack-mobile
npx expo start

# Clear cache and start
npx expo start --clear

# Check for issues
npx expo-doctor
```

---

## 10. Verification Checklist

### Local Development Setup

```
BREVO SETUP
□ Created Brevo account
□ Generated SMTP key
□ Added sender email (rishabhdongre.rd@gmail.com)
□ Verified sender email via link

DOCKER CONFIGURATION
□ Updated docker-compose.dev.yml with MAIL_* vars
□ Set MAIL_FROM to verified sender
□ Set FRONTEND_URL to local IP (not localhost)
□ Set REQUIRE_EMAIL_VERIFICATION=true
□ Rebuilt container with --build flag

VERIFICATION TESTING
□ Registered new user → Email arrived
□ Clicked verification link → Browser showed "Verified!"
□ Logged in after verification → Success!
□ Tested "Resend Verification" → New email arrived
□ Tested login before verification → Shows pending screen
```

### Production Deployment

```
DOMAIN SETUP
□ Added domain to Brevo
□ Added DNS records (TXT, CNAME)
□ Domain verified in Brevo
□ Created noreply@yourdomain.com sender

ENVIRONMENT VARIABLES
□ Set MAIL_FROM to verified domain email
□ Set FRONTEND_URL to production API URL
□ Set strong SECRET_KEY
□ Set ENVIRONMENT=production
□ Restricted CORS_ORIGINS to production domains

PRODUCTION TESTING
□ Registered user → Email arrived
□ Verification link works
□ Login enforcement works
□ Resend functionality works
```

---

## Summary

### Key Takeaways

1. **Always rebuild Docker** when changing environment variables
2. **Verify sender email** in Brevo before sending
3. **Use actual IP** (not localhost) for `FRONTEND_URL` in local dev
4. **Implement "Resend"** to handle lost/expired verification emails
5. **For production**, verify your domain in Brevo

### File Changes Made

| File | Change |
|------|--------|
| `docker-compose.dev.yml` | Added full MAIL_* configuration |
| `app/core/config.py` | Added `REQUIRE_EMAIL_VERIFICATION` |
| `app/api/v1/auth.py` | Added verification check in login |
| `store/useAuthStore.ts` | Added EMAIL_NOT_VERIFIED handling |
| `app/(auth)/login.tsx` | Added redirect to verification screen |
| `app/(auth)/verify-email-pending.tsx` | Created new screen |

---

**Document Version:** 2.0  
**Last Updated:** February 2, 2026  
**Status:** Email Verification Fully Functional ✅
