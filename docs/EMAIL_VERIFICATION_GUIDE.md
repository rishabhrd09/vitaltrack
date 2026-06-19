# CareKosh Email Verification Guide

**Registration flow, tokens, email templates, configuration, and troubleshooting.**

> **Related docs:** See `docs/PHASE1_AUTH_HARDENING.md` for enumeration-leak fix and enforcement gating; see `docs/ENVIRONMENT_SPLIT.md` for staging/production email config; see repo-root `CAREKOSH_DEVELOPER_GUIDE.md` §3 for auth endpoint reference.

---

## Table of Contents

1. [What Was Built](#1-what-was-built)
2. [Architecture & Flow](#2-architecture--flow)
3. [Backend Endpoints](#3-backend-endpoints)
4. [Configuration Reference](#4-configuration-reference)
5. [Local Development Setup](#5-local-development-setup)
6. [Production Deployment](#6-production-deployment)
7. [End-to-End User Flows](#7-end-to-end-user-flows)
8. [Troubleshooting](#8-troubleshooting)
9. [Command Reference](#9-command-reference)
10. [Verification Checklist](#10-verification-checklist)

---

## 1. What Was Built

| Feature | Status | Where |
|---------|--------|-------|
| Email verification enforcement | Shipped | `app/api/v1/auth.py` login path |
| Brevo HTTP API integration | Shipped | `app/utils/email.py` |
| Local email testing | Brevo HTTP API only | Same utility; leave `MAIL_PASSWORD` empty to skip email sends |
| Verification pending screen | Shipped | `app/(auth)/verify-email-pending.tsx` |
| Resend verification | Shipped | `POST /auth/resend-verification` |
| Enumeration-safe responses | Shipped in PR #12 | Identical text on all branches |
| Email required at registration | Shipped in PR #12 | `schemas/user.py` `UserRegister` |

**Current behaviour (post PR #12):**
- Email is **required** to register.
- Login is blocked with `403 EMAIL_NOT_VERIFIED` **only if** `REQUIRE_EMAIL_VERIFICATION=true` **AND** `MAIL_PASSWORD` is set **AND** the user has an email that is not yet verified. All three conditions must hold — this prevents lockouts when Brevo is not configured.
- `POST /auth/resend-verification` returns the same "If an account exists..." message whether the email exists or is already verified — no enumeration.

---

## 2. Architecture & Flow

```
┌──────────┐    ┌──────────────┐    ┌─────────────┐    ┌───────────────┐
│  Mobile  │───▶│   FastAPI    │───▶│  Brevo API  │───▶│  User Inbox   │
│   App    │    │   Backend    │    │  (or SMTP)  │    │  (Gmail etc.) │
└──────────┘    └──────┬───────┘    └─────────────┘    └───────┬───────┘
                       │                                       │
                       ▼                                       │
                ┌──────────────┐                               │
                │  PostgreSQL  │                               │
                │ is_email_    │◀──────────────────────────────┘
                │ verified=true│        (user clicks link)
                └──────────────┘
```

### Component Responsibilities

| Component | File | Responsibility |
|-----------|------|----------------|
| Email utility | `vitaltrack-backend/app/utils/email.py` | Sends via Brevo HTTP API when `MAIL_PASSWORD` is configured |
| Auth endpoints | `vitaltrack-backend/app/api/v1/auth.py` | Register, login guard, verification, resend |
| Config | `vitaltrack-backend/app/core/config.py` | `REQUIRE_EMAIL_VERIFICATION`, `MAIL_*`, `FRONTEND_URL` |
| User model | `vitaltrack-backend/app/models/user.py` | `is_email_verified`, `email_verification_token`, `email_verification_expiry` |
| Migration | `alembic/versions/20260125_add_email_verification.py` | Adds those columns |
| Mobile auth store | `vitaltrack-mobile/store/useAuthStore.ts` | Catches `EMAIL_NOT_VERIFIED`, redirects |
| Verify screen | `vitaltrack-mobile/app/(auth)/verify-email-pending.tsx` | Resend + "Go to Login" |

### Token Storage

Verification tokens follow the same **hash-on-server / raw-in-email** pattern as password reset and (PR #13) account deletion:

- Raw token: `secrets.token_urlsafe(32)` (256 bits of entropy).
- Stored: `SHA-256(raw)` in the `email_verification_token` column.
- TTL: 24 hours (`email_verification_expiry`).
- Verification query compares `SHA-256(incoming)` against the stored hash and requires `expires > now()`.

DB never holds the raw token, so a DB dump alone does not let an attacker verify anyone.

---

## 3. Backend Endpoints

All under `/api/v1/auth` (see `vitaltrack-backend/app/api/v1/auth.py`).

| Method | Path | Purpose | Auth | Rate Limit |
|---|---|---|---|---|
| `POST` | `/register` | Create account, send verification email | none | 3/hour |
| `POST` | `/login` | Login, blocks unverified users | none | 5/min |
| `GET` | `/verify-email?token=...` | Verify via query param — **this is what emails actually link to** (`app/utils/email.py` emits `{FRONTEND_URL}/verify-email?token=...`) | none | — |
| `GET` | `/verify-email/{token}` | Verify via path param (returns JSON; alternate API-style entry point, not used in outgoing email links) | none | — |
| `POST` | `/resend-verification` | Request new verification email | none | 3/hour |
| `GET` | `/email-service-status` | Authenticated email-service diagnostic with raw provider errors masked | bearer token | — |

**Not** `POST /verify-email` — the browser clicks a link in an email, so the endpoint must be `GET`.

### Login Guard (enforced when all three are true)

```python
# vitaltrack-backend/app/api/v1/auth.py
if (
    settings.REQUIRE_EMAIL_VERIFICATION
    and is_email_configured()       # MAIL_PASSWORD is non-empty after SecretStr handling
    and user.email                  # username-only accounts are exempt
    and not user.is_email_verified
):
    raise HTTPException(status_code=403, detail="EMAIL_NOT_VERIFIED")
```

The `is_email_configured()` gate checks the resolved `MAIL_PASSWORD` value after SecretStr handling and prevents a lockout if Brevo env vars were forgotten on a deploy. If the email service isn't configured, the guard is skipped.

### Resend (enumeration-safe)

After PR #12, all three branches return identical text:

```python
return MessageResponse(
    message="If an account exists with this email, a verification link will be sent."
)
```

- Email not found → same message.
- Email exists but already verified → same message.
- Email exists, unverified → same message, token generated, email queued.

An attacker cannot probe which emails are registered by reading the response body.

---

## 4. Configuration Reference

### Environment Variables

| Variable | Purpose | Dev (Docker) | Staging/Prod (Render) |
|---|---|---|---|
| `MAIL_USERNAME` | Legacy SMTP login; unused by current send path | usually empty | unused by current Brevo HTTP API path |
| `MAIL_PASSWORD` | Brevo HTTP API key for the current send path | optional unless testing real email | Brevo API key (`xkeysib-...`) |
| `MAIL_FROM` | Sender shown to user | Verified address | `noreply@carekosh.com` |
| `MAIL_SERVER` | Legacy SMTP host; retained in config | `sandbox.smtp.mailtrap.io` | unused by current Brevo HTTP API path |
| `MAIL_PORT` | Legacy SMTP port | `587` | unused by current Brevo HTTP API path |
| `MAIL_STARTTLS` | Legacy SMTP toggle | `true` | unused by current Brevo HTTP API path |
| `MAIL_SSL_TLS` | Implicit TLS (mutually exclusive) | `false` | `false` |
| `REQUIRE_EMAIL_VERIFICATION` | Block unverified login | `false` (optional in dev) | `true` |
| `FRONTEND_URL` | Base for email links | `http://<host-IP>:8000/api/v1/auth` | `https://api.carekosh.com/api/v1/auth` |

**`MAIL_FROM` default** is `noreply@carekosh.com` in `app/core/config.py` (set by PR #12). If the env var is present it overrides the default.

### Config Validators (PR #12)

Hardened in production only:

- `SECRET_KEY` must be ≥32 chars and must not start with `"CHANGE-THIS"` when `ENVIRONMENT=production`. (`reject_weak_secret_in_production` validator.)
- `FRONTEND_URL` must not be empty when `ENVIRONMENT=production`. (`require_frontend_url_in_production` validator.)
- `CORS_ORIGINS` is parsed by `parse_cors_origins` (accepts JSON or comma-separated). **There is no production-rejection validator for `"*"` today** — `render.yaml` actually ships `CORS_ORIGINS: '["*"]'` to production. Tightening remains blocked until real browser/admin origins are known.

Startup fails fast on the two validators above rather than send broken verification links or run with a default key.

---

## 5. Local Development Setup

Current code has one active send path:

- **Brevo with a verified sender** — real delivery through Brevo's HTTP API.
- For local runs that should not send email, leave `MAIL_PASSWORD` empty. Outside Docker you can also set `REQUIRE_EMAIL_VERIFICATION=false`; the dev compose file sets it `true`, but the guard is skipped while email is unconfigured.

### Prerequisites
- Docker Desktop running
- Brevo account with a verified sender
- Android phone on same Wi-Fi as PC (or USB debugging — see `docs/USB_ADB_REVERSE_GUIDE.md`)

### Step 1: Set up the email provider

**Mailtrap sandbox (historical SMTP option):**
The current code path does not send through Mailtrap SMTP; it sends through Brevo's HTTP API when `MAIL_PASSWORD` is configured. Mailtrap notes are retained only for older SMTP-era troubleshooting.

**Brevo with personal sender:**
1. Log in at [app.brevo.com](https://app.brevo.com).
2. **Senders & IP → Senders → Add a sender** → enter your personal Gmail, confirm via the link Brevo emails you.
3. **SMTP & API → API Keys** → generate a key for `MAIL_PASSWORD`.

### Step 2: Find your local IP (so phone can click verify links)

```bash
# Windows
ipconfig | findstr "IPv4"

# macOS
ipconfig getifaddr en0

# Linux
hostname -I | awk '{print $1}'
```

Save the result (e.g. `192.168.1.42`). Localhost does **not** work on the phone.

### Step 3: Configure `vitaltrack-backend/docker-compose.dev.yml`

```yaml
services:
  api:
    environment:
      - DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/vitaltrack
      - SECRET_KEY=dev-secret-key-change-in-production-min-32-chars
      - ENVIRONMENT=development
      - DEBUG=true

      # CORS — include every origin your phone might present
      - CORS_ORIGINS=["http://localhost:3000","http://localhost:8081","http://192.168.1.42:8081","exp://192.168.1.42:8081"]

      # Email (optional local real-email test through Brevo HTTP API)
      - MAIL_PASSWORD=<brevo-api-key>
      - MAIL_FROM=noreply@carekosh.com

      - REQUIRE_EMAIL_VERIFICATION=true
      - FRONTEND_URL=http://192.168.1.42:8000/api/v1/auth   # <-- your IP
```

### Step 4: Start services

```bash
cd vitaltrack-backend

# Always use --build when env vars changed — restart alone won't reload them.
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml up --build
```

### Step 5: Verify services

```bash
docker compose -f docker-compose.dev.yml ps
curl http://localhost:8000/health
docker exec vitaltrack-api-dev env | grep MAIL
```

### Step 6: Point the mobile app at the dev backend

```bash
# vitaltrack-mobile/.env
EXPO_PUBLIC_API_URL=http://192.168.1.42:8000
```

Then:

```bash
cd vitaltrack-mobile
npx expo start --clear
```

Register an account — email arrives through Brevo, click link, come back, log in.

---

## 6. Production Deployment

For full environment details see `docs/ENVIRONMENT_SPLIT.md`.

### Domain Verification in Brevo (production)

1. Brevo → **Senders & IP → Domains → Add a domain** → enter `carekosh.com`.
2. Add the DNS records Brevo shows (TXT for domain ownership, CNAMEs for DKIM) at your registrar.
3. Wait 5–15 minutes for DNS propagation; click **Verify**.
4. Add sender `noreply@carekosh.com` — it works immediately because the domain is verified.

### Render Environment Variables (production service)

```
SECRET_KEY=<32+ char random, NOT starting with CHANGE-THIS>
ENVIRONMENT=production
DATABASE_URL=postgresql+asyncpg://...@neon.../neondb

MAIL_PASSWORD=<Brevo API key>
MAIL_FROM=noreply@carekosh.com

REQUIRE_EMAIL_VERIFICATION=true
FRONTEND_URL=https://api.carekosh.com/api/v1/auth

CORS_ORIGINS=["*"]   # actual current value in render.yaml — not enforced as
                     # "must be domain-list" by any validator. Tighten only
                     # after real browser/admin origins are known.
```

The production config validators (PR #12) will **refuse to start** if `SECRET_KEY` is weak (or starts with `CHANGE-THIS`) or `FRONTEND_URL` is empty. There is no validator that rejects `CORS_ORIGINS=["*"]` in production today because no real browser/admin origins are configured yet.

### Dev vs Production Summary

| Setting | Dev | Production |
|---|---|---|
| `MAIL_FROM` | verified personal sender | `noreply@carekosh.com` |
| `FRONTEND_URL` | `http://<IP>:8000/api/v1/auth` | `https://api.carekosh.com/api/v1/auth` |
| `DEBUG` | `true` | `false` |
| `SECRET_KEY` | any dev value | strong, not `CHANGE-THIS*` |
| `CORS_ORIGINS` | local origins or wildcard | currently wildcard; replace only after real production browser/admin origins are known |

---

## 7. End-to-End User Flows

### A. New User Registration

```
1. User opens app → Login screen
2. Taps "Sign Up" → Register form
3. Submits email + password + name → POST /api/v1/auth/register
4. Backend: creates user (is_email_verified=false), writes SHA-256(token)+24h
   expiry, schedules verification email via BackgroundTask, returns 201
5. App shows "Check your email" (verify-email-pending screen)
6. User clicks link in email → GET /api/v1/auth/verify-email/{token}
7. Backend verifies hash & expiry → sets is_email_verified=true → HTML success
8. User returns to app → Login → Dashboard
```

### B. Unverified User Tries to Login

```
1. User submits login
2. Backend: password OK, but is_email_verified=false and guard active
   → 403 EMAIL_NOT_VERIFIED
3. Mobile auth store catches EMAIL_NOT_VERIFIED
   → router.replace('/(auth)/verify-email-pending')
4. User taps "Resend Verification Email"
   → POST /api/v1/auth/resend-verification
   → new token, new email
5. Clicks new link → verified → returns → logs in
```

### C. Username-Only Registration (legacy)

Since PR #12, new registrations **require email**. Existing username-only accounts still exist and can log in without verification — the guard skips them because `user.email` is null.

---

## 8. Troubleshooting

### No verification email is sent
When `MAIL_PASSWORD` is empty, `is_email_configured()` is false. The backend skips sending email and does not print raw verification tokens to the logs. If you intended to test real email, confirm `MAIL_PASSWORD` reached the container, then rebuild:
```bash
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml up --build
docker exec vitaltrack-api-dev env | grep MAIL
```

### "Sender not valid" from Brevo
`MAIL_FROM` is not a verified sender/domain in Brevo. Either add the personal address as a verified sender, or set up domain verification. Rebuild the container after changing the env var.

### Verification link gives 404 / "connection refused" on phone
`FRONTEND_URL` is pointing at `localhost` / `127.0.0.1`. Use your PC's LAN IP instead:
```
FRONTEND_URL=http://192.168.1.42:8000/api/v1/auth
```

### CORS error in the mobile app
Add every origin Expo might present (Metro on 8081, the LAN IP, the `exp://` scheme):
```
CORS_ORIGINS=["http://localhost:8081","http://192.168.1.42:8081","exp://192.168.1.42:8081"]
```

### Stuck unverified, can't get a new email
1. Try to log in → catches `EMAIL_NOT_VERIFIED` → redirects to verify screen.
2. Tap **Resend**.
3. Fallback — mark the user verified directly (dev only):
```bash
docker exec -it vitaltrack-db-dev psql -U postgres -d vitaltrack -c \
  "UPDATE users SET is_email_verified = true WHERE email = 'user@example.com';"
```

### Token expired
Tokens TTL is 24 hours. User must request a new one via **Resend**.

### Login returns `EMAIL_NOT_VERIFIED` after the user clicked the link
Check that the link was consumed — the flag is set on the `GET /verify-email/{token}` call, not on app reopen. Re-verify and look at server logs for `verify_email` entries.

---

## 9. Command Reference

### Docker
```bash
docker compose -f docker-compose.dev.yml up --build   # after env changes
docker compose -f docker-compose.dev.yml up           # no env changes
docker compose -f docker-compose.dev.yml down
docker logs vitaltrack-api-dev -f
docker exec vitaltrack-api-dev env | grep MAIL
docker compose -f docker-compose.dev.yml ps
```

### Database
```bash
# Open a psql shell
docker exec -it vitaltrack-db-dev psql -U postgres -d vitaltrack

# List users with verification state
docker exec -it vitaltrack-db-dev psql -U postgres -d vitaltrack -c \
  "SELECT id, email, is_email_verified, created_at FROM users;"

# Manually verify (dev only)
docker exec -it vitaltrack-db-dev psql -U postgres -d vitaltrack -c \
  "UPDATE users SET is_email_verified = true WHERE email = 'user@example.com';"

# Delete test users
docker exec -it vitaltrack-db-dev psql -U postgres -d vitaltrack -c \
  "DELETE FROM users WHERE email LIKE '%@test.com';"
```

### API (curl)
```bash
# Register
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234!","name":"Test User"}'

# Login (should 403 EMAIL_NOT_VERIFIED pre-verification)
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test@example.com","password":"Test1234!"}'

# Resend
curl -X POST http://localhost:8000/api/v1/auth/resend-verification \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

---

## 10. Verification Checklist

### Local development
```
[ ] Brevo verified sender set up
[ ] docker-compose.dev.yml has MAIL_* + REQUIRE_EMAIL_VERIFICATION + FRONTEND_URL
[ ] FRONTEND_URL uses PC LAN IP (not localhost)
[ ] Container rebuilt with --build after any env change
[ ] Registered user → email received from Brevo
[ ] Clicked link → HTML "Verified" page shown
[ ] Login works after verification
[ ] Resend button produces a new email
```

### Production (Render)
```
[ ] carekosh.com domain verified in Brevo (DKIM CNAMEs resolving)
[ ] noreply@carekosh.com sender active
[ ] SECRET_KEY is strong random (not CHANGE-THIS...)
[ ] ENVIRONMENT=production
[ ] CORS_ORIGINS reviewed (currently `["*"]` — tighten to specific domains if you intend to expose the API to a browser frontend; not enforced by validator)
[ ] FRONTEND_URL set to https://api.carekosh.com/api/v1/auth
[ ] Smoke test: register new email → receive mail → verify → login works
[ ] Smoke test: resend-verification returns identical text for real & fake emails
```

---

## Key Takeaways

1. Always **rebuild** the container after changing env vars — `restart` keeps the old ones.
2. **Verify the sender** (personal address or domain) in Brevo before sending.
3. Use your **LAN IP** (not `localhost`) in `FRONTEND_URL` during local dev, otherwise links 404 on the phone.
4. The login guard requires all three of `REQUIRE_EMAIL_VERIFICATION`, `MAIL_PASSWORD`, and `user.email` — missing any and it's skipped.
5. PR #12 made email required at registration and removed the enumeration leak from resend — keep the uniform response string if you touch that endpoint.

---

**Original:** 2026-04-19 · Tracks PR #12 auth hardening · **Last reviewed:** 2026-05-04 against PR #34.

> **Re-audit notes (2026-05-04):**
> 1. The User model column names are `email_verification_token` and `email_verification_expiry` — earlier drafts of this doc used unprefixed `verification_token` / `verification_token_expires`, which don't exist. Corrected in §2 and §Token Storage.
> 2. The Docker container names in §5 / §7 / §8 / §9 are `vitaltrack-api-dev` and `vitaltrack-db-dev` (the DB is `vitaltrack`). Earlier drafts used `carekosh-*` which don't match `docker-compose.dev.yml`. Corrected.
> 3. The verify-email "primary" / "legacy" labels were inverted — `app/utils/email.py` actually emits `?token=...` (query-param) links into outgoing mail, so that route is what users click. The `/verify-email/{token}` path-param route returns JSON and is API-style. Corrected in §3.
> 4. The CORS-`*`-rejection-validator claim was wrong — see §4 corrections. Production currently ships with `CORS_ORIGINS=["*"]` per `render.yaml`.
> 5. Brevo HTTP API (port 443) is the active transport, not SMTP — the SMTP config keys (`MAIL_SERVER`, `MAIL_PORT`, `MAIL_STARTTLS`) remain in config for legacy compatibility but are not used by `app/utils/email.py`.
> 6. Login enforcement guard, enumeration-safe resend, schema-required-email-on-register all re-verified against current code — unchanged.
