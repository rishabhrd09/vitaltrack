"""
VitalTrack — Test Configuration (Production-Grade)

Design decisions based on industry best practices:
- Real PostgreSQL (not SQLite) for production parity
- Transaction rollback per test for speed + isolation
- Rate limiter disabled globally (re-enabled in dedicated tests)
- asyncio_mode=auto eliminates need for @pytest.mark.asyncio markers
"""

import asyncio
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.database import Base, get_db
from app.main import app


# =============================================================================
# DATABASE ENGINE (session-scoped, shared across all tests)
# =============================================================================
test_engine = create_async_engine(settings.DATABASE_URL, echo=False)
TestSession = async_sessionmaker(
    bind=test_engine, class_=AsyncSession, expire_on_commit=False
)


# =============================================================================
# DISABLE RATE LIMITER FOR TESTS
# All test requests come from 127.0.0.1 — rate limits are meaningless.
# Dedicated rate-limit tests re-enable this per-class.
# =============================================================================
app.state.limiter.enabled = False


# =============================================================================
# DATABASE FIXTURES
# =============================================================================
@pytest.fixture(scope="session")
def event_loop():
    """Session-scoped event loop for all async fixtures and tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_database():
    """Create all tables once at session start, drop at session end."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(autouse=True)
async def clean_database():
    """Drop and recreate tables before each test for full isolation."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield


async def _test_db_override() -> AsyncGenerator[AsyncSession, None]:
    """Dependency override: provide test database session."""
    async with TestSession() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


app.dependency_overrides[get_db] = _test_db_override


# =============================================================================
# HTTP CLIENT
# =============================================================================
@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP client for testing API endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# =============================================================================
# TEST HELPERS
# =============================================================================
async def register_user(
    client: AsyncClient,
    *,
    name: str,
    username: str | None = None,
    email: str | None = None,
    password: str = "TestPass1",
) -> dict:
    """Register a user and return the response JSON.

    Accepts both 200 and 201 (the endpoint returns 201 per REST standards).
    """
    payload = {"name": name, "password": password}
    if username:
        payload["username"] = username
    if email:
        payload["email"] = email
    resp = await client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code in [200, 201], (
        f"Registration failed for {username or email}: {resp.text}"
    )
    return resp.json()


async def login_user(
    client: AsyncClient, identifier: str, password: str
) -> dict:
    """Login and return response JSON. Returns error info dict on failure."""
    resp = await client.post(
        "/api/v1/auth/login",
        json={"identifier": identifier, "password": password},
    )
    if resp.status_code == 200:
        return resp.json()
    return {"_status": resp.status_code, "_detail": resp.json()}


def auth_header(token: str) -> dict:
    """Build Authorization header from a Bearer token."""
    return {"Authorization": f"Bearer {token}"}
