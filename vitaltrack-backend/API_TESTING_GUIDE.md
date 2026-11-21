# CareKosh API Testing Guide

Use these curl examples for a disposable development account. They show the bearer-token API used by Android. The web app signs in through the separate cookie-based web-auth routes. For a browser or Android stock edit, send the version originally opened with `PUT /api/v1/items/{item_id}`. A separate stock-only PATCH is available to API callers. Always read the latest returned version before the next edit. [Worked example and conflict recovery](../docs/deployment/CAREKOSH_DEPLOYMENT_ATLAS.html#stock-edit) · [Complete route inventory](../docs/API_TRACEABILITY.md).

> **8 October 2026 local feature update:** richer inventory tables, bounded queries and unsaved voice-prepared drafts are implemented locally. Only touch confirmation saves an order; saving does not change stock. Matching backend/mobile deployment and phone acceptance remain pending. [Current flow, code map and verification limits](../docs/VOICE_INVENTORY_AND_ORDER_DRAFTS.md). Earlier dated results remain historical.


> 8 October 2026 safety follow-up: targeted code fixes are local, tested changes after the earlier audit. Deployment and real-device acceptance remain separate. [Current changes and remaining scope](../docs/BACKEND_HARDENING.md#safety-follow-up-8-october-2026).

> **Status (7 October 2026):** request bodies and error formats re-checked against the schemas and handlers on branch `feature/backend-hardening-ai-voice-agent-foundation` (`03cfebb`); corrected examples are marked "(corrected 7 Oct 2026)". Re-checked on 8 October 2026 against the working tree (`03cfebb` plus uncommitted documentation); further notes are dated 8 Oct 2026. Every endpoint with its handler and tests is listed in [API traceability](../docs/API_TRACEABILITY.md); the main onboarding entry is the [complete developer guide](../docs/CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md). Which commit staging and production run is NOT VERIFIED, so features added on the feature branch (for example `/api/v1/ai/*` and order `localId`) may be missing there.

> curl recipes for the CareKosh backend. The same endpoints work against local, staging, and production — only the base URL changes. Do not create test accounts or data in production; use local Docker or staging.

| Environment | Base URL |
|---|---|
| Local | `http://localhost:8000` |
| Staging | `https://staging-api.carekosh.com` |
| Production | `https://api.carekosh.com` |

All examples below use `http://localhost:8000`. Substitute the base URL for staging/prod.

---

## Quick Start

### 1. Start Backend
```bash
cd vitaltrack-backend
docker compose -f docker-compose.dev.yml up --build -d
```

*(8 Oct 2026)* This compose file publishes PostgreSQL (user and password `postgres`) on port 5432 of every network interface, so use it only on a trusted network. Its development image starts the server even if `alembic upgrade head` failed, so check the container log for a migration error (`docker compose -f docker-compose.dev.yml logs api`).

### 2. Access Swagger UI
Open: http://localhost:8000/docs

Swagger, ReDoc and `/openapi.json` exist only when `DEBUG=true`. `docker-compose.dev.yml` sets it; staging and production should not, so `/docs` returns 404 there.

### 3. Get Auth Token
```bash
# Login and get token
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test@example.com","password":"Test123!"}'
```

---

## Authentication Endpoints

### Register New User
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "SecurePass123!",
    "name": "New User"
  }'
```

**Response (201, abridged — `user` has more fields):**
```json
{
  "access_token": "eyJhbGci...",
  "refresh_token": "eyJhbGci...",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": {
    "id": "uuid",
    "email": "newuser@example.com",
    "name": "New User"
  }
}
```

Password rules: 8–128 characters with at least one upper-case letter, one lower-case letter and one digit. Email is required; `username` is optional (3–50 characters, `a-z`, `0-9`, `_`; upper case is rejected with 422, not converted). Register is limited to 3 requests per hour (shared across hosted workers via Redis). The verification email is sent only when `MAIL_PASSWORD` is configured. The mobile app discards these tokens and sends the user to "Check your email"; when email verification is enforced, they cannot be used for other requests until the email is verified.

### Login
```bash
# Login with email
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "test@example.com",
    "password": "Test123!"
  }'

