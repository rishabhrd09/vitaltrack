# 📚 Complete Docker Conceptual Guide

A comprehensive guide explaining Docker concepts for the VitalTrack backend.

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
│  🟢 vitaltrack-db     → PostgreSQL database running          │
│     Port: 5432:5432   → You can connect on port 5432         │
│                                                               │
│  🟢 vitaltrack-api    → Your FastAPI app running             │
│     Port: 8000:8000   → You can access on localhost:8000     │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

**These are LIVE running programs!** Like having two apps open on your computer.

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

---

## 🔄 What Happens After `docker compose up -d`

```
STEP BY STEP:

1️⃣ Docker reads docker-compose.yml
   └── "I need 2 services: api and db"

2️⃣ For 'db' service:
   └── Download postgres:16-alpine image (if not exists)
   └── Create container 'vitaltrack-db'
   └── Start PostgreSQL on port 5432
   └── Create database 'vitaltrack'

3️⃣ For 'api' service:
   └── Read Dockerfile
   └── Build image layer by layer:
       ├── Start with Python 3.12
       ├── Install pip packages (FastAPI, SQLAlchemy, etc.)
       └── Copy your code
   └── Create container 'vitaltrack-api'
   └── Start FastAPI on port 8000

4️⃣ Connect both containers on same network
   └── 'api' can talk to 'db' using hostname 'db'

5️⃣ Health check passes → Both are running! ✅
```

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
│   │   Windows 11                                                │   │
│   │   ├── Python 3.11 (installed globally)                      │   │
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
│   │   Windows 11                                                │   │
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

---

## 🏢 How Real Companies Use Docker

Yes! Most companies use Docker similarly, but with more tools:

| Environment | What They Use |
|-------------|---------------|
| **Local Dev** | `docker compose up` (exactly like you!) |
| **Testing/CI** | Docker containers in GitHub Actions / Jenkins |
| **Production** | Kubernetes (manages 100s of containers) |

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

### Companies That Use Docker

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

```powershell
# Start all services
docker compose up -d

# Stop all services
docker compose down

# View logs
docker compose logs -f api

# Rebuild after code changes
docker compose up -d --build

# Run command inside container
docker compose exec api alembic upgrade head

# Reset everything (including database)
docker compose down -v
docker compose up -d
```

---

## ✅ VitalTrack Setup Checklist

After running `docker compose up -d`, you should have:

- ✅ `vitaltrack-db` container running (PostgreSQL)
- ✅ `vitaltrack-api` container running (FastAPI)
- ✅ Network created (they can talk to each other)
- ✅ Volume created (database data persists)

**Next Step:** Run the migration command:

```powershell
docker compose exec api alembic upgrade head
```

Then access: **http://localhost:8000/docs** 🚀

---

*Created: January 24, 2026*
