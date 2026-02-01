# Complete Local Testing Guide

> **The definitive reference** for running VitalTrack locally. Everything from architecture to troubleshooting.

---

## Section A: Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           LOCAL DEVELOPMENT SETUP                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│    YOUR PHONE (Expo Go)              YOUR PC (Development Machine)           │
│    ┌─────────────────┐               ┌─────────────────────────────┐         │
│    │                 │               │                             │         │
│    │   VitalTrack    │◄─────────────►│   Expo Metro Bundler        │         │
│    │   Mobile App    │   WiFi/USB    │   Port: 8081                │         │
│    │                 │               │                             │         │
│    └────────┬────────┘               │   ┌─────────────────────┐   │         │
│             │                        │   │                     │   │         │
│             │  API Requests          │   │   FastAPI Backend   │   │         │
│             └───────────────────────►│   │   Port: 8000        │   │         │
│                                      │   │                     │   │         │
│                                      │   └──────────┬──────────┘   │         │
│                                      │              │              │         │
│                                      │   ┌──────────▼──────────┐   │         │
│                                      │   │                     │   │         │
│                                      │   │   PostgreSQL 16     │   │         │
│                                      │   │   Port: 5432        │   │         │
│                                      │   │                     │   │         │
│                                      │   └─────────────────────┘   │         │
│                                      │         (Docker)            │         │
│                                      └─────────────────────────────┘         │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Key Points:**
- Backend (FastAPI + PostgreSQL) runs in Docker containers
- Frontend (Expo) runs natively on your PC
- Phone connects to PC via WiFi or USB

---

## Section B: Connection Method Decision Tree

```
How is your phone connecting to your PC?
│
├─► Same WiFi network (most common)
│   └─► Use: http://YOUR_PC_IP:8000
│       └─► Go to: Section C
│
├─► USB Cable (ADB Reverse)
│   └─► Use: http://localhost:8000
│       └─► Go to: docs/USB_ADB_REVERSE_GUIDE.md
│
└─► Different network / Firewall issues
    └─► Use: npx expo start --tunnel
        └─► Go to: Section D
```

---

## Section C: WiFi Method (Complete Steps)

### Step 1: Find Your PC's IP Address

**Windows (PowerShell):**
```powershell
ipconfig | Select-String "IPv4"
```
Look for: `IPv4 Address. . . . . . . . . . . : 192.168.X.X`

**Mac:**
```bash
ipconfig getifaddr en0
```

**Linux:**
```bash
hostname -I | awk '{print $1}'
```

✅ **Write down your IP:** `_______________`

### Step 2: Verify Phone Can Reach PC

On your **phone's browser**, navigate to:
```
http://YOUR_IP:8000/health
```

✅ **Expected:** `{"status":"healthy"}`

❌ **If timeout:** Check firewall (Section E)  
❌ **If refused:** Backend not running (restart Docker)

### Step 3: Configure Frontend .env

Edit `vitaltrack-mobile/.env`:
```env
EXPO_PUBLIC_API_URL=http://192.168.X.X:8000
```

⚠️ **Critical:**
- NO trailing slash!
- Must be `http://` not `https://`
- Replace `X.X` with your actual IP

### Step 4: Restart Expo (Required!)

```bash
npx expo start --clear
```

The `--clear` flag is **REQUIRED** after `.env` changes.

### Step 5: Test Connection

1. Scan QR code with Expo Go
2. Create an account or login
3. If dashboard loads with data → **Success!**

---

## Section D: Tunnel Method (Fallback)

**When to use:**
- Corporate WiFi with isolation
- Firewall blocking ports
- Phone and PC on different networks

```bash
npx expo start --tunnel
```

This creates a public URL that bypasses local network issues.

**Tradeoffs:**
- ✅ Works through firewalls
- ❌ Slower than direct connection
- ❌ Requires internet

---

## Section E: Firewall Troubleshooting (Windows)

### Symptom
Phone can't reach PC even on same WiFi

### Quick Fix: Test with Firewall Disabled
```
Settings → Windows Security → Firewall & network protection → Turn off (temporarily)
```

If this fixes it, proceed to add permanent rules below.

### Permanent Fix: Add Firewall Rules

**PowerShell (Run as Administrator):**
```powershell
# Allow Expo Metro Bundler
netsh advfirewall firewall add rule name="Expo Metro" dir=in action=allow protocol=tcp localport=8081

# Allow FastAPI Backend
netsh advfirewall firewall add rule name="FastAPI Dev" dir=in action=allow protocol=tcp localport=8000

# Allow PostgreSQL (optional, for external tools)
netsh advfirewall firewall add rule name="PostgreSQL Dev" dir=in action=allow protocol=tcp localport=5432
```

### Allow Docker Through Firewall
```
Settings → Windows Security → Firewall → Allow an app through firewall
→ Find "Docker Desktop" → Check both Private and Public
```

---

## Section F: Docker Troubleshooting

### Problem: "Cannot connect to Docker daemon"
**Cause:** Docker Desktop not running

**Fix:**
1. Start Docker Desktop
2. Wait for it to fully load (1-2 minutes)
3. Verify: `docker ps` should work

### Problem: "Port 5432 already in use"
**Cause:** Local PostgreSQL running

**Fix (Windows):**
```cmd
net stop postgresql-x64-16
```

**Fix (Mac):**
```bash
brew services stop postgresql
```

**Alternative:** Change port in `docker-compose.dev.yml`

