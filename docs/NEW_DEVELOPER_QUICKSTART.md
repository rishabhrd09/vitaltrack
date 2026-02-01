# New Developer Quick Start

> **Time Required:** 30 minutes  
> **Goal:** Running VitalTrack locally with backend + frontend connected

---

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] **Docker Desktop** - [Download](https://www.docker.com/products/docker-desktop/) (must be running)
- [ ] **Node.js 20+** - [Download](https://nodejs.org/) (run `node --version` to verify)
- [ ] **Git** - [Download](https://git-scm.com/)
- [ ] **Expo Go app** on your phone - [iOS](https://apps.apple.com/app/expo-go/id982107779) | [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)
- [ ] Phone and PC on **same WiFi network**

---

## Step 1: Clone Repository (2 min)

```bash
git clone https://github.com/rishabhrd09/vitaltrack.git
cd vitaltrack
```

✅ **Expected:** `vitaltrack` folder created with `vitaltrack-backend/` and `vitaltrack-mobile/` inside

---

## Step 2: Setup Environment (1 min)

**Windows:**
```cmd
setup-local-dev.bat
```

**Mac/Linux:**
```bash
chmod +x setup-local-dev.sh
./setup-local-dev.sh
```

✅ **Expected:** Script outputs "Setup complete!" and creates `.env` files with your IP address

---

## Step 3: Start Backend (5 min)

```bash
cd vitaltrack-backend
docker-compose -f docker-compose.dev.yml up --build
```

**Wait for these messages:**
```
api-1  | INFO:     Application startup complete.
api-1  | INFO:     Uvicorn running on http://0.0.0.0:8000
```

✅ **Verify:** Open http://localhost:8000/health in browser → Should see `{"status":"healthy"}`

**Keep this terminal running!** Open a new terminal for the next step.

---

## Step 4: Start Frontend (5 min)

In a **new terminal:**
```bash
cd vitaltrack-mobile
npm install --legacy-peer-deps
npx expo start --clear
```

✅ **Expected:** QR code displayed in terminal

---

## Step 5: Test on Phone (2 min)

1. Open **Expo Go** app on your phone
2. Scan the QR code from terminal
3. Wait for the app to load (~30 seconds first time)
4. Tap **Create Account**
5. Enter email, password, create account
6. See the **Dashboard** with sample data

✅ **Success!** You now have VitalTrack running locally.

---

## Quick Verification Checklist

```
□ Backend
  □ docker ps shows 2 containers (api + db)
  □ http://localhost:8000/health returns {"status":"healthy"}
  □ http://localhost:8000/docs shows Swagger UI

□ Frontend
  □ Expo shows QR code (no red errors)
  □ Terminal shows "Metro waiting on..."

□ Mobile App
  □ Expo Go scans QR successfully
  □ App loads (not stuck on splash)
  □ Can create account
  □ Dashboard shows categories
```

---

## Something Not Working?

| Problem | Quick Fix |
|---------|-----------|
| "Network request failed" | Check `.env` has correct IP, restart Expo with `--clear` |
| Docker not starting | Ensure Docker Desktop is running |
| Phone can't reach backend | Try USB method: `adb reverse tcp:8000 tcp:8000` |
| npm install fails | Use `npm install --legacy-peer-deps` |

**For detailed troubleshooting:** [Complete Local Testing Guide](LOCAL_TESTING_COMPLETE_GUIDE.md)

---

## Next Steps

1. **Explore the app** - Create items, categories, orders
2. **Make changes** - Edit code, see live reload
3. **Learn the workflow** - Read [Git Workflow Guide](GIT_WORKFLOW_GUIDE.md)
4. **Contribute** - Read [CONTRIBUTING.md](../CONTRIBUTING.md)

---

## Common Commands Reference

```bash
# Backend
docker-compose -f docker-compose.dev.yml up      # Start
docker-compose -f docker-compose.dev.yml down    # Stop
docker-compose -f docker-compose.dev.yml logs -f # View logs

# Frontend
npx expo start                  # Start dev server
npx expo start --clear          # Clear cache and start
npx expo start --tunnel         # Use tunnel (firewall bypass)

# Both
./setup-local-dev.sh            # Reset .env files
```

---

**Questions?** Check the [Complete Guide](LOCAL_TESTING_COMPLETE_GUIDE.md) or open an issue on GitHub.
