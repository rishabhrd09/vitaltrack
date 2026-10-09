# CareKosh Backend

> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. Earlier dated test/release claims retain their original scope. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](../docs/VOICE_INVENTORY_AND_ORDER_DRAFTS.md).


> 8 October 2026 safety follow-up: targeted code fixes are local, tested changes after the earlier audit. Deployment and real-device acceptance remain separate. [Current changes and remaining scope](../docs/BACKEND_HARDENING.md#safety-follow-up-8-october-2026).

> **Status (7 October 2026):** Checked against branch `feature/backend-hardening-ai-voice-agent-foundation` at `03cfebb`. `main` and tag `v1.0.0` are `835fad3` (migrations up to `0006`, 39 `/api/v1` routes, no `/api/v1/ai/*`). The feature branch has migrations up to `0010_order_local_id_unique` (`0007` cannot be downgraded), 44 `/api/v1` routes plus `/`, `/health` and `/live` (47 in total), and 242 backend tests that passed locally on 7 Oct 2026 and again on 8 Oct 2026 (88% coverage). Re-checked against the working tree on 8 Oct 2026. Sections say "feature branch" where `main` differs. What staging and production run is NOT VERIFIED. Earlier note (23 Sept 2026): head `0007`, 152 backend tests — now out of date. Start here: [complete developer guide](../docs/CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md) · [API traceability](../docs/API_TRACEABILITY.md) (every endpoint) · [documentation home](../docs/INDEX.html) · [backend hardening](../docs/BACKEND_HARDENING.md).

> FastAPI backend for the CareKosh home-ICU medical inventory app.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python)](https://python.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://postgresql.org)
[![Hosted on Render](https://img.shields.io/badge/Hosted-Render-46e3b7?logo=render)](https://render.com)

> The directory name `vitaltrack-backend/` is legacy (CareKosh was formerly VitalTrack). Do not rename — Render service paths and `eas.json` references depend on it.

---

## Quick start

### Prerequisites
- Docker Desktop (running), OR Python 3.12 (the version used by Docker and CI) with PostgreSQL 16

### With Docker (recommended)
```bash
cd vitaltrack-backend
cp .env.example .env                             # optional with Docker: docker-compose.dev.yml sets its own SECRET_KEY,
                                                 # DATABASE_URL and ENVIRONMENT; .env only fills MAIL_*, FRONTEND_URL, LOCAL_IP
docker compose -f docker-compose.dev.yml up --build -d
docker compose -f docker-compose.dev.yml logs -f api
```

Alembic migrations run automatically by the container entrypoint. Production uses `docker-entrypoint.sh` (it exits if the migration fails); dev uses `Dockerfile.dev`'s inline entrypoint (it continues even if the migration fails, so check the log). You don't run migrations manually in the normal Docker flow.

### Without Docker
```bash
python -m venv venv
source venv/bin/activate                         # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                             # DATABASE_URL here points at localhost:5432/vitaltrack
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

With `ENVIRONMENT=development` the app also runs `create_tables()` at startup, which only creates missing tables; Alembic stays the schema authority.

### Verify
- Readiness: http://localhost:8000/health (probes the database) · Liveness: http://localhost:8000/live
- Swagger: http://localhost:8000/docs and ReDoc: http://localhost:8000/redoc — only when `DEBUG=true` (the dev compose file and `.env.example` set it; the code default is `False`, and `/openapi.json` is hidden too)

---

## Project structure

```
vitaltrack-backend/
├── alembic/versions/            # 10 migrations on the feature branch, 6 on main (see below)
├── app/
│   ├── api/v1/
│   │   ├── auth.py              # 18 route objects incl. account deletion
│   │   ├── categories.py
│   │   ├── items.py             # CRUD + OCC (version field, 409 on conflict)
│   │   ├── orders.py            # CRUD + POST /{id}/apply
│   │   ├── activity.py          # read-only activity log (the audit_log table has no route)
│   │   └── ai.py                # 5 read-only assistant routes (feature branch)
│   ├── core/
│   │   ├── config.py            # pydantic-settings, validators
│   │   ├── database.py          # async engine (asyncpg), 8 s statement timeout
│   │   ├── logging.py           # log/telemetry scrubbing (feature branch)
│   │   └── security.py          # JWT + Argon2
│   ├── models/                  # SQLAlchemy 2.0 async models
│   ├── schemas/                 # Pydantic I/O schemas
│   ├── services/                # audit helper; feature branch adds AI guard/provider/body limit, inventory lock
│   └── utils/
│       ├── email.py             # Brevo HTTP API email sender
│       └── rate_limiter.py      # slowapi
├── scripts/                     # check_api_routes.py, check_file_coverage.py, smoke/restore/cold-start helpers
├── tests/                       # pytest suite (needs a disposable PostgreSQL database; see Development)
├── docker-compose.yml           # production-image stack for local checks
├── docker-compose.dev.yml       # hot-reload dev stack
├── Dockerfile                   # multi-stage, non-root runtime user, 2 Gunicorn workers
├── Dockerfile.dev               # dev image (uvicorn --reload; no ffmpeg)
├── docker-entrypoint.sh         # production DB wait + alembic, then execs CMD
├── render.yaml                  # Render production service spec (staging is dashboard-only)
└── requirements.txt             # direct pins only; transitive packages are not pinned
```

---

## API endpoints

Counts under `/api/v1`: 18 auth, 6 categories, 8 items, 6 orders, 1 activity = 39 on `main`; the feature branch adds 5 `ai` routes = 44. With the root routes `GET /`, `GET /health` and `GET /live` the feature branch has 47 routes. CI checks the `/api/v1` count with `scripts/check_api_routes.py --expected 44` (39 on `main`). Every endpoint with its handler, tables and tests: [API traceability](../docs/API_TRACEABILITY.md).

### Auth (`/api/v1/auth`) — 18 endpoints

Rate limiting is best effort: five auth routes, counters in memory per worker process (2 workers per instance), reset on restart; an open finding about how clients are identified is tracked privately. Tests disable the limiter.

| Method | Path | Rate limit | Notes |
|---|---|---|---|
| POST | `/register` | 3/hr | email required; returns 201 with tokens; the verification email is sent in the background only when `MAIL_PASSWORD` is set |
| POST | `/login` | 5/min | body `{identifier, password}` (email or username); returns access + refresh |
| GET | `/verify-email` | — | HTML response for email link (`?token=`); single use |
| GET | `/verify-email/{token}` | — | JSON API variant; single use |
| POST | `/resend-verification` | 3/hr | uniform response (no user enumeration); 503 if email is not configured |
| POST | `/forgot-password` | 3/hr | sends reset email (link valid 1 h); 503 if email is not configured |
| GET | `/reset-password` | — | HTML form |
| POST | `/reset-password` | 5/hr | revokes all refresh tokens on success (feature branch: also bumps `session_version`, so existing access tokens stop working) |
| POST | `/refresh` | — | rotates refresh token; a replayed old refresh token gets 401 |
| POST | `/logout` | — | needs the access token plus the refresh token in the body; revokes that refresh token. The access token stays valid until it expires (≤ 30 min) |
| GET | `/me` | — | profile |
| PATCH | `/me` | — | update profile (`null` fields are ignored; `"phone": ""` clears the phone). Feature branch: email changes are refused with 400; on `main` the email can be changed without re-verification |
| **DELETE** | `/me` | — | request account deletion; sends confirmation email (24 h link); 400 if the account has no email, 503 if email is not configured |
| GET | `/confirm-delete/{token}` | — | HTML confirmation page only |
| POST | `/confirm-delete/{token}` | — | final account deletion after form submit |
| POST | `/cancel-delete` | — | abort pending deletion (no button in the app) |
| POST | `/change-password` | — | revokes all refresh tokens (feature branch: also bumps `session_version`); no screen in the app |
| GET | `/email-service-status` | — | authenticated diagnostic; raw provider errors masked |

### Categories (`/api/v1/categories`) — 6 endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/categories` | list (ordered by `display_order`) |
| GET | `/categories/with-counts` | list with item counts |
| GET | `/categories/{id}` | get one |
| POST | `/categories` | create; case-insensitive duplicate name → 409 |
| PUT | `/categories/{id}` | update; `null` fields are ignored |
| DELETE | `/categories/{id}` | delete (cascades items; order lines keep their snapshots) |

`is_default` categories cannot be deleted through the backend API (409); custom categories can still be deleted and remain user-scoped. Category and item names are unique per user only through these API checks, not database constraints.

### Items (`/api/v1/items`) — 8 endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/items` | pagination (`page`, `pageSize` 1–100, default 50) + filters: `categoryId`, `isActive`, `isCritical`, `lowStockOnly`, `outOfStockOnly`, `search` |
| GET | `/items/stats` | aggregate counts (`pendingOrdersCount` = orders in `pending` or `received`); not called by the current app |
| GET | `/items/needs-attention` | active items out of stock (quantity ≤ 0) or low (quantity < minimum stock); expiry is not checked; not called by the current app |
| GET | `/items/{id}` | get one |
| POST | `/items` | create; case-insensitive duplicate name → 409 |
| PUT | `/items/{id}` | **`version` required; OCC: returns 409 `{server_version, server_quantity}` on stale `version`** |
| PATCH | `/items/{id}/stock` | absolute quantity `{quantity, version}` (OCC-checked); the current app has no stock +/- control and does not call it |
| DELETE | `/items/{id}` | delete (no version check) |

### Orders (`/api/v1/orders`) — 6 endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/orders` | pagination (default 20, max 100) + status filter |
| GET | `/orders/{id}` | get one by UUID or public `ORD-YYYYMMDD-NNNN` id |
| POST | `/orders` | create; `orderId` is required but ignored (known issue A-26); the server computes totals and the order number (UTC date, one daily counter for all users). Feature branch: optional `localId` makes retries idempotent (same `localId` → 200 with the existing order) |
| PATCH | `/orders/{id}/status` | `pending → ordered / received / declined`; `ordered → partially_received / received`; `partially_received → received` |
| POST | `/orders/{id}/apply` | apply a `received` order to inventory stock |
| DELETE | `/orders/{id}` | only `pending` / `declined` |

`stock_updated` is reached only by `POST /orders/{id}/apply`; clients should not PATCH directly to that status.

### Activity (`/api/v1/activities`) — 1 endpoint

| Method | Path | Description |
|---|---|---|
| GET | `/activities` | `limit` param (default 50, max 200) |

### AI assistant (`/api/v1/ai`) — 5 endpoints, feature branch only

| Method | Path | Description |
|---|---|---|
| GET | `/ai/capabilities` | which AI features the server allows, plus the user's consent state (read only) |
| PUT | `/ai/consent` | store or revoke consent; accepting returns 503 while `AI_ENABLED` is false |
| POST | `/ai/interpret` | Groq text understanding of a question (no inventory, no audio); needs `AI_ENABLED`, `AI_DATA_CONTROLS_REVIEWED`, `GROQ_API_KEY` and consent scope `groq_text` |
| POST | `/ai/transcribe` | cloud speech-to-text; off unless extra flags are set; not used by the current app build |
| POST | `/ai/speak` | cloud speech; off unless extra flags are set; not used by the current app build |

All five need a Bearer token (401 before the body is read). Bodies are capped at 12,000 bytes (900,000 for `/ai/transcribe`). They write only `ai_consents` and `ai_usage`. Setup: [docs/VOICE_AGENT_SETUP.md](../docs/VOICE_AGENT_SETUP.md).

The former offline-first `/api/v1/sync/*` route surface has been removed (the CI route check also fails if a `/sync` route reappears). The
mobile app is server-first and uses the normal REST endpoints above.

---

## Authentication

### Token flow

```
Client                                   Server
  │                                        │
  │  POST /auth/login                      │
  │  {identifier, password}                │
  ├───────────────────────────────────────►│
  │                                        │
  │  { access_token, refresh_token }       │
  │◄───────────────────────────────────────┤
  │                                        │
  │  GET /api/v1/items                     │
  │  Authorization: Bearer <access>        │
  ├───────────────────────────────────────►│
  │                                        │
  │  [items]                               │
  │◄───────────────────────────────────────┤
  │                                        │
  │  POST /auth/refresh (when access exp.) │
  │  { refresh_token }                     │
  ├───────────────────────────────────────►│
  │                                        │ ← rotates: old refresh is revoked
  │  { access_token, refresh_token }       │
  │◄───────────────────────────────────────┤
```

### Token config

| Setting | Default |
|---|---|
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 30 |
| `REFRESH_TOKEN_EXPIRE_DAYS` | 30 |
| `JWT_ALGORITHM` | `HS256` |

Refresh tokens are stored by `jti` in `refresh_tokens`; a refresh claims (revokes) the presented row with one conditional `UPDATE`, so two simultaneous refreshes with the same token yield one success and one 401. On the feature branch both tokens also carry `session_version`, which every authenticated request compares with `users.session_version`.

### Password reset token flow

Password reset uses an email-link token, but the raw token is never stored in
the database.

1. `POST /auth/forgot-password` generates a high-entropy raw token and stores
   `SHA-256(raw_token)` plus an expiry timestamp on the user row.
2. The reset email links to `/api/v1/auth/reset-password?token=<raw_token>`.
3. `GET /auth/reset-password` renders the browser form. The query token is
   escaped with `html.escape(token, quote=True)` and placed in a `data-token`
   attribute, not interpolated into inline JavaScript.
4. The page JavaScript reads `dataset.token` from the DOM and submits the same
   API body as before:

```json
{
  "token": "<raw_token>",
  "new_password": "<new password>"
}
```

5. `POST /auth/reset-password` hashes the submitted token, compares it with the
   stored hash, enforces expiry, updates the password, clears the reset token,
   and revokes all refresh tokens for the user (feature branch: it also bumps
   `session_version`, so existing access tokens stop working). A "password
   changed" notification email is sent in the background.

The important browser-safety boundary is that the URL token is untrusted input.
It must be treated as data. Escaping it into an HTML attribute prevents crafted
values containing quotes or `</script>` from breaking out of the page and
executing script, while keeping the public POST contract unchanged.

For users, the normal and malicious-token test URLs should look the same: both
render the reset-password form. The security difference is internal to the HTML
source and browser parsing. A malicious-looking token must not show an alert,
inject a second script tag, break the form, or appear as `token: '<raw token>'`
inside inline JavaScript.

### Security features

- **Argon2** password hashing via `passlib[argon2]` (bcrypt fallback for legacy hashes)
- **JWT HS256** with rotating refresh tokens
- **Session revoke on password change / reset / account delete** (refresh tokens; on the feature branch `session_version` also invalidates access tokens). Logout revokes only the refresh token.
- **Password reset XSS guard**: reset tokens are escaped into a DOM attribute and are never rendered raw inside inline JavaScript
- **slowapi** rate limits on five auth endpoints (see table above); best-effort, in memory per worker
- **Ownership checks**: every query filters on `user_id = current_user.id`; another user's record returns 404. No roles are in use.
- **Security headers** (`nosniff`, `DENY` framing, `X-XSS-Protection`, referrer policy, `Cache-Control: no-store`, HSTS in production) and `X-Request-ID` on responses that pass through the app middleware. The request ID is returned but not written to the application logs.
- **Config validators** refuse startup with the placeholder `SECRET_KEY` (in production on `main`; whenever `ENVIRONMENT` is not development/testing on the feature branch) or an empty `FRONTEND_URL` in production. `CORS_ORIGINS` is parsed, but wildcard production rejection remains decision-blocked until real browser/admin origins are configured. CORS only affects browsers; it does not restrict the Android app.

---

## Database schema

### Tables

```
users ──┬── categories ── items
        ├── orders ── order_items
        ├── refresh_tokens
        ├── activity_logs
        ├── audit_log
        ├── ai_consents            (feature branch)
        └── ai_usage               (feature branch)
order_number_counters              (feature branch; one row per UTC day, no user link)
```

At head (`0010`, feature branch) there are 11 application tables plus `alembic_version`. Every user-owned table has `ON DELETE CASCADE` on its `user_id` FK (`order_items` cascades through `orders.id`), so deleting a user leaves no orphans. `order_number_counters` is deliberately not user-linked and survives account deletion, so order numbers are never reused. `order_items.item_id` and the item/order ids in `activity_logs` are plain references without a foreign key, so order history survives item deletion. Primary keys are 36-character UUID strings (not the PostgreSQL `uuid` type). Status/action enums are stored as text holding upper-case enum names (for example `STOCK_UPDATED`), while the API returns lower-case values.

### Migrations (in order)

| # | File | Summary |
|---|---|---|
| 1 | `20260117_000000_initial.py` | users, categories, items, orders, order_items, refresh_tokens, activity_logs |
| 2 | `20260124_add_username.py` | `users.username` (unique, nullable) |
| 3 | `20260125_add_email_verification.py` | email verification columns |
| 4 | `20260406_add_version_audit_log_quantity_check.py` | `items.version` (OCC), `audit_log` table, CHECK `items.quantity >= 0` |
| 5 | `20260419_add_account_deletion_token_fields.py` | `users.deletion_token`, `deletion_token_expires` |
| 6 | `20260623_order_item_quantity_positive.py` | CHECK `order_items.quantity > 0` — head on `main` (`0006_order_item_qty_positive`) |
| 7 | `20260923_session_order_safety.py` | feature branch: `users.session_version`, `order_number_counters` (seeded from existing order ids), token-digest indexes. **One-way: `downgrade()` raises on purpose** |
| 8 | `20260924_ai_consent_usage.py` | feature branch: `ai_consents`, `ai_usage` |
| 9 | `20261006_ai_provider_scopes.py` | feature branch: `ai_consents.scopes`, `ai_usage.provider` |
| 10 | `20261006_order_local_id_unique.py` | feature branch: partial unique index on `orders (user_id, local_id)`; briefly blocks writes to `orders` while it runs; keeps any older duplicates — head `0010_order_local_id_unique` |

On the feature branch, migrations run in one transaction with `SET LOCAL lock_timeout = '30s'` and a PostgreSQL advisory lock (`alembic/env.py`), so two containers starting at once do not migrate concurrently; `main` has no such lock. Upgrading an empty PostgreSQL 16 database to `0010` succeeded locally on 7 Oct 2026 and again on 8 Oct 2026. Before upgrading any shared database past `0006`, take a restorable backup: see [docs/BACKEND_HARDENING.md](../docs/BACKEND_HARDENING.md).

---

## Environment variables

### Required
```env
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname    # postgres:// and postgresql:// auto-converted; query string stripped
SECRET_KEY=<min-32-chars-random>                                # placeholder rejected in production (main) / outside development+testing (feature branch)
```

TLS to the database is switched on in code whenever `ENVIRONMENT` is not `development` or `testing`. Every connection sets `statement_timeout = 8000` ms.

### Optional (defaults shown)
```env
ENVIRONMENT=development
DEBUG=False                                                     # True enables /docs, /redoc, /openapi.json
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=30
CORS_ORIGINS=*                                                  # accepted today; restrict only after real browser/admin origins are known
RATE_LIMIT_PER_MINUTE=60                                        # defined but not read by the limiter (per-route limits are in code)
RATE_LIMIT_BURST=10                                             # defined but not read by the limiter
DATABASE_POOL_SIZE=5                                            # per worker; 2 workers x (5 + 10 overflow) = up to 30 connections
DATABASE_MAX_OVERFLOW=10
MAIL_SERVER=sandbox.smtp.mailtrap.io                            # legacy SMTP-era key; current send path uses Brevo HTTP API
MAIL_USERNAME=
MAIL_PASSWORD=                                                  # Brevo API key; empty disables email
MAIL_FROM=noreply@carekosh.com
FRONTEND_URL=                                                   # required in production; empty becomes http://127.0.0.1:8000/api/v1/auth elsewhere
REQUIRE_EMAIL_VERIFICATION=False                                # enforced only when MAIL_PASSWORD is set; render.yaml sets true for production
EMAIL_VERIFICATION_EXPIRY_HOURS=24
PASSWORD_RESET_EXPIRY_HOURS=1
SENTRY_DSN=                                                     # optional; empty disables Sentry
```

AI settings (feature branch; all off or empty by default, and `render.yaml` sets none): `AI_ENABLED`, `AI_DATA_CONTROLS_REVIEWED`, `GROQ_API_KEY`, `GROQ_INTENT_MODEL` (default `openai/gpt-oss-20b`), `AI_TIMEOUT_SECONDS` (25), `AI_USER_DAILY_REQUESTS` (50), `AI_GLOBAL_DAILY_REQUESTS` (500), `AI_GLOBAL_CONCURRENCY` (4), budget/reservation values in micro-USD, plus transcription/speech flags. See `.env.example` and [docs/VOICE_AGENT_SETUP.md](../docs/VOICE_AGENT_SETUP.md). Keep provider keys on the server only; never in `EXPO_PUBLIC_*` variables.

---

## Development

### Tests

The suite drops and recreates tables, so it refuses to run unless `DATABASE_URL` points at a disposable PostgreSQL database whose name contains `test` or `pytest`, the URL does not look like staging/production/a cloud host, and `ENVIRONMENT` is not `staging` or `production`. These are the commands CI runs (feature branch):

```bash
export DATABASE_URL=postgresql+asyncpg://test:test@localhost:5432/test_db   # disposable database only
export SECRET_KEY=test-secret-key-for-local-testing-minimum-32-chars
export ENVIRONMENT=testing
pytest tests/ -q --migrated-schema --cov=app --cov-report=term-missing --cov-report=json
python scripts/check_api_routes.py --expected 44          # 39 on main
python scripts/check_file_coverage.py coverage.json --threshold 70 \
  --file app/api/v1/items.py \
  --file app/api/v1/orders.py
```

`--migrated-schema` builds each test schema through the Alembic chain instead of `create_all()`. On 7 Oct 2026, and again on 8 Oct 2026, this ran 242 tests (all passed, 88% coverage) on Python 3.12 and PostgreSQL 16. The limiter is disabled in tests.

### Lint / type check / format
```bash
ruff check app/ tests/ scripts/      # CI gate
mypy app/ --ignore-missing-imports   # advisory until the existing baseline is fixed (23 errors on 7 Oct 2026)
black app/                           # optional; not run in CI
```

### Migrations
```bash
alembic revision --autogenerate -m "description"
alembic upgrade head
alembic downgrade -1                 # works down to 0007 only: 0007's downgrade raises on purpose
alembic current
```

### Docker
```bash
docker compose -f docker-compose.dev.yml up --build -d
docker compose -f docker-compose.dev.yml logs -f api
docker compose -f docker-compose.dev.yml exec db psql -U postgres -d vitaltrack
docker compose -f docker-compose.dev.yml exec api alembic upgrade head
```

See [DOCKER_GUIDE.md](DOCKER_GUIDE.md) for Docker concepts walkthrough.

---

## Deployment

### Render (production + staging)

Production IaC: [`render.yaml`](render.yaml) (whether Render reads it as a Blueprint is NOT VERIFIED; service `vitaltrack-api`, Docker, region singapore, plan `starter`, branch `main`, health check `/live`, no `autoDeploy` key, no AI variables). The staging service is managed in Render outside this file.

On pushes to `main`, `.github/workflows/ci.yml` reruns the backend/frontend jobs and then `deploy-backend` calls the `RENDER_DEPLOY_HOOK` URL with `curl` when that secret is configured. Render's own GitHub auto-deploy may also rebuild services connected to `main` (dashboard setting, NOT VERIFIED).

- **Production:** `https://api.carekosh.com`
- **Staging:** `https://staging-api.carekosh.com`

Both are built from the same Dockerfile and differ in env vars (their own Neon database in `DATABASE_URL`, `FRONTEND_URL`, Brevo credentials, `SECRET_KEY`). They can also run different code: the owner reports that on 7 Oct 2026 staging was switched to the feature branch and deployed `b1c8dd7` (not independently verified), while `render.yaml` keeps production on `main`. `/health` and `/live` report the `APP_VERSION` setting (default `1.0.0`, never set from git), so they cannot tell you which commit is deployed; use Render's deploy history.

Render should use `/live` as the platform liveness check. `/health` is a readiness check that probes the database (2 s timeout) and returns `503` when the probe fails.

---

## API testing

See [API_TESTING_GUIDE.md](API_TESTING_GUIDE.md).

### Quick curl examples

```bash
# Readiness: probes the database
curl http://localhost:8000/health

# Liveness: process-only, no database probe
curl http://localhost:8000/live

# Register
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"Test User"}'

# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test@example.com","password":"Test123!"}'

# Authenticated request
curl http://localhost:8000/api/v1/items \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Replace `localhost:8000` with `https://staging-api.carekosh.com` or `https://api.carekosh.com` to hit deployed environments. Do not register test accounts on production; use staging with synthetic data.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Port 5432 in use | Stop local PostgreSQL or change host port in `docker-compose.dev.yml` |
| Database connection failed | Check `DATABASE_URL` format. URL-encode reserved password characters such as `@`; Alembic now handles percent-encoded URLs correctly (A-27 fixed locally) |
| JWT decode error / sudden 401s | Verify `SECRET_KEY` hasn't rotated; on the feature branch a password change or reset also invalidates that user's tokens (`session_version`) |
| Rate limit exceeded (429) | Wait for the window to pass. Limits are per worker process and reset on restart; the per-route limits are set in code (`RATE_LIMIT_PER_MINUTE` is not read). The server sends no `Retry-After` header |
| 409 on item update | OCC working as designed — re-fetch and retry (see `server_version` in response body) |
| `Can't locate revision 0010_…` at startup | The database was upgraded by the feature branch and older code (e.g. `main`) is running. `0007` cannot be downgraded: deploy the feature branch again or restore a backup |
| Render first request slow | Free-tier cold start (~30 s+ after 15 min idle) applies only to services on the free plan; `render.yaml` declares production on the paid `starter` plan (live plans NOT VERIFIED) |

---

For overall architecture, CI/CD, and full troubleshooting, see the [complete developer guide](../docs/CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md) (main onboarding entry) and the shorter repo-root [CAREKOSH_DEVELOPER_GUIDE.md](../CAREKOSH_DEVELOPER_GUIDE.md).
