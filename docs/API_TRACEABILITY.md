# CareKosh API traceability: every endpoint from screen to database

> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. Earlier dated test/release claims retain their original scope. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](VOICE_INVENTORY_AND_ORDER_DRAFTS.md).


> 8 October 2026 safety follow-up: targeted code fixes are local, tested changes after the earlier audit. Deployment and real-device acceptance remain separate. [Current changes and remaining scope](BACKEND_HARDENING.md#safety-follow-up-8-october-2026).

> **Status (7 October 2026).** Written from the source at branch `feature/backend-hardening-ai-voice-agent-foundation`, commit `03cfebb` (not merged; `main` is `835fad3`). Every endpoint below was read in the code. Behaviour marked *reproduced* was replayed on 7 October 2026, and again on 8 October 2026, with [`docs/tools/api_walkthrough.py`](tools/api_walkthrough.py) against a disposable local PostgreSQL 16 database, using synthetic data (7 October transcript (local review reference; not published)). Nothing here was observed on staging, production or a phone. Start with the [Complete developer guide](CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md) if you are new; come back here when you need the exact path of one request.

**Independent re-check (8 October 2026):** every section was re-read against the working tree (`03cfebb` plus uncommitted documentation and two unused mobile imports removed). On 8 October the backend suite (242 passed), the 89-step walkthrough (0 differences), the route inventory (47/47) and the 121 mobile tests were re-run against a disposable local PostgreSQL 16 database, and targeted probes reproduced A-24 to A-27. No live service was contacted. Earlier notes: [extended technical review](../carekosh_system_design/TECHNICAL_REVIEW.md#final-recheck-of-the-eight-recommended-guides).

**Evidence labels used below**

| Label | Meaning |
|---|---|
| VERIFIED IN CURRENT CODE | Read in the source at `03cfebb`. |
| VERIFIED BY REPRODUCED TEST | Replayed on 7 Oct 2026 and again on 8 Oct 2026 (backend test suite: 242 passed; API walkthrough: 89/89 steps as expected). |
| HISTORICAL EVIDENCE | From a dated document; not re-run. |
| PLANNED / RECOMMENDED | Not implemented. |
| NOT VERIFIED | Live or device behaviour this audit could not observe. |

## Contents

1. [How the inventory was counted](#how-the-inventory-was-counted)
2. [Summary matrix](#summary-matrix)
3. [What every request has in common](#what-every-request-has-in-common)
4. [Health and root](#health-and-root)
5. [Authentication and account](#authentication-and-account)
6. [Categories](#categories)
7. [Items](#items)
8. [Orders](#orders)
9. [Activity feed](#activity-feed)
10. [Assistant (AI) routes](#assistant-ai-routes)
11. [Worked examples with database state](#worked-examples-with-database-state)
12. [What happens when things go wrong](#what-happens-when-things-go-wrong)
13. [Known application issues found while tracing](#known-application-issues-found-while-tracing)
14. [Coverage gaps worth knowing](#coverage-gaps-worth-knowing)

## How the inventory was counted

- **Source of the list:** the routes registered on the FastAPI application object (`app.routes`), not the documentation and not the OpenAPI page. [`docs/tools/route_inventory.py`](tools/route_inventory.py) prints them and checks that each has a section in this file.
- **Result:** **47 operations** = **44 under `/api/v1`** + `GET /`, `GET /health`, `GET /live`. Every route object has exactly one method, so route objects and operations are the same number.
  - Under `/api/v1`: auth 18, categories 6, items 8, orders 6, activities 1, ai 5.
  - Three auth routes are hidden from the OpenAPI schema (`include_in_schema=False`): `GET` and `POST /api/v1/auth/confirm-delete/{token}` and `GET /api/v1/auth/reset-password`. They are still real, public routes.
  - `/docs`, `/docs/oauth2-redirect`, `/redoc` and `/openapi.json` exist only when `DEBUG=true` (local development) and are not counted.
- **Cross-checks:** CI runs `scripts/check_api_routes.py --expected 44` (route objects whose path starts with `/api/v1`), and `tests/test_auth.py::TestHealthDiagnostics::test_api_v1_route_count_remains_44` asserts the same. Both passed on 7 Oct 2026 and again on 8 Oct 2026. A route count proves that routes are registered; it says nothing about whether they behave correctly.

## Summary matrix

"Writes" lists tables changed on success. "Tests" summarises the test map (local review reference; not published): **Yes** = the main behaviour is asserted, **Partial** = important branches untested, **None** = no test sends the request.

"Mobile caller": 27 operations are reachable from the app (reset-password only through a deep link; `interpret` only after opt-in). 13 have a service function but no reachable caller ("none (service function only)" and similar). 7 have no mobile code at all: `/`, `/live`, `email-service-status` and the four browser pages opened from emails.

| # | Operation | Auth | Mobile caller | Writes | Tests |
|---|---|---|---|---|---|
| 1 | `GET /` | none | none | – | Yes |
| 2 | `GET /health` | none | Builder preflight before bulk operations; Login cold-start auto-retry | – | Yes |
| 3 | `GET /live` | none | none (health check path in `render.yaml`) | – | Yes |
| 4 | `POST /api/v1/auth/register` | none | Register screen | users, refresh_tokens, activity_logs | Partial |
| 5 | `POST /api/v1/auth/login` | none | Login screen | refresh_tokens, users.last_login, activity_logs | Partial |
| 6 | `POST /api/v1/auth/refresh` | refresh token in body | services/api.ts (automatic) | refresh_tokens | Yes |
| 7 | `POST /api/v1/auth/logout` | access + refresh | Profile menu → Logout | refresh_tokens, activity_logs | Partial |
| 8 | `GET /api/v1/auth/me` | access | app start (session restore); deletion polling | – | Yes |
| 9 | `PATCH /api/v1/auth/me` | access | Profile → Save (name, username) | users | Partial |
| 10 | `DELETE /api/v1/auth/me` | access | Profile → Delete account | users (deletion token) | Partial |
| 11 | `POST /api/v1/auth/cancel-delete` | access | none (service function only) | users | Partial |
| 12 | `GET /api/v1/auth/confirm-delete/{token}` | link token | none (browser page from the email link) | – | Yes |
| 13 | `POST /api/v1/auth/confirm-delete/{token}` | link token | none (browser form from the email link) | deletes the user and every owned row | Partial |
| 14 | `POST /api/v1/auth/change-password` | access | none (service function only) | users, refresh_tokens | Yes |
| 15 | `POST /api/v1/auth/forgot-password` | none | Forgot password screen | users (reset token) | **None** |
| 16 | `GET /api/v1/auth/reset-password` | link token (query) | none (browser page from the email link) | – | Yes |
| 17 | `POST /api/v1/auth/reset-password` | token in body | browser form; app screen only via deep link | users, refresh_tokens | Partial |
| 18 | `GET /api/v1/auth/verify-email` | link token (query) | none (browser page from the email link) | users | **None** |
| 19 | `GET /api/v1/auth/verify-email/{token}` | link token | none (service function only) | users | Partial |
| 20 | `POST /api/v1/auth/resend-verification` | none | Verify-email-pending screen | users (new token) | **None** |
| 21 | `GET /api/v1/auth/email-service-status` | access | none | – | Yes |
| 22 | `GET /api/v1/categories` | access | Inventory, item form, Builder, Search, export | – | Yes |
| 23 | `POST /api/v1/categories` | access | Builder → Add New Category; seed defaults | categories, activity_logs | Yes |
| 24 | `GET /api/v1/categories/with-counts` | access | none (service function only) | – | Yes |
| 25 | `GET /api/v1/categories/{category_id}` | access + owner | none (service function only) | – | Yes |
| 26 | `PUT /api/v1/categories/{category_id}` | access + owner | none (no rename UI) | categories | Partial |
| 27 | `DELETE /api/v1/categories/{category_id}` | access + owner | Builder (empty categories only); replace-all | categories, items (cascade), activity_logs, audit_log | Partial |
| 28 | `GET /api/v1/items` | access | Dashboard, Inventory, forms, Search, export, assistant | – | Partial |
| 29 | `POST /api/v1/items` | access + owned category | Item form (new), Builder suggestions, seed | items, activity_logs, audit_log | Yes |
| 30 | `GET /api/v1/items/stats` | access | none (dashboard counts on the phone) | – | Yes |
| 31 | `GET /api/v1/items/needs-attention` | access | none (service function only) | – | Yes |
| 32 | `GET /api/v1/items/{item_id}` | access + owner | none (item form reads the list cache) | – | Yes |
| 33 | `PUT /api/v1/items/{item_id}` | access + owner | Item form Save; Builder critical star | items, activity_logs, audit_log | Yes |
| 34 | `PATCH /api/v1/items/{item_id}/stock` | access + owner | none (no stock +/- UI) | items, activity_logs, audit_log | Yes |
| 35 | `DELETE /api/v1/items/{item_id}` | access + owner | Item form Delete; Builder; start fresh; replace-all | items, activity_logs, audit_log | Yes |
| 36 | `GET /api/v1/orders` | access | Orders tab, dashboard | – | Partial |
| 37 | `POST /api/v1/orders` | access + owned items | Create order screen | orders, order_items, order_number_counters, activity_logs | Yes |
| 38 | `GET /api/v1/orders/{order_id}` | access + owner | none (service function only) | – | Yes |
| 39 | `PATCH /api/v1/orders/{order_id}/status` | access + owner | Order card: pending → received only | orders, activity_logs | Partial |
| 40 | `POST /api/v1/orders/{order_id}/apply` | access + owner | Order card "Update Stock" (received orders) | orders, items, audit_log, activity_logs | Yes |
| 41 | `DELETE /api/v1/orders/{order_id}` | access + owner | Order card "Remove" (shown for every status) | orders, order_items (cascade), activity_logs, audit_log | Partial |
| 42 | `GET /api/v1/activities` | access | Dashboard Recent Activity (limit 20) | – | Partial |
| 43 | `GET /api/v1/ai/capabilities` | access | assistant dock on every tab switch; Voice setup | – | Yes |
| 44 | `PUT /api/v1/ai/consent` | access | Voice setup → Enable Groq / Withdraw | ai_consents | Yes |
| 45 | `POST /api/v1/ai/interpret` | access + consent | assistant Send (unfamiliar wording) | ai_usage | Partial |
| 46 | `POST /api/v1/ai/transcribe` | access + consent | separately consented Groq online listening | ai_usage | Partial |
| 47 | `POST /api/v1/ai/speak` | access + consent | none in this build (cloud speech off) | ai_usage | Partial |

## What every request has in common

These rules apply to every endpoint, so the sections below do not repeat them.

**The trip through the server** (VERIFIED IN CURRENT CODE; see [request-lifecycle.svg](diagrams/request-lifecycle.svg)):

1. Starlette's error middleware, then `AIBodyLimit` ([app/services/ai_body_limit.py](../vitaltrack-backend/app/services/ai_body_limit.py)) reads the whole body first: at most 2,000,000 bytes on normal routes (413 "Request is too large."), 12,000 bytes on `/api/v1/ai/*` JSON routes and 900,000 bytes on `/ai/transcribe`. `/api/v1/ai/*` requests without a non-empty `Bearer` header get 401 before any body is read (except OPTIONS preflight); AI bodies must finish within 10 s (408). These early middleware replies bypass inner security/request-ID/CORS middleware.
2. Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Cache-Control: no-store`, and HSTS only when `ENVIRONMENT=production`), then `X-Request-ID` (echoed or generated), then CORS (`app/main.py:111-158`).
3. FastAPI matches the route and parses the JSON body. Malformed JSON → 422 `json_invalid` before any dependency runs: no token check, no SQL. Next the dependencies run: `get_db` creates an `AsyncSession` (connection acquired on first SQL), and `get_current_user` checks the bearer token. A bad token → 401 with no SQL; a valid one costs one `SELECT` on `users`. Only then are path, query and body fields validated, so a schema error → 422 after that `SELECT`, raised once `get_db` has closed normally (reproduced on 8 Oct 2026). On the five rate-limited routes the limit is checked inside the endpoint call, after validation. Protected business dependencies share the session; AI authentication and quotas use separate short sessions.
4. The handler runs. Most write handlers call `await db.commit()` themselves. FastAPI serialises the response model after the handler returns; with pinned FastAPI **0.115.6**, the yield dependency then commits any pending transaction and closes before sending. `get_db` rolls back the **current uncommitted transaction** on exceptions, including `HTTPException`. An earlier commit survives a later refresh, serialisation or transport failure; one session is not necessarily one transaction per request (SQL after a commit starts a new transaction). See [FastAPI: dependencies with `yield` and when they exit](https://fastapi.tiangolo.com/advanced/advanced-dependencies/#dependencies-with-yield-httpexception-except-and-background-tasks).
5. The response model is serialised with camelCase aliases (for example `minimumStock`, `isActive`). Auth token fields stay snake_case (`access_token`).

**Authentication on protected routes** (`get_current_user`): no bearer → 401 `Not authenticated`; bad, expired or refresh-type token → 401 `Invalid or expired token`; user missing or token `session_version` ≠ the user's current value → 401 `User not found`; disabled account → 403; email not verified while `REQUIRE_EMAIL_VERIFICATION=true` **and** email sending is configured → 403 `EMAIL_NOT_VERIFIED`.

**Ownership:** every inventory query includes `user_id = current_user.id`. Another user's id therefore returns 404, never 403, so the API does not reveal that the row exists (reproduced).

**Error bodies:**

| Situation | Status | Body |
|---|---|---|
| Validation | 422 | `{"error":"Validation Error","message":"Request validation failed","details":[{"field":"body.name","message":"…","code":"string_too_short"}],"timestamp":"…"}` |
| `HTTPException` from a handler | 400/401/403/404/409/503 | `{"detail":"…"}` |
| Item version conflict | 409 | `{"error":"Version conflict","message":"…","server_version":3,"server_quantity":40}` |
| Database constraint (`IntegrityError`) not handled by the route | 409 | `{"detail":"A conflict occurred. Please try again.","timestamp":"…"}` |
| Rate limit | 429 | for example `{"error":"Rate limit exceeded: 5 per 1 minute"}` (slowapi's handler; no `detail` key, no `Retry-After` header) |
| Anything unexpected | 500 | `{"detail":"An unexpected error occurred. Please try again.","timestamp":"…"}` — reproduced: these 500 responses carry **no** `X-Request-ID`, security headers or `Cache-Control`, because the handler runs in Starlette's outermost error middleware. |

**Rate limits** (slowapi, `app/utils/rate_limiter.py`): register 3/hour, login 5/minute, resend-verification 3/hour, forgot-password 3/hour, reset-password (POST) 5/hour. These are the only slowapi-decorated routes; AI routes have separate database-backed budgets and concurrency limits described below. Rate limiting is best effort: five auth routes, counters in memory per worker process (two workers per production instance), reset on restart; an open finding about how clients are identified is tracked privately. The limiter is disabled in the test suite, so no automated test covers it.

**Mobile client** (`vitaltrack-mobile/services/api.ts`): base `EXPO_PUBLIC_API_URL` (fallback `http://localhost:8000`) + `/api/v1`. Ordinary requests have one **90 s overall deadline**, including response parsing and a refresh/retry; AI calls keep their shorter 50 s deadline. A 401 shares one 30 s refresh and retries once. Token writes are serialized: a late refresh cannot restore a logged-out session or erase a newer login. Logout clears local credentials first and revokes captured credentials best effort with a 30 s deadline. Error bodies become user-facing messages. Writes are never queued offline. Successful writes, uncertain network/gateway failures and 409 conflicts invalidate the relevant queries so active views refetch.

## Health and root

### `GET /`
| Field | Detail |
|---|---|
| Purpose | Service information: name, version, links to `/health`, `/live`, `/api/v1`, and the CORS mode. |
| Caller | No mobile caller found (searched `services/` for `'/'` requests). |
| Auth | None. |
| Handler | `root()` — `app/main.py:311-326`. No database access. |
| Response | 200 `{"name","version","docs","health","live","api","cors_mode"}`. `docs` is null unless `DEBUG=true`. |
| Tests | `test_auth.py::TestHealthDiagnostics::test_root_endpoint`. |
| Status | VERIFIED IN CURRENT CODE. |

### `GET /health`
| Field | Detail |
|---|---|
| Purpose | Readiness: is the process up **and** can it reach PostgreSQL? |
| Caller | Raw `fetch` without auth: `preflightServerCheck()` (`services/api.ts:23-42`, 5 s) before the Builder's seed, replace-all and start-fresh operations (`app/builder.tsx:132-145`); and the Login screen's cold-start auto-retry, which polls `/health` every 5 s up to 12 times after a connection failure and then retries the login (`app/(auth)/login.tsx:126-197`). Also Docker Compose health checks (local) and external monitors if configured (NOT VERIFIED). The app treats a 503 (database down) as "server unreachable". |
| Handler | `health_check()` — `app/main.py:263-291`; `check_database_readiness()` runs `SELECT 1` through `get_db_context()` with a 2 s `asyncio.wait_for`. |
| Database | One `SELECT 1`; no writes. |
| Response | 200 `{"status":"healthy","database":"connected","environment",…}` or **503** `{"status":"unhealthy","database":"unavailable"}`. `version` is the `APP_VERSION` setting (default 1.0.0; nothing sets it from git): it does **not** identify the deployed commit. |
| Tests | 200 with a real probe; 503 only with the readiness function monkeypatched (the real timeout path is untested). |
| Status | VERIFIED IN CURRENT CODE. |

### `GET /live`
| Field | Detail |
|---|---|
| Purpose | Liveness: the process answers. Never touches the database. |
| Caller | Render health check (`render.yaml` `healthCheckPath: /live`) and the image's Docker `HEALTHCHECK` (Compose replaces it with a `/health` check; Render's documentation does not say whether it runs Docker health checks). No mobile caller. |
| Handler | `liveness_check()` — `app/main.py:293-309`. |
| Response | 200 with `"database":"not_checked"`. |
| Why it matters | The declared Render health check uses `/live`, so a database outage alone does not fail that probe. Other platform failures can still restart or remove an instance; live health-check settings are NOT VERIFIED. A green `/live` says nothing about the database or the commit. |
| Tests | `test_live_endpoint_returns_200_without_database_probe`; `render.yaml` text check. |
| Status | VERIFIED IN CURRENT CODE. |

## Authentication and account

Sequence diagram: [auth-session.svg](diagrams/auth-session.svg). Tokens: HS256 JWTs signed with `SECRET_KEY`. Access token: 30 minutes, claims `sub`, `exp`, `iat`, `type=access`, `session_version`. Refresh token: 30 days, plus `jti`, stored as a row in `refresh_tokens` (`app/core/security.py:63-159`).

### `POST /api/v1/auth/register`
| Field | Detail |
|---|---|
| Purpose | Create an account and return a token pair. |
| Caller | Register screen `app/(auth)/register.tsx` → `useAuthStore.register` → `authService.register` (`services/auth.ts:14`). The app does not keep the user signed in after registering; it shows the verify-email screen. |
| Auth | None. Rate limit 3/hour (best effort). |
| Request | `UserRegister` (`app/schemas/user.py:16-64`): `email` **required**; `username` optional (3–50 characters of `[a-z0-9_]`; it must already be lower case, so upper case → 422); `password` 8–128 with an upper-case letter, a lower-case letter and a digit; `name` 1–255 (tags and `<>'";` removed after the length check, so a name of only spaces or tags is stored empty, as in A-24); `phone` ≤ 50. Example: `{"name":"Asha Example","email":"asha.example@example.com","username":"asha_demo","password":"Synthetic1"}` |
| Handler | `register()` — `app/api/v1/auth.py:89-202`. Hashes the password with Argon2 in a worker thread (`anyio.to_thread`) so the event loop is not blocked. |
| Database | Reads `users` (email, then username). Writes `users`, `refresh_tokens` (jti, device name from User-Agent, client host), `activity_logs` (`USER_REGISTER`). |
| Transaction | One commit (`auth.py:183`). The verification email is sent afterwards as a background task, only when `MAIL_PASSWORD` is set; a failed send does not undo the account. |
| Concurrency | Duplicate checks are SELECTs, so two simultaneous registrations with the same email both pass the check; the unique index then rejects the second, which surfaces as **409** "A conflict occurred" (not the 400 a sequential duplicate gets). Untested. |
| Response | 201 `AuthResponse` `{access_token, refresh_token, token_type, expires_in: 1800, user:{…camelCase}}`. 400 "Email already registered" / "Username already taken"; 422 validation; 429 rate limit. |
| Tests | Many (`TestRegistration*`, `TestPasswordValidation`); concurrent duplicates and the email enqueue are untested. |
| Status | VERIFIED IN CURRENT CODE; reproduced (201, duplicate 400, weak password 422). |

### `POST /api/v1/auth/login`
| Field | Detail |
|---|---|
| Purpose | Exchange email-or-username + password for a token pair. |
| Caller | Login screen `app/(auth)/login.tsx` → `useAuthStore.login` → `authService.login` (`services/auth.ts:23`). Tokens are saved in `expo-secure-store`. |
| Auth | None. Rate limit 5/minute (best effort). |
| Request | `UserLogin`: `identifier` (lowercased; contains `@` → email lookup, otherwise username), `password`. |
| Handler | `login()` — `auth.py:208-310`. Locks the user row (`SELECT … FOR UPDATE`) so login cannot interleave with a password change; verifies the password in a worker thread. |
| Database | Writes `refresh_tokens` (new row), `users.last_login`, `activity_logs` (`USER_LOGIN`, details include the client address seen by the server). |
| Response | 200 `AuthResponse`. 401 "Incorrect email/username or password" (same message for unknown user and wrong password); 403 "Account is disabled"; 403 `EMAIL_NOT_VERIFIED` (only when both `REQUIRE_EMAIL_VERIFICATION` and `MAIL_PASSWORD` are set — the app matches this exact string). Unknown identifiers skip the password hash, so response time can differ between "no such user" and "wrong password" (not measured). |
| Tests | Login by username/email, case-insensitivity, 401s. Untested: the 403 branches, the rate limit, the activity row. |
| Status | VERIFIED IN CURRENT CODE; reproduced (200, 401, 403 `EMAIL_NOT_VERIFIED`). |

### `POST /api/v1/auth/refresh`
| Field | Detail |
|---|---|
| Purpose | Rotate tokens: spend one refresh token, receive a new pair. |
| Caller | `services/api.ts:109-151` automatically after a 401, single-flight (one refresh shared by every waiting request, 30 s timeout). Not called by screens. |
| Auth | The refresh token in the body (`TokenRefresh {refresh_token}`). No rate limit. |
| Handler | `refresh_token()` — `auth.py:738-812`. Decodes the JWT (must be `type=refresh` with a `jti`), locks the user row, checks `is_active`, `session_version` and the verification policy, then **claims** the stored token with one conditional `UPDATE refresh_tokens SET is_revoked=true WHERE jti, user_id, NOT is_revoked, expires_at > now() RETURNING id`. |
| Database | `refresh_tokens`: old row revoked, new row inserted. |
| Concurrency | Two simultaneous refreshes with the same token: exactly one wins (reproduced: one 200, one 401). A reused (already rotated) token gets 401, but the newer token family is **not** revoked: there is no theft detection. |
| Response | 200 `AuthResponse`; 401 "Invalid or expired refresh token"; 403 `EMAIL_NOT_VERIFIED`. |
| Mobile effect | New tokens saved; the original request is retried once. 401/403 from refresh → stored session cleared → login screen. Timeout or 5xx → tokens kept, the request fails with a connectivity message. |
| Tests | Rotation, single use, concurrent refresh (ungated), after logout and password change. |
| Status | VERIFIED IN CURRENT CODE; reproduced. |

### `POST /api/v1/auth/logout`
| Field | Detail |
|---|---|
| Purpose | Revoke the refresh token supplied in the body and record a logout. |
| Caller | Profile menu → Log out → `useAuthStore.logout` → `authService.logout`. The local user, credentials and query cache are cleared without waiting for the server. Login/registration refuse while local cleanup runs. Captured credentials are revoked in the background, with a separate 30 s deadline; if necessary they are rotated and the rotated refresh token is revoked without persisting it. A late ordinary refresh also retires an abandoned pair. Server revocation is best effort, not a guarantee when offline. |
| Auth | Valid **access** token (`CurrentUser`) plus `{refresh_token}` in the body. |
| Handler | `logout()` — `auth.py:818-859`. |
| Database | Marks the matching `refresh_tokens` row revoked (only if it belongs to the caller); writes `activity_logs` (`USER_LOGOUT`). An unknown or foreign refresh token is ignored silently (still 200). |
| Limitation | The **access token keeps working until it expires** (up to 30 min): logout does not change `session_version` and there is no deny-list. Reproduced on 7 Oct 2026. Password change or reset does invalidate access tokens. |
| Response | 200 `{"message":"Successfully logged out","success":true}`; 401 without a valid access token; 403 `EMAIL_NOT_VERIFIED` while verification is enforced, so an unverified user cannot revoke the token on the server. |
| Tests | Refresh token refused after logout; other sessions unaffected. The access-token behaviour is not tested either way. |
| Status | VERIFIED IN CURRENT CODE; reproduced. |

### `GET /api/v1/auth/me`
| Field | Detail |
|---|---|
| Purpose | Current user's profile. |
| Caller | `authService.getProfile` (`services/auth.ts:52-54`), not a TanStack query: (a) app start, raced against an 8 s timeout (on timeout the app enters "Connecting… server warming up" mode and retries once after 5 s); (b) after an account-deletion request, the Profile screen polls it every 5 s for up to 10 minutes and shows "Account Deleted" as soon as a poll gets 401 or 404 (for whatever reason, for example a password reset elsewhere). The profile lives in the zustand auth store, persisted in SecureStore (`vitaltrack-auth`). |
| Auth | Access token. |
| Handler | `get_profile()` — `auth.py:865-876`; the user is already loaded by `get_current_user` (with `noload("*")`, so no collections are read). |
| Response | 200 `UserResponse` (`id, email, username, name, phone, isActive, isVerified, isEmailVerified, createdAt, updatedAt, lastLogin`); 401/403 as in [What every request has in common](#what-every-request-has-in-common). |
| Status | VERIFIED IN CURRENT CODE; reproduced. |

### `PATCH /api/v1/auth/me`
| Field | Detail |
|---|---|
| Purpose | Edit name, phone and username. |
| Caller | Profile → Save (`app/profile.tsx:99-126`) → `authService.updateProfile`. The app sends only `{name, username}`; it has no phone field, and it requires a username even though the API treats it as optional. A 400 "Username already taken" appears inline. |
| Request | `UserUpdate`: `name`, `phone`, `username`, `email` — all optional. |
| Handler | `update_profile()` — `auth.py:879-919`. Re-reads the user under a row lock and rejects the request (401) if the session generation changed while waiting. |
| Rules | A different `email` → 400 "To change your email, contact support." (the whole request is rejected). An account without an email cannot add one here (same 400). `username` must be unique (400; a simultaneous claim of the same name surfaces as 409) and already lower case (422 otherwise). **`null` is ignored for every field**, so a phone number cannot be cleared by sending null (reproduced); `"phone": ""` is stored and does clear it, while `"name": ""` → 422. |
| Database | `users` row. No activity row. |
| Response | 200 `UserResponse`; 400; 401; 422. |
| Tests | Email-change refusal and name change; username and phone paths untested. |
| Status | VERIFIED IN CURRENT CODE; reproduced. |

### `DELETE /api/v1/auth/me`
| Field | Detail |
|---|---|
| Purpose | Step 1 of account deletion: email a confirmation link. Nothing is deleted yet. |
| Caller | Profile → Delete My Account (`app/profile.tsx:165-218`) → confirm → `authService.requestAccountDeletion`; the app then polls `GET /auth/me` every 5 s (while the Profile screen stays open) to notice the deletion. |
| Rules | The account must have an email (400 otherwise, "contact support"); email sending must be configured (503 otherwise). Stores the SHA-256 of a random token with a 24-hour expiry and emails `FRONTEND_URL/confirm-delete/<token>` through Brevo (background task). |
| Database | `users.deletion_token`, `users.deletion_token_expires`. |
| Response | 200 message; 400; 401; 403 `EMAIL_NOT_VERIFIED` while verification is enforced (an unverified user cannot request deletion); 503. |
| Tests | Token stored (email stubbed); the 400/503 branches and the email itself are untested. |
| Status | VERIFIED IN CURRENT CODE; reproduced with a recorder instead of email. |

### `POST /api/v1/auth/cancel-delete`
| Field | Detail |
|---|---|
| Purpose | Clear a pending deletion token. |
| Caller | **No screen calls it.** `authService.cancelAccountDeletion` exists (`services/auth.ts:112`) but nothing in `app/` or `components/` uses it. Use the API directly when testing. |
| Database | `users` (token and expiry set to null) under a row lock. |
| Response | 200 message; 401. |
| Status | VERIFIED IN CURRENT CODE; reproduced (a cancelled link then shows "Invalid or Expired Link"). |

### `GET /api/v1/auth/confirm-delete/{token}`
| Field | Detail |
|---|---|
| Purpose | Step 2a: show a confirmation page with a "Permanently Delete My Account" form. Opening the link deletes nothing (email scanners and link previews are harmless). |
| Caller | A browser opening the emailed link. Hidden from OpenAPI. |
| Response | 200 HTML confirmation page; 400 HTML "Invalid or Expired Link". Account labels are HTML-escaped. |
| Status | VERIFIED IN CURRENT CODE; reproduced. |

### `POST /api/v1/auth/confirm-delete/{token}`
| Field | Detail |
|---|---|
| Purpose | Step 2b: delete the account. |
| Caller | The HTML form from the previous route. Hidden from OpenAPI. |
| Handler | `confirm_account_deletion()` — `auth.py:1111-1144`: finds the user by token digest and unexpired time **with a row lock**, deletes the `users` row, commits. |
| Database | PostgreSQL `ON DELETE CASCADE` removes the user's categories, items, orders, order_items, refresh_tokens, activity_logs, audit_log, ai_consents and ai_usage in the same transaction. `order_number_counters` is not linked to users and stays, so order numbers are never reused (reproduced: counts before/after in the transcript (local review reference; not published)). Logs keep the user id only. |
| Response | 200 HTML "Account Deleted"; 400 HTML invalid link. |
| Tests | Only the `users` row is asserted through this route; the cascade is asserted only by this audit's walkthrough. |
| Not covered by this route | Backups and provider logs can still contain old data until they expire (NOT VERIFIED: retention is a dashboard setting). |
| Status | VERIFIED IN CURRENT CODE; reproduced. |

### `POST /api/v1/auth/change-password`
| Field | Detail |
|---|---|
| Purpose | Change password while signed in; signs every session out. |
| Caller | **No screen calls it** (`authService.changePassword` exists at `services/auth.ts:66` without a UI). |
| Request | `{current_password, new_password}` (new: 8–128 with upper, lower, digit). |
| Handler | `change_password()` — `auth.py:1168-1210`: row lock, verify current password (thread), hash new, `session_version += 1`, clear reset and deletion tokens, revoke all refresh rows. |
| Effect | Every existing access token fails at once (401 "User not found", because `session_version` changed); every refresh token is revoked (reproduced). No email is sent (reset sends one), no activity row is written and there is no rate limit. |
| Response | 200 "Password changed successfully. Please log in again."; 400 wrong current password; 422 weak password. |
| Status | VERIFIED IN CURRENT CODE; reproduced. |

### `POST /api/v1/auth/forgot-password`
| Field | Detail |
|---|---|
| Purpose | Email a password-reset link. |
| Caller | Forgot password screen `app/(auth)/forgot-password.tsx` → `useAuthStore.forgotPassword` → `authService.forgotPassword`. |
| Rules | 503 if email is not configured (this reveals the server's configuration, not whether an account exists). Otherwise always 200 with the same message, whether or not the email exists or the account is active (enumeration-resistant body). Stores the SHA-256 of a random token with a **1-hour** expiry; the link is `FRONTEND_URL/reset-password?token=…`. Rate limit 3/hour. |
| Database | `users.password_reset_token`, `password_reset_expiry` (row locked). |
| Tests | **None.** Reproduced by this audit with a recorder instead of Brevo. |
| Status | VERIFIED IN CURRENT CODE; reproduced. |

### `GET /api/v1/auth/reset-password`
| Field | Detail |
|---|---|
| Purpose | Server-rendered reset form opened from the email link. |
| Caller | Browser. Hidden from OpenAPI. |
| Details | The token from the query string is HTML-escaped into a `data-token` attribute; the inline script reads it from the DOM and POSTs JSON to the same path. No database access until submit. The script checks only length ≥ 8 and that both entries match. On failure it shows the response's `detail`, else "Reset failed. The link may have expired." The 422 and 429 bodies have no `detail`, so a weak password or a rate limit is reported as an expired link (A-28). |
| Tests | Escaping and the absence of inline token interpolation are tested. |
| Status | VERIFIED IN CURRENT CODE. |

### `POST /api/v1/auth/reset-password`
| Field | Detail |
|---|---|
| Purpose | Set a new password with a reset token. |
| Caller | The HTML form above (the reset email links to the backend page). The app's own reset screen (`app/(auth)/reset-password.tsx`) is reachable only through the deep link `vitaltrack://reset-password?token=…`, which no email produces; it also checks only length ≥ 8, so other password rules come back as a raw 422 message. |
| Handler | `reset_password()` — `auth.py:669-732`: finds the active user whose stored digest matches and whose expiry is in the future, **with a row lock**; sets the password, `session_version += 1`, clears reset and deletion tokens, revokes all refresh rows; emails a "password changed" notice in the background. |
| Concurrency | The same token used twice at once: one 200, one 400 (tested). Single-use (reproduced). |
| Response | 200; 400 "Invalid or expired reset token"; 422 weak password; 429. |
| Status | VERIFIED IN CURRENT CODE; reproduced. |

### `GET /api/v1/auth/verify-email`
| Field | Detail |
|---|---|
| Purpose | HTML verification page for the emailed link (`FRONTEND_URL/verify-email?token=…`). |
| Handler | `verify_email_html()` — `auth.py:316-363`: one conditional `UPDATE users SET is_email_verified=true, token=null … WHERE digest matches AND not expired RETURNING id`. A GET with a side effect: link scanners could consume the token, which only verifies the address. |
| Response | 200 "Email Verified!"; 400 "Verification Failed"; 500 page on unexpected errors. |
| Tests | **None** (the JSON variant below is tested). |
| Status | VERIFIED IN CURRENT CODE. |

### `GET /api/v1/auth/verify-email/{token}`
| Field | Detail |
|---|---|
| Purpose | JSON variant of verification. |
| Caller | No screen calls it (`authService.verifyEmail` exists at `services/auth.ts:90-92`). Emails link to the HTML variant above. |
| Response | 200 `{"message","is_verified":true}`; 400 invalid or expired (single use; reproduced). |
| Status | VERIFIED IN CURRENT CODE; reproduced. |

### `POST /api/v1/auth/resend-verification`
| Field | Detail |
|---|---|
| Purpose | Send a new verification link. |
| Caller | Verify-email-pending screen → "Resend Verification Email" (`app/(auth)/verify-email-pending.tsx:37-53`, 60 s cooldown). Known app issue: if the person logged in with a **username**, the screen passes that username as `email` and the request fails with 422. |
| Rules | 503 when email is not configured; otherwise the same 200 message for unknown, verified and unverified addresses. Rate limit 3/hour. |
| Tests | **None.** |
| Status | VERIFIED IN CURRENT CODE. |

### `GET /api/v1/auth/email-service-status`
| Field | Detail |
|---|---|
| Purpose | Diagnostic: is email configured and does Brevo's account API answer? |
| Caller | No mobile caller found. |
| Auth | Access token. Makes an **outbound call** to `https://api.brevo.com/v3/account` when configured. |
| Response | 200 with a generic message; provider details never returned. |
| Status | VERIFIED IN CURRENT CODE. |

## Categories

All routes require an access token and filter by owner. Router: `app/api/v1/categories.py`. Mobile service: `services/categories.ts`.

### `GET /api/v1/categories`
| Field | Detail |
|---|---|
| Purpose | The user's categories ordered by `display_order`, with no tie-breaker: the app sends 0 for every category it creates, so their order is unspecified. No pagination. |
| Caller | `useCategories()` → `categoryService.getAll` (`services/categories.ts:43-45`), query key `['categories']`, mounted by Inventory, the item form, Builder, Search, the export dialog and every inventory row; also read directly by "Refresh from server", seed and replace-all. |
| Database | `SELECT … FROM categories WHERE user_id` with `noload(items)` (no item collections are loaded). |
| Response | 200 `{categories:[{id, localId, name, description, displayOrder, isDefault, createdAt, updatedAt}], total}`. |
| Status | VERIFIED IN CURRENT CODE. |

### `POST /api/v1/categories`
| Field | Detail |
|---|---|
| Purpose | Create a category. |
| Caller | Builder → "+ Add New Category" (`app/builder.tsx:947-963`) → `useCreateCategory`; and the seed-defaults flow (`hooks/useSeedInventory.ts`). The app never sends `is_default`, so app-created categories are never "default" in the database. A duplicate-name 409 is shown with the generic "Conflict — updated by someone else" alert (see [known app issues](#known-application-issues-found-while-tracing)). |
| Request | `CategoryCreate`, **snake_case keys only** (camelCase such as `displayOrder` is silently ignored): `name` 1–255 (tags and `<>'";` removed), `description` ≤ 1000, `display_order` ≥ 0, `is_default`, `local_id` ≤ 36. The length is checked before cleaning, so `"   "` is stored as an empty name (A-24). |
| Handler | `create_category()` — `categories.py:136-194`: takes a per-user transaction advisory lock (`pg_advisory_xact_lock`) so duplicate checks cannot race, checks a case-insensitive duplicate (409), inserts, writes an activity row with the reused item action `ITEM_CREATE`, labelled "Category: …". No audit row. |
| Constraint note | Names are **not** unique in the database (existing duplicates are kept); only this API path prevents new duplicates. |
| Response | 201 `CategoryResponse`; 409 "Category with this name already exists"; 422. |
| Status | VERIFIED IN CURRENT CODE; reproduced (409 on a case-insensitive duplicate). Concurrent creates: one 201, rest 409 (tested, ungated). |

### `GET /api/v1/categories/with-counts`
| Field | Detail |
|---|---|
| Purpose | Categories plus the number of **active** items in each (one grouped query with an outer join). Returns a bare JSON array; `localId` is always `null` here because the handler does not copy it (code reading). |
| Caller | No screen calls it (`categoryService.getWithCounts` exists). |
| Status | VERIFIED IN CURRENT CODE; tested. |

### `GET /api/v1/categories/{category_id}`
| Field | Detail |
|---|---|
| Purpose | One category (404 if missing or not yours). |
| Caller | No screen calls it. |
| Status | VERIFIED IN CURRENT CODE. |

### `PUT /api/v1/categories/{category_id}`
| Field | Detail |
|---|---|
| Purpose | Rename or reorder a category. |
| Caller | No screen calls it: the app has no rename-category UI (`useUpdateCategory` is unused). |
| Request | `CategoryUpdate`: all fields optional, snake_case keys only. **Null is ignored for every field** (you cannot clear a description with null; send `""`). |
| Handler | `update_category()` — `categories.py:200-261`; advisory lock when renaming; case-insensitive duplicate → 409. No activity or audit row is written for category edits. |
| Status | VERIFIED IN CURRENT CODE. Rename-to-duplicate (409) is untested. |

### `DELETE /api/v1/categories/{category_id}`
| Field | Detail |
|---|---|
| Purpose | Delete a category **and every item in it**. |
| Caller | Builder: long-press a category chip or the list-header trash icon (`app/builder.tsx:888-924`); replace-all. The **app** refuses to delete non-empty categories and categories with default names before calling the API; the **API** would delete the items too and protects only rows with `is_default=true`. `categoryService.delete` treats 404 as success. |
| Rules | Default categories cannot be deleted (409). Resets send `?onlyIfEmpty=true&expectedUpdatedAt=<encoded original timestamp>`. Under a category row lock, changed metadata or a non-empty category gets 409 before deletion. The lock also blocks new item foreign-key references until commit. Normal deletion retains its cascade; both query guards are optional for ordinary callers. |
| Database | One activity row with the reused action `ITEM_DELETE` ("Category: …"), one `audit_log` row per contained item (name, quantity, category; none for the category itself), then the category row; its items are removed by the ORM cascade and `ON DELETE CASCADE`. Order lines that referenced those items keep their snapshots (no foreign key). |
| Transaction | The deletion and its activity/audit rows commit together. A failure before commit rolls them back; a failure after commit cannot undo them. |
| Tests | Audit/default-category tests plus `test_reset_safety.py`: non-empty reset deletion preserves items, an old update timestamp preserves renamed category details, a matching timestamp permits empty deletion, ordinary deletion still cascades, ownership is enforced and a real concurrent FK insert is observed waiting on the category lock. |
| Status | VERIFIED IN CURRENT CODE. |

## Items

Router: `app/api/v1/items.py`. Mobile service: `services/items.ts`. Stock rules: **out of stock** = quantity ≤ 0; **low stock** = 0 < quantity < minimum stock; **needs attention** = either, active items only.

### `GET /api/v1/items`
| Field | Detail |
|---|---|
| Purpose | List items with filters and pagination. |
| Caller | `useItems()` (query key `['items']`) → `itemService.getAll({limit: 999})` (`services/items.ts:135-182`), which walks every page of 100 and refuses overlapping pages or a changing total. Mounted by the Dashboard, Inventory (pull-to-refresh), item form, Create order, Builder, Search and the export dialog; also used by "Refresh from server", the voice assistant's inventory snapshot, seed, replace-all and start-fresh. The app requests all items (no `isActive` filter) and hides inactive ones on most screens. |
| Request | Query: `categoryId`, `isActive`, `isCritical`, `lowStockOnly`, `outOfStockOnly`, `search` (≤100 chars, case-insensitive match on name, description, brand; `%` and `_` act as wildcards), `page` ≥ 1, `pageSize` 1–100 (default 50). Without `isActive`, inactive items are included, also by the low/out-of-stock filters. |
| Database | One count query with the same filters, then the page ordered by `name, id` (stable for paging). |
| Response | 200 `{items:[ItemResponse…], total}` with `version` on every item. |
| Notes | Offset paging is not a snapshot: if items change between page requests, a later refresh is needed. The mobile client detects overlaps and changing totals, but a change that keeps the total the same (one item deleted on an earlier page while another is created) can still skip an item without any error. |
| Status | VERIFIED IN CURRENT CODE. Page > 1 is untested on the backend (tested only against fake responses on mobile). |

### `POST /api/v1/items`
| Field | Detail |
|---|---|
| Purpose | Create an item. |
| Caller | Item form Save on `/item/new` → `useCreateItem`; Builder suggested items; seed defaults. A hidden item with the same name is restored with PUT. No create idempotency key is sent: a lost-response retry can return duplicate-name 409. The form preserves ordinary name/contact punctuation while removing markup; required name text must remain after cleaning. The API-only empty-name gap A-24 remains. |
| Request | `ItemCreate`: owned `categoryId`; name 1–255 (the API still checks length before cleaning: A-24); quantity/minimumStock 0–999,999; purchaseLink must start with lower-case http/https. Text fields remove markup and javascript:. Contact cleaning preserves punctuation and Unicode, removes markup and javascript:, trims and retains the existing 100-character limit. Create and update use the same contact cleaner. |
| Handler | `create_item()` — `items.py:246-339`: advisory lock, ownership check, case-insensitive duplicate name → 409, insert, `ITEM_CREATE` activity, `audit_log` create row. |
| Example | `{"categoryId":"<uuid>","name":"Nitrile gloves","quantity":40,"unit":"pairs","minimumStock":50,"supplierName":"City Medical Supplies","isCritical":true}` → 201, `version: 1`. |
| Status | VERIFIED IN CURRENT CODE; reproduced. |

### `GET /api/v1/items/stats`
| Field | Detail |
|---|---|
| Purpose | Dashboard counts: total active items, categories, out of stock, low stock, critical, pending orders. |
| Caller | **No screen calls it.** The dashboard computes its cards on the phone from the cached items and orders (`app/(tabs)/index.tsx:58-66`) with different rules: the phone's "low stock" also counts critical equipment with exactly 1 left and any item with minimum ≥ 1 and exactly 1 left (`types/index.ts:129-152`), and its "Pending Orders" card counts `pending`, `ordered` and `received`. |
| Notes | Loads every active item row and counts in Python (fine at the current scale; a SQL aggregate would scale better). `pendingOrdersCount` counts orders in **`pending` or `received`** only, so `ordered` and `partially_received` orders are not included — confirm this matches what the dashboard label promises. |
| Status | VERIFIED IN CURRENT CODE; tested. |

### `GET /api/v1/items/needs-attention`
| Field | Detail |
|---|---|
| Purpose | Active items that are out of stock or low, ordered by quantity, then critical first, then name. |
| Caller | No screen calls it; the dashboard's Needs Attention list is computed on the phone. |
| Status | VERIFIED IN CURRENT CODE; tested. |

### `GET /api/v1/items/{item_id}`
| Field | Detail |
|---|---|
| Purpose | One item (404 if missing or not yours). |
| Caller | No screen calls it: the item form reads the item from the `['items']` list cache (`app/item/[id].tsx:92`). |
| Status | VERIFIED IN CURRENT CODE; reproduced (another user's id → 404). |

### `PUT /api/v1/items/{item_id}`
| Field | Detail |
|---|---|
| Purpose | Edit an item, including its quantity. This is the app's normal write path for stock changes. |
| Caller | Item form Save on an existing item (`app/item/[id].tsx:212-222`) → `useUpdateItem`; reactivating a hidden item; Builder critical-star toggle (`useToggleItemCritical`, body `{isCritical, version}`). The form always sends name, category, quantity, unit, minimum stock and critical flag; blank description, brand, supplier name, supplier contact, notes and purchase link go as explicit `null`. It never sends `expiryDate` or `isActive`, cannot clear the photo, and silently leaves a non-blank invalid purchase link unchanged. |
| Request | `ItemUpdate` (`app/schemas/item.py:74-115`): every field optional **except `version`** (required). Omitted field → unchanged. Explicit `null` → **clears** optional fields (`description, expiryDate, brand, notes, supplierName, supplierContact, purchaseLink, imageUri`); `null` on required fields (`name, quantity, unit, minimumStock, isActive, isCritical`) is ignored, and so is a `null` or empty `categoryId`. `purchaseLink: ""` also clears. Changing `categoryId` requires a category you own (400). Create and update now apply the same contact cleaner (A-25 fixed locally). Any successful PUT increases `version`, even when nothing changed. |
| Handler | `update_item()` — `items.py:345-522`. When the body includes `name` (Edit Item always sends it), it first takes the per-account item-name advisory lock (`items.py:362-363`), so two such saves for one account run one after the other. Then one compare-and-swap: `UPDATE items SET …, version = version + 1 WHERE id AND user_id AND version = :sent RETURNING id`. |
| Concurrency | 0 rows updated (someone else saved first, or the row was deleted) → **409** `{"error":"Version conflict","server_version","server_quantity"}` with the values this request read before its update; nothing written. See [inventory-concurrency.svg](diagrams/inventory-concurrency.svg). |
| Database | `items`; `activity_logs` (`ITEM_UPDATE`, e.g. "qty: 40 → 38"); `audit_log` with an old/new snapshot of six fields (name, quantity, unit, minimum stock, active, critical). |
| Response | 200 `ItemResponse` with the new `version`. |
| App behaviour | The screen still closes as soon as Save is tapped. Fields and `formVersion` are captured from the same initial item snapshot; cache refetches cannot replace that version. A form opened before the item loaded cannot save defaults. On 409 the server message is shown and relevant active queries refetch. The person must reopen the editor to load fresh form values; Retry retains the original variables and cannot bypass a stale-version conflict. A-1 is fixed locally with real component regression tests; phone acceptance remains unverified. |
| Status | VERIFIED IN CURRENT CODE; reproduced (explicit null clears brand; null quantity ignored; stale version 409). A-1 fixed locally and verified with a rendered edit form; not yet verified on a device. |

### `PATCH /api/v1/items/{item_id}/stock`
| Field | Detail |
|---|---|
| Purpose | Set an absolute quantity (not a delta) with the same version check. |
| Caller | **No screen calls it**: the app has no stock +/- control. Quantity changes go through the item form (`PUT`) or by applying a received order. |
| Request | `StockUpdate {quantity 0–999999, version}`. |
| Database | Same CAS on `items`; `STOCK_UPDATE` activity ("Stock: 40 → 38 pairs"); audit row. |
| Concurrency | Two API clients saving the same version at once: one 200, one 409, and the version advances once (reproduced with direct API calls; the app never calls this route). There is no advisory lock here: the second update waits for the first one's row lock, then re-checks the version in its `WHERE` clause. |
| Status | VERIFIED IN CURRENT CODE; reproduced. |

### `DELETE /api/v1/items/{item_id}`
| Field | Detail |
|---|---|
| Purpose | Delete an item. |
| Caller | Item form → Delete Item (`app/item/[id].tsx:227-248`); Builder row trash; start-fresh and replace-all loops. `itemService.delete` treats 404 as success (already gone). |
| Rules | Ordinary deletion keeps its existing behavior without a version check. Resets send optional `?version=N`: a row lock and comparison reject changed items with 409 before deletion. Order snapshots are preserved. |
| Database | `ITEM_DELETE` activity, audit row with the old name and quantity, then the row. |
| Status | VERIFIED IN CURRENT CODE; reproduced. |

## Orders

Router: `app/api/v1/orders.py`. Mobile service: `services/orders.ts`. State machine: [order-status.svg](diagrams/order-status.svg). Idempotency: [order-idempotency.svg](diagrams/order-idempotency.svg).

### `GET /api/v1/orders`
| Field | Detail |
|---|---|
| Purpose | The user's orders, newest `exported_at` first, with their lines. |
| Caller | `useOrders()` (key `['orders']`, `staleTime 0`) → `orderService.getAll` (`services/orders.ts:61-74`), which walks every page of 100 and removes duplicate ids, with no total or overlap check (an order created or deleted between pages can be missed); mounted by the Dashboard and the Orders tab (pull-to-refresh). |
| Request | `status` filter (lowercase value), `page`, `pageSize` 1–100 (default 20). |
| Response | 200 `{orders:[OrderResponse…], total, page, pageSize, hasMore}`. |
| Status | VERIFIED IN CURRENT CODE. `hasMore=true` is untested on the backend. |

### `POST /api/v1/orders`
| Field | Detail |
|---|---|
| Purpose | Create a purchase order (status `pending`). Creating an order never changes stock. |
| Caller | Create order screen `app/order/create.tsx` → `useServerMutations` → `orderService.create` (`services/orders.ts:92`). The screen generates **one `localId` per Save press** (`create.tsx:282-287`). Retry from the failure dialog or toast re-sends the same `localId`; pressing Save again creates a new one. |
| Request | `OrderCreate` (`app/schemas/order.py:85-103`): `items` 1–1,000 lines; each line `itemId` (must be yours, else 400 and nothing created), `quantity` 1–999,999, snapshot fields (`name, brand, unit, currentStock, minimumStock, imageUri, supplierName, purchaseLink`). `orderId` is **required by the schema but ignored** (missing → 422, reproduced 8 Oct; the server allocates the public number: A-26); `totalItems/totalUnits/status/timestamps` are type-checked, then ignored; line fields `categoryName`, `isEssential` and `notes` are accepted but **not stored**. Duplicate `itemId` lines are allowed. `localId` optional, 1–36 characters. |
| Handler | `create_order()` — `orders.py:258-357`. |
| Database | (1) if `localId` given: `SELECT` an existing order for (user, localId) → return its **current** state with **200**, and nothing else runs; (2) ownership check of item ids; (3) `INSERT INTO order_number_counters … ON CONFLICT (day) DO UPDATE SET last_value = last_value + 1 RETURNING` → `ORD-YYYYMMDD-NNNN` (UTC date; one counter per day shared by all users, so one user's numbers have gaps); (4) insert `orders`, `order_items` (snapshots exactly as the app sent them), `activity_logs` (`ORDER_CREATED`); commit. No audit row. |
| Concurrency & retries | Same `localId` twice at the same moment: the partial unique index `uq_orders_user_id_local_id` rejects the second insert; its transaction rolls back (undoing its counter increment) and it returns the first order with 200 (reproduced: one 201, one 200, one row). **Without `localId`** (older app builds) every request creates a new order. Migration 0010 keeps existing duplicate rows and exempts later copies by id from the index; indexed keys prevent new duplicates. Reusing a key with a different schema-valid payload still returns the original order, not an updated one (reproduced 8 Oct: quantity 10 → 99 returned the order with 10 units); new lines are not even checked for ownership. The day's counter row stays locked until the creating transaction ends, so concurrent creates by all users on the same UTC day queue there. |
| Response | 201 `OrderResponse` (new) or 200 (replay); 400 invalid item ids; 409 other integrity conflicts; 422 validation. |
| Status | VERIFIED IN CURRENT CODE; reproduced. |

### `GET /api/v1/orders/{order_id}`
| Field | Detail |
|---|---|
| Purpose | One order by internal UUID **or** public `ORD-…` id. |
| Caller | No screen calls it. |
| Status | VERIFIED IN CURRENT CODE; reproduced (history still shows a deleted item's snapshot). |

### `PATCH /api/v1/orders/{order_id}/status`
| Field | Detail |
|---|---|
| Purpose | Move an order through its workflow. |
| Caller | Order card → "Have you received the order?", shown only for `pending` orders (`components/orders/OrderCard.tsx:154-163` → `app/(tabs)/orders.tsx:31-46`), which sends `{"status":"received"}`. The app offers **no** other transition (ordered, partially received, declined), and it shows `partially_received` as "Unknown". |
| Allowed | `pending` → `ordered`, `received` or `declined`; `ordered` → `partially_received` or `received`; `partially_received` → `received`. `received` reaches `stock_updated` only through `/apply`. `declined` and `stock_updated` are final. Same status → 200 no-op (no write, `notes` ignored). Anything else → 400 "Illegal order status transition". A target of `stock_updated` → 400 "Order stock updates must be applied through the apply endpoint". A missing status → 400 "Status is required" and an unknown value → 400 "Invalid order status" (not 422). |
| Handler | `update_order_status()` — `orders.py:363-453`: conditional `UPDATE orders … WHERE id AND user_id AND status = :old`; if another request changed the status first → 409. Sets `ordered_at`, `received_at` or `declined_at`; optional `notes` replaces the order's notes. |
| Database | `orders`; activity (`ORDER_RECEIVED`, `ORDER_DECLINED`, otherwise the reused item action `ITEM_UPDATE`). No audit row. `partially_received` stores no quantities and no timestamp. Receiving never changes stock. |
| Storage detail | The `status` column stores the enum **name** in upper case (`PENDING`, `STOCK_UPDATED`); the API sends and returns lower-case values. Raw SQL must use the upper-case names. |
| Status | VERIFIED IN CURRENT CODE; reproduced. Several illegal pairs are untested. |

### `POST /api/v1/orders/{order_id}/apply`
| Field | Detail |
|---|---|
| Purpose | Add a received order's quantities to stock. |
| Caller | Order card → "Update Stock", shown only for `received` orders (`OrderCard.tsx:165-174` → `orders.tsx:48-63`, with a confirmation dialog) → `orderService.applyToStock`. On success the app invalidates items, orders and activities; a 409 (missing items) is shown with the generic "Conflict — updated by someone else" alert. |
| Handler | `apply_order_to_stock()` — `orders.py:459-605`. Steps 1–5 run in one transaction that the handler commits; the `refresh()` after that commit reads the order in a new one. (1) order must be `received` with ≥ 1 line (400); (2) every line's item must still exist (409 naming missing items, nothing changed); (3) claim: `UPDATE orders SET status='stock_updated', applied_at=now WHERE status='received'` (a second apply gets 400); (4) for each line, in item-id order to prevent opposing-order deadlocks between these apply operations (not a guarantee for every transaction), `UPDATE items SET quantity = quantity + line.quantity, version = version + 1`; one audit row per order line (two lines for the same item give two increments and two rows); (5) `ORDER_APPLIED` activity; commit. |
| Rules | Always adds the **full ordered quantity** of every line, even if the order passed through `partially_received`. Inactive items are updated too, and there is no upper bound, so stock can pass the 999,999 that the item form accepts. Bumping `version` means a phone still holding the old version gets 409 on its next edit (intended); Edit Item now retains the version captured with its form values (A-1 fixed locally). |
| Rollback | Any failure before commit undoes the claim and every increment (reproduced with a deleted item; tested with an injected mid-apply exception). |
| Status | VERIFIED IN CURRENT CODE; reproduced. |

### `DELETE /api/v1/orders/{order_id}`
| Field | Detail |
|---|---|
| Purpose | Delete a `pending` or `declined` order. |
| Caller | Order card → "Remove" (`OrderCard.tsx:189-195`), shown for **every** status, so the API's 400 is what stops received or applied orders from being deleted; the person then sees a toast and an alert. `orderService.delete` does not treat 404 as success. |
| Handler | `delete_order()` — `orders.py:611-686`: status pre-check (400), then a conditional `DELETE … WHERE status IN (pending, declined)` so an order applied in the meantime cannot be erased; activity row with the reused action `ITEM_DELETE` ("Order …") and an `order/delete` audit row. Lines cascade. The order number is not reused. |
| Status | VERIFIED IN CURRENT CODE; reproduced. |

## Activity feed

### `GET /api/v1/activities`
| Field | Detail |
|---|---|
| Purpose | The user's most recent activity entries, newest first. |
| Caller | `useActivities(20)` (key `['activities']`) on the Dashboard's Recent Activity list. The app hides `user_login`, `user_logout` and `user_register` entries and groups bulk operations. |
| Request | `limit` 1–200 (default 50). No paging beyond the limit. |
| Response | 200 `{activities:[{id, action, itemName, itemId, details, orderId, timestamp}], total}`; `action` is lower case in the API, upper case in the database. `total` is the number of rows returned (at most `limit`), not the number stored. Rows with the same timestamp have no tie-breaker. |
| Notes | `audit_log` (before/after snapshots) has no read endpoint; it is for operators, and only some writes create audit rows (none for category create/update, order create or status changes, or any auth action). Activity action names are reused across entities (`ITEM_CREATE` for categories; `ITEM_UPDATE` for some order status changes; `ITEM_DELETE` for category and order deletes). |
| Status | VERIFIED IN CURRENT CODE; reproduced. Isolation and ordering are untested. |

## Assistant (AI) routes

Router: `app/api/v1/ai.py`; guards: `app/services/ai_guard.py`; provider adapters: `app/services/ai_provider.py`. These routes write **only** `ai_consents` and `ai_usage`; they never touch inventory, orders, activity or audit tables. Authentication uses a short-lived separate session, and quota bookkeeping uses its own short transactions, so no database connection is held while waiting for Groq. Flow diagram: [voice-flow.svg](diagrams/voice-flow.svg).

### `GET /api/v1/ai/capabilities`
| Field | Detail |
|---|---|
| Purpose | Tell the app which cloud features the **server** allows and what this account consented to. |
| Caller | `services/assistant.ts:10-14`. Because the assistant dock is embedded in the tab bar and re-initialises on every tab change, this request runs on **every tab switch** and every return to the tabs while signed in (two small database reads each time), plus after consent changes and on "Recheck". The app treats a different `consent_version` as "unavailable". |
| Logic | `interpret` is true only if `AI_ENABLED`, `AI_DATA_CONTROLS_REVIEWED` and `GROQ_API_KEY` are set; transcription and speech need further flags (all off by default). |
| Database | Reads `users` (authentication, in its own short session) and `ai_consents`. |
| Response | 200 `{interpret, interpret_contracts:[1,2], order_review_guard:true, transcribe, speak, consent_version:"voice-2026-10-06", consented, voice, scopes, transcription_providers, speech_providers}`. The legacy `voice` field names Alba; it is not evidence that the mobile app uses hosted speech. |
| Status | VERIFIED IN CURRENT CODE; reproduced (all false with default flags). |

### `PUT /api/v1/ai/consent`
| Field | Detail |
|---|---|
| Purpose | Grant or withdraw consent for specific cloud processing. |
| Caller | Voice setup grants `groq_text` for understanding or separately `groq_audio` for online listening after the matching disclosure; granting one preserves any already accepted scopes. Audio additionally needs a fresh local `audioOptIn`. "Withdraw all cloud consent" sends `accepted:false, scopes:[]`. |
| Request | `ConsentRequest` (strict): `version` must equal `voice-2026-10-06`; `accepted`; `scopes` from `groq_text, groq_audio, sarvam_audio, sarvam_speech, kokoro_speech, alba_speech`, no duplicates; accepting needs ≥ 1 scope; withdrawing needs none (422 otherwise). |
| Rules | Accepting while `AI_ENABLED` is false → 503 and **nothing written**. Withdrawing always works and always writes: it upserts `accepted=false, scopes=[]`, even with AI off or for an account that never consented. |
| Database | Upsert into `ai_consents` (one row per user). |
| Status | VERIFIED IN CURRENT CODE; reproduced. |

### `POST /api/v1/ai/interpret`
| Field | Detail |
|---|---|
| Purpose | Turn one unfamiliar question into **one allowed intent**. It never returns stock facts. |
| Caller | Assistant `ask()` (`components/assistant/AssistantExperience.tsx:293-330`) only when the local matcher found nothing **and** capabilities say `interpret: true` with a stored `groq_text` consent **and** this device's cloud switch is on, and only after the person pressed Send. Current clients negotiate `{question, has_previous_item, contract_version:2}` when supported; v1 clients omit the version. Capabilities are refreshed before unmatched online requests. |
| Request | `InterpretRequest` (strict, ≤ 12 KB body): `question` 1–600 chars, `has_previous_item` bool, `contract_version` 1 or 2 (default 1). No inventory list or recording is sent by this operation. |
| Guards | `reserve()` (`ai_guard.py:95-181`): flags enabled; consent version and the `groq_text` scope; under a global advisory lock, daily limits (50 per user, 500 overall), a conservative cost budget (default 5,000 micro-USD per attempt → at most 20 attempts per user per day), at most 4 calls in flight overall and 1 per user (429 with `Retry-After`). A "day" starts at 00:00 UTC (05:30 IST). Inserts an `ai_usage` row with status `reserved`. |
| Provider call | `POST https://api.groq.com/openai/v1/chat/completions`, model `GROQ_INTENT_MODEL` (default `openai/gpt-oss-20b`), temperature 0, `response_format` strict JSON schema of v1 `Intent` or v2 `Specification`, low reasoning effort, no tools, 3,072 maximum completion tokens for v2 / 1,024 for v1, 25 s total deadline (5 s to connect), no retries. |
| Output checks | Valid JSON, `finish_reason == "stop"`, schema-valid v1 `Intent` or v2 `Specification`; v2 additionally grounds names/units/explicit quantity-to-item associations in the question; a `previous` reference needs context; a named item must be a contiguous sequence of words in the question after case/punctuation normalisation (otherwise 502). This is a name-containment check, not proof of correct semantics. The app validates the intent again before using it. Strict JSON output does not guarantee correct interpretation of arbitrary wording; question text can itself contain sensitive item names or other user-entered details. |
| Settle | `ai_usage` updated to `complete` or `failed` with token counts; failed reserved attempts still count against limits. Settlement errors are logged and leave the row reserved until its in-flight expiry; they do not replace an otherwise successful answer with a 500. |
| Response | 200 legacy `{intent, item_query, reference, fields}` or v2 `{version,intent,draft_mode,query,lines,include_low,include_out}`; 401; 403 no consent; 408 body not received within 10 s; 413 body too large; 422; 429 (own quotas, or the provider busy with `Retry-After: 30`); 502 unusable output or provider error; 503 disabled; 504 timeout **or** any network/DNS failure reaching the provider. The current app wraps the failure with retry/edit/basic-command guidance and states that nothing was saved; earlier A-35 evidence describes the old generic message. |
| Status | VERIFIED IN CURRENT CODE; reproduced with Groq replaced by an in-process recorder. **Real Groq behaviour is NOT VERIFIED.** |

### `POST /api/v1/ai/transcribe`
| Field | Detail |
|---|---|
| Purpose | Server-side speech-to-text (Groq Whisper or Sarvam) for an uploaded recording. |
| Caller | `AssistantExperience.stopRecording`: optional Groq listening after explicit `groq_audio` consent, fresh local `audioOptIn`, and provider checks. Otherwise Moonshine runs on the phone. The 9 October local module supplies streaming local captions and a temporary PCM16/16 kHz WAV; new uploads declare `audio/wav`. Older-module AAC/M4A uploads declare `audio/mp4`. Captions alone never trigger interpretation or drafting. `CLOUD_TRANSCRIPTION_ENABLED=true`; cloud speech remains disabled. |
| Gating | Also needs `AI_TRANSCRIBE_ENABLED` and the provider's flags, plus `groq_audio`/`sarvam_audio` consent. With default settings it returns 503. |
| Details | Multipart upload ≤ 900 KB; mono WAV or M4A 0.3–30 s; decoded by `ffmpeg` with an 8 s limit; flat-line audio rejected; Groq transcripts are checked with segment quality metrics; Sarvam uses its separate response checks. These checks do not prove recognition accuracy. |
| Status | VERIFIED IN CURRENT CODE; reachable from the separately consented online-listening UI. Real recognition/provider behavior remains NOT VERIFIED. |

### `POST /api/v1/ai/speak`
| Field | Detail |
|---|---|
| Purpose | Server-side text-to-speech (Alba/Piper worker, Kokoro worker or Sarvam). |
| Caller | **None in this build** (cloud speech disabled; the app uses Android text-to-speech). |
| Gating | `AI_SPEECH_ENABLED` and provider-specific rights/keys; `voice-service/` contains worker implementations; their actual deployment is NOT VERIFIED. Returns 503 with defaults. |
| Status | VERIFIED IN CURRENT CODE. No test exercises a successful response. |

## Local inventory/draft feature follow-up — 8 October 2026

`GET /ai/capabilities` now also advertises `interpret_contracts: [1, 2]` and `order_review_guard: true`. `POST /ai/interpret` defaults to the legacy intent schema; `contract_version: 2` requests a strict inventory-query/local-draft specification. Interpretation still never executes order/inventory writes; consent/usage are the only AI transport writes. New request/response schemas live in `app/schemas/ai.py` and the mobile `features/assistant/contracts.ts`.

`POST /orders` accepts optional `expectedVersion` on each item line. For a new guarded submission, ownership is checked and item rows are locked in ID order; inactive or version-changed items return 409 before order creation. Legacy submissions omit this guard and retain their behavior. A replayed existing `localId` returns its original order first, even after stock changes. No migration or stock formula changed. The review screen waits for verified inventory, keeps a failed draft, preserves submission identity across retries, and re-exports saved orders without creating another one.

The complete current UI/request/state paths and added regression tests are in [the inventory and draft guide](VOICE_INVENTORY_AND_ORDER_DRAFTS.md). Earlier audit evidence, line numbers and test counts below describe their dated snapshots; unrelated audit findings are not closed by this feature work.

## Worked examples with database state

All examples use synthetic people and items and were replayed on 7 Oct 2026 by [`api_walkthrough.py`](tools/api_walkthrough.py), and again on 8 Oct 2026 with the same results (89 steps, none differed). Full request/response pairs are in the 7 October transcript (local review reference; not published). Ids are shortened. The walkthrough calls the API directly; it does not drive the app.

### 1. Register, log in, refresh, log out

| Step | Request | Status | Database after |
|---|---|---|---|
| Register | `POST /auth/register` `{"name":"Asha Example","email":"asha.example@example.com","username":"asha_demo","password":"Synthetic1"}` | 201 | `users`: 1 row, `is_email_verified=false`, `session_version=0`; `refresh_tokens`: 1 active; `activity_logs`: `USER_REGISTER` |
| Same email, different case | `POST /auth/register` `{"email":"ASHA.example@example.com",…}` | 400 "Email already registered" | unchanged |
| Login by username | `POST /auth/login` `{"identifier":"ASHA_DEMO",…}` | 200 | `refresh_tokens`: 2 active; `USER_LOGIN` activity |
| Refresh | `POST /auth/refresh` `{"refresh_token":R1}` | 200 | R1 revoked; R2 inserted |
| Replay R1 | `POST /auth/refresh` | 401 | unchanged |
| Two refreshes with R2 at once | | one 200, one 401 | R2 revoked; one new token |
| Logout | `POST /auth/logout` (access A3, body R3) | 200 | R3 revoked; `USER_LOGOUT` activity |
| Use A3 again | `GET /auth/me` | **200** | — the access token stays valid until it expires |
| Refresh with R3 | `POST /auth/refresh` | 401 | unchanged |

### 2. Email verification and password recovery

With `REQUIRE_EMAIL_VERIFICATION=true` and email "configured" (the sender replaced by a recorder): registering Ravi returns 201 with tokens, but `GET /auth/me` with that token returns **403 `EMAIL_NOT_VERIFIED`**, and so does login. `GET /auth/verify-email/{token}` returns 200 and sets `is_email_verified=true`, clearing the stored digest; the same link a second time returns 400. After login, `POST /auth/change-password` returns 200: `session_version` 0 → 1, every refresh row revoked, and the previous access token immediately gets 401. A reset link is single-use: first `POST /auth/reset-password` 200 (`session_version` → 2), second 400.

### 3. Profile operations

`PATCH /auth/me {"name":"Asha E.","phone":"+91 90000 00000"}` → 200 and both columns change. `{"phone": null}` → 200 but the phone is **unchanged**. `{"email":"new.address@example.com"}` → 400 "To change your email, contact support."

### 4. Categories, items, explicit null and versions

| Step | Request | Status | `items` row after (quantity / brand / version) |
|---|---|---|---|
| Create category "Respiratory" | `POST /categories` | 201 | — |
| Create "respiratory" | `POST /categories` | 409 | — |
| Create Nitrile gloves (40 pairs, minimum 50, brand SafeHands) | `POST /items` | 201 | 40 / SafeHands / 1 |
| Clear the brand | `PUT /items/{id}` `{"brand": null, "version": 1}` | 200 | 40 / **null** / 2 (supplier unchanged because it was omitted) |
| Null quantity | `PUT /items/{id}` `{"quantity": null, "version": 2}` | 200 | **40** / null / 3 (required field: null ignored) |
| Stale save | `PUT /items/{id}` `{"quantity": 45, "version": 1}` | **409** `server_version: 3, server_quantity: 40` | unchanged |
| Two API clients, same version (the app never calls this route) | two simultaneous `PATCH /items/{id}/stock` with `version: 3` (38 and 36) | one 200, one 409 | 38 / null / 4; one audit row 40 → 38 |

### 5. Orders from creation to stock

| Step | Status | Effect |
|---|---|---|
| `POST /orders` with `localId` L1 (gloves 60, catheter 20) | 201 | `ORD-20261007-0001`, status `pending`, `total_units` 80; counter for 20261007 = 1; stock unchanged |
| Same request again (lost response, retry) | **200** | same order returned; still 1 order |
| Two simultaneous requests with `localId` L2 | 201 + 200 | exactly 1 order for L2 |
| Two requests **without** `localId` | 201 + 201 | 2 separate orders (older-app behaviour) |
| `PATCH status` pending → `stock_updated` | 400 | illegal transition |
| pending → ordered → received; received again | 200, 200, 200 (no-op) | `ordered_at`, `received_at` set |
| `POST /apply` | 200 | gloves 38 → 98 (v4 → v5), catheter 0 → 20; status `stock_updated`; 2 audit rows tagged `order:ORD-20261007-0001` |
| `POST /apply` again | 400 | stock unchanged |
| `DELETE` the applied order | 400 | only pending/declined can be deleted |
| New order for gloves + catheter, mark received, delete the catheter item, apply | **409** "inventory items are missing" | gloves stay 98 / v5; order stays `received` (rolled back) |
| Delete a pending order, then create another | 200, 201 | the deleted number `…-0006` is never reused (`…-0007` next) |

### 6. Account deletion

`DELETE /auth/me` → 200 (token emailed; here recorded). `POST /auth/cancel-delete` → 200, and the old link then shows "Invalid or Expired Link" (400). A new `DELETE /auth/me`, then `GET /confirm-delete/{token}` → 200 confirmation page and the user still exists; `POST /confirm-delete/{token}` → 200. Row counts before → after: users 3 → 2, categories 1 → 0, items 1 → 0, orders 6 → 0, order_items 11 → 0, refresh_tokens 8 → 3, activity_logs 26 → 3, audit_log 9 → 0, ai_consents 1 → 0, ai_usage 4 → 0, order_number_counters 1 → **1**. The other two synthetic accounts were untouched. Logging in afterwards returns 401.

### 7. Voice and typed questions

What the phone does is described in the [developer guide's voice chapter](CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md); the server side is below. Groq was replaced by a recorder that returned scripted answers, so these rows test the server's checks, not a real model. The two questions were sent straight to the API: in the app, both would be answered by the local matcher and never reach `/ai/interpret` (the first is a combined local quantity + supplier read; the second starts with "delete" once "Please" is removed, a local `unsupported_action`).

| Step | Status | Database |
|---|---|---|
| `GET /ai/capabilities` with default flags | 200, everything false | read only |
| Accept consent while AI is off | 503 | **no row written** |
| `POST /ai/interpret` without a bearer token | 401 (before the body is read) | — |
| Server flags enabled (synthetic placeholder key); interpret without consent | 403 | — |
| Grant `groq_text` | 200 | `ai_consents`: version `voice-2026-10-06`, accepted, `["groq_text"]` |
| "Could you tell me how many nitrile gloves are left and who supplies them?" | 200 `{"intent":"read_item","item_query":"nitrile gloves","reference":"named","fields":["quantity","supplier"]}` | `ai_usage`: 1 row `complete`, 5,000 micro-USD reserved, token counts |
| A model answer naming an item not in the question | 502 | usage row `failed` |
| "Please delete everything from inventory" | 200 `unsupported_action` | — |
| Provider timeout | 504 | usage row `failed` (still counted) |
| 13 KB question body | 413 | — |
| Checksums of users, categories, items, orders, order_items, activity_logs, audit_log, order_number_counters before and after | unchanged | — |
| What the (replaced) Groq endpoint received | `{"question": "...", "has_previous_item": false}`, strict schema, no tools | — |

A typed question that the local matcher understands ("Show low stock", "How many nitrile gloves are left?") does not call `/ai/interpret` for that question: separate capabilities or consent requests may occur. For the stock answer the app only reads `GET /api/v1/items` (or reuses fresh cache) and builds the answer on the phone.

## What happens when things go wrong

| Situation | What the server does | What the app does |
|---|---|---|
| **Invalid input** | 422 with field-level `details` before the handler; the authentication dependency may already have queried the database, and the 422 is raised after `get_db` has closed normally. Malformed JSON fails earlier; invalid authentication can take precedence over schema errors. Exception: names that become empty after cleaning are accepted (A-24). | Shows a validation message; nothing saved. |
| **Not your data** | 404 (ownership is part of the query). | Shows the server's message (for example "Item not found"); item and category deletes treat 404 as already done. |
| **Missing or bad token** | 401; refresh tokens rejected on protected routes. | One shared refresh, then retry; a definitive 401/403 from refresh signs the user out. |
| **Expired access token** | 401 `Invalid or expired token`. | Refresh with the stored refresh token (rotation), retry once. |
| **Unverified email (when enforced)** | 403 `EMAIL_NOT_VERIFIED` for an unverified email account on login, refresh and routes using the protected bearer dependency; public routes are outside that policy. | Shows the verify-email screen; the exact string matters. |
| **Lost connectivity** | A request blocked before sending does not reach the server. A lost connection or response after sending may occur after commit. | Most write buttons check NetInfo first and show "Offline — Connect to WiFi…" without sending anything; writes that do go out are not paused for later automatic replay (`networkMode: 'always'`, retry 0), but failure timing depends on the network; ordinary requests have a 90 s overall deadline. There is **no offline write queue**. Queries keep showing cached (possibly stale) data and refetch on reconnect (`onlineManager` wired to NetInfo). The Dashboard and Orders tab show "showing last synced data" when offline; no screen shows a last-sync time. The assistant answers from the last data synced in this login, labelled "Last known". Screens treat "connected" as online while TanStack also requires internet reachability, so on Wi-Fi without internet a write can be attempted and fail with a connection error. |
| **Concurrent edits** | Item writes: 409 version conflict. Order status: 409 if the status moved. Duplicate names: advisory lock → 409. Same order `localId`: one order. | The item form sends its captured version. Mutation hooks invalidate relevant active queries after 409; the person reopens/reloads the form before editing again. Retry retains the original variables. |
| **Timeouts** | SQL statements: 8 s on the application engine; health: 2 s; Groq: 25 s. Alembic has a separate engine. A timeout rolls back uncommitted work, not an earlier commit. | Ordinary API requests: 90 s overall deadline. Refresh and detached logout revocation: 30 s; health preflight: 5 s; AI: 50 s; assistant inventory: 20 s abort/22 s deadline. A missing response can follow a successful commit: the dialog says the server may have saved, and active views refetch. Check before retrying; an order retry must reuse its original `localId`. |
| **Rollback** | A failure before commit rolls back that uncommitted transaction. Order apply, category delete and account deletion commit their related changes atomically. | A failed response after commit may leave data changed; refetch before retrying. |
| **Unexpected error** | 500 generic message, logged with the exception type and code location but no values. | Generic error message. |

## Known application issues found while tracing

A-1 to A-23 were found by reading the mobile and backend code on 7 Oct 2026 (static analysis; none of them was reproduced on a phone; A-13, A-14 and A-16 were reproduced against the API in a disposable local database). A-18 to A-23 came from the source checks and the documentation agents' reviews. All 23 were re-checked against the code on 8 Oct 2026. **A-24 to A-35 were found on 8 Oct 2026**: A-24 to A-27 were reproduced against a disposable local database (A-27 with Alembic's configuration call alone), the rest come from reading the code. They were originally documented without changing the application. **Subsequent owner-authorized fixes on 8 October 2026** are marked below; unmarked findings remain open. Earlier audit evidence and line anchors describe the pre-fix snapshot. See [the safety follow-up](BACKEND_HARDENING.md#safety-follow-up-8-october-2026) for implementation and verification scope.

| Id | Issue | Evidence | Proposed fix |
|---|---|---|---|
| A-1 | **Fixed locally — 8 Oct 2026.** Previously: A stale edit used the live-cache version. | `app/item/[id].tsx`, `tests/item-form-safety.test.cjs` | Fields and version are captured together; blank/unloaded forms still cannot save. Active views refetch after 409. Device/live acceptance is not claimed. |
| A-2 | **"Remove" is offered for orders the API will not delete.** | `components/orders/OrderCard.tsx:189-195` vs `app/api/v1/orders.py:640-644` | Show Remove only for `pending` and `declined`. |
| A-3 | **Fixed locally for hook-based mutations.** A 409 previously showed a generic “Refreshing” claim without refreshing. | `utils/serverErrors.ts`, `hooks/useServerMutations.ts`, reconciliation tests | Show the actual server message and invalidate the affected hook queries after 409. Direct bulk calls retain their existing operation-level reconciliation; no universal automatic retry or form reload is claimed. |
| A-4 | **Two messages for one failure** (global toast plus a call-site alert) for category and order mutations and some item actions. | `providers/QueryProvider.tsx:52-68`; `hooks/useServerMutations.ts:235-337`; `app/(tabs)/orders.tsx:38-77` | Give each mutation one owner for error feedback. |
| A-5 | **Resend verification fails after a username login.** The typed identifier is passed as `email`. | `app/(auth)/login.tsx:229-233`; `app/(auth)/verify-email-pending.tsx:37-46`; `app/schemas/user.py:212-214` (EmailStr) | Pass the account's email (from the server) or ask for it on that screen. |
| A-6 | **Rate-limit message says "wait 60 seconds"** on every screen except Login (which shows "Too many attempts…"); the server sends no `Retry-After` and the real windows are per hour for most auth routes. | `services/api.ts:307-314`; `app/(auth)/login.tsx:49-52`; `app/utils/rate_limiter.py:38-42` | Send `Retry-After` (slowapi `headers_enabled=True`) or use neutral wording. |
| A-7 | **Dashboard counts differ from the API's stats** (broader low-stock rule; pending orders include `ordered`). | `app/(tabs)/index.tsx:58-66`; `types/index.ts:129-152`; `app/api/v1/items.py:139,151-158` | Decide on one definition of "low stock" and "pending", then share it (or call `/items/stats`). |
| A-8 | **Reset-password screen** validates only length and is reachable only through a deep link no email uses. | `app/(auth)/reset-password.tsx:48-51`; `app/utils/email.py:148` | Either remove the screen or link emails to it and mirror the password rules. |
| A-9 | **Registration tokens are discarded on the phone but stay valid on the server** (refresh row valid 30 days). | `services/auth.ts:15`; `store/useAuthStore.ts:289`; `app/api/v1/auth.py:159-171` | Stop issuing tokens on register, or revoke them (call logout) when discarding. |
| A-10 | **Mobile and backend status lists differ**: the app's type has `cancelled`/`completed`; `partially_received` renders as "Unknown". | `types/index.ts:173-181`; `components/orders/OrderCard.tsx:32-77`; `app/models/order.py:19-27` | Align the types and add a badge for `partially_received`. |
| A-11 | **`GET /ai/capabilities` on every tab switch** and every return to the tabs while signed in. The same re-initialisation also makes the phone re-check every file of the speech pack. | `app/(tabs)/_layout.tsx:16-23`; `components/assistant/AssistantExperience.tsx:140-180`; `modules/carekosh-voice/android/src/main/java/expo/modules/carekoshvoice/ModelPack.kt:90-115` | Cache capabilities per session (for example a TanStack query with a staleTime); verify the speech pack once after download or at start-up. |
| A-12 | **Fixed locally — 8 Oct 2026.** Previously: Ordinary requests could wait indefinitely. | `services/api.ts`, `tests/api-refresh.test.cjs` | 90 s overall deadline covers transport, refresh/retry waits and body parsing; caller cancellation remains distinct. Device/live acceptance is not claimed. |
| A-13 | **500 responses lack `X-Request-ID` and security headers** (generic handler runs outside the middleware). Reproduced. | `app/main.py:223-237`; transcript (local review reference; not published) | Add the headers in a pure ASGI middleware that wraps the error middleware, or set them in the 500 handler. |
| A-14 | **Logout leaves the access token valid** for up to 30 minutes. Reproduced. | `app/api/v1/auth.py:818-859`; `app/api/deps.py:50-70` | Accept and document, or bump a per-session marker / keep a short deny-list. |
| A-15 | **Profile `phone` and category fields cannot be cleared with `null`**, unlike items. Only an empty string works (`"phone": ""`, `"description": ""`). | `app/api/v1/auth.py:910-913`; `app/api/v1/categories.py:248-256` | Use `model_fields_set` as `update_item` does. |
| A-16 | **A received order whose item was deleted is stuck**: apply returns 409, `received → declined` is not an allowed transition, and delete accepts only pending/declined. | `app/api/v1/orders.py:28-46,502-524,640-644`; reproduced in the walkthrough | Allow `received → declined`, or let apply skip/report missing lines by choice. Product decision. |
| A-17 | **Local dev container starts the server even if the migration failed** (`Dockerfile.dev` builds an inline entrypoint that runs `alembic upgrade head` and then `uvicorn` without stopping on error). Production's `docker-entrypoint.sh` does stop. | `vitaltrack-backend/Dockerfile.dev:33-44`; `docker-entrypoint.sh:49-56` | Add `set -e` to the dev entrypoint, or make it exit when `alembic upgrade head` fails. Development only. |
| A-18 | **IP address and User-Agent are kept with every refresh-token row, with no clean-up.** Register, login and refresh each store them; expired and revoked rows are never purged, so they stay until the account is deleted. Login activity details also include the client address. | `app/api/v1/auth.py:168-169`, `:282-283`, `:797-798`; no delete of `refresh_tokens` outside account deletion (searched `app/`) | Purge expired/revoked refresh rows on a schedule (or at login), and state the retention in the privacy policy. Privacy decision for the owner. |
| A-19 | **`main` initialises Sentry with SDK defaults**: in sentry-sdk 2.20.0 that means local variables in stack frames and request bodies up to the SDK's "medium" size, filtered only by the SDK's built-in scrubber for known secret key names. The feature branch sets `include_local_variables=False`, `send_default_pii=False`, `max_request_body_size="never"` and its own `before_send` scrubbers. Matters only for a service that runs `main` with `SENTRY_DSN` set (NOT VERIFIED). | `git show main:vitaltrack-backend/app/main.py` lines 42-46 vs branch `app/main.py:46-54`; SOURCES (local review reference; not published) row 31 | Ship the branch configuration (merging does), or set the same options on `main`. |
| A-20 | **Fixed locally — 8 Oct 2026.** Previously: python-jose 3.3.0 contained two published advisories. | `vitaltrack-backend/requirements.txt`, auth/security suites | Pinned 3.5.0, including the 3.4.0 security fixes and declared Python 3.12 support. Authentication regression tests pass; no signing-key or algorithm change. Device/live acceptance is not claimed. |
| A-21 | **The assistant consent version is written in three places** (twice in the backend schema, once in the app) with nothing checking they match; a mismatch makes the app report the assistant's online option as unavailable without explanation. | `vitaltrack-mobile/services/assistant.ts:5,12`; `vitaltrack-backend/app/schemas/ai.py:7,76` | Add a contract test, or have the app accept the version reported by `/ai/capabilities`. |
| A-22 | **Deprecated Gunicorn worker class.** `uvicorn.workers.UvicornWorker` is deprecated since uvicorn 0.30.0 (0.34.0 installed); it still works. | `vitaltrack-backend/Dockerfile:81`; [uvicorn 0.34.0 changelog](https://github.com/encode/uvicorn/blob/0.34.0/CHANGELOG.md) (0.30.0 entry; retrieved 2026-10-07) | Switch to the `uvicorn-worker` package when dependencies are next upgraded. Maintenance. |
| A-23 | **Upgrade hazard, not a current defect: FastAPI dependency timing.** With FastAPI 0.115.6, `get_db`'s commit after `yield` runs after the response is serialised but before it is sent. FastAPI 0.118.0 moved it to after the response is sent, so a handler that relies on `get_db` to commit could report success before a failed commit. 0.121.0 added a dependency `scope` (`scope="function"` exits before the response). Separately, 0.132.0 rejects JSON bodies without a JSON `Content-Type` by default. | `app/core/database.py:107-124`; [FastAPI release notes](https://fastapi.tiangolo.com/release-notes/) (0.118.0, 0.121.0, 0.132.0; read 8 Oct 2026); SOURCES (local review reference; not published) row 1 | Before upgrading FastAPI, make every write handler commit explicitly (most already do) or give `get_db` the early-exit scope; check that every client sends `Content-Type: application/json`. |
| A-24 | **Category and item names that clean to empty are accepted** (found 8 Oct 2026; reproduced). The length rule runs before tags and spaces are removed, so `"   "` is stored as `""` (201), and `"<b></b>"` then fails as a duplicate of that empty name (409). An item named `"<i></i>"` is stored as `""`. User `name` follows the same pattern (code reading). | `vitaltrack-backend/app/schemas/category.py:19, 25-35, 41, 46-54`; `app/schemas/item.py:20, 38-50, 78, 96-104`; `app/schemas/user.py:28, 58-64, 135, 149-157` | Reject a value that is empty after cleaning, or clean it in a `mode="before"` validator so the length rule sees the cleaned text. Decide separately what to do with names already stored empty. |
| A-25 | **Fixed locally — 8 Oct 2026.** Previously: Contact create/update cleaning differed. | `app/schemas/item.py`, `tests/test_items.py` | Both use the same markup cleaner and preserve valid punctuation/Unicode within the existing length limit. Device/live acceptance is not claimed. |
| A-26 | **`POST /orders` requires `orderId` but ignores it** (found 8 Oct 2026; reproduced: missing → 422 `body.orderId` "Field required"). The server always allocates the public number; the app sends a random placeholder, and its comments wrongly say `totalItems`, `totalUnits` and `exportedAt` are also required. | `vitaltrack-backend/app/schemas/order.py:87`; `app/api/v1/orders.py:270-357` (never read); `vitaltrack-mobile/services/orders.ts:35, 85-93` | Make `orderId` optional (still accepted from older builds) and correct the mobile comments. |
| A-27 | **Fixed locally — 8 Oct 2026.** Previously: ConfigParser rejected percent-encoded database URLs. | `alembic/env.py`, `tests/test_alembic_url.py` | Escape % only when setting Alembic configuration; reading it returns the unchanged original URL. Device/live acceptance is not claimed. |
| A-28 | **The reset-password page reports weak passwords and rate limits as "The link may have expired"** (found 8 Oct 2026; code reading). The page reads only `detail`; 422 bodies carry `details`/`message` and 429 bodies carry `error`. The hint "Min 8 characters, 1 uppercase, 1 number" omits the lower-case rule. | `vitaltrack-backend/app/api/v1/auth.py:605, 650`; `app/main.py:197-205` | Show `detail`, else the first `details[].message`, else `error`; list all three character rules in the hint. |
| A-29 | **Fixed locally — 8 Oct 2026.** Previously: The reset backup and deletion used different snapshots. | `hooks/useSeedInventory.ts`, `app/builder.tsx`, `tests/inventory-reset.test.cjs`, `tests/test_reset_safety.py` | Copy the complete server DTOs into a uniquely named backup before any delete, use only its IDs/item versions/category update timestamps, stop after an account change, and delete categories only if empty. Changed or newly added records are preserved or the concurrent write is refused. Both app and backend must contain these fixes. Device/live acceptance is not claimed. |
| A-30 | **Fixed locally — 8 Oct 2026.** Previously: Valid name/contact punctuation was silently removed. | `utils/sanitize.ts`, `app/schemas/item.py`, mobile/backend item tests | Preserve legitimate text, remove markup and keep escaping HTML output. Already altered stored values are not automatically repaired. Device/live acceptance is not claimed. |
| A-31 | **Fixed locally — 8 Oct 2026.** Previously: A lost response was wrongly described as an unsaved write. | `utils/mutationFeedback.ts`, `hooks/useServerMutations.ts`, `tests/mutation-reconciliation.test.cjs` | Describe the outcome as uncertain; invalidate relevant active queries after network/gateway failures. Retry still uses the original variables. Device/live acceptance is not claimed. |
| A-32 | **Fixed locally — 8 Oct 2026.** Previously: Logout cleanup waited for unbounded network work. | `services/auth.ts`, `services/api.ts`, `store/useAuthStore.ts`, logout/store/refresh tests | Local logout first; isolated bounded best-effort revocation, serialized credential writes and stale-refresh guards. Local cleanup blocks a racing login/registration. Device/live acceptance is not claimed. |
| A-33 | **Fixed locally — 8 Oct 2026.** Previously: Safety words inside an item name caused false refusal. | `features/assistant/core.ts`, `features/assistant/snapshot.ts`, phrasing/UI tests | An exact active name from this session's verified cache fences name words off from safety checks; the final answer still uses verified inventory. Sync inventory first if there is no owned cache. Negations, mutations, history and medical requests remain refused. Device/live acceptance is not claimed. |
| A-34 | **Fixed locally — 8 Oct 2026.** Previously: An unused listen=1 parameter could start recording. | `components/assistant/AssistantExperience.tsx`, `tests/assistant-inline.test.cjs` | Removed automatic route-triggered recording. A microphone tap is required, and Send remains required before text upload. Device/live acceptance is not claimed. |
| A-35 | **Every interpret failure shows the same message** (found 8 Oct 2026; code reading). 403, 429, 502, 503 and 504 all become "Online understanding could not complete this question…", and `Retry-After` is not shown, so a person cannot tell a used-up daily allowance (it resets at 05:30 IST) from a passing error. If the phone gives up or the person cancels, the server call still runs and counts toward the allowance. | `vitaltrack-mobile/components/assistant/AssistantExperience.tsx:305-309`; `services/api.ts:418-436`; `vitaltrack-backend/app/api/v1/ai.py:93-104` | Map each status to its own message (including when the allowance resets); say that a cancelled question may still have counted. |

## Coverage gaps worth knowing

These come from reading every test (the ledger (local review reference; not published) has the full list). They are not bugs; they are places where the documentation cannot lean on an automated test.

- No test for `POST /auth/forgot-password`, `POST /auth/resend-verification` or the HTML `GET /auth/verify-email`.
- Logout's effect on the access token is not tested either way (this audit reproduced that it stays valid).
- Rate limiting, security headers, `X-Request-ID` and CORS headers are untested (the limiter is disabled in tests).
- Account deletion: the route test checks only the `users` row; the inventory cascade is shown only by this audit's walkthrough (a separate test deletes a user row directly and checks that the AI rows go).
- No test sends a name that cleans to empty, a non-empty `supplierContact` on an update, a missing `orderId` or a reused `localId` with a changed payload (A-24 to A-26; the 8 Oct probes did).
- Concurrent duplicate registration (would return 409, not 400) is untested.
- AI quotas are tested at service level, not as HTTP 429; the provider error mapping (`bounded_call`) is untested; no successful `/ai/speak`.
- Migration downgrades (including 0007's refusal) are untested.
- About ten concurrency tests start requests together without forcing the overlap, so a pass does not prove the race was exercised.
- Mobile tests cover the API client, logout and order-creation services, item paging, the sanitising helpers, the query provider, assistant logic and assistant UI; screens, stores and the category service are not loaded by any test.
