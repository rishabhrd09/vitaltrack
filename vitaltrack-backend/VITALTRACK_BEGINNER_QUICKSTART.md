# 🚀 VitalTrack Backend - Beginner's Quick Start Guide

**For developers who want to run this project from scratch**

---

## 📋 What You'll Need (Prerequisites)

Before starting, install these on your computer:

| Tool | Minimum Version | Download Link | Why You Need It |
|------|----------------|---------------|-----------------|
| **Git** | 2.30+ | https://git-scm.com | To clone the code |
| **Docker Desktop** | 4.0+ | https://docker.com/get-started | To run containers |
| **VS Code** (optional) | Latest | https://code.visualstudio.com | To edit code |

### Check If You Have Them:

```bash
# Open terminal/command prompt and run:
git --version      # Should show: git version 2.x.x
docker --version   # Should show: Docker version 24.x.x
```

---

## 🎯 Quick Start (5 Minutes)

### Step 1: Extract the ZIP File

```bash
# Windows: Right-click → Extract All → Choose location
# Mac/Linux: 
unzip vitaltrack-backend.zip
cd vitaltrack-backend
```

### Step 2: Start Everything with ONE Command

```bash
docker compose up -d --build
```

**What this does:**
- Downloads PostgreSQL database
- Builds the API server
- Starts both in background
- Takes 2-3 minutes first time

### Step 3: Setup the Database

```bash
docker compose exec api alembic upgrade head
```

**What this does:**
- Creates all database tables
- Sets up the schema

### Step 4: Verify It's Working

Open your browser and go to:
- **API Documentation:** http://localhost:8000/docs
- **Health Check:** http://localhost:8000/health

You should see:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "database": "connected"
}
```

### 🎉 That's It! The API is Running!

---

## 📖 Step-by-Step Explanation (For Complete Beginners)

### What is Docker?

Docker is like a "virtual computer inside your computer" that runs the app the same way everywhere. Instead of installing Python, PostgreSQL, etc. manually, Docker does it automatically.

### Understanding the Commands

#### Command 1: `docker compose up -d --build`

```
docker compose    → Docker's tool to manage multiple containers
up                → Start the containers
-d                → Detached mode (runs in background)
--build           → Rebuild the images (use when code changes)
```

#### Command 2: `docker compose exec api alembic upgrade head`

```
docker compose exec → Run a command inside a container
api                 → The container name (from docker-compose.yml)
alembic             → Database migration tool
upgrade head        → Apply all pending database changes
```

---

## 🔧 Common Tasks

### View Logs (See What's Happening)

```bash
# See all logs
docker compose logs

# See only API logs (follow mode)
docker compose logs -f api

# See only database logs
docker compose logs db
```

### Stop Everything

```bash
# Stop containers (data preserved)
docker compose stop

# Stop AND remove containers (data preserved in volume)
docker compose down

# Stop, remove, AND delete database data
docker compose down -v
```

### Restart After Code Changes

```bash
docker compose up -d --build
```

### Check Container Status

```bash
docker compose ps
```

Expected output:
```
NAME              STATUS          PORTS
vitaltrack-api    Up (healthy)    0.0.0.0:8000->8000/tcp
vitaltrack-db     Up (healthy)    0.0.0.0:5432->5432/tcp
```

---

## 🧪 Test the API

### Using Swagger UI (Easiest)

1. Open http://localhost:8000/docs
2. Click any endpoint (e.g., `POST /api/v1/auth/register`)
3. Click "Try it out"
4. Fill in the data
5. Click "Execute"

### Using PowerShell (Windows)

```powershell
# Register a new user
Invoke-WebRequest -Uri "http://localhost:8000/api/v1/auth/register" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"test@example.com","password":"Password123","name":"Test User"}'
```

### Using curl (Mac/Linux)

```bash
# Register a new user
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Password123","name":"Test User"}'
```

### Using curl (login with username)

```bash
# Register with username only
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"john_doe","password":"Password123","name":"John"}'

# Login with username
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"john_doe","password":"Password123"}'
```

---

## 🗂️ Project Structure Explained

```
vitaltrack-backend/
│
├── app/                    # Main application code
│   ├── api/v1/            # API endpoints (routes)
│   │   ├── auth.py        # Login, register, logout
│   │   ├── categories.py  # Category management
│   │   ├── items.py       # Inventory items
│   │   ├── orders.py      # Order tracking
│   │   └── sync.py        # Mobile app sync
│   ├── core/              # Core utilities
│   │   ├── config.py      # App configuration
│   │   ├── database.py    # Database connection
│   │   └── security.py    # Password & JWT
│   ├── models/            # Database table definitions
│   └── schemas/           # Request/response formats
│
├── alembic/               # Database migrations
│   └── versions/          # Migration history
│
├── docker-compose.yml     # Container setup
├── Dockerfile            # How to build the API
├── requirements.txt      # Python packages
└── .env                  # Environment variables
```

---

## 🔑 Important Files

### `.env` - Configuration

```bash
# Database connection
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/vitaltrack

# Security (CHANGE IN PRODUCTION!)
SECRET_KEY=development-secret-key-change-in-production

# Server settings
DEBUG=true
ENVIRONMENT=development
```

### `docker-compose.yml` - What Gets Started

- **api** - The FastAPI application (Port 8000)
- **db** - PostgreSQL database (Port 5432)

---

## ❓ Troubleshooting

### Problem: "Port 8000 already in use"

```bash
# Stop whatever is using port 8000
# Windows:
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# Mac/Linux:
lsof -i :8000
kill -9 <PID>

# Or change port in docker-compose.yml:
ports:
  - "8001:8000"  # Use 8001 instead
```

### Problem: "Cannot connect to database"

```bash
# Check if database container is running
docker compose ps

# Check database logs
docker compose logs db

# Restart everything
docker compose down
docker compose up -d --build
```

### Problem: "Permission denied" (Linux/Mac)

```bash
# Run with sudo
sudo docker compose up -d --build
```

### Problem: Docker not starting

1. Make sure Docker Desktop is running
2. On Windows, check WSL 2 is enabled
3. Restart Docker Desktop

### Problem: Migration fails

```bash
# Check what's wrong
docker compose exec api alembic history

# Reset database (WARNING: deletes all data)
docker compose down -v
docker compose up -d --build
docker compose exec api alembic upgrade head
```

---

## 🌐 Access Points

| Service | URL | Description |
|---------|-----|-------------|
| API Root | http://localhost:8000 | API information |
| Swagger Docs | http://localhost:8000/docs | Interactive API docs |
| ReDoc | http://localhost:8000/redoc | Alternative docs |
| Health Check | http://localhost:8000/health | Server status |

---

## 📚 What to Learn Next

1. **Test the API** - Use Swagger to create users, items, orders
2. **Read the Code** - Start with `app/api/v1/items.py`
3. **Check Documentation** - Read `README.md` and other .md files
4. **Connect Frontend** - The API is ready for your mobile app

---

## 💡 Tips for Beginners

1. **Always use `docker compose logs -f api`** to see errors
2. **After changing code**, run `docker compose up -d --build`
3. **Swagger UI** at `/docs` is your best friend for testing
4. **Don't change `.env`** unless you know what you're doing
5. **PostgreSQL data persists** even after `docker compose down`

---

## 🆘 Getting Help

- Read error messages carefully - they usually tell you what's wrong
- Check container logs: `docker compose logs`
- Make sure Docker Desktop is running
- Restart everything: `docker compose down && docker compose up -d --build`

---

*Happy coding! 🎉*
