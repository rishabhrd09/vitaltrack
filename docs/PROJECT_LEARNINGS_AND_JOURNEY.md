# VitalTrack — Complete Project Learnings & Journey

> **Everything learned during the Railway-to-Render migration, APK testing, and production hardening. Written for the developer's future reference.**

---

## Timeline of Events

| Date | What Happened |
|------|--------------|
| March 2026 | Railway free trial expired |
| March 24 | Started migration branch, made all code changes |
| March 24 | Local Docker + Expo Go testing (USB debugging) |
| March 24 | Pushed branch, built first preview APK |
| March 24 | Created Neon DB + Render service + UptimeRobot |
| March 24 | Discovered rate limiter 500 error on Render |
| March 24 | Fixed rate limiter, created PR, merged to main |
| March 25 | APK testing round 1 — found auth flow bugs |
| March 25 | Fixed auth system (10 fixes across frontend + backend) |
| March 25 | APK testing round 2 — found data loss, logout, PDF bugs |
| March 25 | Fixed data persistence, logout, unit dropdown, PDF export |
| March 25 | Configured Brevo email on Render |
| March 25 | Implemented strict email verification |

---

## Part 1: Infrastructure Migration (Railway to Render + Neon)

### What Changed
- **3 frontend files**: URL replacements (Railway → Render)
- **3 backend files**: Neon SSL compatibility (`connect_args`)
- **1 infrastructure file**: `render.yaml` with correct env var names
- **1 CI/CD file**: Railway CLI → Render deploy hook
- **Zero business logic changes**

### Why It Was Almost Zero Changes
VitalTrack follows the **12-Factor App** pattern. All configuration comes from environment variables via `pydantic-settings`. The `config.py` validator handles any PostgreSQL URL format. The only non-trivial change was Neon SSL compatibility — `asyncpg` doesn't accept `?sslmode=require` as a URL parameter.

### Neon SSL Fix Pattern (Reusable)
```python
# config.py — strip query params from DATABASE_URL
if "?" in v:
    v = v.split("?")[0]

# database.py — pass SSL via connect_args
_connect_args = {"ssl": True} if settings.ENVIRONMENT == "production" else {}
engine = create_async_engine(..., connect_args=_connect_args)
```
This pattern works for ANY managed PostgreSQL provider that requires SSL.

---

## Part 2: Local Development Testing

### The Setup That Actually Worked
After many failed attempts with Wi-Fi and tunnel modes, **USB debugging** was the only reliable method:

```bash
adb reverse --remove-all          # Clear stale mappings FIRST
adb reverse tcp:8000 tcp:8000     # Backend
adb reverse tcp:8081 tcp:8081     # Metro bundler
echo EXPO_PUBLIC_API_URL=http://localhost:8000 > .env
npx expo start --localhost --clear
```

### What Failed and Why

| Method | Problem |
|--------|---------|
| Wi-Fi (LAN mode) | Windows Firewall blocked ports 8000/8081 |
| Tunnel mode | Ngrok service was down |
| Expo Go auto-update | Phone storage full → uninstalled Expo Go |
| ADB with stale device | `ZD2225Y8DK` device not found error |
| ADB wrong port mapping | `tcp:8000 → tcp:8081` (Metro instead of backend) |

### Critical Expo Go Fix
`expo-updates` package with no `updates` config in `app.json` caused "unable to download remote update" crash. Fix: `"updates": { "enabled": false }` in `app.json`.

---

## Part 3: Authentication System — The Hard Way

### The Journey
1. **First attempt**: Set `isAuthenticated: true` for all registrations → email users bypassed verification
2. **Second attempt**: Removed email verification entirely → user didn't want that
3. **Third attempt**: Made it conditional based on `isEmailVerified` field → field was missing from User type
4. **Fourth attempt**: Added field, fixed route guard → verify screen flashed and disappeared
5. **Fifth attempt**: Added delay hack → fragile, timing-dependent
6. **Final solution**: `isAuthenticated: false` for email registrations, strict blocking, no escape

