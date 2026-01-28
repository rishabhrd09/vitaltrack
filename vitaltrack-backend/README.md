# VitalTrack Backend

**Phase 3 Complete** | FastAPI + PostgreSQL | Production-Ready

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://www.postgresql.org)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python)](https://www.python.org)

---

## 🚀 Quick Start

### Prerequisites
- Docker Desktop installed and running

### Start Backend (2 minutes)

```bash
cd vitaltrack-backend

# Start containers
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

### Verify API
- **Swagger Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [API_TESTING_GUIDE.md](./API_TESTING_GUIDE.md) | Complete API testing guide with examples |
| [DOCKER_GUIDE.md](./DOCKER_GUIDE.md) | Docker concepts and commands explained |

---

## 🔧 Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | FastAPI 0.115 |
| Database | PostgreSQL 16 |
| ORM | SQLAlchemy 2.0 (async) |
| Auth | JWT + Argon2 |
| Migrations | Alembic |
| Server | Uvicorn |

---

## 📂 Project Structure

```
vitaltrack-backend/
├── app/
│   ├── api/v1/           # API routes (auth, categories, items, orders, sync)
│   ├── core/             # Config, database, security
│   ├── models/           # SQLAlchemy models
│   ├── schemas/          # Pydantic schemas
│   └── main.py           # FastAPI application
├── alembic/              # Database migrations
├── Dockerfile            # Production dockerfile
├── docker-compose.yml    # Docker services
└── requirements.txt      # Python dependencies
```

---

## 🔐 API Endpoints (34 Total)

### Authentication (11 endpoints)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/refresh` | Refresh tokens |
| POST | `/api/v1/auth/logout` | Logout |
| GET | `/api/v1/auth/me` | Get profile |
| PATCH | `/api/v1/auth/me` | Update profile |
| POST | `/api/v1/auth/change-password` | Change password |
| GET | `/api/v1/auth/verify-email/{token}` | Verify email |
| POST | `/api/v1/auth/resend-verification` | Resend verification |
| POST | `/api/v1/auth/forgot-password` | Request password reset |
| POST | `/api/v1/auth/reset-password` | Reset password |

### Categories (6 endpoints)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/categories` | List all |
| GET | `/api/v1/categories/with-counts` | List with item counts |
| POST | `/api/v1/categories` | Create |
| GET | `/api/v1/categories/{id}` | Get one |
| PUT | `/api/v1/categories/{id}` | Update |
| DELETE | `/api/v1/categories/{id}` | Delete |

### Items (8 endpoints)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/items` | List with filters |
| GET | `/api/v1/items/stats` | Dashboard statistics |
| GET | `/api/v1/items/needs-attention` | Low/out of stock |
| POST | `/api/v1/items` | Create |
| GET | `/api/v1/items/{id}` | Get one |
| PUT | `/api/v1/items/{id}` | Update |
| PATCH | `/api/v1/items/{id}/stock` | Update stock only |
| DELETE | `/api/v1/items/{id}` | Delete |

### Orders (6 endpoints)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/orders` | List orders |
| POST | `/api/v1/orders` | Create |
| GET | `/api/v1/orders/{id}` | Get one |
| PATCH | `/api/v1/orders/{id}/status` | Update status |
| POST | `/api/v1/orders/{id}/apply` | Apply to stock |
| DELETE | `/api/v1/orders/{id}` | Delete |

### Sync (3 endpoints)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/sync/push` | Push local changes |
| POST | `/api/v1/sync/pull` | Pull server changes |
| POST | `/api/v1/sync/full` | Full bidirectional sync |

---

## 🐳 Docker Commands

```bash
# Start services
docker-compose up -d --build

# View logs
docker-compose logs -f api

# Stop services
docker-compose down

# Reset database (deletes all data)
docker-compose down -v
docker-compose up -d --build
```

---

## 🔧 Local Development (Without Docker)

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload --port 8000
```

---

## 🚢 Deployment

### Railway
```bash
railway login
railway init
railway add      # Select PostgreSQL
railway up
```

### Render
1. Create Web Service from repo
2. Add PostgreSQL database
3. Build: `pip install -r requirements.txt`
4. Start: `gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker`

---

## 🔑 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `SECRET_KEY` | JWT signing key (64 chars) | Required |
| `ENVIRONMENT` | `development` or `production` | development |
| `DEBUG` | Enable debug mode | false |
| `CORS_ORIGINS` | Allowed origins (comma-separated) | * |

---

## 🧪 Testing

```bash
# Run tests
pytest

# With coverage
pytest --cov=app --cov-report=html
```

---

**VitalTrack Backend v1.0.0** | Phase 3 Complete ✅
