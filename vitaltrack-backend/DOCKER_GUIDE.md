# 📚 Complete Docker Conceptual Guide

> **8 October 2026 local feature update:** richer inventory tables, bounded queries and unsaved voice-prepared drafts are implemented locally. Only touch confirmation saves an order; saving does not change stock. Matching backend/mobile deployment and phone acceptance remain pending. [Current flow, code map and verification limits](../docs/VOICE_INVENTORY_AND_ORDER_DRAFTS.md). Earlier dated results remain historical.


> 8 October 2026 safety follow-up: targeted code fixes are local, tested changes after the earlier audit. Deployment and real-device acceptance remain separate. [Current changes and remaining scope](../docs/BACKEND_HARDENING.md#safety-follow-up-8-october-2026).

A comprehensive guide explaining Docker concepts for the CareKosh backend. (Container and image names still use the legacy `vitaltrack-*` prefix — they match the directory name, which we deliberately did not rename during the CareKosh rebrand.)

> **Status (re-checked 8 October 2026 against the working tree, `03cfebb` plus uncommitted documentation):** conceptual tutorial from January 2026; the concepts still apply. Image sizes and layer counts below are example observations from that time, not current measurements. `docker-compose.dev.yml` builds `Dockerfile.dev` (one stage, `pip install`, `uvicorn --reload`, no ffmpeg, runs as root). `docker-compose.yml` builds the multi-stage production `Dockerfile` (virtual env copied from a builder stage, non-root user, Gunicorn with 2 workers, ffmpeg). Their start-up differs; see [Dev image vs production image](#-dev-image-vs-production-image). For setup commands see the [backend README](README.md) and the [complete developer guide](../docs/CAREKOSH_COMPLETE_DEVELOPER_GUIDE.md).

---

## 🧱 Part 1: The Three Core Concepts

### Image vs Container vs Layer

Think of it like cooking:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    COOKING ANALOGY                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   RECIPE (Instructions)  →  IMAGE (Blueprint)                       │
│   INGREDIENTS (Steps)    →  LAYERS (Build steps)                    │
│   COOKED DISH (Running)  →  CONTAINER (Running app)                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

| Concept | What It Is | Analogy |
|---------|------------|---------|
| **Image** | A frozen snapshot with all code + dependencies | Recipe book (doesn't cook itself) |
| **Container** | A running instance of an image | The actual dish being cooked |
| **Layer** | Each step that built the image | Individual recipe steps |

---

## 📸 Understanding Docker Desktop Views

### Containers (Running Apps)

```
┌──────────────────────────────────────────────────────────────┐
│  CONTAINERS = Running Applications                           │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  🟢 vitaltrack-db-dev → PostgreSQL database running          │
│     Port: 5432:5432   → You can connect on port 5432         │
│                                                               │
│  🟢 vitaltrack-api-dev → Your FastAPI app running            │
│     Port: 8000:8000   → You can access on localhost:8000     │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

**These are LIVE running programs!** Like having two apps open on your computer.

> **Local exposure warning:** a mapping such as `5432:5432` publishes the port on every network interface of your computer, not only `localhost`. Both compose files do this for PostgreSQL (user and password `postgres`) and for the optional pgAdmin (port 5050, default `admin` password). Use them only on a trusted network. Recommended (not in the files): bind to `127.0.0.1:5432:5432` and `127.0.0.1:5050:80` in a local override.

---

### Images (Blueprints)

```
┌──────────────────────────────────────────────────────────────┐
│  IMAGES = Blueprints (Not Running)                           │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  📦 postgres:16-alpine (305 MB)                              │
│     → Downloaded from Docker Hub                             │
│     → Blueprint for PostgreSQL                               │
│                                                               │
│  📦 vitaltrack-backend-api (525 MB)                          │
│     → Built from YOUR Dockerfile                             │
│     → Contains your Python code + all packages               │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

**Images don't do anything until you "run" them as containers.**

---

### Layers (Build Steps)

```
┌──────────────────────────────────────────────────────────────┐
│  LAYERS = How the image was built, step by step              │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  postgres:16-alpine has 24 layers:                           │
│  ├── Layer 0: Start with Alpine Linux (9 MB)                 │
│  ├── Layer 2: Create postgres user (45 KB)                   │
│  ├── Layer 12: Download PostgreSQL (273 MB) ← biggest!       │
│  └── ... more setup steps                                    │
│                                                               │
│  vitaltrack-backend-api has 21 layers:                       │
│  ├── Layer 0: Start with Debian Linux (87 MB)                │
│  ├── Layer 5: Install Python 3.12                            │
│  ├── Layer 13: Copy virtual env with packages (254 MB)       │
│  └── ... your code gets copied                               │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

**Layers are cached!** If you rebuild, Docker reuses unchanged layers = faster builds.

(The `vitaltrack-backend-api` example above is the production `Dockerfile`. The dev image from `Dockerfile.dev` installs packages with pip directly, so it has no virtual-env copy layer.)

---

## 🔄 What Happens After `docker compose -f docker-compose.dev.yml up -d`

```
STEP BY STEP:

1️⃣ Docker reads docker-compose.dev.yml
   └── "I need 2 services: api and db" (pgadmin starts only with --profile tools)

2️⃣ For 'db' service:
   └── Download postgres:16-alpine image (if not exists)
   └── Create container 'vitaltrack-db-dev'
   └── Start PostgreSQL on port 5432
   └── Create database 'vitaltrack'

3️⃣ For 'api' service:
   └── Read Dockerfile.dev (named by `dockerfile:` in the dev compose file)
   └── Build image layer by layer:
       ├── Start with Python 3.12
       ├── Install pip packages (FastAPI, SQLAlchemy, etc.)
       └── Copy your code (app/ and alembic/ are also mounted for hot reload)
   └── Wait until 'db' reports healthy, then create container 'vitaltrack-api-dev'
   └── Entrypoint waits for Postgres (no time limit), runs `alembic upgrade head`,
       then starts FastAPI (uvicorn --reload) on port 8000, even if the migration failed

4️⃣ Connect both containers on same network
   └── 'api' can talk to 'db' using hostname 'db'

5️⃣ Health check passes → Both are running! ✅
```

## 🧭 Dev image vs production image

- **`Dockerfile.dev`** (used by `docker-compose.dev.yml`): runs as root, waits for `db` forever, and starts `uvicorn --reload` even after a failed migration. Because `ENVIRONMENT=development`, the app also runs `create_all` at start-up, which can hide a failed migration. No ffmpeg, so the optional server-side transcription route (off by default) cannot decode audio there (503).
- **`Dockerfile`** (production; also built locally by `docker-compose.yml`): `docker-entrypoint.sh` reads host and port from `DATABASE_URL` (unless `DATABASE_HOST` is set, as `docker-compose.yml` does) and tries `pg_isready` 30 times, 2 s apart, then continues anyway. If the URL has no `:port`, it probes `localhost:5432` instead and loses a minute or more first. A failed `alembic upgrade head` stops the container. Then it `exec`s Gunicorn with `--bind 0.0.0.0:${PORT:-8000}`.
- A `%` in `DATABASE_URL` (for example a percent-encoded password) makes `alembic/env.py` raise, so the production container stops before serving.

---

## 🆚 Local Development vs Docker Development

### Traditional Local Development (Without Docker)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    LOCAL DEVELOPMENT                                 │
│              (Without Docker - Traditional Way)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   YOUR COMPUTER                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                                                              │   │
│   │   macOS / Windows / Linux                                   │   │
│   │   ├── Python 3.12 (installed globally or in a venv)         │   │
│   │   ├── PostgreSQL 16 (installed globally)                    │   │
│   │   ├── pip packages (installed in venv)                      │   │
│   │   └── Your code (in a folder)                               │   │
│   │                                                              │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│   PROBLEMS:                                                          │
│   ❌ "Works on my machine" - might not work on colleague's PC       │
│   ❌ Version conflicts (Python 3.9 vs 3.11)                         │
│   ❌ Messy uninstalls leave files behind                            │
│   ❌ Different OS = different setup steps                           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Docker Development (Containerized Way)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DOCKER DEVELOPMENT                                │
│                    (Containerized Way)                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   YOUR COMPUTER                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                                                              │   │
│   │   macOS / Windows / Linux                                   │   │
│   │   └── Docker Desktop                                        │   │
│   │       ├─────────────────────┐  ┌─────────────────────┐      │   │
│   │       │ Container: api      │  │ Container: db       │      │   │
│   │       │ ┌─────────────────┐ │  │ ┌─────────────────┐ │      │   │
│   │       │ │ Linux           │ │  │ │ Linux           │ │      │   │
│   │       │ │ Python 3.12     │ │  │ │ PostgreSQL 16   │ │      │   │
│   │       │ │ pip packages    │ │  │ │ Database files  │ │      │   │
│   │       │ │ Your code       │ │  │ └─────────────────┘ │      │   │
│   │       │ └─────────────────┘ │  └─────────────────────┘      │   │
│   │       └─────────────────────┘                               │   │
│   │                                                              │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│   BENEFITS:                                                          │
│   ✅ Same setup works on ANY computer                               │
│   ✅ Isolated - doesn't mess with your system                       │
│   ✅ Easy cleanup - just delete containers                          │
│   ✅ Reproducible - same environment every time                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

Caveat: these files use floating tags (`python:3.12-slim`, `postgres:16-alpine`, `dpage/pgadmin4:latest`), and `requirements.txt` pins only direct dependencies, so two builds months apart can differ. Full reproducibility needs pinned image digests and a lock file.

---

## 🏢 How Real Companies Use Docker

Yes! Most companies use Docker similarly, but with more tools:

| Environment | What They Use |
|-------------|---------------|
| **Local Dev** | `docker compose up` (exactly like you!) |
| **Testing/CI** | Docker containers in GitHub Actions / Jenkins |
| **Production** | Kubernetes (manages 100s of containers) — CareKosh itself runs its API as a Docker web service on Render (production and staging services; dashboard settings NOT VERIFIED), not Kubernetes |

### Real Company Workflow

```
DEVELOPER'S LAPTOP                    PRODUCTION SERVERS
┌─────────────────────┐               ┌─────────────────────┐
│                     │               │                     │
│  docker compose     │   Git Push    │  Kubernetes         │
│  up -d              │  ──────────►  │  (or Docker Swarm)  │
│                     │               │                     │
│  Test locally       │   CI/CD       │  Same containers    │
│                     │   Pipeline    │  running at scale   │
│                     │               │                     │
└─────────────────────┘               └─────────────────────┘

Same Docker images run everywhere! That's the magic.
```

In CareKosh the dev image is not the production image: to run the production `Dockerfile` locally, use `docker-compose.yml` instead of `docker-compose.dev.yml`.

### Companies That Use Docker

(Illustrative, simplified public examples; not verified for this guide.)

- **Spotify** - Microservices in containers
- **Netflix** - 1000s of containers
- **Uber** - All services containerized
- **Google** - Created Kubernetes for managing containers
- **Almost every tech startup** - Standard practice

---

## 🎯 Quick Reference Summary

| Term | Simple Explanation |
|------|-------------------|
| **Image** | A zip file containing your app + all dependencies |
| **Container** | That zip file "unzipped and running" |
| **Layer** | Each build step, cached for speed |
| **docker compose up** | "Start all my containers" |
| **Volume** | Persistent storage (database data survives restarts) |

---

## 🔧 Common Docker Commands

```bash
# Start all services
docker compose -f docker-compose.dev.yml up --build -d

# Stop and remove the containers (the database volume is kept)
docker compose -f docker-compose.dev.yml down

# View logs
docker compose -f docker-compose.dev.yml logs -f api

# Rebuild after dependency or Dockerfile changes
# (edits in app/ and alembic/ are mounted and reload without a rebuild)
docker compose -f docker-compose.dev.yml up -d --build

# Troubleshooting only: rerun migrations manually
docker compose -f docker-compose.dev.yml exec api alembic upgrade head

# Reset everything. DESTRUCTIVE: -v deletes the local database volume and all its data
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up --build -d
```

---

## ✅ CareKosh Setup Checklist

After running `docker compose -f docker-compose.dev.yml up --build -d`, you should have:

- ✅ `vitaltrack-db-dev` container running (PostgreSQL)
- ✅ `vitaltrack-api-dev` container running (FastAPI)
- ✅ Network created (they can talk to each other)
- ✅ Volume created (database data persists)

Alembic migrations run automatically at container startup. Run `docker compose -f docker-compose.dev.yml exec api alembic upgrade head` only while troubleshooting a bypassed or failed startup. (The dev entrypoint keeps starting the server even if the migration fails, so read the log.) If you switch a local database between the feature branch (migrations up to `0010`) and `main` (up to `0006`), reset it with `down -v` (this deletes all local data): migration `0007` cannot be downgraded.

Then access: **http://localhost:8000/docs** 🚀 (available because the dev compose file sets `DEBUG=true`)

---

*Created: January 24, 2026 · Reviewed: October 7, 2026 · Re-checked: October 8, 2026 against `Dockerfile`, `Dockerfile.dev`, `docker-entrypoint.sh` and both compose files (no Docker command was run)*
