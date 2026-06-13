# CareKosh Backend

> FastAPI backend for the CareKosh home-ICU medical inventory app.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python)](https://python.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://postgresql.org)
[![Hosted on Render](https://img.shields.io/badge/Hosted-Render-46e3b7?logo=render)](https://render.com)

> The directory name `vitaltrack-backend/` is legacy (CareKosh was formerly VitalTrack). Do not rename — Render service paths and `eas.json` references depend on it.

---

## Quick start

### Prerequisites
- Docker Desktop (running), OR Python 3.12+ with PostgreSQL 16

### With Docker (recommended)
```bash
cd vitaltrack-backend
cp .env.example .env                             # edit SECRET_KEY (min 32 chars)
docker compose -f docker-compose.dev.yml up --build -d
docker compose logs -f api
```

Alembic migrations run automatically via `docker-entrypoint.sh`. You don't run them manually.

### Without Docker
```bash
python -m venv venv
source venv/bin/activate                         # Windows: venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Verify
- Health: http://localhost:8000/health
- Swagger: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

## Project structure

```
vitaltrack-backend/
├── alembic/versions/            # 5 migrations (see below)
├── app/
│   ├── api/v1/
│   │   ├── auth.py              # 18 route objects incl. account deletion
│   │   ├── categories.py
│   │   ├── items.py             # CRUD + OCC (version field, 409 on conflict)
│   │   ├── orders.py            # CRUD + POST /{id}/apply
│   │   └── activity.py          # read-only audit/activity log
│   ├── core/
│   │   ├── config.py            # pydantic-settings, prod validators
│   │   ├── database.py          # async engine (asyncpg)
│   │   └── security.py          # JWT + Argon2
│   ├── models/                  # SQLAlchemy 2.0 async models
│   ├── schemas/                 # Pydantic I/O schemas
│   └── utils/
│       ├── email.py             # fastapi-mail (Mailtrap dev / Brevo prod)
│       └── rate_limiter.py      # slowapi
├── docker-compose.dev.yml
├── Dockerfile                   # multi-stage, non-root runtime user
├── docker-entrypoint.sh         # waits for DB, runs alembic, execs CMD
├── render.yaml                  # Render service spec
└── requirements.txt
```

---

## API endpoints

Counts: 18 auth, 6 categories, 8 items, 6 orders, 1 activity = 39 total.

### Auth (`/api/v1/auth`) — 18 endpoints

| Method | Path | Rate limit | Notes |
|---|---|---|---|
| POST | `/register` | 3/hr | email required |
| POST | `/login` | 5/min | returns access + refresh |
| GET | `/verify-email` | — | HTML response for email link |
| GET | `/verify-email/{token}` | — | JSON API variant |
| POST | `/resend-verification` | 3/hr | uniform response (no user enumeration) |
| POST | `/forgot-password` | 3/hr | sends reset email |
| GET | `/reset-password` | — | HTML form |
| POST | `/reset-password` | 5/hr | revokes all refresh tokens on success |
| POST | `/refresh` | — | rotates refresh token |
| POST | `/logout` | — | revokes refresh token |
| GET | `/me` | — | profile |
| PATCH | `/me` | — | update profile |
| **DELETE** | `/me` | — | request account deletion; sends confirmation email |
| GET | `/confirm-delete/{token}` | — | HTML confirmation page only |
| POST | `/confirm-delete/{token}` | — | final account deletion after form submit |
| POST | `/cancel-delete` | — | abort pending deletion |
| POST | `/change-password` | — | revokes all refresh tokens |
| GET | `/email-service-status` | — | authenticated diagnostic; raw provider errors masked |

### Categories (`/api/v1/categories`) — 6 endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/categories` | list (ordered by `display_order`) |
| GET | `/categories/with-counts` | list with item counts |
| GET | `/categories/{id}` | get one |
| POST | `/categories` | create |
| PUT | `/categories/{id}` | update |
| DELETE | `/categories/{id}` | delete (cascades items) |

`is_default` categories cannot be deleted through the backend API; custom categories can still be deleted and remain user-scoped.

### Items (`/api/v1/items`) — 8 endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/items` | pagination + filters: `categoryId`, `isActive`, `isCritical`, `lowStockOnly`, `outOfStockOnly`, `search` |
| GET | `/items/stats` | aggregate counts |
| GET | `/items/needs-attention` | low / out / expired |
| GET | `/items/{id}` | get one |
| POST | `/items` | create |
| PUT | `/items/{id}` | **OCC: returns 409 `{server_version, server_quantity}` on stale `version`** |
| PATCH | `/items/{id}/stock` | quick stock update (OCC-checked) |
| DELETE | `/items/{id}` | delete |

### Orders (`/api/v1/orders`) — 6 endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/orders` | pagination + status filter |
| GET | `/orders/{id}` | get one |
| POST | `/orders` | create |
| PATCH | `/orders/{id}/status` | `pending → ordered/declined → received → stock_updated` |
| POST | `/orders/{id}/apply` | apply a `received` order to inventory stock |
| DELETE | `/orders/{id}` | only `pending` / `declined` |

### Activity (`/api/v1/activities`) — 1 endpoint

| Method | Path | Description |
|---|---|---|
| GET | `/activities` | `limit` param (default 50, max 200) |

The former offline-first `/api/v1/sync/*` route surface has been removed. The
mobile app is server-first and uses the normal REST endpoints above.

---

## Authentication

### Token flow

```
Client                                   Server
  │                                        │
  │  POST /auth/login                      │
  │  {email/username, password}            │
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
   and revokes all refresh tokens for the user.

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
- **Session revoke on password change / reset / account delete**
- **Password reset XSS guard**: reset tokens are escaped into a DOM attribute and are never rendered raw inside inline JavaScript
- **slowapi** rate limits on auth endpoints (see table above)
- **Config validators** refuse production startup if `SECRET_KEY` is the placeholder or `FRONTEND_URL` is empty. `CORS_ORIGINS` is parsed, but wildcard production rejection remains decision-blocked until real browser/admin origins are configured.

---

## Database schema

### Tables

```
users ──┬── categories ── items
        ├── orders ── order_items
        ├── refresh_tokens
        ├── activity_logs
        └── audit_logs
```

Every child table has `ondelete="CASCADE"` on its `user_id` FK. `DELETE FROM users` leaves no orphans.

### Migrations (in order)

| # | File | Summary |
|---|---|---|
| 1 | `20260117_000000_initial.py` | users, categories, items, orders, order_items, refresh_tokens, activity_logs |
| 2 | `20260124_add_username.py` | `users.username` (unique, nullable) |
| 3 | `20260125_add_email_verification.py` | email verification columns |
| 4 | `20260406_add_version_audit_log_quantity_check.py` | `items.version` (OCC), `audit_logs` table, CHECK `items.quantity >= 0` |
| 5 | `20260419_add_account_deletion_token_fields.py` | `users.deletion_token`, `deletion_token_expires` |

---

## Environment variables

### Required
```env
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname    # postgresql:// auto-converted
SECRET_KEY=<min-32-chars-random>                                # prod rejects placeholder
```

### Optional (defaults shown)
```env
ENVIRONMENT=development
DEBUG=False
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=30
CORS_ORIGINS=*                                                  # accepted today; restrict only after real browser/admin origins are known
RATE_LIMIT_PER_MINUTE=60
RATE_LIMIT_BURST=10
MAIL_SERVER=sandbox.smtp.mailtrap.io                            # Brevo SMTP in prod
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_FROM=noreply@carekosh.com
FRONTEND_URL=                                                   # required in production
REQUIRE_EMAIL_VERIFICATION=False                                # True in production
EMAIL_VERIFICATION_EXPIRY_HOURS=24
PASSWORD_RESET_EXPIRY_HOURS=1
```

---

## Development

### Tests
```bash
pytest tests/ -q --cov=app --cov-report=term-missing --cov-report=json
python scripts/check_api_routes.py --expected 39
python scripts/check_file_coverage.py coverage.json --threshold 70 \
  --file app/api/v1/items.py \
  --file app/api/v1/orders.py
```

### Lint / type check / format
```bash
ruff check app/ tests/
mypy app/ --ignore-missing-imports   # advisory until the existing baseline is fixed
black app/
```

### Migrations
```bash
alembic revision --autogenerate -m "description"
alembic upgrade head
alembic downgrade -1
alembic current
```

### Docker
```bash
docker compose -f docker-compose.dev.yml up --build -d
docker compose -f docker-compose.dev.yml logs -f api
docker compose exec db psql -U postgres -d vitaltrack
docker compose exec api alembic upgrade head
```

See [DOCKER_GUIDE.md](DOCKER_GUIDE.md) for Docker concepts walkthrough.

---

## Deployment

### Render (production + staging)

Configuration: [`render.yaml`](render.yaml).

Backend auto-deploys on every push to `main` via the `deploy-backend` job in `.github/workflows/ci.yml`, which POSTs to a Render deploy hook (secret `RENDER_DEPLOY_HOOK`).

- **Production:** `https://vitaltrack-api.onrender.com`
- **Staging:** `https://vitaltrack-api-staging.onrender.com`

Both run the same container; they differ only in env vars (Neon branch for `DATABASE_URL`, `FRONTEND_URL`, Brevo credentials).

Render should use `/live` as the platform liveness check. `/health` is a readiness check that probes the database and returns `503` when the probe fails.

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

Replace `localhost:8000` with `https://vitaltrack-api-staging.onrender.com` or `https://vitaltrack-api.onrender.com` to hit deployed environments.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Port 5432 in use | Stop local PostgreSQL or change host port in `docker-compose.dev.yml` |
| Database connection failed | Check `DATABASE_URL` format; URL-encode passwords containing `@` |
| JWT decode error | Verify `SECRET_KEY` hasn't rotated |
| Rate limit exceeded | Wait, or raise `RATE_LIMIT_PER_MINUTE` / per-route limits |
| 409 on item update | OCC working as designed — re-fetch and retry (see `server_version` in response body) |
| Render first request slow | Free-tier cold start ~30 s after 15 min idle |

---

For overall architecture, CI/CD, and full troubleshooting, see the repo-root [CAREKOSH_DEVELOPER_GUIDE.md](../CAREKOSH_DEVELOPER_GUIDE.md).
