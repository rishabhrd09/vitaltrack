"""
VitalTrack — Test Configuration

- Real PostgreSQL (same as CI) for production parity
- Drop/recreate tables per test for full isolation
- Rate limiter disabled globally
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
# DATABASE ENGINE
# =============================================================================
test_engine = create_async_engine(settings.DATABASE_URL, echo=False)
TestSession = async_sessionmaker(
    bind=test_engine, class_=AsyncSession, expire_on_commit=False
)


# =============================================================================
# DISABLE RATE LIMITER FOR TESTS
# =============================================================================
app.state.limiter.enabled = False


# =============================================================================
# EVENT LOOP — required for session-scoped async operations
# =============================================================================
@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# =============================================================================
# DATABASE ISOLATION — drop + recreate ALL tables before each test
# =============================================================================
@pytest_asyncio.fixture(autouse=True)
async def fresh_database():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


# =============================================================================
# DEPENDENCY OVERRIDE
# =============================================================================
async def _test_db_override() -> AsyncGenerator[AsyncSession, None]:
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
    resp = await client.post(
        "/api/v1/auth/login",
        json={"identifier": identifier, "password": password},
    )
    if resp.status_code == 200:
        return resp.json()
    return {"_status": resp.status_code, "_detail": resp.json()}


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
