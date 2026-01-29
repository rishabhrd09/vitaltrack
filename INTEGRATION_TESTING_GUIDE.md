# VitalTrack Local Integration Testing Guide

> **Goal:** Test the Frontend (Expo Go on phone) + Backend (Docker on PC) working together over WiFi.

This guide provides step-by-step commands to test your complete application locally before pushing to GitHub.

---

## Prerequisites

Before starting, ensure you have:

| Requirement | How to Verify | Install Link |
|-------------|---------------|--------------|
| **Git** | `git --version` | [git-scm.com](https://git-scm.com/) |
| **Docker Desktop** | Running in system tray | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **Node.js 20+** | `node --version` | [nodejs.org](https://nodejs.org/) |
| **Expo Go App** | Installed on phone | [Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent) / [App Store](https://apps.apple.com/app/expo-go/id982107779) |
| **Same WiFi** | Phone & PC connected | - |

---

## Step-by-Step Setup

### Step 1: Backend Setup (The "Server")

We run the FastAPI backend and PostgreSQL database in Docker containers.

```powershell
# 1. Enter backend directory
cd vitaltrack-backend

# 2. Create environment file from template
copy .env.example .env
# (Mac/Linux: cp .env.example .env)

# 3. Start Docker containers
# This downloads images, builds the API, and starts everything
docker-compose up -d --build

# 4. Wait 30 seconds for initialization, then verify
docker-compose ps
# Should show 2 containers: api (running), postgres (running)

# 5. (Optional) Force run database migrations
docker-compose exec api alembic upgrade head
```

**Verify Backend:** Open http://localhost:8000/docs in your browser.  
You should see the **Swagger UI** with all API endpoints.

**Verify Health:** http://localhost:8000/health should return `{"status": "healthy"}`

---

### Step 2: Find Your PC's IP Address (The "Bridge")

Your phone needs to know your PC's IP address to connect to the local backend.

```powershell
# Windows
ipconfig

# Look for this section:
# Wireless LAN adapter Wi-Fi:
#    IPv4 Address. . . . . . . . . . . : 192.168.1.15  ← THIS IS YOUR IP
```

```bash
# Mac/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1
# or
ip addr show | grep "inet " | grep -v 127.0.0.1
```

**Write down your IP address** (e.g., `192.168.1.15`). You'll need it next.

---

### Step 3: Frontend Setup (The "App")

Configure the mobile app to point to your PC's backend.

```powershell
# 1. Enter mobile directory
cd ..\vitaltrack-mobile

# 2. Install dependencies
npm install --legacy-peer-deps

# 3. Create environment file with YOUR IP
# IMPORTANT: Replace 192.168.1.15 with YOUR actual IP!

# Windows (PowerShell) - Safe method preventing encoding issues:
"EXPO_PUBLIC_API_URL=http://192.168.1.15:8000" | Out-File -FilePath .env -Encoding utf8

# Windows (CMD):
# echo EXPO_PUBLIC_API_URL=http://192.168.1.15:8000> .env

# Mac/Linux:
# echo "EXPO_PUBLIC_API_URL=http://192.168.1.15:8000" > .env
```

---

### Step 4: Launch & Test

```powershell
# Start Expo development server
npx expo start --clear
```

1. **Open Expo Go** app on your phone
2. **Scan the QR code** displayed in terminal
3. **Wait** for the app to bundle and load (~30 seconds first time)

---

## Verification Checklist

Test each scenario to confirm the integration works:

| # | Test | Action | Expected Result |
|---|------|--------|-----------------|
| 1 | **Backend Health** | Visit http://localhost:8000/health | `{"status": "healthy"}` |
| 2 | **Register User** | Create account in app | Backend logs: `POST /api/v1/auth/register 200` |
| 3 | **Login** | Login with new account | Dashboard loads successfully |
| 4 | **Create Category** | Add a new category | Appears in category list |
| 5 | **Create Item** | Add inventory item | Visible in http://localhost:8000/docs → GET /items |
| 6 | **Offline Mode** | Turn off phone WiFi | App continues working (cached data) |
| 7 | **Sync** | Turn WiFi back on | Data syncs automatically |

---

## Troubleshooting

| Issue | Possible Causes | Solutions |
|-------|-----------------|-----------|
| **"Network request failed"** | Wrong IP / Firewall / Different WiFi | 1. Verify IP in `.env` matches `ipconfig` output<br>2. Check phone & PC on same WiFi<br>3. Temporarily disable Windows Firewall<br>4. Allow Docker through firewall |
| **"Connection refused"** | Docker not running | 1. Check Docker Desktop is running<br>2. Run `docker ps` to verify containers<br>3. Run `docker-compose up -d` again |
| **Database errors** | Migrations not run | Run `docker-compose exec api alembic upgrade head` |
| **"Unable to resolve host"** | Using localhost instead of IP | Ensure `.env` has `http://192.168.x.x:8000`, NOT `localhost` |
| **App not loading in Expo** | Cache issues | Run `npx expo start --clear` |
| **Containers won't start** | Port conflict | Check if port 8000 or 5432 is in use: `netstat -ano \| findstr :8000` |

---

## Cleanup

When finished testing:

```powershell
# Stop backend containers (keeps data)
cd vitaltrack-backend
docker-compose down

# Stop AND delete all data (fresh start next time)
docker-compose down -v
```

---

## Quick Reference

| Resource | URL |
|----------|-----|
| Backend API | http://localhost:8000 |
| API Documentation | http://localhost:8000/docs |
| Health Check | http://localhost:8000/health |
| Mobile App API URL | http://YOUR_PC_IP:8000 |
