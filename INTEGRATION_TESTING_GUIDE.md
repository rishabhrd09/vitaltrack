# 📱 VitalTrack - Manual Integration Testing Guide

> Step-by-step guide to test backend + frontend integration on Expo Go

---

## 🔧 Prerequisites

| Requirement | Status |
|-------------|--------|
| Docker Desktop | Running |
| Node.js 18+ | Installed |
| Expo Go app | Installed on phone |
| Phone & PC on same WiFi | Verified |

---

## Step 1: Find Your Computer's IP Address

### Windows (PowerShell)
```powershell
ipconfig | Select-String "IPv4"
```
Look for: `IPv4 Address. . . . : 192.168.X.X`

### Mac/Linux
```bash
ipconfig getifaddr en0    # Mac
hostname -I                # Linux
```

**Write down your IP:** `_____________`

---

## Step 2: Start Backend

```powershell
cd d:\rd_projects_yt\mobile_app_chai_yt\android_home_icu\first_claude_draft\backedn_claude_1\phase3\latest\final_latest\final_backup\vitaltrack-production-ready\vitaltrack-backend

# Start Docker containers
docker-compose up -d --build

# Wait 15 seconds, then verify
docker-compose ps
```

**Expected output:**
```
NAME              STATUS          PORTS
vitaltrack-api    Up (healthy)    0.0.0.0:8000->8000/tcp
vitaltrack-db     Up (healthy)    0.0.0.0:5432->5432/tcp
```

**Verify API is running:**
```powershell
curl http://localhost:8000/health
```
Should return: `{"status":"healthy"...}`

---

## Step 3: Configure Frontend for Your IP

```powershell
cd d:\rd_projects_yt\mobile_app_chai_yt\android_home_icu\first_claude_draft\backedn_claude_1\phase3\latest\final_latest\final_backup\vitaltrack-production-ready\vitaltrack-mobile

# Create/update .env file with YOUR IP address
echo "EXPO_PUBLIC_API_URL=http://YOUR_IP_HERE:8000" > .env
```

**Example (replace with your IP):**
```powershell
echo "EXPO_PUBLIC_API_URL=http://192.168.1.100:8000" > .env
```

---

## Step 4: Start Frontend

```powershell
cd d:\rd_projects_yt\mobile_app_chai_yt\android_home_icu\first_claude_draft\backedn_claude_1\phase3\latest\final_latest\final_backup\vitaltrack-production-ready\vitaltrack-mobile

# Install dependencies (if not already done)
npm install --legacy-peer-deps

# Start Expo
npx expo start --clear
```

**If network issues, use tunnel mode:**
```powershell
npx expo start --tunnel --clear
```

---

## Step 5: Connect Expo Go

1. Open **Expo Go** app on your phone
2. Scan the **QR code** in terminal
3. Wait for app to load (30-60 seconds first time)

---

## 📋 Integration Test Checklist

### Authentication Tests

| Test | Steps | Expected Result | ✅ |
|------|-------|-----------------|---|
| **Register** | Tap "Create Account", fill form, submit | Account created, redirected to app | ☐ |
| **Login** | Enter email/password, tap Login | Logged in, see Dashboard | ☐ |
| **Logout** | Tap profile icon, tap Logout | Returned to login screen | ☐ |
| **Wrong password** | Enter wrong password | "Invalid credentials" error | ☐ |

### Inventory Tests

| Test | Steps | Expected Result | ✅ |
|------|-------|-----------------|---|
| **View categories** | Tap Inventory tab | See all categories | ☐ |
| **Create item** | Tap +, fill form, save | Item appears in list | ☐ |
| **Edit item** | Tap item, modify, save | Changes saved | ☐ |
| **Delete item** | Tap item, tap delete | Item removed | ☐ |
| **Search** | Type in search bar | Results filtered | ☐ |

### Order Tests

| Test | Steps | Expected Result | ✅ |
|------|-------|-----------------|---|
| **Create order** | Tap Orders, tap Create | Order form opens | ☐ |
| **Add items** | Select items, quantities | Items added to order | ☐ |
| **Generate PDF** | Tap Generate | PDF preview shows | ☐ |
| **Save order** | Tap Save | Order saved, appears in list | ☐ |
| **Receive order** | Tap order, tap Received | Status changes to Received | ☐ |
| **Apply to stock** | Tap Apply to Stock | Stock quantities updated | ☐ |

### Sync Tests

| Test | Steps | Expected Result | ✅ |
|------|-------|-----------------|---|
| **Offline mode** | Turn off WiFi, use app | App works, shows offline indicator | ☐ |
| **Reconnect** | Turn WiFi back on | Data syncs automatically | ☐ |
| **Token refresh** | Use app for 30+ min | No logout, tokens refresh | ☐ |

---

## 🔍 Debugging Commands

### Check Backend Logs
```powershell
cd vitaltrack-backend
docker-compose logs -f api
```

### Check Frontend Logs
Watch the terminal where `npx expo start` is running.

### Test API Directly
```powershell
# Health check
curl http://localhost:8000/health

# Register test user
curl -X POST http://localhost:8000/api/v1/auth/register `
  -H "Content-Type: application/json" `
  -d '{"email":"test@example.com","password":"Test1234!","name":"Test User"}'
```

### Reset Database
```powershell
cd vitaltrack-backend
docker-compose down -v
docker-compose up -d --build
```

---

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| "Network request failed" | Check IP in .env matches your computer |
| Can't scan QR code | Use `npx expo start --tunnel` |
| App won't load | Clear cache: `npx expo start --clear` |
| Backend not healthy | Check Docker: `docker-compose ps` |
| Login fails | Reset DB: `docker-compose down -v && docker-compose up -d` |

---

## ✅ Test Complete Checklist

Before declaring testing complete:

- [ ] All authentication tests pass
- [ ] All inventory CRUD operations work
- [ ] All order operations work
- [ ] Offline mode works, data syncs on reconnect
- [ ] App works for 30+ minutes without re-login
- [ ] No console errors in Metro bundler
- [ ] No errors in backend logs

---

## 🎯 Quick Reference

```powershell
# Start everything (run in 2 terminals)

# Terminal 1 - Backend
cd vitaltrack-backend
docker-compose up -d --build
docker-compose logs -f api

# Terminal 2 - Frontend
cd vitaltrack-mobile
echo "EXPO_PUBLIC_API_URL=http://YOUR_IP:8000" > .env
npm install --legacy-peer-deps
npx expo start --clear
```

---

**VitalTrack v1.0.0** | Manual Integration Testing Guide