# Login with username
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "testuser",
    "password": "Test123!"
  }'
```

### Refresh Token
```bash
curl -X POST http://localhost:8000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "YOUR_REFRESH_TOKEN"
  }'
```

### Get Current User
```bash
curl http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Logout
```bash
curl -X POST http://localhost:8000/api/v1/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "YOUR_REFRESH_TOKEN"
  }'
```

Logout revokes that refresh token. The access token keeps working until it expires (at most 30 minutes). Refreshing with an already-used refresh token returns 401.

---

## Categories Endpoints

### List All Categories
```bash
curl http://localhost:8000/api/v1/categories \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Create Category
```bash
curl -X POST http://localhost:8000/api/v1/categories \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Medications",
    "description": "All medications and pills"
  }'
```

Category bodies use snake_case keys (`display_order`, `is_default`); camelCase keys are silently ignored. A name that matches an existing one case-insensitively returns 409. *(8 Oct 2026)* A name made only of spaces or HTML tags is currently accepted and stored empty (known issue A-24 in [API traceability](../docs/API_TRACEABILITY.md#known-application-issues-found-while-tracing)).

### Get Single Category
```bash
curl http://localhost:8000/api/v1/categories/CATEGORY_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Update Category
```bash
curl -X PUT http://localhost:8000/api/v1/categories/CATEGORY_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Name",
    "description": "Updated description"
  }'
```

### Delete Category
```bash
curl -X DELETE http://localhost:8000/api/v1/categories/CATEGORY_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

This also deletes **every item in the category**. The mobile app refuses to delete a category that still has items; the API does not. Only categories with `is_default=true` are protected (409).

---

## Items Endpoints

### List All Items
```bash
# Get all items
curl http://localhost:8000/api/v1/items \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Filter by category
curl "http://localhost:8000/api/v1/items?categoryId=CATEGORY_ID" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Filter by low stock
curl "http://localhost:8000/api/v1/items?lowStockOnly=true" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Other filters
curl "http://localhost:8000/api/v1/items?isCritical=true&outOfStockOnly=false&isActive=true&search=mask" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Each call returns one page: `page` 1 and `pageSize` 50 by default (maximum 100), plus `total`. Without `isActive`, inactive items are included.

### Create Item
```bash
curl -X POST http://localhost:8000/api/v1/items \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryId": "CATEGORY_ID",
    "name": "Oxygen Mask",
    "quantity": 10,
    "unit": "pieces",
    "minimumStock": 5,
    "isCritical": true
  }'
```

### Get Single Item
```bash
curl http://localhost:8000/api/v1/items/ITEM_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Update Item
```bash
curl -X PUT http://localhost:8000/api/v1/items/ITEM_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Name",
    "quantity": 15,
    "version": 1
  }'
```

(Corrected 7 Oct 2026: `version` is required; without it the request fails with 422.) Send the `version` you last read. New items start at version 1, and every successful update adds 1. A stale version returns 409 with `server_version` and `server_quantity`. Optional fields you send as `null` are cleared; fields you leave out are unchanged; required fields such as `name` or `quantity` ignore `null`.

### Update Stock Only
```bash
curl -X PATCH http://localhost:8000/api/v1/items/ITEM_ID/stock \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 20,
    "version": 1
  }'
```

`quantity` is the new absolute value, not a change. The mobile app never calls this route; it changes quantities through `PUT`.

### Delete Item
```bash
curl -X DELETE http://localhost:8000/api/v1/items/ITEM_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get Item Statistics
```bash
curl http://localhost:8000/api/v1/items/stats \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Response:**
```json
{
  "totalItems": 32,
  "totalCategories": 10,
  "outOfStockCount": 2,
  "lowStockCount": 5,
  "criticalItems": 8,
  "pendingOrdersCount": 3
}
```

`pendingOrdersCount` counts orders in `pending` or `received` only. The mobile dashboard does not call this route; it computes its own counts on the phone with slightly different rules, so the numbers can differ from the app.

---

## Orders Endpoints

### List All Orders
```bash
curl http://localhost:8000/api/v1/orders \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Returns one page, newest first (`pageSize` 20 by default, maximum 100), with `total`, `page`, `pageSize` and `hasMore`.

