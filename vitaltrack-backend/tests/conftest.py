"""
VitalTrack — Test Configuration
Uses real PostgreSQL (same as CI) for production-parity testing.
Research basis: "Use PostgreSQL with transaction rollbacks, not SQLite,
because medical data integrity demands production parity."
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


test_engine = create_async_engine(settings.DATABASE_URL, echo=False)
TestSession = async_sessionmaker(
    bind=test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def fresh_database():
    """Drop and recreate ALL tables before each test — zero pollution."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def _test_db_override() -> AsyncGenerator[AsyncSession, None]:
    async with TestSession() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


app.dependency_overrides[get_db] = _test_db_override

# Disable rate limiting during tests — all requests come from 127.0.0.1
# and would hit the 3/hour limit after just 3 registrations
app.state.limiter.enabled = False


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


async def register_user(
    client: AsyncClient, *, name: str,
    username: str | None = None, email: str | None = None,
    password: str = "TestPass1",
) -> dict:
    payload = {"name": name, "password": password}
    if username: payload["username"] = username
    if email: payload["email"] = email
    resp = await client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code in [200, 201], f"Registration failed for {username or email}: {resp.text}"
    return resp.json()


async def login_user(client: AsyncClient, identifier: str, password: str) -> dict:
    resp = await client.post("/api/v1/auth/login", json={"identifier": identifier, "password": password})
    return resp.json() if resp.status_code == 200 else {"_status": resp.status_code, "_detail": resp.json()}


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
