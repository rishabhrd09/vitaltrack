# 🏥 VitalTrack - Complete Quick Start Guide

**Phase 2 Complete | January 26, 2026 | Verified & Tested**

This guide covers setting up and testing BOTH the backend and frontend together.

---

## Part 1: Backend Setup

### Prerequisites
- ✅ Docker Desktop installed and running
- ✅ PowerShell (Windows) or Terminal (Mac/Linux)

### 1.1 Start Backend (2 minutes)

```powershell
# Navigate to backend folder
cd vitaltrack-backend

# Start Docker containers (builds API + PostgreSQL)
docker-compose up -d --build

# Wait 15-20 seconds for containers to start, then run migrations
docker-compose exec api alembic upgrade head

# Verify containers are running
docker-compose ps
```

**Expected output:**
```
NAME              STATUS          PORTS
vitaltrack-api    Up (healthy)    0.0.0.0:8000->8000/tcp
vitaltrack-db     Up (healthy)    0.0.0.0:5432->5432/tcp
```

### 1.2 Verify API is Working

Open browser: **http://localhost:8000/docs**

You should see Swagger UI with all 34 API endpoints.

---

## Part 2: Frontend Setup (TESTED ✅)

### Prerequisites
- ✅ Node.js 18+ installed
- ✅ Expo Go app on your phone (Play Store / App Store)
- ✅ Phone and computer on same WiFi network

### 2.1 Install Frontend

```powershell
# Navigate to frontend folder
cd vitaltrack-mobile

# IMPORTANT: Use --legacy-peer-deps flag (required for React 19)
npm install --legacy-peer-deps
```

> ⚠️ **Note:** Regular `npm install` will fail due to React 19 peer dependency conflicts. Always use `--legacy-peer-deps`.

### 2.2 Configure Backend URL (Optional)

For API integration, create `.env` file in frontend folder:

```ini
# For physical device - use your computer's IPv4 address
EXPO_PUBLIC_API_URL=http://192.168.1.100:8000

# Find your IP:
# Windows: ipconfig (look for "IPv4 Address" under WiFi)
# Mac: ifconfig en0 | grep inet
```

**For Android Emulator only:**
```ini
EXPO_PUBLIC_API_URL=http://10.0.2.2:8000
```

### 2.3 Start Expo (TESTED ✅)

```powershell
npx expo start --clear
```

**Expected output:**
- QR code displayed in terminal
- URL shown (e.g., `exp://192.168.1.3:8081`)

### 2.4 Run on Phone

1. Open **Expo Go** app on your phone
2. Scan the **QR code** from terminal
3. App loads! 🎉

---

## Part 3: Backend Manual Testing Checklist

### 3.1 Test Authentication (5 minutes)

Open http://localhost:8000/docs

**Step 1: Register User**
1. Find `POST /api/v1/auth/register` → Click "Try it out"
2. Enter:
```json
{
  "email": "test@example.com",
  "password": "Test1234",
  "name": "Test User"
}
```
3. Click Execute → ✅ Should return 201 with tokens
4. **Copy the `access_token`**

**Step 2: Authorize Swagger**
1. Click green **"Authorize"** button (top-right)
2. Enter: `Bearer YOUR_ACCESS_TOKEN`
3. Click "Authorize" → "Close"

**Step 3: Test Profile**
1. `GET /api/v1/auth/me` → Execute
2. ✅ Should return profile with camelCase fields:
   - `isActive`, `isVerified`, `isEmailVerified`, `createdAt`

**Step 4: Test Login**
1. `POST /api/v1/auth/login`
2. Enter:
```json
{
  "identifier": "test@example.com",
  "password": "Test1234"
}
```
3. ✅ Should return 200 with new tokens

### 3.2 Test CRUD Operations (10 minutes)

**Create Category:**
```json
POST /api/v1/categories
{
  "name": "Medical Supplies",
  "displayOrder": 1
}
```
→ Copy the returned `id`

**Create Item:**
```json
POST /api/v1/items
{
  "categoryId": "PASTE_CATEGORY_ID",
  "name": "Oxygen Mask",
  "quantity": 5,
  "unit": "pieces",
  "minimumStock": 10,
  "isCritical": true
}
```
→ Copy the returned `id`

**Check Stats:**
```
GET /api/v1/items/stats
```
✅ Should return:
```json
{
  "totalItems": 1,
  "totalCategories": 1,
  "outOfStockCount": 0,
  "lowStockCount": 1,
  "criticalItems": 1,
  "pendingOrdersCount": 0
}
```

**Create Order:**
```json
POST /api/v1/orders
{
  "items": [{
    "itemId": "PASTE_ITEM_ID",
    "name": "Oxygen Mask",
    "quantity": 50,
    "currentStock": 5,
    "minimumStock": 10,
    "unit": "pieces"
  }]
}
```

**Apply Order (update stock):**
1. `PATCH /api/v1/orders/{id}/status` → `{"status": "received"}`
2. `POST /api/v1/orders/{id}/apply`
3. ✅ Item stock should now be 55

### 3.3 Test Password Reset

1. `POST /api/v1/auth/forgot-password`
2. Enter: `{"email": "test@example.com"}`
3. ✅ Returns 200
4. Check logs: `docker-compose logs api | Select-String "Reset token"`

---

## Part 4: Complete Verification Checklist

### Backend ✅
- [ ] `docker-compose up -d --build` works
- [ ] `docker-compose exec api alembic upgrade head` works
- [ ] http://localhost:8000/docs loads
- [ ] Register returns tokens
- [ ] Login works
- [ ] Profile returns camelCase (isActive, createdAt)
- [ ] Create category works
- [ ] Create item works
- [ ] Stats returns 6 fields (including totalCategories, pendingOrdersCount)
- [ ] Create and apply order works
- [ ] Forgot password logs token

### Frontend ✅
- [ ] `npm install --legacy-peer-deps` completes
- [ ] `npx expo start --clear` shows QR code
- [ ] Expo Go app loads the project
- [ ] Dashboard screen displays
- [ ] Login screen accessible at /(auth)/login

---

## Troubleshooting

### npm install fails with ERESOLVE error
```powershell
# Use legacy-peer-deps flag
npm install --legacy-peer-deps
```

### Metro bundler won't start
```powershell
# Clear cache and restart
npx expo start --clear
```

### Can't connect to backend from phone
1. Check backend running: http://localhost:8000/health
2. Ensure .env has your computer's IP (not localhost)
3. Computer and phone must be on same WiFi
4. Check firewall isn't blocking port 8000

### Docker issues
```powershell
# Full reset
docker-compose down -v
docker-compose up -d --build
docker-compose exec api alembic upgrade head
```

---

## Quick Reference

| Service | URL |
|---------|-----|
| Backend API | http://localhost:8000 |
| Swagger Docs | http://localhost:8000/docs |
| Health Check | http://localhost:8000/health |
| Expo Dev Server | http://localhost:8081 |

---

**✅ Phase 2 Complete! Ready for Phase 3 (Full API Integration)** 🎉
