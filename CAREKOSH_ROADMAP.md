# CareKosh Roadmap

> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. Earlier dated test/release claims retain their original scope. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](docs/VOICE_INVENTORY_AND_ORDER_DRAFTS.md).

> **Status (7 October 2026):** Code facts below were re-checked against branch `feature/backend-hardening-ai-voice-agent-foundation` at `03cfebb`. `main` and tag `v1.0.0` are still `835fad3` (30 June 2026): migrations up to `0006`, no `/api/v1/ai/*` routes. The feature branch adds migrations `0007`–`0010` (head `0010_order_local_id_unique`; `0007` is one-way), five `/api/v1/ai/*` routes and the read-only voice assistant; it has no pull request yet. On 7 Oct 2026 the backend suite (242 tests) and mobile suite (121 tests) passed locally. Play Console, Render, Neon and other dashboard items were not re-checked and are NOT VERIFIED; where a row below shows June evidence, it is historical. Earlier note (23 Sept 2026): head `0007`, 152 backend tests — now out of date.
>
> Current behaviour: [complete developer guide](docs/CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md) · [API traceability](docs/API_TRACEABILITY.md) · [documentation home](docs/INDEX.html) · audit summary (local review reference; not published).

**Last updated:** 2026-06-19 (status table, phases and PR history amended on 2026-10-07)

CareKosh is a home-ICU medical inventory app for family caregivers. This document captures where the project has been, where it is today, and what remains before a Play Store launch.

---

## Status at a glance