### Create Order
```bash
curl -X POST http://localhost:8000/api/v1/orders \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "client-ref-1",
    "localId": "12fbb8cf-5849-4d78-8da3-7c351284b21f",
    "items": [
      {
        "itemId": "ITEM_ID_1",
        "name": "Oxygen Mask",
        "quantity": 10
      },
      {
        "itemId": "ITEM_ID_2",
        "name": "Suction Catheter",
        "quantity": 5
      }
    ]
  }'
```

(Corrected 7 Oct 2026: the earlier example omitted `orderId` and each line's `name`, which the schema requires, so it returned 422.) Notes:
- `orderId` must be present but is ignored; the server assigns the public number `ORD-YYYYMMDD-NNNN`. Client totals, `status` and timestamps are ignored too; the server computes totals.
- Each line needs `itemId` (an item you own, else 400), `name` and `quantity` (1–999,999); 1–1,000 lines. Snapshot fields (`brand`, `unit`, `currentStock`, `minimumStock`, `supplierName`, `purchaseLink`, `imageUri`) are stored as sent. `categoryName`, `isEssential` and line `notes` are accepted but not stored.
- `localId` (optional, 1–36 characters) identifies a submission for this account. A retry with matching notes and stored line fields returns 200 with the saved order. Reusing it with different stored fields returns 409. Generate a UUID for each new submission and retain it across retries. After an uncertain response, look it up with `GET /api/v1/orders/submission/{local_id}`. The recovery endpoints require a UUID. Without a key, each successful create request creates an order.
- Order numbers use the UTC date and one daily counter shared by all accounts, so one account's numbers have gaps.

### Get Single Order
```bash
curl http://localhost:8000/api/v1/orders/ORDER_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

`ORDER_ID` can be the UUID or the public `ORD-YYYYMMDD-NNNN` id.

### Update Order Status
```bash
curl -X PATCH http://localhost:8000/api/v1/orders/ORDER_ID/status \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "ordered"
  }'
```

**Valid statuses:**
- `pending` - Order created
- `ordered` - Order placed with supplier
- `partially_received` - Some ordered items received
- `declined` - Order cancelled
- `received` - All items received
- `stock_updated` - Received order applied to inventory (via `POST /orders/{id}/apply`)

Status flow:
- `pending → ordered / received / declined`
- `ordered → partially_received / received / declined`
- `partially_received → received / declined`
- `received → declined` before stock is applied
- `received → stock_updated` only through `POST /orders/{id}/apply`

Setting the same status again returns 200 and changes nothing; an illegal transition returns 400; a concurrent change returns 409. `partially_received` stores no per-line quantities. The mobile app offers only pending → received and "Update Stock" (apply); the other transitions are API-only.

### Apply Order to Stock
```bash
curl -X POST http://localhost:8000/api/v1/orders/ORDER_ID/apply \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Only a `received` order can be applied. Each line adds its full ordered quantity to the item and bumps the item's `version`, all in one transaction. If any referenced item was deleted, the response is 409 listing the missing names and nothing changes. Repeating apply on an applied order returns 200 with the applied order. The retry does not add stock again. An initial apply from an ineligible status returns 400.

### Delete Order
```bash
curl -X DELETE http://localhost:8000/api/v1/orders/ORDER_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Only pending and declined orders can be deleted. Other statuses return 400. The per-day sequence allocates order numbers independently of later deletions.

---

## Account Deletion (PR #13)

Play Store–compliant two-step deletion flow.

### Step 1: Request deletion (authenticated)
```bash
curl -X DELETE http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```
Response: `{"message": "A confirmation email has been sent. Please check your inbox and open the link to review and confirm account deletion. The link expires in 24 hours.", "success": true}`. Server generates a random token, stores only its SHA-256 digest in `deletion_token` (24 h TTL) and emails a confirmation link. Returns 400 if the account has no email and 503 if email is not configured (`MAIL_PASSWORD` empty), so this flow cannot be completed on a local stack without a Brevo key.

### Step 2a: Open email confirmation page
```bash
curl http://localhost:8000/api/v1/auth/confirm-delete/DELETION_TOKEN
```
HTML confirmation page rendered. No data is deleted on GET.

### Step 2b: Submit final confirmation
```bash
curl -X POST http://localhost:8000/api/v1/auth/confirm-delete/DELETION_TOKEN
```
HTML success page rendered. User row is deleted; CASCADE unwinds categories, items, orders, order_items, activity_logs, refresh_tokens, audit_log (feature branch: also ai_consents and ai_usage). `order_number_counters` are kept.

### Step 2c (alternative): Cancel pending deletion
```bash
curl -X POST http://localhost:8000/api/v1/auth/cancel-delete \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

