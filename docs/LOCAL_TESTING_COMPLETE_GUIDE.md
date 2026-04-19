# Complete Local Testing Guide

> The definitive reference for running CareKosh locally — from architecture to the long tail of troubleshooting.

For a 30-minute onramp, start with [NEW_DEVELOPER_QUICKSTART.md](NEW_DEVELOPER_QUICKSTART.md). This guide goes wider and deeper.

Companion docs:
- USB debugging: [USB_ADB_REVERSE_GUIDE.md](USB_ADB_REVERSE_GUIDE.md)
- Architecture: [../CAREKOSH_DEVELOPER_GUIDE.md §1](../CAREKOSH_DEVELOPER_GUIDE.md#1-architecture-overview)
- Environment wiring (dev/staging/prod): repo-root `CAREKOSH_ENVIRONMENT_ARCHITECTURE.html`

---

## A · Architecture of a local setup

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           LOCAL DEVELOPMENT SETUP                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│    YOUR PHONE (Expo Go)              YOUR PC                                  │
│    ┌─────────────────┐               ┌─────────────────────────────┐         │
│    │                 │               │                             │         │
│    │   CareKosh app  │◄─────────────►│   Expo Metro bundler         │         │
│    │   (JS bundle    │   Wi-Fi / USB │   port 8081                  │         │
│    │    from Metro)  │               │                             │         │
│    └────────┬────────┘               │   ┌─────────────────────┐   │         │
│             │                        │   │                     │   │         │
│             │  HTTPS API             │   │   FastAPI backend   │   │         │
│             └───────────────────────►│   │   port 8000         │   │         │
│                                      │   │                     │   │         │
│                                      │   └──────────┬──────────┘   │         │
│                                      │              │              │         │
│                                      │   ┌──────────▼──────────┐   │         │
│                                      │   │  postgres:16        │   │         │
│                                      │   │  port 5432          │   │         │
│                                      │   └─────────────────────┘   │         │
│                                      │   (both in Docker)          │         │
│                                      └─────────────────────────────┘         │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Key facts:**
- Backend (FastAPI + Postgres 16) runs in two Docker containers via `docker-compose.dev.yml`.
- Metro bundler runs natively on your PC on port 8081.
- Expo Go on the phone loads the JS bundle over Metro and talks to the API over HTTPS.
- In dev, `REQUIRE_EMAIL_VERIFICATION` defaults to `false` — you can register and log in without an email round-trip.
- The mobile app is **server-first** (TanStack Query). No offline queue, no AsyncStorage-backed domain data. If the backend is down, writes error out — they do not silently queue.

---

## B · Connection method — pick one

```
How is your phone connecting to your PC?
│
├─► Same Wi-Fi (most common)
│     use: http://YOUR_PC_IP:8000      → go to §C
│
├─► USB cable (ADB reverse)
│     use: http://localhost:8000       → see USB_ADB_REVERSE_GUIDE.md
│
└─► Different network / aggressive firewall
      use: npx expo start --tunnel     → go to §D
```

---

### B.1 Switching backends easily

CareKosh's `package.json` ships scripts that set the right `EXPO_PUBLIC_API_URL` for you, so you don't have to edit `.env` every time you switch targets.

| Command | Target | When |
|---|---|---|
| `npm run start:local` | Local Docker (`http://localhost:8000`) | Day-to-day dev |
| `npm run start:staging` | Render staging | Reproduce a staging bug against real Neon data |
| `npm run start` | `.env` setting | When you want manual control |

**One-time setup on Windows** (cross-platform env var syntax):
```bash
cd vitaltrack-mobile
npm install --save-dev cross-env
```

---

## C · Wi-Fi method

### Step 1 — Find your PC's IP

**Windows (PowerShell)**
```powershell
ipconfig | Select-String "IPv4"
# IPv4 Address. . . . . . . . . . . : 192.168.X.X
```

**macOS**
```bash
ipconfig getifaddr en0
```

**Linux**
```bash
hostname -I | awk '{print $1}'
```

### Step 2 — Confirm phone can reach PC

Open `http://YOUR_IP:8000/health` in the **phone's browser**. Expect:
```json
{"status":"healthy"}
```

- Timeout → firewall is blocking (see §E).
- "Connection refused" → backend isn't actually running.
- Browser loads, but the app fails → check the `.env` value matches the IP exactly.

### Step 3 — Point the app at your backend

**Recommended — use the npm scripts** (see §B.1):
```bash
npm run start:local
```

**Manual — edit `vitaltrack-mobile/.env`:**
```env
EXPO_PUBLIC_API_URL=http://192.168.X.X:8000
```

Note: `EXPO_PUBLIC_API_URL` is read at **build/launch** time. After a change you must restart Metro with `--clear`.

### Step 4 — Restart Metro
```bash
npx expo start --clear
```

`--clear` flushes the Metro cache so the new env var is picked up.

### Step 5 — Test

1. Scan the QR code in Expo Go.
2. Register an account (dev defaults skip email verification).
3. Dashboard loads → you're in.

---

## D · Tunnel method (fallback)

Use when: corporate Wi-Fi with client isolation, strict firewalls, phone on a different network.

```bash
cd vitaltrack-mobile
npx expo start --tunnel
```

Expo creates a public URL and routes Metro traffic through it. The app still hits whatever `EXPO_PUBLIC_API_URL` points at, so your phone must be able to reach that URL — typically this means setting `EXPO_PUBLIC_API_URL=https://vitaltrack-api-staging.onrender.com` and letting the phone hit staging directly.

**Trade-offs**

- ✅ Works behind firewalls and on split networks.
- ❌ Slower than direct.
- ❌ Requires internet on both sides.
- ❌ Won't help you hit a local backend unless you also tunnel that (see `ngrok`).

---

## E · Windows firewall

### Triage

Temporarily disable the firewall:
```
Settings → Privacy & security → Windows Security → Firewall & network protection → turn OFF the active profile
```

- If the phone now reaches the PC → firewall was the cause; add permanent rules below.
- If it still fails → router isolation or Wi-Fi AP client-isolation.

### Permanent rules (PowerShell as admin)

```powershell
netsh advfirewall firewall add rule name="Expo Metro"    dir=in action=allow protocol=tcp localport=8081
netsh advfirewall firewall add rule name="CareKosh API"  dir=in action=allow protocol=tcp localport=8000
# Optional, only if you want external DB clients:
netsh advfirewall firewall add rule name="Postgres Dev"  dir=in action=allow protocol=tcp localport=5432
```

### Docker through the firewall

`Settings → Windows Security → Firewall → Allow an app through firewall` → find **Docker Desktop** → check both **Private** and **Public**.

---

## F · Docker troubleshooting

### "Cannot connect to the Docker daemon"
Docker Desktop is not running. Start it, wait 1–2 min for the tray icon to go steady, then:
```bash
docker ps
```

### "Port 5432 already in use"
A local Postgres is holding the port.

**Windows**
```cmd
net stop postgresql-x64-16
```

**macOS**
```bash
brew services stop postgresql
```

Alternative: change the host-side port in `docker-compose.dev.yml` (e.g. `5433:5432`).

### "Database tables don't exist"
`docker-entrypoint.sh` is supposed to run `alembic upgrade head` on startup. If you bypassed it:
```bash
docker compose -f docker-compose.dev.yml exec api alembic upgrade head
```

### Container keeps restarting
```bash
docker compose -f docker-compose.dev.yml logs -f api
```

Common causes:
- `DATABASE_URL` malformed in `.env` (passwords with `@` must be URL-encoded)
- `SECRET_KEY` missing or < 32 chars (production validator — development is lenient)
- Python syntax error in your last edit

### "Can't locate revision" in Alembic logs
Your local DB is on a revision that the current code doesn't know about.
```bash
docker compose -f docker-compose.dev.yml down -v    # WIPES dev DB
docker compose -f docker-compose.dev.yml up --build
```

**Never do this on staging or production.**

### Fresh-start nuclear option
```bash
cd vitaltrack-backend
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up --build -d
docker compose -f docker-compose.dev.yml logs -f api
```

### "localhost:5432 failed, retrying…" × 30 at startup
Harmless. `docker-entrypoint.sh` probes a local-dev fallback before using the real `DATABASE_URL`. The Render logs show the same thing. Not a bug.

---

## G · Expo / Metro troubleshooting

### "Network request failed" inside the app

Debug in order:
1. Backend up on PC: `curl http://localhost:8000/health` → `{"status":"healthy"}`
2. Phone can reach PC: `http://YOUR_IP:8000/health` in the phone browser works
3. `.env` exactly matches that IP (no typos, no trailing slash)
4. Metro restarted with `--clear` **after** the `.env` change
5. Windows firewall rules in place (§E)

### App stuck on splash
```bash
cd vitaltrack-mobile
rm -rf node_modules/.cache
npx expo start --clear
```

### "Unable to resolve module" on some new package
```bash
rm -rf node_modules
npm install --legacy-peer-deps
npx expo start --clear
```

### QR code won't scan
- Phone + PC on same Wi-Fi?
- Try `w` in the Metro terminal to open web-preview and confirm Metro is up.
- Try `npx expo start --tunnel` — tunnels bypass network discovery.

### Edits not reflecting
```bash
npx expo start --clear
```

If still not reflecting after a clear:
```bash
rm -rf node_modules .expo
npm install --legacy-peer-deps
npx expo start --clear
```

### "Unable to download remote update" after install
`expo-updates` is installed but `app.json` has no `updates` block. For dev, make sure `app.json` has:
```json
"updates": { "enabled": false }
```
This shipped in the Railway → Render migration (PR #1).

---

## H · Command reference

### Backend

```bash
cd vitaltrack-backend

# start (first time, or after Dockerfile change)
docker compose -f docker-compose.dev.yml up --build -d

# start (fast, no rebuild)
docker compose -f docker-compose.dev.yml up -d

# stop (keep volume)
docker compose -f docker-compose.dev.yml down

# stop + wipe DB (fresh start)
docker compose -f docker-compose.dev.yml down -v

# tail logs
docker compose -f docker-compose.dev.yml logs -f api

# run migrations manually
docker compose -f docker-compose.dev.yml exec api alembic upgrade head

# psql into the dev DB
docker compose -f docker-compose.dev.yml exec db psql -U postgres -d vitaltrack

# container status
docker ps
```

### Mobile

```bash
cd vitaltrack-mobile

npm install --legacy-peer-deps          # install deps

npx expo start                          # normal
npx expo start --clear                  # flush Metro cache (use after .env)
npx expo start --tunnel                 # public tunnel (firewall bypass)
npx expo start --lan                    # force LAN mode

npx tsc --noEmit                        # type check
npm run lint                            # ESLint
npx expo-doctor                         # Expo config sanity

# full reset
rm -rf node_modules .expo
npm install --legacy-peer-deps
npx expo start --clear
```

### Environment setup

```bash
# One-shot helper that writes .env with your LAN IP
./setup-local-dev.sh      # macOS / Linux
setup-local-dev.bat       # Windows
```

Manual `.env` contents:

**Backend — `vitaltrack-backend/.env`**
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/vitaltrack
SECRET_KEY=<at-least-32-chars>
ENVIRONMENT=development
```

**Mobile — `vitaltrack-mobile/.env`**
```env
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:8000
```

---

## I · Verification checklist

### Backend
```
□ Docker Desktop is running
□ docker ps shows 2 containers (api + db)
□ Both containers status: Up
□ http://localhost:8000/health → {"status":"healthy"}
□ http://localhost:8000/docs loads Swagger UI
□ docker compose logs api has no ERROR/CRITICAL lines
□ alembic current matches the newest migration filename
    (as of PR #13: 20260419_add_account_deletion_token_fields)
```

### Mobile
```
□ npm install completed cleanly (with --legacy-peer-deps)
□ npx expo start shows QR
□ Metro says "Waiting on exp://…"
□ No red error banners in the terminal
```

### Connection
```
□ Found PC IP: _______________
□ http://IP:8000/health works from the PHONE browser
□ .env has that exact IP (no typos, no trailing slash)
□ Metro restarted with --clear after any .env change
```

### App
```
□ Expo Go scans the QR and loads the bundle
□ Not stuck on splash
□ Auth screen appears
□ Can register a new account
□ Dashboard loads
□ Can create an item → appears in Inventory
□ Activity log shows the item_created entry
□ Profile screen (top-right menu) opens, shows user info
```

---

## Quick reference

```
┌────────────────────────────────────────────────────────────┐
│             CAREKOSH LOCAL DEV QUICK REFERENCE              │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  START BACKEND:                                            │
│    cd vitaltrack-backend                                   │
│    docker compose -f docker-compose.dev.yml up --build -d  │
│                                                            │
│  START MOBILE:                                             │
│    cd vitaltrack-mobile                                    │
│    npx expo start --clear                                  │
│                                                            │
│  FIND YOUR IP:                                             │
│    Windows: ipconfig | findstr "IPv4"                      │
│    macOS:   ipconfig getifaddr en0                         │
│    Linux:   hostname -I | awk '{print $1}'                 │
│                                                            │
│  VERIFY BACKEND:                                           │
│    curl http://localhost:8000/health                       │
│                                                            │
│  PHONE CAN'T CONNECT?                                      │
│    1. .env has correct IP                                  │
│    2. npx expo start --clear                               │
│    3. USB: adb reverse tcp:8000 tcp:8000                   │
│    4. Tunnel: npx expo start --tunnel                      │
│                                                            │
│  FRESH DB:                                                 │
│    docker compose down -v && docker compose up --build     │
│                                                            │
└────────────────────────────────────────────────────────────┘
```