| Area | Status |
|---|---|
| Mobile app (React Native + Expo) | ✅ feature-complete for v1 (`v1.0.0` tag, June 2026) |
| Backend API (FastAPI) | ✅ feature-complete for v1 (`v1.0.0` tag, June 2026) |
| Backend hardening: session versioning, order counters, order idempotency (migrations `0007`–`0010`) | 🟡 on the feature branch, not merged; `0007` cannot be downgraded |
| Read-only voice assistant ("Ask CareKosh") + `/api/v1/ai/*` | 🟡 on the feature branch, not merged; offline Android recognition/live words; optional Groq Whisper audio and GPT-OSS text understanding require separate consent and server settings; local drafts require touch-only saving |
| Hosting (Render + Neon) | June 2026 evidence: live in staging + production. 7 Oct 2026: the owner reports that staging was switched to the feature branch and deployed `b1c8dd7` (owner-reported, not independently verified). Production's commit and every database's Alembic revision are NOT VERIFIED |
| CI/CD | ✅ PR test jobs and deploy hook on push to `main`. The `protect-main` ruleset requires a pull request but no status checks, so failing CI does not technically block a merge. Render auto-deploy is NOT VERIFIED |
| Rebrand (VitalTrack → CareKosh) | ✅ shipped PR #10/#11 |
| Auth hardening | ✅ shipped PR #12 |
| Account deletion (Play Store compliance) | ✅ shipped PR #13 |
| Loading UX — skeleton screens | ✅ shipped PR #15 |
| Loading UX — cache persistence + cold-start retry | ✅ shipped PR #16 |
| CareKosh API domains + email sender | ✅ shipped PR #49/#51 |
| Hosted privacy policy | 🔴 not yet (June 2026; drafts exist under `future_plan/legal/`; hosting NOT VERIFIED on 7 Oct) |
| Play Console account + closed testing | 🟡 in progress (June 2026; NOT VERIFIED on 7 Oct) |
| Launch on Google Play | 🔴 not yet (June 2026; NOT VERIFIED on 7 Oct) |
| Automated test suite health | ✅ 7 Oct 2026 (feature branch, local): 242 backend tests passed, 88% total coverage; 121 mobile tests passed. Earlier: 123 backend tests with 85% coverage in the June Goal 11 evidence |
| Backend quality gates | ✅ Ruff, pytest, exact `/api/v1` route count (39 on `main`, 44 on the feature branch) and item/order coverage gates fail the CI run; mypy (23 errors on 7 Oct) and Trivy stay advisory until existing findings are cleaned up |
| Goal 8 backend finish | ✅ shipped PR #45; CORS remains explicitly decision-blocked until real browser/admin origins are known |
| Goal 9 Play Store hardening | ✅ shipped PR #46; preview APK smoke evidence recorded |
| Goal 10/11 launch operations | ✅ shipped PR #47; runbook, restore/smoke evidence, redaction hardening, and monitor template recorded |

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
- Added server-side audit log (`audit_log` table) behind a non-negative-quantity CHECK constraint.
- Zustand reduced to UI-only state (`useAppStore.ts` is 61 lines).
- Hosting migrated Railway → Render (PR #1, pre-phase).

The mobile-side sync module is gone, and the unused backend `/api/v1/sync/*` route surface has now been removed as well. Server-first writes use the normal REST endpoints only; `localId` fields remain as compatibility metadata, not as a sync contract.

### Phase 4 — CareKosh rebrand (PRs #10, #11)
Renamed the product from VitalTrack to CareKosh across user-visible surfaces: app name, splash, copy, email from-address, API `APP_NAME`, Play Console listing assets. Directory names (`vitaltrack-backend`, `vitaltrack-mobile`) and git history were intentionally **not** renamed to avoid breaking Render service paths, EAS config, and historical links.

### Phase 5 — Auth hardening (PR #12)
- `email` is now **required** at registration (username-only signup removed).
- `POST /auth/resend-verification` returns a uniform response regardless of account state (no user enumeration).
- `POST /auth/change-password` and `POST /auth/reset-password` revoke **all** refresh tokens for the user. (Later, on the feature branch: they also bump `users.session_version`, so existing access tokens stop working immediately.)
- Config validators refuse production startup if `SECRET_KEY` matches the placeholder or `FRONTEND_URL` is empty. (Later, on the feature branch: the placeholder is refused in every environment except development and testing.) `CORS_ORIGINS=["*"]` is still accepted today; tightening CORS remains decision-blocked until real browser/admin origins are known.

### Phase 7 — Loading UX (PRs #15, #16)

Two-PR effort to close the "blank-screen while loading" gap without reintroducing offline-first:

- **PR #15 — Skeleton screens.** `components/common/SkeletonLoader.tsx` provides themed, animated placeholder shapes (pulse from opacity 0.3 → 0.7) for three variants: `dashboard`, `inventory`, `orders`. Each tab screen (`app/(tabs)/index.tsx`, `inventory.tsx`, `orders.tsx`) now renders `<SkeletonLoader variant="…" />` while `isLoading` is true, keeping the header and SafeAreaView intact.
- **PR #16 — Cache persistence + cold-start auto-retry.** `providers/QueryProvider.tsx` now wraps children in `PersistQueryClientProvider`, persisting successful inventory/order/category/activity queries to `AsyncStorage` under key `carekosh-query-cache`. `staleTime` stays at 30 s (medical freshness requirement); `gcTime` raised to 24 h; schema `buster` tied to `Constants.expoConfig.version`; auth query keys excluded from disk via `shouldDehydrateQuery`. `focusManager.setEventListener` now wires `AppState` so `refetchOnWindowFocus` actually works in React Native. An `ENABLE_CACHE_PERSISTENCE` kill switch at the top of the file disables everything with one line (a code change, so it reaches installed phones only through a new build; over-the-air updates are disabled). `useAuthStore.logout()` and successful `login()` both clear the cache (memory + disk) for shared-device privacy. On login, an `isColdStart` flag is set when `ApiClientError.status` is `0 / 502 / 503 / 504`; the login screen starts a `/health` auto-retry loop (5 s interval, 12 attempts max, Cancel button, `AbortController`-based timeout — no `AbortSignal.timeout` for Hermes compat). Old static "Server is starting up…" text removed.

### Phase 6 — Account deletion + Profile screen (PR #13)
Google Play policy requires in-app account deletion with full data erasure:
- `DELETE /auth/me` → generates a `deletion_token` (24 h TTL), emails confirmation link.
- `GET /auth/confirm-delete/{token}` → renders an HTML confirmation page.
- `POST /auth/confirm-delete/{token}` → deletes the user. CASCADE unwinds categories, items, orders, order_items, activity_logs, refresh_tokens, audit_log (and, on the feature branch, ai_consents and ai_usage; `order_number_counters` are kept).
- `POST /auth/cancel-delete` → lets a logged-in user abort a pending deletion (API only; the app has no button for it).
- Mobile: `app/profile.tsx` lets users edit Name/Username, keeps email read-only, supports account deletion, and opens from the top-right profile button's bottom-sheet menu.

### Phase 8 — Backend production guard (PRs #37 → #43)
The backend production-guard sequence closed the previously verified high-risk backend gaps:
- Removed the unused `/api/v1/sync/*` route surface.
- Made account deletion POST-confirmed instead of destructive on GET.
- Escaped password-reset URL tokens in backend-rendered HTML.
- Added item/order/category domain tests and atomic order stock application.
- Split `/health` readiness from `/live` liveness and masked secret config values.
- Added blocking Ruff, pytest, exact `/api/v1` route-count, and item/order coverage gates while keeping mypy and Trivy advisory until their existing baselines are clean.

### Phase 9 — Release hardening and launch operations (PRs #45 → #47)
The later goal work finished the post-pack backend security pass and moved Play/ops readiness into documented, evidence-backed checks:
- Goal 8 authenticated the email diagnostic, protected default categories server-side, masked raw provider errors, and documented the still-deferred production CORS-origin decision.
- Goal 9 hardened Android release configuration, minimized permissions, disabled sensitive Android auto-backup behavior, and captured Play Data Safety inputs.
- Goal 10/11 added launch/rollback runbooks, guarded restore drills, read-only production/staging smoke evidence, cold-start/load smoke evidence, log-redaction hardening, and a monitor provider template. Actual production monitor-provider setup is still a launch gap unless external provider evidence is added.

### Phase 10 — Backend hardening and read-only voice assistant (feature branch, Sept–Oct 2026; not merged)
Branch `feature/backend-hardening-ai-voice-agent-foundation`, commits `07847a4` (6 Oct), `b1c8dd7` (6 Oct) and `03cfebb` (7 Oct). No pull request yet.
- Migration `0007`: `users.session_version` (password change/reset invalidates access tokens at once), per-day `order_number_counters` for `ORD-YYYYMMDD-NNNN` numbers, token-digest indexes. Its `downgrade()` raises on purpose.
- Migrations `0008`/`0009`: `ai_consents` and `ai_usage` tables for the assistant's consent and usage accounting.
- Migration `0010`: partial unique index on `orders (user_id, local_id)` so a retried order save returns the existing order instead of a duplicate.
- Five `/api/v1/ai/*` routes (capabilities, consent, interpret, transcribe, speak); all AI flags default to off.
- Mobile: compact **Ask Care Coach** dock, AudioRecord/Moonshine live/offline recognition, optionally consented Groq Whisper final transcription and GPT-OSS interpretation, on-phone inventory answers and unsaved drafts. Voice has no order-save/stock/apply/send operation; hosted speech stays disabled.
- CI: route gate raised to 44; mobile `npm test` and voice-module autolinking check added.
- Rollout notes: [docs/BACKEND_HARDENING.md](docs/BACKEND_HARDENING.md), [docs/VOICE_AGENT_SETUP.md](docs/VOICE_AGENT_SETUP.md).

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
| #13 | `fix/account-deletion` | Email-confirmed account deletion + initial Profile screen |
| #14 | `docs/carekosh-docs-overhaul` | Documentation overhaul — complete guide refresh for PRs #1–#13 |
| #15 | `fix/skeleton-loading` | Skeleton loading screens for dashboard, inventory, orders tabs |
| #16 | `fix/cache-persistence-cold-start` | TanStack Query cache persistence + cold-start auto-retry on login + focusManager wiring |
| #37 | `security/remove-legacy-sync-router` | Remove unused legacy backend sync route surface |
| #38 | `security/account-deletion-post-confirm` | Make account deletion finalization POST-confirmed |
| #39 | `security/reset-password-token-escaping` | Escape reset-password URL tokens in backend-rendered HTML |
| #40 | `test/domain-inventory-order-coverage` | Add item/order/category domain test coverage |
| #41 | `correctness/atomic-apply-order-stock` | Make order stock application atomic |
| #42 | `ops/health-and-secret-types` | Make `/health` DB-backed readiness, add `/live`, and mask config secrets |
| #43 | `ci/block-quality-gates-and-docs` | Block backend Ruff/pytest/route/coverage gates; keep mypy/Trivy advisory with documented baselines |
| #44 | `ci/block-quality-gates-and-docs` | Align production-guard docs after Goals 1-7 |
| #45 | `security/post-pack-hardening` | Implement Goal 8 post-pack security hardening |
| #46 | `mobile/playstore-release-hardening` | Finalize Goal 9 Android/Play Store release hardening |
| #47 | `ops/launch-readiness-runbook` | Harden Goal 10/11 restore, smoke, monitoring-template, and redaction evidence |
| #48 | `docs/backend-platform-migration-guide` | Backend platform migration guide (docs) |
| #49 | `config/use-carekosh-custom-domains` | Cut production/staging APIs to `api.carekosh.com` / `staging-api.carekosh.com`; configure the `noreply@carekosh.com` sender path |
| #50 | `profile-account-ui-launch` | Ship profile/account UI updates: editable Name/Username, read-only email, About modal, support mailto |
| #51 | `docs/redact-personal-email` | Redact personal email and Brevo account identifiers from domain/email documentation |
| #52 | — | Docs: align current-state docs after PR #51 (squash merge, 19 Jun 2026) |
| #53 | — | `chore(mobile)`: rename app id to `com.carekosh.mobile` (21 Jun 2026) |
| #54 | — | Backend prelaunch hardening (23 Jun 2026) |
| #55 | — | Docs: planning + interview prep (`future_plan` AI roadmap, Play Store playbook, Phase B checklist, backend interview guide) |
| #56 | — | Docs: align launch playbook with 2026 Play rules; add legal pages |
| #57 | — | Launch prep: dependency fix and hardening, cleartext cleanup, playbook + legal docs (30 Jun 2026; this is `main` and tag `v1.0.0`, `835fad3`) |
| — | `feature/backend-hardening-ai-voice-agent-foundation` | Not merged; no PR as of 7 Oct 2026. See Phase 10 |

(PR #3 was rolled into #4 during review and does not appear as its own merge commit. Rows #52–#57 were added on 7 Oct 2026 from the `main` commit log; their branch names are not recorded in the squash-merge messages.)

---

## In progress — Play Store launch checklist

Statuses are as last recorded in June 2026. Rows that depend on Play Console, Brevo, Cloudflare or a monitoring provider were not re-checked on 7 Oct 2026 and are NOT VERIFIED.

| Task | Owner | Status |
|---|---|---|
| Publish privacy policy at a stable URL | rishabhrd09 | 🟡 draft written, not hosted |
| Register a production domain for email (`noreply@carekosh.com`) | rishabhrd09 | ✅ live; Brevo DKIM plus Cloudflare SPF/DMARC/MX verified, prod/staging APIs cut over in PR #49 |
| Google Play Console account verification | rishabhrd09 | 🟡 paid, identity check in review |
| Closed testing track with ≥12 testers for 14 days | rishabhrd09 | 🔴 not started |
| Play Store listing assets (feature graphic, screenshots, description) | rishabhrd09 | 🟡 screenshots WIP |
| Data safety form | rishabhrd09 | 🔴 not started |
| Goal 10/11 launch ops runbook, restore evidence, monitor template, and smoke scripts | rishabhrd09 | ✅ documented in `docs/LAUNCH_READINESS_RUNBOOK_GOAL_10.md` and `docs/LAUNCH_READINESS_EVIDENCE_GOAL_10.md` |
| Production monitor provider setup | rishabhrd09 | 🔴 template exists; provider monitors and alert destination not proven yet |
| Production AAB build from CI (currently `if: false` in `ci.yml`) | rishabhrd09 | 🔴 not started — restore the condition noted in `ci.yml` (`github.ref == 'refs/heads/main' && github.event_name == 'push'`) when ready |
| Merge or retire the feature branch (backend hardening + voice assistant) | rishabhrd09 | 🟡 no PR yet (7 Oct 2026); migration `0007` is one-way, so plan a backup and staging check before any shared database is upgraded |

---

## Planned — v1.1 (post-launch)

Rough priority order; none are scheduled.

1. **Clean advisory CI baselines.** Fix the current mypy errors, upgrade vulnerable dependencies from the Trivy HIGH/CRITICAL baseline, then promote both advisory jobs to blocking gates.
2. **Sentry** for mobile + backend error monitoring. (Backend support already exists and is optional: it starts only when `SENTRY_DSN` is set. Whether a DSN is configured on Render is NOT VERIFIED. The mobile app has no Sentry.)
3. **Production monitor provider setup.** Goal 10 adds the monitor template; the remaining work is creating the actual provider monitors and alert destination.
4. **Google SSO** on mobile.
5. **Biometric unlock** (fingerprint / face).
6. **Hindi localization** — the target user base for home ICU caregivers in India skews non-English.
7. **DPDP Act grievance endpoint** — India's DPDP Act requires a named data protection officer and a grievance channel; currently unimplemented.
8. **Production AAB from CI** — enable the disabled `build-production` job and wire `eas submit` into the pipeline.
9. **Item expiry tracking + alerts.** (An optional expiry date is already stored and shown on each item; nothing alerts on it yet.)
10. **Caregiver sharing** — multiple accounts on one inventory (currently each user's inventory is private).
11. **Production CORS real-origin tightening.** Goal 8 shipped the safe backend fixes; replacing wildcard production CORS still waits on real browser/admin origins.

---

## Deferred / not planned

- **Offline editing.** Deliberately ruled out — see the server-first rationale in [CAREKOSH_DEVELOPER_GUIDE.md §1](CAREKOSH_DEVELOPER_GUIDE.md#1-architecture-overview). Medical inventory has real-world consequences for merge conflicts; the single source of truth is the server.
- **Renaming `vitaltrack-backend` / `vitaltrack-mobile` directories.** Breaks Render paths, EAS config, historical PR links. Not worth the churn.
- **Reintroducing offline sync.** Deliberately ruled out for the same reason as offline editing: server-first REST writes are the supported contract.
