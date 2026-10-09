# Complete Local Testing Guide

> **AI voice source update — 9 October 2026:** Current AI voice architecture, checked against the 9 October 2026 working tree at `0946eb7` plus local UI/capture changes: Android AudioRecord → Moonshine provisional live words → offline Moonshine or separately opted-in Groq Whisper final transcript → review/edit and Send → local parser or consented Groq GPT-OSS v2 specification → validated real inventory answers/local unsaved drafts. Device TTS and PDF rendering are local. Only touch confirmation saves an order; voice cannot change stock. Groq text and audio permissions are separate; hosted speech/Sarvam are not selected. Earlier dated test/release claims retain their original scope. This source review does not certify live deployment, account billing, all phones or recognition accuracy. [Complete stack, request flow, consent, costs and code map](VOICE_INVENTORY_AND_ORDER_DRAFTS.md).


> 8 October 2026 safety follow-up: targeted code fixes are local, tested changes after the earlier audit. Deployment and real-device acceptance remain separate. [Current changes and remaining scope](BACKEND_HARDENING.md#safety-follow-up-8-october-2026).

> **Status (re-checked 8 October 2026):** Commands and file facts re-checked against the working tree of branch `feature/backend-hardening-ai-voice-agent-foundation` (`03cfebb` plus uncommitted documentation); `main` is `835fad3`. Phones, ADB and native builds were not re-tested. On the feature branch the local database migrates to `0010_order_local_id_unique` (`0006` on `main`), and migration `0007` cannot be downgraded — switching a local database between the two branches needs a reset (§F). Backend suite: 242 tests; mobile suite: 121 tests (`npm test`); both passed again on 8 Oct 2026 (backend against a disposable local PostgreSQL 16 database). Earlier note (23 Sept 2026): head `0007`, 152 backend tests — now out of date. Current behaviour: [complete developer guide](CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md) · [documentation home](INDEX.html).

> The definitive reference for running CareKosh locally — from architecture to the long tail of troubleshooting.

For a 30-minute onramp, start with [NEW_DEVELOPER_QUICKSTART.md](NEW_DEVELOPER_QUICKSTART.md); the main onboarding entry is [CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md](CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md). This guide goes wider and deeper on local setup.

Companion docs:
- **Conceptual deep-dive** ("what is actually happening when I run these commands"): [LOCAL_TESTING_INTERNALS.md](LOCAL_TESTING_INTERNALS.md)
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
│             │  HTTP API              │   │   FastAPI backend   │   │         │
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
- Expo Go on the phone loads the JS bundle over Metro and talks to the local API over plain HTTP (`http://<PC-IP>:8000`, or `http://localhost:8000` with `adb reverse`). Earlier text said HTTPS; only staging and production use HTTPS.
- Both Compose files publish the API (8000), PostgreSQL (5432, user/password `postgres`/`postgres`) and, with the pgAdmin profile, pgAdmin (5050, password `admin`) on **all** network interfaces, not only `localhost`. Run them only on a network you trust.
- `docker-compose.dev.yml` sets `REQUIRE_EMAIL_VERIFICATION=true`. With `MAIL_PASSWORD` blank, the backend skips the login gate to avoid local lockout; once you configure Brevo locally, you must verify the email before login.
- The mobile app is **server-first** (TanStack Query). No offline queue; AsyncStorage holds a read-only display cache and small settings (theme and, on the feature branch, voice preferences), never the source of truth. If the backend is down, writes error out — they do not silently queue.
- Expo Go cannot load the voice assistant's native module (feature branch). To test voice locally you need an EAS-built Android APK from the `preview` profile. (The `development` profile cannot build until `expo-dev-client` is installed; it is not.)

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
| `npm run start:local` | Local Docker (`http://localhost:8000`) | Day-to-day dev (on a physical phone this needs `adb reverse tcp:8000 tcp:8000`) |
| `npm run start:staging` | Staging API (`https://staging-api.carekosh.com`) | Reproduce a staging bug against staging's Neon data |
| `npm run start:prod` | Production API (`https://api.carekosh.com`) | Avoid for development: it points the dev app at real production data |
| `npm run start` | `.env` setting | When you want manual control |

**Keep one source for the URL.** If `vitaltrack-mobile/.env` also sets `EXPO_PUBLIC_API_URL`, remove that line before using these scripts: in development the `.env` value overrides the script's value (read from the installed Expo SDK 54 code; not tested on a phone).

**Windows:** the scripts use `cross-env` for cross-platform env var syntax. It is already in `devDependencies`, so `npm install --legacy-peer-deps` installs it; no separate install step is needed (earlier text said to install it by hand).

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

Open `http://YOUR_IP:8000/health` in the **phone's browser**. Expect (version, environment and timestamp fields omitted):
```json
{"status":"healthy","database":"connected"}
```

- Timeout → firewall is blocking (see §E).
- `503` / `database:"unavailable"` → backend is reachable, but the database readiness probe failed.
- "Connection refused" → backend isn't actually running.
- Browser loads, but the app fails → check the `.env` value matches the IP exactly.

### Step 3 — Point the app at your backend

Over Wi-Fi the phone must use your PC's LAN IP. Put it in `vitaltrack-mobile/.env`:
```env
EXPO_PUBLIC_API_URL=http://192.168.X.X:8000
```

Do not use `npm run start:local` here: it sets `http://localhost:8000`, which a phone on Wi-Fi reaches only through `adb reverse` (USB guide).

Note: in development, Expo picks up `.env` edits; reload the app fully afterwards (Expo's documentation says that is enough). A value set by a `start:*` script changes only when you restart Metro with another script.

### Step 4 — Start (or restart) Metro
```bash
npx expo start --clear
```

`--clear` empties Metro's transform cache. It is harmless, but it is not what selects the URL.

### Step 5 — Test

1. Scan the QR code in Expo Go.
2. Register an account. The app always goes to the "Check your email" screen after registering (it does not sign you in). If local email is configured, verify the email first; with `MAIL_PASSWORD` blank no email is sent and the backend skips the gate, so tap "I've Verified — Go to Login" and sign in.
3. Dashboard loads → you're in.

---

## D · Tunnel method (fallback)

Use when: corporate Wi-Fi with client isolation, strict firewalls, phone on a different network.

```bash
cd vitaltrack-mobile
npx expo start --tunnel
```

Expo creates a public URL (through `@expo/ngrok`, which it offers to install) and routes Metro traffic through it. The app still hits whatever `EXPO_PUBLIC_API_URL` points at, so your phone must be able to reach that URL — typically this means `npm run start:staging -- --tunnel`, letting the phone hit staging directly.

**Trade-offs**

- ✅ Works behind firewalls and on split networks.
- ❌ Slower than direct.
- ❌ Requires internet on both sides.
- ❌ Won't help you hit a local backend. Tunnelling the backend too (for example with `ngrok`) would put your development API, with its `/docs` page, on the public internet; prefer staging.

---

## E · Windows firewall

### Triage

Temporarily disable the firewall:
```
Settings → Privacy & security → Windows Security → Firewall & network protection → turn OFF the active profile
```

Turn it back on straight after the test, and do this only on a network you trust.

- If the phone now reaches the PC → firewall was the cause; add permanent rules below.
- If it still fails → router isolation or Wi-Fi AP client-isolation.

### Permanent rules (PowerShell as admin)

`profile=private` limits each rule to the Private network profile, so the ports stay closed on public networks (café, hotel). Your home Wi-Fi must be set to Private. (Earlier text left the profile out.)

```powershell
netsh advfirewall firewall add rule name="Expo Metro"    dir=in action=allow protocol=tcp localport=8081 profile=private
netsh advfirewall firewall add rule name="CareKosh API"  dir=in action=allow protocol=tcp localport=8000 profile=private
# Not recommended: opening 5432 exposes the dev database (user/password postgres/postgres) to the network.
# Remove a rule later with: netsh advfirewall firewall delete rule name="Expo Metro"
```

The repository-root `fix-firewall.ps1` does something similar for port 8000 only, but on both the **Private and Public** profiles, and it has no undo script. Remove its rule when you are done: `Remove-NetFirewallRule -DisplayName "VitalTrack-Backend-8000"` (Administrator PowerShell).

### Docker through the firewall

`Settings → Windows Security → Firewall → Allow an app through firewall` → find **Docker Desktop** → check **Private**. Avoid **Public**: both Compose files publish the API (8000), PostgreSQL (5432, `postgres`/`postgres`) and pgAdmin (5050) on all network interfaces.

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
brew services list                  # find the exact name, e.g. postgresql@16
brew services stop postgresql@16
```

Alternative: change the host-side port in `docker-compose.dev.yml` (e.g. `5433:5432`).

### "Database tables don't exist"
The dev container's inline entrypoint runs `alembic upgrade head` on startup. If you bypassed it:
```bash
docker compose -f docker-compose.dev.yml exec api alembic upgrade head
```

### Container exits or keeps restarting
```bash
docker compose -f docker-compose.dev.yml logs -f api
```

Common causes:
- A bad `DATABASE_URL` or `SECRET_KEY` after editing `docker-compose.dev.yml`. The dev compose file sets both itself, so the values in `.env` are not used by this stack (earlier text pointed at `.env`). If you run the backend outside Docker, `DATABASE_URL` comes from your shell or, failing that, `.env` (shell values win). URL-encode reserved password characters such as `@`. The 8 Oct 2026 local A-27 fix escapes percent signs for Alembic's ConfigParser, which returns the original encoded URL to SQLAlchemy. Do not remove required encoding.
- `SECRET_KEY` shorter than 32 characters — refused in **every** environment. Only the `CHANGE-THIS…` placeholder is tolerated in development (earlier text said development was lenient about length).
- Python syntax error in your last edit

Note: a failed `alembic upgrade head` does **not** stop the dev container. The entrypoint generated in `Dockerfile.dev` has no `set -e`, and development startup then creates any missing tables straight from the models, so a migration problem can surface later as odd API errors. Check the log lines above "Starting server..." (the production `docker-entrypoint.sh`, by contrast, exits on a failed migration).

### "Can't locate revision" in Alembic logs
Your local DB is on a revision that the current code doesn't know about. Most often: the database was upgraded on the feature branch (head `0010_order_local_id_unique`) and you then checked out `main` (head `0006_order_item_qty_positive`). Migration `0007` cannot be downgraded, so reset the dev volume:
```bash
docker compose -f docker-compose.dev.yml down -v    # WIPES dev DB
docker compose -f docker-compose.dev.yml up --build
```

**Never do this on staging or production.**

### Fresh-start nuclear option
```bash
cd vitaltrack-backend
docker compose -f docker-compose.dev.yml down -v    # WIPES every local account, item and order in the dev volume
docker compose -f docker-compose.dev.yml up --build -d
docker compose -f docker-compose.dev.yml logs -f api
```

### "Database not ready yet..." during API startup
Normal while the dev entrypoint waits for Postgres at `db:5432`. The dev entrypoint retries every 2 s with no limit (it never exits on its own) and checks `DATABASE_HOST`/`DATABASE_PORT`, not `DATABASE_URL`. If it keeps repeating, inspect the `db` container health (`docker compose -f docker-compose.dev.yml ps`) and those two variables. (The production `docker-entrypoint.sh` gives up after 30 tries and continues with a warning.)

---

## G · Expo / Metro troubleshooting

### "Network request failed" inside the app

Debug in order:
1. Backend up on PC: `curl http://localhost:8000/health` → status `healthy` and database `connected`
2. Phone can reach PC: `http://YOUR_IP:8000/health` in the phone browser works
3. `.env` exactly matches that IP (no typos, no trailing slash)
4. App fully reloaded **after** the `.env` change (restart Metro if unsure), and no `start:*` script with a different URL in use — in development a `.env` URL overrides the script's (§B.1)
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
- Open `http://localhost:8081/status` in the PC's browser; `packager-status:running` confirms Metro is up. (Pressing `w` would try to start the web build, which needs packages this project does not install.)
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
Historical (March 2026): this Expo Go error was attributed to `expo-updates` being installed while `app.json` had no `updates` block; Expo's documentation does not confirm that cause. `app.json` now has the following, for every build (not only development), so no build looks for over-the-air updates:
```json
"updates": { "enabled": false }
```
This shipped in the Railway → Render migration (commit `9d7091c`, PR #1). If the error appears again, first check that the Expo Go build matches SDK 54.

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

# stop + wipe DB (fresh start) — deletes the dev volume and all local data, no undo
docker compose -f docker-compose.dev.yml down -v

# tail logs
docker compose -f docker-compose.dev.yml logs -f api

# run migrations manually
docker compose -f docker-compose.dev.yml exec api alembic upgrade head

# psql into the dev DB
docker compose -f docker-compose.dev.yml exec db psql -U postgres -d vitaltrack

# container status
docker ps

# backend tests: they DROP EVERY TABLE before and after each test. Use a disposable
# database whose name contains "test", ENVIRONMENT=testing and an empty MAIL_PASSWORD;
# never the dev database above. Recipe: local_testing_field_manual.html §06.08
```

### Mobile

```bash
cd vitaltrack-mobile

npm install --legacy-peer-deps          # install deps

npx expo start                          # normal
npx expo start --clear                  # flush Metro's transform cache (when the bundle looks stale)
npx expo start --tunnel                 # public tunnel (firewall bypass)
npx expo start --lan                    # force LAN mode

npx tsc --noEmit                        # type check
npm run lint                            # ESLint
npm test                                # node --test tests/*.test.cjs (feature branch: 121 tests, re-run 8 Oct 2026)
npx expo-doctor                         # Expo config sanity (not installed; npx fetches it; CI ignores its result)

# full reset
rm -rf node_modules .expo
npm install --legacy-peer-deps
npx expo start --clear
```

### Environment setup

```bash
# One-shot helper, run from the repository root
bash setup-local-dev.sh   # macOS / Linux (the file is not marked executable in git)
setup-local-dev.bat       # Windows
```

What the helpers do: check for Node, npm, Git and Docker; detect a LAN IP (check it — the Windows script takes the first IPv4 address, which can be a virtual adapter); write `vitaltrack-backend/.env` and `vitaltrack-mobile/.env` **only if they do not exist yet**; and run `npm install --legacy-peer-deps` in `vitaltrack-mobile`. They run no Docker command and delete nothing. The mobile `.env` they write sets `EXPO_PUBLIC_API_URL` to your LAN IP — remove that line if you later use the `start:*` scripts (§B.1).

Manual `.env` contents:

With `docker-compose.dev.yml`, only `LOCAL_IP`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM` and `FRONTEND_URL` are read from the backend `.env` (by compose, for substitution). The compose file sets `DATABASE_URL`, `SECRET_KEY` and `ENVIRONMENT` itself, and `.env` is not copied into the image. The remaining lines below matter only if you run the backend outside Docker — and then the database host is `localhost`, not `db`. With `docker-compose.yml` instead, **every** key in `.env` reaches the container except those the file sets itself, so a real `MAIL_PASSWORD` or `GROQ_API_KEY` there is live.

**Backend — `vitaltrack-backend/.env`**
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/vitaltrack
SECRET_KEY=<at-least-32-chars>
ENVIRONMENT=development
LOCAL_IP=YOUR_LAN_IP
MAIL_FROM=noreply@carekosh.com
MAIL_PASSWORD=
FRONTEND_URL=http://YOUR_LAN_IP:8000/api/v1/auth
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
□ http://localhost:8000/health → status healthy + database connected when DB is reachable
□ http://localhost:8000/live → status healthy + database not_checked
□ http://localhost:8000/docs loads Swagger UI
    (only because docker-compose.dev.yml sets DEBUG=true; docs are off otherwise)
□ docker compose -f docker-compose.dev.yml logs api has no ERROR/CRITICAL lines
□ docker compose -f docker-compose.dev.yml exec api alembic current
    prints the head revision id (not a file name):
    feature branch: 0010_order_local_id_unique (head)
    main:           0006_order_item_qty_positive (head)
    (earlier text named the PR #13 file 20260419_add_account_deletion_token_fields)
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
□ App fully reloaded (or Metro restarted) after any .env change
```

### App
```
□ Expo Go scans the QR and loads the bundle
□ Not stuck on splash
□ Auth screen appears
□ Can register a new account
□ Dashboard loads
□ Can create an item → appears in Inventory
□ Dashboard → Recent Activity shows an "Item Create" entry
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
│    2. Reload the app (or restart Metro)                    │
│    3. USB: adb reverse tcp:8000 tcp:8000                   │
│       and use http://localhost:8000                        │
│    4. Tunnel (Metro only, so use staging):                 │
│       npm run start:staging -- --tunnel                    │
│                                                            │
│  FRESH DB (wipes the dev database):                        │
│    docker compose -f docker-compose.dev.yml down -v        │
│    docker compose -f docker-compose.dev.yml up --build -d  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```