### Problem: "Database tables don't exist"
**Cause:** Migrations didn't run

**Fix:**
```bash
docker-compose exec api alembic upgrade head
```

### Problem: Container keeps restarting
**Debug:**
```bash
docker-compose -f docker-compose.dev.yml logs -f api
```

**Common causes:**
- `DATABASE_URL` incorrect in `.env`
- `SECRET_KEY` missing or too short
- Python syntax error

### Problem: Need fresh start
**Nuclear option (deletes all data):**
```bash
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up --build
```

---

## Section G: Expo Troubleshooting

### Problem: "Network request failed" in app

**Debug Steps (in order):**
1. Verify backend: `curl http://localhost:8000/health`
2. Verify from phone: open `http://YOUR_IP:8000/health` in phone browser
3. Check `.env` has correct IP (no typos!)
4. Restart Expo: `npx expo start --clear`
5. Check firewall (Section E)

### Problem: App stuck on splash screen
```bash
# Clear all caches
rm -rf node_modules/.cache
npx expo start --clear
```

### Problem: "Unable to resolve module"
```bash
rm -rf node_modules
npm install --legacy-peer-deps
npx expo start --clear
```

### Problem: QR code not scanning
- Ensure phone and PC on same WiFi
- Try pressing `w` in terminal (opens web)
- Try tunnel mode: `npx expo start --tunnel`

### Problem: Changes not reflecting
```bash
# Clear Metro cache
npx expo start --clear

# If still not working, full reset
rm -rf node_modules .expo
npm install --legacy-peer-deps
npx expo start --clear
```

---

## Section H: Complete Command Reference

### Backend Commands
```bash
cd vitaltrack-backend

# Start (first time or after changes)
docker-compose -f docker-compose.dev.yml up --build

# Start (quick, no rebuild)
docker-compose -f docker-compose.dev.yml up

# Start (background)
docker-compose -f docker-compose.dev.yml up -d

# Stop
docker-compose -f docker-compose.dev.yml down

# Stop + delete data (fresh start)
docker-compose -f docker-compose.dev.yml down -v

# View logs (real-time)
docker-compose -f docker-compose.dev.yml logs -f api

# Run migrations manually
docker-compose exec api alembic upgrade head

# Access database directly
docker-compose exec db psql -U postgres -d vitaltrack

# Check container status
docker ps
```

### Frontend Commands
```bash
cd vitaltrack-mobile

# Install dependencies
npm install --legacy-peer-deps

# Start (normal)
npx expo start

# Start (clear cache - use after .env changes)
npx expo start --clear

# Start (tunnel mode - firewall bypass)
npx expo start --tunnel

# Start (LAN mode - explicit)
npx expo start --lan

# Reset everything
rm -rf node_modules .expo
npm install --legacy-peer-deps
npx expo start --clear

# TypeScript check
npx tsc --noEmit

# Lint check
npm run lint
```

### Environment Setup
```bash
# Run setup script
./setup-local-dev.sh      # Mac/Linux
setup-local-dev.bat       # Windows

# Manual .env creation (if script fails)
# Backend: vitaltrack-backend/.env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/vitaltrack
SECRET_KEY=your-secret-key-at-least-32-characters-long
ENVIRONMENT=development

# Frontend: vitaltrack-mobile/.env
EXPO_PUBLIC_API_URL=http://YOUR_IP:8000
```

---

## Section I: Verification Checklist

### Backend Verification
```
□ Docker Desktop is running
□ docker ps shows 2 containers (vitaltrack-backend-api-1, vitaltrack-backend-db-1)
□ Both containers status is "Up"
□ http://localhost:8000/health returns {"status":"healthy"}
□ http://localhost:8000/docs loads Swagger UI
□ No errors in docker-compose logs
```

### Frontend Verification
```
□ npm install completed without errors
□ npx expo start shows QR code
□ No red error messages in terminal
□ Terminal shows "Metro waiting on..."
```

### Connection Verification
```
□ Found PC's IP address: _______________
□ Phone browser can reach http://IP:8000/health
□ .env file has correct IP (no typos)
□ Expo restarted with --clear after .env change
```

### App Verification
```
□ Expo Go scans QR successfully
□ App loads (not stuck on splash screen)
□ Login/Register screen appears
□ Can create new account
□ Dashboard loads with categories
□ Can create new item
□ Item appears in inventory
```

---

## Quick Reference Card

```
┌────────────────────────────────────────────────────────────┐
│                    QUICK REFERENCE                          │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  START BACKEND:                                            │
│  cd vitaltrack-backend                                     │
│  docker-compose -f docker-compose.dev.yml up --build       │
│                                                            │
│  START FRONTEND:                                           │
│  cd vitaltrack-mobile                                      │
│  npx expo start --clear                                    │
│                                                            │
│  FIND YOUR IP:                                             │
│  Windows: ipconfig | findstr "IPv4"                        │
│  Mac: ipconfig getifaddr en0                               │
│                                                            │
│  VERIFY BACKEND:                                           │
│  curl http://localhost:8000/health                         │
│                                                            │
│  PHONE CAN'T CONNECT?                                      │
│  1. Check .env has correct IP                              │
│  2. Restart: npx expo start --clear                        │
│  3. Try USB: adb reverse tcp:8000 tcp:8000                 │
│  4. Try tunnel: npx expo start --tunnel                    │
│                                                            │
└────────────────────────────────────────────────────────────┘
```