### The Correct Architecture
```
REGISTRATION:
  Email provided → isAuthenticated = false → verify-email-pending (blocked)
  Username only  → isAuthenticated = true  → dashboard

LOGIN:
  Backend checks REQUIRE_EMAIL_VERIFICATION + MAIL_PASSWORD + is_email_verified
  If all conditions met and email not verified → 403 EMAIL_NOT_VERIFIED
  Frontend catches this → redirects to verify-email-pending

ROUTE GUARD:
  !isAuthenticated && !inAuthGroup → redirect to login
  isAuthenticated && inAuthGroup → redirect to tabs
  !isAuthenticated && inAuthGroup → stay (login, register, verify screens)
```

### Key Lesson
The backend should be the **single source of truth** for auth rules. The frontend should just follow the backend's response. Don't duplicate auth logic in the frontend — let the backend decide what's allowed.

---

## Part 4: Production Bugs Found During APK Testing

### P0: Data Loss on App Reopen
**Root cause**: `loadUserData()` called `clearAllUserData()` on every app open, before fetching from server. If server was slow (Render cold start), data was gone.

**Lesson**: Never destroy local data before confirming the server has it. The pattern should be:
1. Read local state
2. Try to fetch from server
3. If server has newer data → update local
4. If server is empty but local has data → push local to server
5. If both empty → seed with defaults

### P0: Auth Init Clears Session on Network Error
**Root cause**: `initialize()` cleared tokens on ANY error, including network timeouts.

**Lesson**: Distinguish between "token is invalid" (401) and "can't reach server" (network error). Only clear auth on 401.

### P1: Rate Limiter Behind Proxy
**Root cause**: `slowapi` with `get_remote_address` gets the proxy IP behind Cloudflare.

**Lesson**: Always use proxy-aware IP detection in production. Check `CF-Connecting-IP` and `X-Forwarded-For` headers.

### P1: Logout Hangs
**Root cause**: Sync-before-logout took too long, no timeout.

**Lesson**: Any pre-action (sync before logout, save before close) needs a timeout. Use `Promise.race` with a deadline. Always put state cleanup in `finally`.

---

## Part 5: Email System (Brevo)

### Configuration
Brevo uses HTTP API (not SMTP) — bypasses port blocking on Render. The code at `app/utils/email.py` sends emails via `POST https://api.brevo.com/v3/smtp/email`.

### Render Environment Variables for Email
| Key | Value |
|-----|-------|
| `MAIL_PASSWORD` | Brevo API key (starts with `xkeysib-`) |
| `MAIL_FROM` | Verified sender email |
| `REQUIRE_EMAIL_VERIFICATION` | `true` |

### Safety Guards in Code
- `is_email_configured()` checks if `MAIL_PASSWORD` is set before trying to send
- Login verification only enforced if BOTH `REQUIRE_EMAIL_VERIFICATION=true` AND `MAIL_PASSWORD` is set
- If email service isn't configured, users can register and use app without verification

---

## Part 6: PDF Export System

### Architecture
- Shared utility at `utils/orderPdfExport.ts`
- Used by both order creation screen and order list (OrderCard)
- Two formats: Table PDF (no images) and Card PDF (with images)
- Images converted to base64 for embedding in HTML → PDF

### Image Handling
```typescript
const base64 = await readAsStringAsync(fileUri, { encoding: 'base64' });
return `data:${mimeType};base64,${base64}`;
```

---

## Part 7: Free Tier Infrastructure

### Monthly Cost: $0

| Service | Purpose | Free Tier |
|---------|---------|-----------|
| **Render** | Backend hosting | 750 hrs/month, sleeps after 15 min |
| **Neon** | PostgreSQL database | 0.5 GB, 100 compute-hrs/month |
| **UptimeRobot** | Keep-alive pings | 50 monitors, 5-min interval |
| **Expo EAS** | APK/AAB builds | 30 builds/month |
| **Brevo** | Transactional email | 300 emails/day |
| **GitHub Actions** | CI/CD pipeline | 2000 min/month |

### Render Cold Start Workaround
UptimeRobot pings `/health` every 5 minutes, preventing sleep. Without it, first request takes ~60 seconds.

---

## Part 8: Key Technical Decisions

