# 🧪 VitalTrack API Testing Guide

**A complete, step-by-step guide to test all API endpoints**  
**Version:** 2.1.0 | **Updated:** January 26, 2026

---

## 📋 Table of Contents

| # | Section | Description |
|---|---------|-------------|
| 1 | [Quick Start](#1-quick-start) | Get the API running in 2 minutes |
| 2 | [Understanding the API](#2-understanding-the-api) | How authentication and requests work |
| 3 | [Authentication Endpoints](#3-authentication-endpoints) | Register, Login, Email Verification, Password Reset |
| 4 | [Categories Endpoints](#4-categories-endpoints) | CRUD operations for categories |
| 5 | [Items Endpoints](#5-items-endpoints) | CRUD operations for inventory items |
| 6 | [Orders Endpoints](#6-orders-endpoints) | Order creation and lifecycle |
| 7 | [Sync Endpoints](#7-sync-endpoints) | Offline sync operations |
| 8 | [Complete Testing Walkthrough](#8-complete-testing-walkthrough) | Full workflow from registration to order |
| 9 | [Troubleshooting](#9-troubleshooting) | Common issues and solutions |

---

# 1. Quick Start

## 1.1 Prerequisites

- ✅ Docker Desktop installed and running
- ✅ Project cloned to your machine

## 1.2 Start the API (Docker Method - Recommended)

Open PowerShell/Terminal and run:

```powershell
# Step 1: Navigate to project folder
cd d:\rd_projects_yt\mobile_app_chai_yt\android_home_icu\first_claude_draft\backedn_claude_1\vitaltrack-backend

# Step 2: Build and start containers (IMPORTANT: use --build to include code changes)
docker-compose up -d --build

# Step 3: Wait 10 seconds, then run database migrations
docker-compose exec api alembic upgrade head

# Step 4: Verify API is running
docker-compose ps
```

**Expected output:**
```
NAME             STATUS          PORTS
vitaltrack-api   Up (healthy)    0.0.0.0:8000->8000/tcp
vitaltrack-db    Up (healthy)    0.0.0.0:5432->5432/tcp
```

## 1.3 Access the API

| Interface | URL | Description |
|-----------|-----|-------------|
| **Swagger UI** | http://localhost:8000/docs | Interactive API testing (USE THIS!) |
| **ReDoc** | http://localhost:8000/redoc | Read-only documentation |
| **Health Check** | http://localhost:8000/health | Verify API is working |

## 1.4 Important Notes

> ⚠️ **After making code changes:** Always run `docker-compose up -d --build` to rebuild the container with new code.

> ⚠️ **Alembic command not found?** Run migrations inside Docker: `docker-compose exec api alembic upgrade head`

---

# 2. Understanding the API

## 2.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     HOW AUTHENTICATION WORKS                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. REGISTER or LOGIN                                           │
│     ↓                                                            │
│  2. Receive TWO tokens:                                          │
│     • access_token  (expires in 30 minutes)                     │
│     • refresh_token (expires in 30 days)                        │
│     ↓                                                            │
│  3. Use access_token in ALL protected requests:                 │
│     Header: "Authorization: Bearer YOUR_ACCESS_TOKEN"           │
│     ↓                                                            │
│  4. When access_token expires, use refresh_token to get new one │
│     ↓                                                            │
│  5. LOGOUT revokes the refresh_token                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 2.2 How to Use Swagger UI

1. Open http://localhost:8000/docs
2. **Register** or **Login** to get your access_token
3. Click the green **"Authorize"** button (top right)
4. Enter: `Bearer YOUR_ACCESS_TOKEN_HERE` (include the word "Bearer")
5. Click **"Authorize"** then **"Close"**
6. Now all protected endpoints (🔒) will work!

## 2.3 Rate Limiting Explained

Some endpoints have rate limits to prevent abuse:

| Endpoint | Limit | Meaning |
|----------|-------|---------|
| `/auth/register` | 3/hour | Max 3 registrations per hour per IP |
| `/auth/login` | 5/minute | Max 5 login attempts per minute per IP |
| `/auth/forgot-password` | 3/hour | Max 3 password reset requests per hour |
| `/auth/reset-password` | 5/hour | Max 5 reset attempts per hour |
| `/auth/resend-verification` | 3/hour | Max 3 resend requests per hour |

**When exceeded:** Returns `429 Too Many Requests` - wait and try again.

---

# 3. Authentication Endpoints

## 3.1 Register New User

```
POST /api/v1/auth/register
🔓 Public | Rate Limit: 3 per hour
```

**Request Body (with email):**
```json
{
  "email": "doctor@hospital.com",
  "password": "SecurePass123",
  "name": "Dr. Smith",
  "phone": "+1234567890"
}
```

**Request Body (with username - alternative):**
```json
{
  "username": "dr_smith",
  "password": "SecurePass123",
  "name": "Dr. Smith"
}
```

**Password Requirements:**
- Minimum 8 characters
- At least 1 uppercase letter (A-Z)
- At least 1 lowercase letter (a-z)
- At least 1 digit (0-9)

**Response (201 Created):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "doctor@hospital.com",
    "username": null,
    "name": "Dr. Smith",
    "phone": "+1234567890",
    "is_active": true,
    "is_verified": false,
    "is_email_verified": false,
    "created_at": "2026-01-26T00:00:00.000Z",
    "updated_at": "2026-01-26T00:00:00.000Z",
    "last_login": null
  }
}
```

> 📧 **Email Verification:** If email is configured, a verification email is sent. Otherwise, check the Docker logs for the verification token: `docker-compose logs api`

---

## 3.2 Login

```
POST /api/v1/auth/login
🔓 Public | Rate Limit: 5 per minute
```

**Request Body:**
```json
{
  "identifier": "doctor@hospital.com",
  "password": "SecurePass123"
}
```

> **Tip:** The `identifier` field accepts EITHER email OR username. The system auto-detects based on whether it contains "@".

**Response (200 OK):** Same as register response.

**Errors:**
| Code | Meaning |
|------|---------|
| 401 | Wrong email/username or password |
| 403 | Account is disabled |
| 429 | Too many attempts, wait 1 minute |

---

## 3.3 Email Verification

### Verify Email (Click Link from Email)

```
GET /api/v1/auth/verify-email/{token}
🔓 Public
```

**Example:**
```
GET http://localhost:8000/api/v1/auth/verify-email/abc123xyz456def789
```

**Response (200 OK):**
```json
{
  "message": "Email verified successfully! You can now log in.",
  "is_verified": true
}
```

### Resend Verification Email

```
POST /api/v1/auth/resend-verification
🔓 Public | Rate Limit: 3 per hour
```

**Request Body:**
```json
{
  "email": "doctor@hospital.com"
}
```

**Response (200 OK):**
```json
{
  "message": "If an account exists with this email, a verification link will be sent.",
  "success": true
}
```

> 🔒 **Security:** Always returns success (even if email doesn't exist) to prevent attackers from discovering valid emails.

---

## 3.4 Password Reset

### Step 1: Request Reset Link

```
POST /api/v1/auth/forgot-password
🔓 Public | Rate Limit: 3 per hour
```

**Request Body:**
```json
{
  "email": "doctor@hospital.com"
}
```

**Response (200 OK):**
```json
{
  "message": "If an account exists with this email, a password reset link will be sent.",
  "success": true
}
```

> 📧 **Where's the token?** Check Docker logs: `docker-compose logs api | grep "Reset token"`

### Step 2: Reset Password

```
POST /api/v1/auth/reset-password
🔓 Public | Rate Limit: 5 per hour
```

**Request Body:**
```json
{
  "token": "THE_TOKEN_FROM_EMAIL_OR_LOGS",
  "new_password": "NewSecurePass456"
}
```

**Response (200 OK):**
```json
{
  "message": "Password reset successfully! Please log in with your new password.",
  "success": true
}
```

> ⚠️ **Security:** After password reset, ALL existing sessions are revoked. User must log in again on all devices.

---

## 3.5 Token Management

### Refresh Access Token

```
POST /api/v1/auth/refresh
🔓 Public
```

Use this when your access_token expires (after 30 minutes).

**Request Body:**
```json
{
  "refresh_token": "YOUR_REFRESH_TOKEN"
}
```

**Response:** New access_token and refresh_token (old refresh_token is invalidated).

### Logout

```
POST /api/v1/auth/logout
🔐 Requires Authentication
```

**Request Body:**
```json
{
  "refresh_token": "YOUR_REFRESH_TOKEN"
}
```

---

## 3.6 User Profile

### Get My Profile

```
GET /api/v1/auth/me
🔐 Requires Authentication
```

### Update My Profile

```
PATCH /api/v1/auth/me
🔐 Requires Authentication
```

**Request Body (all fields optional):**
```json
{
  "name": "Dr. John Smith",
  "phone": "+1987654321"
}
```

### Change Password

```
POST /api/v1/auth/change-password
🔐 Requires Authentication
```

**Request Body:**
```json
{
  "current_password": "OldPassword123",
  "new_password": "NewPassword456"
}
```

---

# 4. Categories Endpoints

All category endpoints require authentication (🔐).

## 4.1 List Categories

```
GET /api/v1/categories
```

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "ICU Supplies",
      "description": "Critical care equipment",
      "displayOrder": 1,
      "isDefault": false,
      "createdAt": "2026-01-26T00:00:00.000Z",
      "updatedAt": "2026-01-26T00:00:00.000Z"
    }
  ],
  "total": 1
}
```

## 4.2 List Categories with Item Counts

```
GET /api/v1/categories/with-counts
```

Same as above but includes `itemCount` for each category.

## 4.3 Create Category

```
POST /api/v1/categories
```

**Request Body:**
```json
{
  "name": "ICU Supplies",
  "description": "Critical care equipment",
  "displayOrder": 1
}
```

## 4.4 Get Single Category

```
GET /api/v1/categories/{category_id}
```

## 4.5 Update Category

```
PUT /api/v1/categories/{category_id}
```

## 4.6 Delete Category

```
DELETE /api/v1/categories/{category_id}
```

---

# 5. Items Endpoints

All item endpoints require authentication (🔐).

## 5.1 List Items

```
GET /api/v1/items
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `category_id` | UUID | Filter by category |
| `search` | string | Search in name/brand |
| `is_active` | boolean | Filter active items |
| `is_critical` | boolean | Filter critical items |
| `low_stock` | boolean | Filter items below minimum |
| `page` | integer | Page number (default: 1) |
| `page_size` | integer | Items per page (default: 50) |

**Example:**
```
GET /api/v1/items?low_stock=true&is_critical=true&page=1
```

## 5.2 Get Item Statistics

```
GET /api/v1/items/stats
```

**Response:**
```json
{
  "totalItems": 150,
  "outOfStockCount": 5,
  "lowStockCount": 12,
  "criticalItems": 8
}
```

## 5.3 Get Items Needing Attention

```
GET /api/v1/items/needs-attention
```

Returns items that are out of stock OR below minimum stock.

## 5.4 Create Item

```
POST /api/v1/items
```

**Request Body:**
```json
{
  "categoryId": "CATEGORY_UUID_HERE",
  "name": "Oxygen Mask",
  "quantity": 25,
  "unit": "pieces",
  "minimumStock": 10,
  "isCritical": true,
  "brand": "MedPro",
  "supplierName": "Hospital Supplies Inc",
  "supplierContact": "+1234567890",
  "purchaseLink": "https://example.com/product",
  "expiryDate": "2027-12-31",
  "description": "Adult size oxygen mask"
}
```

**Required Fields:** `categoryId`, `name`, `unit`

## 5.5 Update Item

```
PUT /api/v1/items/{item_id}
```

## 5.6 Quick Stock Update

```
PATCH /api/v1/items/{item_id}/stock
```

**Request Body:**
```json
{
  "quantity": 50,
  "reason": "Restocked from delivery"
}
```

## 5.7 Delete Item

```
DELETE /api/v1/items/{item_id}
```

---

# 6. Orders Endpoints

All order endpoints require authentication (🔐).

## 6.1 List Orders

```
GET /api/v1/orders
```

**Query Parameters:**
- `status`: Filter by status (pending, ordered, received, applied, declined)

## 6.2 Create Order

```
POST /api/v1/orders
```

**Request Body:**
```json
{
  "items": [
    {
      "itemId": "ITEM_UUID",
      "name": "Oxygen Mask",
      "brand": "MedPro",
      "unit": "pieces",
      "quantity": 50,
      "currentStock": 5,
      "minimumStock": 10
    }
  ],
  "notes": "Urgent restock"
}
```

**Response:**
```json
{
  "id": "uuid",
  "orderId": "ORD-20260126-0001",
  "status": "pending",
  "totalItems": 1,
  "totalUnits": 50,
  "items": [...],
  "exportedAt": "2026-01-26T00:00:00.000Z"
}
```

## 6.3 Order Lifecycle

```
pending → ordered → received → applied
                  ↘ declined
```

### Update Order Status

```
PATCH /api/v1/orders/{order_id}/status
```

**Request Body:**
```json
{
  "status": "ordered"
}
```

### Apply Order to Inventory

```
POST /api/v1/orders/{order_id}/apply
```

- Order must be in `received` status
- Adds ordered quantities to item stock
- Changes status to `applied`

---

# 7. Sync Endpoints

For offline-first mobile app support. All require authentication (🔐).

## 7.1 Push Local Changes

```
POST /api/v1/sync/push
```

## 7.2 Pull Server Changes

```
POST /api/v1/sync/pull
```

## 7.3 Full Sync

```
POST /api/v1/sync/full
```

---

# 8. Complete Testing Walkthrough

Follow these steps in order to test the complete API:

## Step 1: Register a User

In Swagger UI (http://localhost:8000/docs):

1. Find `POST /api/v1/auth/register`
2. Click "Try it out"
3. Enter:
```json
{
  "email": "test@example.com",
  "password": "Test1234",
  "name": "Test User"
}
```
4. Click "Execute"
5. **Copy the `access_token` from the response!**

## Step 2: Authorize Swagger

1. Click the green **"Authorize"** button at the top
2. Enter: `Bearer YOUR_ACCESS_TOKEN`
3. Click "Authorize" then "Close"

## Step 3: Create a Category

1. Find `POST /api/v1/categories`
2. Enter:
```json
{
  "name": "Medical Supplies",
  "displayOrder": 1
}
```
3. Execute and **copy the category `id`**

## Step 4: Create an Item

1. Find `POST /api/v1/items`
2. Enter (replace CATEGORY_ID):
```json
{
  "categoryId": "PASTE_CATEGORY_ID_HERE",
  "name": "Oxygen Mask",
  "quantity": 5,
  "unit": "pieces",
  "minimumStock": 10,
  "isCritical": true
}
```
3. Execute and **copy the item `id`**

## Step 5: Check Stats

1. Find `GET /api/v1/items/stats`
2. Execute
3. You should see `lowStockCount: 1` (since quantity < minimumStock)

## Step 6: Create an Order

1. Find `POST /api/v1/orders`
2. Enter (replace ITEM_ID):
```json
{
  "items": [
    {
      "itemId": "PASTE_ITEM_ID_HERE",
      "name": "Oxygen Mask",
      "quantity": 50,
      "currentStock": 5,
      "minimumStock": 10,
      "unit": "pieces"
    }
  ]
}
```
3. Execute and **copy the order `id`**

## Step 7: Process the Order

1. `PATCH /api/v1/orders/{order_id}/status` → `{"status": "ordered"}`
2. `PATCH /api/v1/orders/{order_id}/status` → `{"status": "received"}`
3. `POST /api/v1/orders/{order_id}/apply`

## Step 8: Verify Stock Updated

1. `GET /api/v1/items/{item_id}`
2. Quantity should now be 55 (5 original + 50 from order)

---

# 9. Troubleshooting

## Issue: "Alembic is not recognized"

**Solution:** Run migrations inside Docker:
```powershell
docker-compose exec api alembic upgrade head
```

## Issue: New endpoints not showing in Swagger

**Solution:** Rebuild the Docker container:
```powershell
docker-compose up -d --build
```
Then refresh browser (Ctrl+F5).

## Issue: 401 Unauthorized

**Solutions:**
1. Make sure you clicked "Authorize" in Swagger
2. Check token format: `Bearer YOUR_TOKEN` (include "Bearer ")
3. Token may have expired - login again

## Issue: 429 Too Many Requests

**Solution:** Wait for rate limit to reset:
- Login: Wait 1 minute
- Register/Forgot Password: Wait 1 hour

## Issue: Container won't start

**Solution:**
```powershell
docker-compose down
docker-compose up -d --build
docker-compose logs api
```

## Issue: Can't connect to database

**Solution:**
```powershell
docker-compose down -v  # Remove volumes
docker-compose up -d --build
docker-compose exec api alembic upgrade head  # Re-run migrations
```

---

# Quick Reference: All Endpoints

## Authentication (12 endpoints)

| Method | Endpoint | Auth | Rate Limit |
|--------|----------|------|------------|
| POST | `/auth/register` | 🔓 | 3/hour |
| POST | `/auth/login` | 🔓 | 5/min |
| GET | `/auth/verify-email/{token}` | 🔓 | - |
| POST | `/auth/resend-verification` | 🔓 | 3/hour |
| POST | `/auth/forgot-password` | 🔓 | 3/hour |
| POST | `/auth/reset-password` | 🔓 | 5/hour |
| POST | `/auth/refresh` | 🔓 | - |
| POST | `/auth/logout` | 🔐 | - |
| GET | `/auth/me` | 🔐 | - |
| PATCH | `/auth/me` | 🔐 | - |
| POST | `/auth/change-password` | 🔐 | - |

## Categories (6 endpoints)

| Method | Endpoint | Auth |
|--------|----------|------|
| GET | `/categories` | 🔐 |
| GET | `/categories/with-counts` | 🔐 |
| GET | `/categories/{id}` | 🔐 |
| POST | `/categories` | 🔐 |
| PUT | `/categories/{id}` | 🔐 |
| DELETE | `/categories/{id}` | 🔐 |

## Items (8 endpoints)

| Method | Endpoint | Auth |
|--------|----------|------|
| GET | `/items` | 🔐 |
| GET | `/items/stats` | 🔐 |
| GET | `/items/needs-attention` | 🔐 |
| GET | `/items/{id}` | 🔐 |
| POST | `/items` | 🔐 |
| PUT | `/items/{id}` | 🔐 |
| PATCH | `/items/{id}/stock` | 🔐 |
| DELETE | `/items/{id}` | 🔐 |

## Orders (6 endpoints)

| Method | Endpoint | Auth |
|--------|----------|------|
| GET | `/orders` | 🔐 |
| GET | `/orders/{id}` | 🔐 |
| POST | `/orders` | 🔐 |
| PATCH | `/orders/{id}/status` | 🔐 |
| POST | `/orders/{id}/apply` | 🔐 |
| DELETE | `/orders/{id}` | 🔐 |

## Sync (3 endpoints)

| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/sync/push` | 🔐 |
| POST | `/sync/pull` | 🔐 |
| POST | `/sync/full` | 🔐 |

---

**Legend:** 🔓 = Public | 🔐 = Requires `Authorization: Bearer TOKEN`

---

*VitalTrack Backend v1.0.0 - Phase 2 Complete*  
*Last Updated: January 26, 2026*