The mobile app has no cancel button, so this curl call is the way to test cancellation.

---

## Removed Legacy Sync Endpoints

The pre-server-first `/api/v1/sync/*` routes were removed in the backend production-guard work. The mobile app no longer has `sync.ts`, `useSyncStore`, or an offline mutation queue. Do not test or build against `/api/v1/sync/push`, `/api/v1/sync/pull`, or `/api/v1/sync/full`; they should return 404 in the current backend.

`localId` / `local_id` fields may still appear in schemas and records as compatibility metadata, but they are not a sync contract.

---

## Health Check

```bash
curl http://localhost:8000/health
```

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "environment": "development",
  "database": "connected",
  "timestamp": "2026-..."
}
```

`/health` is the DB-backed readiness endpoint and returns 503 when the database probe fails. `/live` is the process-only liveness endpoint (the health-check path in `render.yaml`; the live Render setting is NOT VERIFIED) and returns `"database": "not_checked"`. Neither reports the deployed commit: `version` is the `APP_VERSION` setting (default 1.0.0).

---

## Error Responses

(Corrected 7 Oct 2026 against `app/main.py`, `app/api/deps.py` and slowapi 0.1.9: the earlier 403, 422 and 429 examples did not match the code.)

### 400 Bad Request
```json
{
  "detail": "Email already registered"
}
```

### 401 Unauthorized
```json
{
  "detail": "Invalid or expired token"
}
```

Other 401 details include `"Not authenticated"` (no token) and `"Incorrect email/username or password"` (login).

### 403 Forbidden
```json
{
  "detail": "EMAIL_NOT_VERIFIED"
}
```

Also `"User account is disabled"` for an inactive account. No route uses roles, so a "not enough permissions" style 403 does not occur. Another user's record returns 404, not 403.

### 404 Not Found
```json
{
  "detail": "Item not found"
}
```

### 409 Conflict
Item version conflict (`PUT /items/{id}`, `PATCH /items/{id}/stock`):
```json
{
  "error": "Version conflict",
  "message": "…",
  "server_version": 3,
  "server_quantity": 12
}
```

A database uniqueness race (for example two simultaneous registrations with the same email) is answered by a generic handler:
```json
{
  "detail": "A conflict occurred. Please try again.",
  "timestamp": "2026-..."
}
```

### 422 Validation Error
The app replaces FastAPI's default body with this shape:
```json
{
  "error": "Validation Error",
  "message": "Request validation failed",
  "details": [
    {
      "field": "body.email",
      "message": "value is not a valid email address: …",
      "code": "value_error"
    }
  ],
  "timestamp": "2026-..."
}
```

### 429 Rate Limit
The application’s rate-limit handler returns 429 and includes a `Retry-After` header.
```json
{
  "error": "Rate limit exceeded: 5 per 1 minute"
}
```

### 500 Internal Server Error
```json
{
  "detail": "An unexpected error occurred. Please try again.",
  "timestamp": "2026-..."
}
```

These 500 responses are produced outside the app's middleware, so they come without `X-Request-ID` and the security headers.

---

## Testing Flow

### Complete Test Sequence

```bash
# 1. Health check
curl http://localhost:8000/health

# 2. Register user
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"Test"}' \
  | jq -r '.access_token')

# 3. Create category
CAT_ID=$(curl -s -X POST http://localhost:8000/api/v1/categories \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Equipment"}' \
  | jq -r '.id')