| Decision | Why |
|----------|-----|
| `asyncpg` over `psycopg2` | Async support for FastAPI |
| SSL via `connect_args` not URL params | `asyncpg` doesn't accept `?sslmode=require` |
| `useFocusEffect` over `useEffect` | Clears errors on every screen focus, not just mount |
| `isLoggingOut` separate from `isLoading` | Prevents logout from being blocked by other loading states |
| `REQUIRE_EMAIL_VERIFICATION` default `False` | Safe default — prevents lock-out if email not configured |
| Brevo HTTP API over SMTP | Port 587 blocked on some platforms; HTTPS always works |
| `Promise.race` for sync timeout | Prevents sync from blocking logout indefinitely |
| Preserve local data on network error | Render cold starts shouldn't cause data loss |

---

## Part 9: Files Modified Across All Sessions

### Migration (Branch: migrate/railway-to-render)
```
.github/workflows/ci.yml            — Railway CLI → Render deploy hook
vitaltrack-backend/render.yaml       — Fixed env var names
vitaltrack-backend/app/core/config.py — Query param stripping + SSL
vitaltrack-backend/app/core/database.py — SSL connect_args
vitaltrack-backend/alembic/env.py    — SSL connect_args for migrations
vitaltrack-mobile/eas.json           — 2 URLs: Railway → Render
vitaltrack-mobile/package.json       — 1 URL + expo version bumps
vitaltrack-mobile/app.json           — updates.enabled: false
```

### Auth System Fixes (Direct to main)
```
vitaltrack-mobile/store/useAuthStore.ts — Register flow, logout, init
vitaltrack-mobile/app/(auth)/login.tsx  — Error clearing, friendly messages
vitaltrack-mobile/app/(auth)/register.tsx — Conditional verify redirect
vitaltrack-mobile/app/(auth)/forgot-password.tsx — Error clearing, hints
vitaltrack-mobile/app/(auth)/verify-email-pending.tsx — Strict blocking
vitaltrack-mobile/app/(auth)/_layout.tsx — Registered verify screen
vitaltrack-mobile/app/_layout.tsx       — Route guard fixes
vitaltrack-mobile/types/index.ts        — Added isEmailVerified
vitaltrack-mobile/services/api.ts       — Status-specific error messages
vitaltrack-backend/app/api/v1/auth.py   — MAIL_PASSWORD guard, is_email_configured
vitaltrack-backend/app/utils/email.py   — is_email_configured() helper
vitaltrack-backend/app/utils/rate_limiter.py — Proxy-aware, swallow_errors
```

### Bug Fixes (Direct to main)
```
vitaltrack-mobile/store/useAppStore.ts  — Data persistence fix
vitaltrack-mobile/app/item/[id].tsx     — nestedScrollEnabled
vitaltrack-mobile/utils/orderPdfExport.ts — NEW: shared PDF utility
vitaltrack-mobile/components/orders/OrderCard.tsx — Export PDF button
```

### Documentation
```
docs/RAILWAY_TO_RENDER_MIGRATION.md    — NEW: migration guide
docs/BRANCH_MIGRATE_RAILWAY_TO_RENDER.md — NEW: branch changelog
docs/TECHNICAL_CHALLENGES.md           — Added challenges 9-21
docs/PROJECT_LEARNINGS_AND_JOURNEY.md  — NEW: this document
docs/DEPLOYMENT_GUIDE.md               — Migration notice
docs/DEVOPS_AND_ARCHITECTURE.md        — Migration notice
```

---

## Part 10: What's Left To Do

| Task | Priority | Status |
|------|----------|--------|
| Test strict email verification on APK | P0 | APK building |
| Test forgot password with Brevo | P1 | Needs testing |
| Build production AAB for Play Store | P1 | After APK verified |
| Submit to Play Store | P2 | After AAB built |
| Set up Brevo sender domain verification | P2 | Improves deliverability |
| Monitor Neon storage usage | P3 | Check monthly |
| Upgrade Node.js 20 actions before June 2026 | P3 | GitHub warnings |

---

*Created: March 25, 2026*
*Covers: Railway migration + APK testing + production hardening*
