# CareKosh Roadmap

**Last updated:** 2026-04-19

CareKosh is a home-ICU medical inventory app for family caregivers. This document captures where the project has been, where it is today, and what remains before a Play Store launch.

---

## Status at a glance

| Area | Status |
|---|---|
| Mobile app (React Native + Expo) | ✅ feature-complete for v1 |
| Backend API (FastAPI) | ✅ feature-complete for v1 |
| Hosting (Render + Neon) | ✅ live in staging + production |
| CI/CD | ✅ PR gates + auto-deploy to Render |
| Rebrand (VitalTrack → CareKosh) | ✅ shipped PR #10/#11 |
| Auth hardening | ✅ shipped PR #12 |
| Account deletion (Play Store compliance) | ✅ shipped PR #13 |
| Loading UX — skeleton screens | ✅ shipped PR #15 |
| Loading UX — cache persistence + cold-start retry | ✅ shipped PR #16 |
| Domain + privacy policy hosted | 🟡 in progress |
| Play Console account + closed testing | 🟡 in progress |
| Launch on Google Play | 🔴 not yet |
| Automated test suite health | 🔴 40 / 53 tests failing — largest open gap |

---

## Completed phases

### Phase 1 — Mobile MVP (frontend-only)
React Native + Expo SDK 54 app with inventory, orders, categories, activity log, dashboard. Local-only, no backend yet. Complete.

### Phase 2 — Backend integration
FastAPI + PostgreSQL. User auth (JWT + refresh rotation), CRUD for categories/items/orders, activity log, Alembic migrations. Complete.

