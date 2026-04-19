# CareKosh — Project Learnings & Journey

> Everything learned during the Railway→Render migration, the offline-first→server-first migration, APK testing, auth hardening, account deletion, and the CareKosh rebrand. A durable reference for what went wrong, what we fixed, and why.

The project shipped under the name **VitalTrack** through PR #9, then rebranded to **CareKosh** in PRs #10–#11. References to "VitalTrack" in this document are historical.

---

## Timeline

| Date | What happened | PR |
|---|---|---|
| Mar 2026 | Railway free trial expired; hosting migration planned | — |
| Mar 24 | Migration branch `migrate/railway-to-render`; Neon, Render, UptimeRobot wired up | #1 |
| Mar 24 | Discovered rate limiter 500 on Render (proxy-aware fix) | #1 |
| Mar 24 | First preview APK built against Render staging | — |
| Mar 25 | APK round 1 — found auth flow bugs, fixed (10 fixes) | — |
| Mar 25 | APK round 2 — data loss on reopen, logout hang, PDF bugs | — |
| Mar 25 | Brevo email wired on Render; strict verification implemented | — |
| Apr 2 | Staging + production database split via Neon branches | #2 |
| Apr 4 | Incident: item quantity reset during concurrent edits (motivated server-first) | — |
| Apr 6 | Server-first refactor shipped — TanStack Query, OCC, audit log | #4–#8 |
| Apr 8 | Order mutation hardening + global ID collision fix | #9 |
| Apr 10 | VitalTrack → CareKosh rebrand (user-visible surfaces) | #10, #11 |
| Apr 14 | Auth hardening — email required, session revoke, prod config validators | #12 |
| Apr 19 | Account deletion (Play Store compliance) + Profile screen + swipe-down menu | #13 |

---

## Part 1 — Infrastructure migration (Railway → Render + Neon)

### What actually changed

- **3 frontend files**: URL replacements (Railway → Render).
- **3 backend files**: Neon SSL compatibility via `connect_args`.
- **1 infra file**: `render.yaml` with correct env var names.
- **1 CI/CD file**: Railway CLI → Render deploy hook.
- **Zero business logic changes.**

### Why it was almost zero changes

CareKosh follows the **12-factor app** pattern. All configuration comes from env vars via `pydantic-settings`. The `config.py` validator handles any Postgres URL format. The only non-trivial change was Neon SSL compatibility — `asyncpg` doesn't accept `?sslmode=require` as a URL parameter.

### Neon SSL fix pattern (reusable)

```python
# app/core/config.py — strip query params from DATABASE_URL
if "?" in v:
    v = v.split("?")[0]

# app/core/database.py — pass SSL via connect_args
_connect_args = {"ssl": True} if settings.ENVIRONMENT in ("staging", "production") else {}
engine = create_async_engine(..., connect_args=_connect_args)
```

Works for any managed Postgres that requires SSL.

---

## Part 2 — Local development: what finally worked

After several failed Wi-Fi and tunnel attempts, **USB debugging via `adb reverse`** was the only reliable method on our network:

```bash
adb reverse --remove-all
adb reverse tcp:8000 tcp:8000     # backend
adb reverse tcp:8081 tcp:8081     # Metro
echo EXPO_PUBLIC_API_URL=http://localhost:8000 > .env
npx expo start --localhost --clear
```

### What failed and why

| Method | Problem |
|---|---|
| Wi-Fi (LAN mode) | Windows Firewall blocked ports 8000/8081 |
| Tunnel mode | Ngrok service outage |
| Expo Go auto-update | Phone storage full → uninstalled Expo Go |
| Stale ADB device record | `ZD2225Y8DK` device-not-found error |
| Wrong ADB port mapping | `tcp:8000 → tcp:8081` (Metro instead of backend) |

### Critical Expo Go fix

`expo-updates` installed without an `updates` block in `app.json` caused "unable to download remote update" crashes. Fix: `"updates": { "enabled": false }` in `app.json` for the dev profile.

Full walkthrough: [USB_ADB_REVERSE_GUIDE.md](USB_ADB_REVERSE_GUIDE.md).

---

## Part 3 — Authentication: the hard way

### The journey

1. First attempt: set `isAuthenticated: true` for all registrations → email users bypassed verification.
2. Removed verification entirely → not acceptable for production.
3. Conditional logic on `isEmailVerified` → field missing from User type.
4. Added the field, fixed route guard → verify screen flashed then disappeared.
5. Added a timing hack → fragile.
6. **Final:** `isAuthenticated: false` on email registration, strict backend blocking, frontend mirrors backend's decision.

### Final architecture

