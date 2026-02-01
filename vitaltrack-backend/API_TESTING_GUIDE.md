# API Testing Guide

> Complete guide for testing VitalTrack API endpoints.

---

## Quick Start

### 1. Start Backend
```bash
cd vitaltrack-backend
docker-compose -f docker-compose.dev.yml up --build
```

### 2. Access Swagger UI
Open: http://localhost:8000/docs

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

**Response:**
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

---

## Items Endpoints

### List All Items
```bash
# Get all items
curl http://localhost:8000/api/v1/items \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Filter by category
curl "http://localhost:8000/api/v1/items?category_id=CATEGORY_ID" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Filter by low stock
curl "http://localhost:8000/api/v1/items?low_stock=true" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Create Item
```bash
curl -X POST http://localhost:8000/api/v1/items \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "category_id": "CATEGORY_ID",
    "name": "Oxygen Mask",
    "quantity": 10,
    "unit": "pieces",
    "minimum_stock": 5,
    "is_critical": true
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
    "quantity": 15
  }'
```

### Update Stock Only
```bash
curl -X PATCH http://localhost:8000/api/v1/items/ITEM_ID/stock \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 20
  }'
```

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
  "total_items": 32,
  "total_categories": 10,
  "low_stock_count": 5,
  "out_of_stock_count": 2,
  "critical_items_count": 8
}
```

---

## Orders Endpoints

### List All Orders
```bash
curl http://localhost:8000/api/v1/orders \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Create Order
```bash
curl -X POST http://localhost:8000/api/v1/orders \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "item_id": "ITEM_ID_1",
        "quantity": 10
      },
      {
        "item_id": "ITEM_ID_2",
        "quantity": 5
      }
    ]
  }'
```

### Get Single Order
```bash
curl http://localhost:8000/api/v1/orders/ORDER_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

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
- `partially_received` - Some items received
- `received` - All items received
- `stock_updated` - Stock levels updated
- `declined` - Order cancelled

### Apply Order to Stock
```bash
curl -X POST http://localhost:8000/api/v1/orders/ORDER_ID/apply \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Delete Order
```bash
curl -X DELETE http://localhost:8000/api/v1/orders/ORDER_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Sync Endpoints

### Push Local Changes
```bash
curl -X POST http://localhost:8000/api/v1/sync/push \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {
        "id": "op_123",
        "type": "create",
        "entity": "item",
        "entityId": "local-uuid",
        "localId": "local-uuid",
        "data": {
          "name": "New Item",
          "quantity": 10,
          "categoryId": "cat-uuid"
        },
        "timestamp": "2026-01-27T10:00:00Z"
      }
    ],
    "lastSyncAt": null
  }'
```

**Response:**
```json
{
  "results": [
    {
      "operationId": "op_123",
      "success": true,
      "entityId": "local-uuid",
      "serverId": "server-uuid"
    }
  ],
  "serverTime": "2026-01-27T10:00:05Z",
  "successCount": 1,
  "errorCount": 0
}
```

### Pull Server Changes
```bash
curl -X POST http://localhost:8000/api/v1/sync/pull \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "lastSyncAt": null,
    "includeDeleted": true
  }'
```

**Response:**
```json
{
  "categories": [...],
  "items": [...],
  "orders": [...],
  "deletedIds": [],
  "serverTime": "2026-01-27T10:00:05Z",
  "hasMore": false
}
```

### Full Sync (Push + Pull)
```bash
curl -X POST http://localhost:8000/api/v1/sync/full \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [...],
    "lastSyncAt": null,
    "includeDeleted": true
  }'
```

---

## Health Check

```bash
curl http://localhost:8000/health
```

**Response:**
```json
{
  "status": "healthy"
}
```

---

## Error Responses

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

### 403 Forbidden
```json
{
  "detail": "Not enough permissions"
}
```

### 404 Not Found
```json
{
  "detail": "Item not found"
}
```

### 422 Validation Error
```json
{
  "detail": [
    {
      "loc": ["body", "email"],
      "msg": "value is not a valid email address",
      "type": "value_error.email"
    }
  ]
}
```

### 429 Rate Limit
```json
{
  "detail": "Rate limit exceeded. Try again in 60 seconds."
}
```

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
  -d "{\"category_id\":\"$CAT_ID\",\"name\":\"Oxygen Mask\",\"quantity\":10,\"minimum_stock\":5}" \
  | jq -r '.id')

# 5. Update stock
curl -X PATCH http://localhost:8000/api/v1/items/$ITEM_ID/stock \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"quantity":15}'

# 6. Get stats
curl http://localhost:8000/api/v1/items/stats \
  -H "Authorization: Bearer $TOKEN"

# 7. Sync pull
curl -X POST http://localhost:8000/api/v1/sync/pull \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"lastSyncAt":null}'

echo "All tests passed!"
```

---

## Postman Collection

Import this JSON into Postman for a complete collection:

```json
{
  "info": {
    "name": "VitalTrack API",
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
        {"name": "Me", "request": {"method": "GET", "url": "{{baseUrl}}/api/v1/auth/me"}}
      ]
    },
    {
      "name": "Items",
      "item": [
        {"name": "List", "request": {"method": "GET", "url": "{{baseUrl}}/api/v1/items"}},
        {"name": "Create", "request": {"method": "POST", "url": "{{baseUrl}}/api/v1/items"}},
        {"name": "Stats", "request": {"method": "GET", "url": "{{baseUrl}}/api/v1/items/stats"}}
      ]
    },
    {
      "name": "Sync",
      "item": [
        {"name": "Push", "request": {"method": "POST", "url": "{{baseUrl}}/api/v1/sync/push"}},
        {"name": "Pull", "request": {"method": "POST", "url": "{{baseUrl}}/api/v1/sync/pull"}}
      ]
    }
  ]
}
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| 401 on all requests | Token expired | Login again to get new token |
| Connection refused | Backend not running | Start Docker containers |
| 422 Validation error | Invalid request body | Check required fields |
| Rate limit exceeded | Too many requests | Wait and retry |
