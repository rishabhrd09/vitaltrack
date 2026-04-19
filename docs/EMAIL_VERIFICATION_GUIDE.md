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
| Mailtrap sandbox for dev | Shipped | Same utility, SMTP path |
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
| Email utility | `vitaltrack-backend/app/utils/email.py` | Sends via Brevo HTTP API (prod/staging) or SMTP (dev) |
| Auth endpoints | `vitaltrack-backend/app/api/v1/auth.py` | Register, login guard, verification, resend |
| Config | `vitaltrack-backend/app/core/config.py` | `REQUIRE_EMAIL_VERIFICATION`, `MAIL_*`, `FRONTEND_URL` |
| User model | `vitaltrack-backend/app/models/user.py` | `is_email_verified`, `verification_token`, `verification_token_expires` |
| Migration | `alembic/versions/20260125_add_email_verification.py` | Adds those columns |
| Mobile auth store | `vitaltrack-mobile/store/useAuthStore.ts` | Catches `EMAIL_NOT_VERIFIED`, redirects |
| Verify screen | `vitaltrack-mobile/app/(auth)/verify-email-pending.tsx` | Resend + "Go to Login" |

### Token Storage

Verification tokens follow the same **hash-on-server / raw-in-email** pattern as password reset and (PR #13) account deletion:

- Raw token: `secrets.token_urlsafe(32)` (256 bits of entropy).
- Stored: `SHA-256(raw)` in `verification_token`.
- TTL: 24 hours (`verification_token_expires`).
- Verification query compares `SHA-256(incoming)` against the stored hash and requires `expires > now()`.

DB never holds the raw token, so a DB dump alone does not let an attacker verify anyone.

---

## 3. Backend Endpoints

All under `/api/v1/auth` (see `vitaltrack-backend/app/api/v1/auth.py`).

| Method | Path | Purpose | Auth | Rate Limit |
|---|---|---|---|---|
| `POST` | `/register` | Create account, send verification email | none | 3/hour |
| `POST` | `/login` | Login, blocks unverified users | none | 5/min |
| `GET` | `/verify-email?token=...` | Verify via query param (legacy) | none | — |
| `GET` | `/verify-email/{token}` | Verify via path param (primary) | none | — |
| `POST` | `/resend-verification` | Request new verification email | none | 3/hour |
| `GET` | `/email-service-status` | Is Brevo configured? | none | — |

**Not** `POST /verify-email` — the browser clicks a link in an email, so the endpoint must be `GET`.

### Login Guard (enforced when all three are true)

```python
# vitaltrack-backend/app/api/v1/auth.py
if (
    settings.REQUIRE_EMAIL_VERIFICATION
    and settings.MAIL_PASSWORD      # email actually configured
    and user.email                  # username-only accounts are exempt
    and not user.is_email_verified
):
    raise HTTPException(status_code=403, detail="EMAIL_NOT_VERIFIED")
```

The `MAIL_PASSWORD` gate prevents a lockout if Brevo env vars were forgotten on a deploy. If the email service isn't configured, the guard is skipped.

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
| `MAIL_USERNAME` | SMTP login (if using SMTP) | Mailtrap sandbox user | Brevo SMTP user |
| `MAIL_PASSWORD` | SMTP password or Brevo API key | Mailtrap token | Brevo API key (`xkeysib-...`) |
| `MAIL_FROM` | Sender shown to user | Verified address | `noreply@carekosh.com` |
| `MAIL_SERVER` | SMTP host | `sandbox.smtp.mailtrap.io` | `smtp-relay.brevo.com` |
| `MAIL_PORT` | SMTP port | `2525` (Mailtrap) | `587` |
| `MAIL_STARTTLS` | STARTTLS on | `true` | `true` |
| `MAIL_SSL_TLS` | Implicit TLS (mutually exclusive) | `false` | `false` |
| `REQUIRE_EMAIL_VERIFICATION` | Block unverified login | `false` (optional in dev) | `true` |
| `FRONTEND_URL` | Base for email links | `http://<host-IP>:8000/api/v1/auth` | `https://vitaltrack-api.onrender.com/api/v1/auth` |

**`MAIL_FROM` default** is `noreply@carekosh.com` in `app/core/config.py` (set by PR #12). If the env var is present it overrides the default.

### Config Validators (PR #12)

Hardened in production only:

- `SECRET_KEY` must be ≥32 chars and must not start with `"CHANGE-THIS"` when `ENVIRONMENT=production`.
- `FRONTEND_URL` must not be empty when `ENVIRONMENT=production`.
- `CORS_ORIGINS` must not be `"*"` when `ENVIRONMENT=production`.

Startup fails fast rather than send broken verification links or run with a default key.

---

## 5. Local Development Setup

You have two choices:

- **Mailtrap sandbox** (recommended) — captures email to a web UI, no risk of sending to real addresses.
- **Brevo with a verified personal sender** — real delivery to your own inbox.

### Prerequisites
- Docker Desktop running
- Mailtrap account **or** Brevo account with a verified sender
- Android phone on same Wi-Fi as PC (or USB debugging — see `docs/USB_ADB_REVERSE_GUIDE.md`)

### Step 1: Set up the email provider

**Mailtrap sandbox:**
1. Create account at [mailtrap.io](https://mailtrap.io), go to **Sandbox → Inboxes**.
2. Open the default inbox → **SMTP Settings** → Node.js/etc.
3. Note host (`sandbox.smtp.mailtrap.io`), port (`2525`), username, and password.

**Brevo with personal sender:**
1. Log in at [app.brevo.com](https://app.brevo.com).
2. **Senders & IP → Senders → Add a sender** → enter your personal Gmail, confirm via the link Brevo emails you.
3. **SMTP & API → SMTP** → note the SMTP username and generate a Master key for `MAIL_PASSWORD`.

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
      - DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/carekosh
      - SECRET_KEY=dev-secret-key-change-in-production-min-32-chars
      - ENVIRONMENT=development
      - DEBUG=true

      # CORS — include every origin your phone might present
      - CORS_ORIGINS=["http://localhost:3000","http://localhost:8081","http://192.168.1.42:8081","exp://192.168.1.42:8081"]

      # Email (Mailtrap sandbox example)
      - MAIL_USERNAME=<mailtrap-username>
      - MAIL_PASSWORD=<mailtrap-password>
      - MAIL_FROM=noreply@carekosh.com
      - MAIL_SERVER=sandbox.smtp.mailtrap.io
      - MAIL_PORT=2525
      - MAIL_STARTTLS=true
      - MAIL_SSL_TLS=false

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
docker exec carekosh-api-dev env | grep MAIL
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

Register an account — email arrives in Mailtrap/Gmail, click link, come back, log in.

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

MAIL_USERNAME=<Brevo SMTP user>
MAIL_PASSWORD=<Brevo API key>
MAIL_FROM=noreply@carekosh.com
MAIL_SERVER=smtp-relay.brevo.com
MAIL_PORT=587
MAIL_STARTTLS=true
MAIL_SSL_TLS=false

REQUIRE_EMAIL_VERIFICATION=true
FRONTEND_URL=https://vitaltrack-api.onrender.com/api/v1/auth

CORS_ORIGINS=["https://carekosh.com","https://app.carekosh.com"]
```

The production config validators (PR #12) will **refuse to start** if `SECRET_KEY` is weak, `FRONTEND_URL` is empty, or `CORS_ORIGINS` is `"*"`.

### Dev vs Production Summary

| Setting | Dev | Production |
|---|---|---|
| `MAIL_FROM` | verified personal sender | `noreply@carekosh.com` |
| `FRONTEND_URL` | `http://<IP>:8000/api/v1/auth` | `https://vitaltrack-api.onrender.com/api/v1/auth` |
| `DEBUG` | `true` | `false` |
| `SECRET_KEY` | any dev value | strong, not `CHANGE-THIS*` |
| `CORS_ORIGINS` | local origins | production domains only |

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

### "Mail not configured" in logs
```
[EMAIL] Mail not configured. Verification token for user@email.com: abc123...
```
`MAIL_USERNAME`/`MAIL_PASSWORD` didn't reach the container. Rebuild:
```bash
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml up --build
docker exec carekosh-api-dev env | grep MAIL
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
docker exec -it carekosh-db-dev psql -U postgres -d carekosh -c \
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
docker logs carekosh-api-dev -f
docker exec carekosh-api-dev env | grep MAIL
docker compose -f docker-compose.dev.yml ps
```

### Database
```bash
# Open a psql shell
docker exec -it carekosh-db-dev psql -U postgres -d carekosh

# List users with verification state
docker exec -it carekosh-db-dev psql -U postgres -d carekosh -c \
  "SELECT id, email, is_email_verified, created_at FROM users;"

# Manually verify (dev only)
docker exec -it carekosh-db-dev psql -U postgres -d carekosh -c \
  "UPDATE users SET is_email_verified = true WHERE email = 'user@example.com';"

# Delete test users
docker exec -it carekosh-db-dev psql -U postgres -d carekosh -c \
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
[ ] Mailtrap inbox OR Brevo verified sender set up
[ ] docker-compose.dev.yml has MAIL_* + REQUIRE_EMAIL_VERIFICATION + FRONTEND_URL
[ ] FRONTEND_URL uses PC LAN IP (not localhost)
[ ] Container rebuilt with --build after any env change
[ ] Registered user → email captured in Mailtrap or received in Gmail
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
[ ] CORS_ORIGINS restricted to carekosh.com domains (no "*")
[ ] FRONTEND_URL set to https://vitaltrack-api.onrender.com/api/v1/auth
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

**Last updated:** 2026-04-19 · Tracks PR #12 auth hardening.