### Phase 3 — Server-first migration (PRs #4 → #8)
Ripped out the offline-first architecture:
- Deleted mobile `sync.ts`, `useSyncStore`, AsyncStorage-backed persistence of domain data.
- Introduced `@tanstack/react-query` for all reads and writes.
- Added optimistic concurrency control: `version` column on `items`, HTTP 409 response on stale updates with `server_version` + `server_quantity` in the body.
- Added server-side audit log (`audit_logs` table) behind a non-negative-quantity CHECK constraint.
- Zustand reduced to UI-only state (`useAppStore.ts` is 61 lines).
- Hosting migrated Railway → Render (PR #1, pre-phase).

The mobile-side sync module is gone; the backend `/sync/*` endpoints remain in `app/api/v1/sync.py` but are no longer called. They are kept for backward compatibility and future opt-in use.

### Phase 4 — CareKosh rebrand (PRs #10, #11)
Renamed the product from VitalTrack to CareKosh across user-visible surfaces: app name, splash, copy, email from-address, API `APP_NAME`, Play Console listing assets. Directory names (`vitaltrack-backend`, `vitaltrack-mobile`) and git history were intentionally **not** renamed to avoid breaking Render service paths, EAS config, and historical links.

### Phase 5 — Auth hardening (PR #12)
- `email` is now **required** at registration (username-only signup removed).
- `POST /auth/resend-verification` returns a uniform response regardless of account state (no user enumeration).
- `POST /auth/change-password` and `POST /auth/reset-password` revoke **all** refresh tokens for the user.
- Config validators refuse production startup if `SECRET_KEY` matches the placeholder, `CORS_ORIGINS` is `*`, or `FRONTEND_URL` is empty.

### Phase 7 — Loading UX (PRs #15, #16)

Two-PR effort to close the "blank-screen while loading" gap without reintroducing offline-first:

- **PR #15 — Skeleton screens.** `components/common/SkeletonLoader.tsx` provides themed, animated placeholder shapes (pulse from opacity 0.3 → 0.7) for three variants: `dashboard`, `inventory`, `orders`. Each tab screen (`app/(tabs)/index.tsx`, `inventory.tsx`, `orders.tsx`) now renders `<SkeletonLoader variant="…" />` while `isLoading` is true, keeping the header and SafeAreaView intact.
- **PR #16 — Cache persistence + cold-start auto-retry.** `providers/QueryProvider.tsx` now wraps children in `PersistQueryClientProvider`, persisting successful inventory/order/category/activity queries to `AsyncStorage` under key `carekosh-query-cache`. `staleTime` stays at 30 s (medical freshness requirement); `gcTime` raised to 24 h; schema `buster` tied to `Constants.expoConfig.version`; auth query keys excluded from disk via `shouldDehydrateQuery`. `focusManager.setEventListener` now wires `AppState` so `refetchOnWindowFocus` actually works in React Native. An `ENABLE_CACHE_PERSISTENCE` kill switch at the top of the file disables everything with one line. `useAuthStore.logout()` and successful `login()` both clear the cache (memory + disk) for shared-device privacy. On login, an `isColdStart` flag is set when `ApiClientError.status` is `0 / 502 / 503 / 504`; the login screen starts a `/health` auto-retry loop (5 s interval, 12 attempts max, Cancel button, `AbortController`-based timeout — no `AbortSignal.timeout` for Hermes compat). Old static "Server is starting up…" text removed.

### Phase 6 — Account deletion + Profile screen (PR #13)
Google Play policy requires in-app account deletion with full data erasure:
- `DELETE /auth/me` → generates a `deletion_token` (24 h TTL), emails confirmation link.
- `GET /auth/confirm-delete/{token}` → deletes the user. CASCADE unwinds categories, items, orders, order_items, activity_logs, refresh_tokens, audit_logs.
- `POST /auth/cancel-delete` → lets a logged-in user abort a pending deletion.
- Mobile: new `app/profile.tsx` screen with account info, change-password, delete-account flow, and a swipe-down-to-dismiss popup menu reached from the top-right of the app.

---

## PR history

| # | Branch | Title / change |
|---|---|---|
| #1 | `migrate/railway-to-render` | Backend hosting migration; Dockerfile + entrypoint rework |
| #2 | `feature/production_staging_database` | Neon branches for staging + production, wired via env vars |
| #4 | `refactor/server-first-architecture` | Initial server-first cut (removed offline sync) |
| #5 | `refactor/server-first-architecture` | Follow-up fixes |
| #6 | `refactor/server-first-architecture` | Follow-up fixes |
| #7 | `refactor/server-first-architecture` | Follow-up fixes |
| #8 | `refactor/server-first-architecture` | Final server-first cut; OCC + audit log |
| #9 | `feature/order_error_fix` | Harden order mutations + API error handling |
| #10 | `feature/rebrand-carekosh` | VitalTrack → CareKosh (user-visible rebrand) |
| #11 | `feature/rebrand-carekosh` | Rebrand polish: app icon safe zone + order-ID mismatch in PDF |
| #12 | `fix/auth-hardening` | Email required, session-revoke on password change, prod config validators |
| #13 | `fix/account-deletion` | Email-confirmed account deletion + Profile screen + swipe-down menu |
| #14 | `docs/carekosh-docs-overhaul` | Documentation overhaul — complete guide refresh for PRs #1–#13 |
| #15 | `fix/skeleton-loading` | Skeleton loading screens for dashboard, inventory, orders tabs |
| #16 | `fix/cache-persistence-cold-start` | TanStack Query cache persistence + cold-start auto-retry on login + focusManager wiring |

(PR #3 was rolled into #4 during review and does not appear as its own merge commit.)

---

## In progress — Play Store launch checklist

| Task | Owner | Status |
|---|---|---|
| Publish privacy policy at a stable URL | rishabhrd09 | 🟡 draft written, not hosted |
| Register a production domain for email (`noreply@carekosh.com`) | rishabhrd09 | 🟡 domain registered, SPF/DKIM pending |
| Google Play Console account verification | rishabhrd09 | 🟡 paid, identity check in review |
| Closed testing track with ≥12 testers for 14 days | rishabhrd09 | 🔴 not started |
| Play Store listing assets (feature graphic, screenshots, description) | rishabhrd09 | 🟡 screenshots WIP |
| Data safety form | rishabhrd09 | 🔴 not started |
| Production AAB build from CI (currently `if: false` in `ci.yml`) | rishabhrd09 | 🔴 not started — flip to `if: github.ref == 'refs/heads/main'` when ready |

---

## Planned — v1.1 (post-launch)

Rough priority order; none are scheduled.

1. **Fix the test suite.** 40 / 53 backend tests currently fail (schema drift from the server-first migration + account-deletion changes). Largest single portfolio gap.
2. **Sentry** for mobile + backend error monitoring.
3. **UptimeRobot** (or similar) pinging `/health` every 5 min to keep Render warm and to alert on outages.
4. **Google SSO** on mobile.
5. **Biometric unlock** (fingerprint / face).
6. **Hindi localization** — the target user base for home ICU caregivers in India skews non-English.
7. **DPDP Act grievance endpoint** — India's DPDP Act requires a named data protection officer and a grievance channel; currently unimplemented.
8. **Production AAB from CI** — enable the disabled `build-production` job and wire `eas submit` into the pipeline.
9. **Item expiry tracking + alerts.**
10. **Caregiver sharing** — multiple accounts on one inventory (currently each user's inventory is private).

---

## Deferred / not planned

- **Offline editing.** Deliberately ruled out — see the server-first rationale in [CAREKOSH_DEVELOPER_GUIDE.md §1](CAREKOSH_DEVELOPER_GUIDE.md#1-architecture-overview). Medical inventory has real-world consequences for merge conflicts; the single source of truth is the server.
- **Renaming `vitaltrack-backend` / `vitaltrack-mobile` directories.** Breaks Render paths, EAS config, historical PR links. Not worth the churn.
- **Removing backend `sync.py`.** Kept as dead code behind unused routes. Removal is a trivial follow-up but not worth a PR on its own.
