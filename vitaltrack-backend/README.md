# VitalTrack Backend

Production-ready FastAPI backend for VitalTrack medical inventory management.

## Features

- 🔐 **JWT Authentication** - Secure access with token refresh rotation
- 🗄️ **Async PostgreSQL** - High-performance database with SQLAlchemy 2.0
- 📱 **Offline-First Sync** - Full sync support for mobile app
- 🔒 **Security First** - Argon2 password hashing, input validation, CORS
- 📊 **RESTful API** - Clean, documented endpoints
- 🐳 **Docker Ready** - Production-ready containerization

## Tech Stack

- **Framework**: FastAPI 0.115+
- **Database**: PostgreSQL 16 + SQLAlchemy 2.0 (async)
- **Authentication**: JWT (python-jose) + Argon2
- **Migrations**: Alembic
- **Validation**: Pydantic 2.0
- **Server**: Uvicorn / Gunicorn

## Quick Start

### Prerequisites

- Python 3.11+
- PostgreSQL 15+
- Docker (optional)

### Local Development

```bash
# Clone and navigate to backend
cd vitaltrack-backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or: venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Copy environment variables
cp .env.example .env
# Edit .env with your database credentials

# Run database migrations
alembic upgrade head

# Start development server
uvicorn app.main:app --reload --port 8000
```

### Docker Development

```bash
# Start all services (API + PostgreSQL)
docker-compose up -d

# View logs
docker-compose logs -f api

# Run migrations
docker-compose exec api alembic upgrade head

# Stop services
docker-compose down
```

## API Documentation

Once running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **OpenAPI JSON**: http://localhost:8000/openapi.json

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register new user |
| POST | `/api/v1/auth/login` | Login with email/username |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| POST | `/api/v1/auth/logout` | Logout and revoke token |
| GET | `/api/v1/auth/me` | Get current user profile |
| PATCH | `/api/v1/auth/me` | Update user profile |
| POST | `/api/v1/auth/change-password` | Change password |
| GET | `/api/v1/auth/verify-email/{token}` | Verify email address |
| POST | `/api/v1/auth/resend-verification` | Resend verification email |
| POST | `/api/v1/auth/forgot-password` | Request password reset |
| POST | `/api/v1/auth/reset-password` | Reset password with token |

### Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/categories` | List all categories |
| POST | `/api/v1/categories` | Create category |
| GET | `/api/v1/categories/{id}` | Get category |
| PUT | `/api/v1/categories/{id}` | Update category |
| DELETE | `/api/v1/categories/{id}` | Delete category |

### Items
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/items` | List items (with filters) |
| POST | `/api/v1/items` | Create item |
| GET | `/api/v1/items/{id}` | Get item |
| PUT | `/api/v1/items/{id}` | Update item |
| PATCH | `/api/v1/items/{id}/stock` | Update stock only |
| DELETE | `/api/v1/items/{id}` | Delete item |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/orders` | List orders |
| POST | `/api/v1/orders` | Create order |
| GET | `/api/v1/orders/{id}` | Get order |
| PATCH | `/api/v1/orders/{id}/status` | Update status |
| POST | `/api/v1/orders/{id}/apply` | Apply to stock |
| DELETE | `/api/v1/orders/{id}` | Delete order |

### Sync
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/sync/push` | Push local changes |
| POST | `/api/v1/sync/pull` | Pull server changes |
| POST | `/api/v1/sync/full` | Full sync (push + pull) |

## Project Structure

```
vitaltrack-backend/
├── alembic/                 # Database migrations
│   ├── versions/            # Migration files
│   └── env.py               # Migration config
├── app/
│   ├── api/
│   │   ├── deps.py          # Dependencies
│   │   └── v1/              # API v1 routes
│   │       ├── auth.py
│   │       ├── categories.py
│   │       ├── items.py
│   │       ├── orders.py
│   │       └── sync.py
│   ├── core/
│   │   ├── config.py        # Settings
│   │   ├── database.py      # DB setup
│   │   └── security.py      # Auth helpers
│   ├── models/              # SQLAlchemy models
│   ├── schemas/             # Pydantic schemas
│   └── main.py              # FastAPI app
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
└── .env.example
```

## Database Migrations

```bash
# Create new migration
alembic revision --autogenerate -m "description"

# Run migrations
alembic upgrade head

# Rollback one migration
alembic downgrade -1

# View migration history
alembic history
```

## Testing

```bash
# Run tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html
```

## Deployment

### Railway

1. Connect GitHub repository
2. Add PostgreSQL plugin
3. Set environment variables
4. Deploy automatically on push

### Render

1. Create Web Service from repo
2. Add PostgreSQL database
3. Set environment variables
4. Build command: `pip install -r requirements.txt`
5. Start command: `gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker`

## Security Notes

- Always use HTTPS in production
- Rotate `SECRET_KEY` periodically
- Use strong database passwords
- Enable rate limiting for production
- Review CORS origins before deployment

## License

MIT License - See LICENSE file
