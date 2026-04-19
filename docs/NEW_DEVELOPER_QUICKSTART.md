# New Developer Quick Start

> **Time required:** ~30 minutes
> **Goal:** CareKosh running locally — backend + mobile connected, able to register and log in.

For the comprehensive reference, see the repo-root [CAREKOSH_DEVELOPER_GUIDE.md](../CAREKOSH_DEVELOPER_GUIDE.md). This file is the fast path.

---

## Prerequisites

- **Docker Desktop** — [download](https://www.docker.com/products/docker-desktop/), must be running
- **Node.js 20+** — `node --version` to verify
- **Git**
- **Expo Go** app on your phone — [iOS](https://apps.apple.com/app/expo-go/id982107779) · [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)
- Phone + PC on the **same Wi-Fi network** (or be ready to use `adb reverse` — see [USB_ADB_REVERSE_GUIDE.md](USB_ADB_REVERSE_GUIDE.md))

---

## Step 1 — Clone (2 min)

```bash
git clone https://github.com/rishabhrd09/vitaltrack.git
cd vitaltrack
```

The repo is called `vitaltrack` for legacy reasons — the product is **CareKosh**. Directory names `vitaltrack-backend/` and `vitaltrack-mobile/` are deliberately unchanged.

---

## Step 2 — Environment setup (1 min)

**Windows**
```cmd
setup-local-dev.bat
```

**macOS / Linux**
```bash
chmod +x setup-local-dev.sh
./setup-local-dev.sh
```

Outputs "Setup complete!" and creates `.env` files seeded with your LAN IP.

---

## Step 3 — Start the backend (5 min)

```bash
cd vitaltrack-backend
docker compose -f docker-compose.dev.yml up --build -d
docker compose logs -f api
```

Wait for:
```
api-1  | INFO:     Application startup complete.
api-1  | INFO:     Uvicorn running on http://0.0.0.0:8000
```

`docker-entrypoint.sh` waits for Postgres, runs `alembic upgrade head`, then starts Gunicorn — you do not run migrations manually.

**Verify:** http://localhost:8000/health → `{"status":"healthy"}`
**API docs:** http://localhost:8000/docs

Keep this terminal running. Open a new one for the next step.

---

## Step 4 — Start the mobile app (5 min)

```bash
cd vitaltrack-mobile
npm install --legacy-peer-deps
npx expo start --clear
```

Expect: QR code in the terminal + `Metro waiting on…`

---

## Step 5 — On your phone (2 min)

1. Open **Expo Go**.
2. Scan the QR code.
3. Wait ~30 s for the first-load Metro bundle.
4. Tap **Create Account** — enter name, email, password.
5. Since dev defaults `REQUIRE_EMAIL_VERIFICATION=False`, you're taken straight to the dashboard. (Staging + production require email verification — see [EMAIL_VERIFICATION_GUIDE.md](EMAIL_VERIFICATION_GUIDE.md).)

Success — CareKosh is running locally.

---

## Verification checklist

```
□ Backend
  □ docker ps shows 2 containers (api + db)
  □ http://localhost:8000/health returns {"status":"healthy"}
  □ http://localhost:8000/docs shows Swagger UI
  □ alembic head matches newest file in vitaltrack-backend/alembic/versions/
    (as of PR #13: 20260419_add_account_deletion_token_fields)

□ Mobile
  □ QR code shown, no red errors
  □ Metro says "Waiting on exp://…"

□ Device
  □ Expo Go scans the QR
  □ Dashboard loads after registration
  □ Creating an item works; activity log updates
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Network request failed" | `.env` has wrong IP; restart Expo with `--clear`; or use `adb reverse` (USB) |
| Docker not starting | Docker Desktop must be running in the tray |
| Phone can't reach backend | Use USB: `adb reverse tcp:8000 tcp:8000` — see [USB_ADB_REVERSE_GUIDE.md](USB_ADB_REVERSE_GUIDE.md) |
| `npm install` fails | Always `npm install --legacy-peer-deps` (React Native peer-dep weirdness) |
| Port 5432 conflict | Local Postgres running; stop it, or edit the host-side port in `docker-compose.dev.yml` |
| "Can't connect to database" in backend logs | Happens during the first 30 seconds — `docker-entrypoint.sh` is probing. Wait. |

Deep dive: [LOCAL_TESTING_COMPLETE_GUIDE.md](LOCAL_TESTING_COMPLETE_GUIDE.md).

---

## Common commands

```bash
# Backend
docker compose -f docker-compose.dev.yml up --build -d      # start
docker compose -f docker-compose.dev.yml down               # stop (keep volume)
docker compose -f docker-compose.dev.yml down -v            # stop + wipe DB
docker compose -f docker-compose.dev.yml logs -f api        # tail logs

# Mobile
npx expo start                  # dev server
npx expo start --clear          # clear Metro cache
npx expo start --tunnel         # firewall / LAN bypass

# Setup
./setup-local-dev.sh            # regenerate .env with your current IP
```

---

## Next steps

1. **Pick a first task** — see [CAREKOSH_ROADMAP.md](../CAREKOSH_ROADMAP.md).
2. **Learn the flow** — [GIT_WORKFLOW_GUIDE.md](GIT_WORKFLOW_GUIDE.md).
3. **Understand the architecture** — [CAREKOSH_DEVELOPER_GUIDE.md §1](../CAREKOSH_DEVELOPER_GUIDE.md#1-architecture-overview) and the architecture HTML at the repo root (`carekosh_architecture_diagrams.html`).
4. **Contribute** — [CAREKOSH_DEVELOPER_GUIDE.md §12](../CAREKOSH_DEVELOPER_GUIDE.md#12-contribution-workflow) (branch names, commit convention, PR flow).

Questions? Open a GitHub issue or tag `@rishabhrd09`.