```
REGISTRATION
  Email provided      → isAuthenticated = false → verify-email-pending (blocked)
  Username only       → isAuthenticated = true  → dashboard

LOGIN
  Backend checks REQUIRE_EMAIL_VERIFICATION + MAIL_PASSWORD set + is_email_verified
  If all conditions met and email not verified → 403 EMAIL_NOT_VERIFIED
  Frontend catches 403 → redirects to verify-email-pending

ROUTE GUARD
  !isAuthenticated && !inAuthGroup → redirect to login
  isAuthenticated && inAuthGroup   → redirect to tabs
  !isAuthenticated && inAuthGroup  → stay (login, register, verify screens)
```

### Later hardening (PR #12)

- **Email is now required at registration** — username-only signup removed.
- `/resend-verification` returns a uniform response regardless of account state (no user enumeration).
- Password change and password reset revoke **all** refresh tokens.
- Config validators refuse production startup if `SECRET_KEY` is the placeholder, `CORS_ORIGINS` is `*`, or `FRONTEND_URL` is empty.

### Key lesson

The backend is the **single source of truth** for auth rules. The frontend follows the backend's response. Don't duplicate auth logic — let the backend decide.

---

## Part 4 — Production bugs that taught us the lessons

### P0 · Data loss on app reopen (pre-server-first)

**Root cause:** `loadUserData()` called `clearAllUserData()` on every app open, before fetching from server. On a Render cold start (30–60 s), data was gone.

**Lesson:** never destroy local data before confirming the server has it.