# 4. Create item
ITEM_ID=$(curl -s -X POST http://localhost:8000/api/v1/items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"categoryId\":\"$CAT_ID\",\"name\":\"Oxygen Mask\",\"quantity\":10,\"minimumStock\":5}" \
  | jq -r '.id')

# 5. Update stock
curl -X PUT http://localhost:8000/api/v1/items/$ITEM_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"quantity":15,"version":1}'

# 6. Get stats
curl http://localhost:8000/api/v1/items/stats \
  -H "Authorization: Bearer $TOKEN"

# 7. Fetch activity log
curl "http://localhost:8000/api/v1/activities?limit=10" \
  -H "Authorization: Bearer $TOKEN"

echo "Sequence finished - check each response above (curl does not fail on HTTP errors)"
```

This flow uses the token returned by `/register`. That works on a local stack without `MAIL_PASSWORD`. Running it a second time needs a different email (the same one returns 400 and `TOKEN` becomes `null`), and registration is limited to 3 per hour for the configured rate-limit key. If email verification is enforced (with `REQUIRE_EMAIL_VERIFICATION=true` and `MAIL_PASSWORD` set), verify the email and log in first. (The earlier ending, `echo "All tests passed!"`, printed success regardless of the responses.)

---

## Postman Collection

Import this JSON into Postman as a starter collection (URLs only: add the `Authorization: Bearer {{token}}` header and request bodies yourself; it covers only some endpoints):

```json
{
  "info": {
    "name": "CareKosh API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {"key": "baseUrl", "value": "http://localhost:8000"},
    {"key": "token", "value": ""}
  ],
  "item": [
    {
      "name": "Auth",
      "item": [
        {"name": "Register", "request": {"method": "POST", "url": "{{baseUrl}}/api/v1/auth/register"}},
        {"name": "Login", "request": {"method": "POST", "url": "{{baseUrl}}/api/v1/auth/login"}},
        {"name": "Me", "request": {"method": "GET", "url": "{{baseUrl}}/api/v1/auth/me"}},
        {"name": "Delete Account", "request": {"method": "DELETE", "url": "{{baseUrl}}/api/v1/auth/me"}}
      ]
    },
    {
      "name": "Items",
      "item": [
        {"name": "List", "request": {"method": "GET", "url": "{{baseUrl}}/api/v1/items"}},
        {"name": "Create", "request": {"method": "POST", "url": "{{baseUrl}}/api/v1/items"}},
        {"name": "Stats", "request": {"method": "GET", "url": "{{baseUrl}}/api/v1/items/stats"}},
        {"name": "Needs Attention", "request": {"method": "GET", "url": "{{baseUrl}}/api/v1/items/needs-attention"}}
      ]
    },
    {
      "name": "Orders",
      "item": [
        {"name": "List", "request": {"method": "GET", "url": "{{baseUrl}}/api/v1/orders"}},
        {"name": "Apply to Stock", "request": {"method": "POST", "url": "{{baseUrl}}/api/v1/orders/:id/apply"}}
      ]
    }
  ]
}
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| 401 on all requests | Access token expired (30 min), `SECRET_KEY` rotated, or (feature branch) password changed/reset, which invalidates existing tokens. Logout alone does not invalidate the access token | Login again to get new token |
| 403 `EMAIL_NOT_VERIFIED` | Verification enforced and email not verified | Verify via the emailed link, or test locally without `MAIL_PASSWORD` |
| Connection refused | Backend not running | Start Docker containers |
| 422 Validation error | Invalid request body | Check required fields (`version` on item updates; `orderId` and line `name` on orders) and the `details` list |
| 409 on item update | Stale `version` | Re-read the item and send the new `version` |
| 413 | Body too large (feature branch only: 2 MB cap for normal routes, 12 KB for AI JSON routes) | Send a smaller request |
| 429 Rate limit exceeded | Too many auth requests | Honor Retry-After. Hosted workers use shared Redis storage |
| 503 on forgot-password / resend / delete account | Email not configured (`MAIL_PASSWORD` empty) | Expected locally without a Brevo key |
