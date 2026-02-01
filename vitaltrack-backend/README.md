# VitalTrack Backend

> FastAPI backend for VitalTrack medical inventory management system.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.109-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python)](https://python.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://postgresql.org)

---

## Quick Start

### Prerequisites
- Docker Desktop (running)
- Or: Python 3.12+ with PostgreSQL 16

### Using Docker (Recommended)
```bash
cd vitaltrack-backend
docker-compose -f docker-compose.dev.yml up --build
```

### Without Docker
```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload --port 8000
```

### Verify
- Health: http://localhost:8000/health
- API Docs: http://localhost:8000/docs

---

## Project Structure

```
vitaltrack-backend/
├── alembic/                    # Database migrations
│   └── versions/               # Migration files
├── app/
│   ├── api/
│   │   ├── deps.py            # Dependency injection
│   │   └── v1/                # API routes
│   │       ├── auth.py        # Authentication
│   │       ├── categories.py  # Category CRUD
│   │       ├── items.py       # Item CRUD
│   │       ├── orders.py      # Order management
│   │       └── sync.py        # Offline sync
│   ├── core/
│   │   ├── config.py          # Settings
│   │   ├── database.py        # DB connection
│   │   └── security.py        # JWT + Argon2
│   ├── models/                # SQLAlchemy models
│   ├── schemas/               # Pydantic schemas
│   └── utils/
│       ├── email.py           # Email service
│       └── rate_limiter.py    # Rate limiting
├── docker-compose.dev.yml     # Development setup
├── Dockerfile                 # Production build
└── requirements.txt           # Dependencies
```

---

## API Endpoints (34 Total)

### Authentication (11 endpoints)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/login` | Login (email or username) |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Revoke refresh token |
| GET | `/api/v1/auth/me` | Get current user |
| PATCH | `/api/v1/auth/me` | Update profile |
| POST | `/api/v1/auth/change-password` | Change password |
| POST | `/api/v1/auth/forgot-password` | Request reset |
| POST | `/api/v1/auth/reset-password` | Reset with token |
| POST | `/api/v1/auth/verify-email` | Verify email |
| POST | `/api/v1/auth/resend-verification` | Resend email |

### Categories (6 endpoints)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/categories` | List all |
| POST | `/api/v1/categories` | Create |
| GET | `/api/v1/categories/{id}` | Get one |
| PUT | `/api/v1/categories/{id}` | Update |
| DELETE | `/api/v1/categories/{id}` | Delete |
| GET | `/api/v1/categories/count` | Get count |

### Items (8 endpoints)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/items` | List all (with filters) |
| POST | `/api/v1/items` | Create |
| GET | `/api/v1/items/{id}` | Get one |
| PUT | `/api/v1/items/{id}` | Update |
| DELETE | `/api/v1/items/{id}` | Delete |
| PATCH | `/api/v1/items/{id}/stock` | Update stock |
| GET | `/api/v1/items/stats` | Get statistics |
| GET | `/api/v1/items/low-stock` | Get low stock items |

### Orders (6 endpoints)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/orders` | List all |
| POST | `/api/v1/orders` | Create |
| GET | `/api/v1/orders/{id}` | Get one |
| DELETE | `/api/v1/orders/{id}` | Delete |
| PATCH | `/api/v1/orders/{id}/status` | Update status |
| POST | `/api/v1/orders/{id}/apply` | Apply to stock |

### Sync (3 endpoints)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/sync/push` | Push local changes |
| POST | `/api/v1/sync/pull` | Pull server changes |
| POST | `/api/v1/sync/full` | Full bidirectional sync |

---

## Authentication

### JWT Token Flow
```
┌────────────┐  POST /auth/login   ┌────────────┐
│   Client   │ ───────────────────► │   Server   │
│            │ {email, password}   │            │
│            │ ◄─────────────────── │            │
│            │ {access_token,      │            │
│            │  refresh_token}     │            │
└────────────┘                     └────────────┘
      │
      │ API Request with:
      │ Authorization: Bearer <access_token>
      ▼
┌────────────┐                     ┌────────────┐
│   Client   │ GET /api/v1/items   │   Server   │
│            │ ───────────────────► │            │
│            │ ◄─────────────────── │            │
│            │ [items array]        │            │
└────────────┘                     └────────────┘
```

### Token Configuration
```python
ACCESS_TOKEN_EXPIRE_MINUTES=30    # 30 minutes
REFRESH_TOKEN_EXPIRE_DAYS=30      # 30 days
```

### Security Features
- **Argon2** password hashing (OWASP recommended)
- **JWT** with RS256 algorithm
- **Token rotation** on refresh
- **Rate limiting** on auth endpoints

---

## Database Schema

See [DATABASE_ARCHITECTURE.md](DATABASE_ARCHITECTURE.md) for complete schema.

### Quick Overview
```
users ──┬── categories ── items
        │
        └── orders ── order_items

        └── refresh_tokens

        └── activity_logs
```

---

## Environment Variables

### Required
```env
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname
SECRET_KEY=<min-32-chars-random-string>
```

### Optional
```env
ENVIRONMENT=development          # or: production, testing
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=30
CORS_ORIGINS=*                   # Comma-separated in production
```

---

## Development

### Run Tests
```bash
# Install test dependencies
pip install pytest pytest-asyncio httpx

# Run tests
pytest -v
```

### Code Quality
```bash
# Linting
pip install ruff
ruff check app/

# Type checking
pip install mypy
mypy app/

# Format code
pip install black
black app/
```

### Database Migrations
```bash
# Create migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Rollback one
alembic downgrade -1

# View current
alembic current
```

---

## Docker Commands

```bash
# Development
docker-compose -f docker-compose.dev.yml up --build
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml logs -f api

# Access database
docker-compose exec db psql -U postgres -d vitaltrack

# Run migrations
docker-compose exec api alembic upgrade head

# Production build
docker build -t vitaltrack-api .
```

---

## Deployment

### Railway
See `railway.toml` for configuration.

```bash
# Install CLI
npm i -g @railway/cli

# Deploy
railway up
```

### Render
See `render.yaml` for configuration.

---

## API Testing

See [API_TESTING_GUIDE.md](API_TESTING_GUIDE.md) for complete testing guide.

### Quick cURL Examples

```bash
# Health check
curl http://localhost:8000/health

# Register
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"Test User"}'

# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test@example.com","password":"Test123!"}'

# Get items (with token)
curl http://localhost:8000/api/v1/items \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 5432 in use | Stop local PostgreSQL or change port |
| Database connection failed | Check DATABASE_URL format |
| JWT decode error | Verify SECRET_KEY is same |
| Rate limit exceeded | Wait or configure higher limits |

---

## License

This project is for educational and portfolio purposes.