**Root fix:** the server-first migration (PR #4) eliminated the local-cache-of-domain-data problem entirely. TanStack Query treats the server as truth; there is no local inventory store to accidentally wipe.

### P0 · Auth init clears session on network error

**Root cause:** `initialize()` cleared tokens on **any** error, including network timeouts.

**Lesson:** distinguish "token is invalid" (401) from "can't reach server" (network error). Only clear auth on 401.

### P0 · Quantity reset during concurrent edits (April 4 incident)

Two caregivers editing the same item silently overwrote each other's updates. Root of why server-first was worth the rewrite.

**Fix:** optimistic concurrency — `version` column on items, UPDATE checks `WHERE version = :expected`, returns HTTP 409 with `{server_version, server_quantity}` if stale (PR #4).

### P1 · Rate limiter behind proxy

**Root cause:** `slowapi` with `get_remote_address` was getting the Render proxy IP, so every user looked the same.

**Fix:** proxy-aware IP detection (CF-Connecting-IP, X-Forwarded-For).

### P1 · Logout hangs

**Root cause:** a pre-logout sync took too long with no timeout. (This ship-jettisoned with the sync layer in PR #4.)

**Lesson:** any pre-action (save before close, sync before logout) needs a deadline via `Promise.race`, and state cleanup belongs in `finally`.

### P1 · Order ID mismatch in PDF (PR #11)

**Root cause:** PDF renderer used a local order ID that no longer existed after the server-first migration.

**Fix:** PDF reads the server-assigned `order_number`.

---

## Part 5 — Email system (Brevo)

### Why Brevo's SMTP works on Render

Render's outbound traffic allows SMTP over STARTTLS on port 587. We use Brevo SMTP via `fastapi-mail` + `aiosmtplib`. In development we use Mailtrap's sandbox.

### Render env vars for email (both services)

| Var | Example |
|---|---|
| `MAIL_SERVER` | `smtp-relay.brevo.com` |
| `MAIL_USERNAME` | Brevo SMTP login |
| `MAIL_PASSWORD` | Brevo SMTP key |
| `MAIL_FROM` | `noreply@carekosh.com` |
| `MAIL_PORT` | `587` |
| `MAIL_STARTTLS` | `True` |
| `REQUIRE_EMAIL_VERIFICATION` | `true` |

### Safety guards in code

- `is_email_configured()` checks `MAIL_PASSWORD` is set before sending.
- Login verification enforced only if `REQUIRE_EMAIL_VERIFICATION=true` AND email service is configured AND the user actually has an email.
- If email isn't configured, registration still works — used for local dev.

See [EMAIL_VERIFICATION_GUIDE.md](EMAIL_VERIFICATION_GUIDE.md) for the full flow.

---

## Part 6 — PDF export

### Architecture

- Shared utility at `vitaltrack-mobile/utils/orderPdfExport.ts`.
- Used from the order-create screen and from `components/orders/OrderCard`.
- Two formats: compact table, card-with-images.
- Images read via `readAsStringAsync({ encoding: 'base64' })`, embedded as `data:` URIs in the HTML that is rendered to PDF.

---

## Part 7 — Free-tier infrastructure

### Monthly cost: $0 (so far)

| Service | Purpose | Free tier |
|---|---|---|
| Render | Backend hosting | 750 hrs/month, sleeps after 15 min idle |
| Neon | Postgres | 0.5 GB, 100 compute-hrs/month |
| UptimeRobot | Keep-alive pings | 50 monitors, 5-min interval |
| Expo EAS | APK/AAB builds | 30 builds/month |
| Brevo | Transactional email | 300 emails/day |
| GitHub Actions | CI/CD | 2000 min/month |

### Render cold-start mitigation

UptimeRobot pings `/health` every ~5 min. Without it, the first request after 15 min idle takes ~60 s. With it, effectively zero cold starts during active hours.

---

## Part 8 — Key technical decisions (and why)

| Decision | Why |
|---|---|
| `asyncpg` over `psycopg2` | Native async for FastAPI |
| SSL via `connect_args`, not URL params | `asyncpg` doesn't accept `?sslmode=require` |
| **Server-first over offline-first** | Life-critical inventory + concurrent caregivers = merge conflicts with real consequences (PR #4) |
| **TanStack Query over rolling our own cache** | Query keys, staleness, refetch-on-focus, mutation rollback — all solved problems |
| **Zustand stays** | 61 lines for UI-only state is correct; no need to yank a dependency |
| `expo-secure-store` for tokens | Hardware-backed keystore on Android; AsyncStorage is not appropriate for auth material |
| `useFocusEffect` over `useEffect` on auth screens | Clears errors on every screen focus, not just mount |
| `isLoggingOut` separate from `isLoading` | Prevents logout from being blocked by other loading states |
| `REQUIRE_EMAIL_VERIFICATION` default `False` | Safe default — prevents lockout if email isn't configured |
| HS256 JWT (not RS256) | Single server; RS256 buys nothing at our scale |
| Argon2 password hashing | OWASP-recommended, replaces legacy bcrypt (kept as fallback verifier) |
| Both Render services auto-deploy from `main` | One merge = both environments updated; simpler than a long-lived staging branch |
| `build-production` in CI disabled (`if: false`) | Until Play Console is live, manual AAB keeps the control loop tight |
| Account deletion is two-step email-confirmed | Play Store + DPDP Act; one-click deletion is attractive for attackers with stolen access tokens (PR #13) |

---

## Part 9 — Major files modified (by theme)

### Migration (PR #1 · `migrate/railway-to-render`)
```
.github/workflows/ci.yml                         Railway CLI → Render deploy hook
vitaltrack-backend/render.yaml                   env var names
vitaltrack-backend/app/core/config.py            strip query params
vitaltrack-backend/app/core/database.py          SSL connect_args
vitaltrack-backend/alembic/env.py                SSL for migrations
vitaltrack-mobile/eas.json                       URLs: Railway → Render
vitaltrack-mobile/app.json                       updates.enabled: false
```

### Server-first (PRs #4–#8 · `refactor/server-first-architecture`)
```
vitaltrack-mobile/services/sync.ts               DELETED (611 lines)
vitaltrack-mobile/store/useAppStore.ts           1100 lines → 61 lines
vitaltrack-mobile/hooks/useServerData.ts         NEW — TanStack queries
vitaltrack-mobile/hooks/useServerMutations.ts    NEW — mutations + OCC handling
vitaltrack-backend/app/api/v1/items.py           version column + 409 on stale
vitaltrack-backend/app/models/audit_log.py       NEW
vitaltrack-backend/alembic/versions/20260406_... version + audit + CHECK
```

### Auth hardening (PR #12 · `fix/auth-hardening`)
```
vitaltrack-backend/app/core/config.py            production validators
vitaltrack-backend/app/schemas/user.py           email required in UserRegister
vitaltrack-backend/app/api/v1/auth.py            session revoke on password change
                                                 uniform /resend-verification response
```

### Account deletion (PR #13 · `fix/account-deletion`)
```
vitaltrack-backend/app/models/user.py            deletion_token, deletion_token_expires
vitaltrack-backend/app/api/v1/auth.py            DELETE /me, GET /confirm-delete/{t}, POST /cancel-delete
vitaltrack-backend/alembic/versions/20260419_... migration
vitaltrack-mobile/app/profile.tsx                NEW — Profile screen
vitaltrack-mobile/services/auth.ts               requestAccountDeletion, cancelAccountDeletion
components/common/ProfileMenuSheet.tsx           NEW — swipe-down dismiss
```

---

## Part 10 — What's left (as of 2026-04-19)

| Task | Priority | Status |
|---|---|---|
| Host privacy policy at a stable URL | P0 | Drafted, not hosted |
| Play Console identity verification | P0 | In review |
| Play Store listing assets (screenshots, feature graphic) | P0 | WIP |
| Closed testing (≥12 testers, 14 days) | P1 | Not started |
| Data Safety form in Play Console | P1 | Not started |
| Flip `build-production` CI job from `if: false` | P2 | Ready; pending listing complete |
| Fix the test suite (40/53 failing) | P2 | Largest portfolio gap |
| Sentry error monitoring (mobile + backend) | P3 | Planned v1.1 |
| Sender domain verification in Brevo | P3 | Improves deliverability |
| DPDP Act grievance endpoint | P3 | Required for India launch per DPDP Act |

See [../CAREKOSH_ROADMAP.md](../CAREKOSH_ROADMAP.md) for the live version.

---

*Original: March 25, 2026 · Updated for PRs #4–#13 through April 2026.*
