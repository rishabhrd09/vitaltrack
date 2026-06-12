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
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.database import Base, get_db
from app.main import app


# =============================================================================
# DATABASE ENGINE
# =============================================================================
def _assert_safe_test_database_url(database_url: str) -> str:
    """Refuse destructive test isolation unless the URL is clearly disposable."""
    url = make_url(database_url)
    database_name = (url.database or "").lower()
    rendered_url = database_url.lower()
    environment = (settings.ENVIRONMENT or "").lower()

    if environment in {"production", "staging"}:
        raise RuntimeError(
            "Refusing to run destructive test setup with "
            f"ENVIRONMENT={settings.ENVIRONMENT!r}."
        )

    blocked_markers = (
        "production",
        "staging",
        "render.com",
        "railway.app",
        "neon.tech",
        "supabase.co",
        "amazonaws.com",
    )
    if any(marker in rendered_url for marker in blocked_markers):
        raise RuntimeError(
            "Refusing to run destructive test setup against a URL that looks "
            "like staging or production."
        )

    allowed_db_markers = ("test", "pytest")
    if not any(marker in database_name for marker in allowed_db_markers):
        raise RuntimeError(
            "Refusing to run Base.metadata.drop_all/create_all against "
            f"database {url.database!r}. Set DATABASE_URL to a disposable "
            "test database whose name contains 'test' or 'pytest'."
        )

    return database_url


TEST_DATABASE_URL = _assert_safe_test_database_url(settings.DATABASE_URL)

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
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
    if not email:
        identifier = username or name.lower().replace(" ", "")
        email = f"{identifier}@test.com"
    payload = {"name": name, "email": email, "password": password}
    if username:
        payload["username"] = username
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


async def register_and_auth(
    client: AsyncClient,
    *,
    name: str = "Test User",
    username: str | None = None,
    email: str | None = None,
    password: str = "TestPass1",
) -> tuple[dict, dict]:
    data = await register_user(
        client,
        name=name,
        username=username,
        email=email,
        password=password,
    )
    return data, auth_header(data["access_token"])


async def create_category(
    client: AsyncClient,
    headers: dict,
    *,
    name: str = "Supplies",
    **overrides,
) -> dict:
    payload = {
        "name": name,
        "description": f"{name} category",
        "display_order": 1,
    }
    payload.update(overrides)
    resp = await client.post("/api/v1/categories", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def create_item(
    client: AsyncClient,
    headers: dict,
    *,
    category_id: str,
    name: str = "Gloves",
    **overrides,
) -> dict:
    payload = {
        "categoryId": category_id,
        "name": name,
        "description": f"{name} description",
        "quantity": 10,
        "unit": "pieces",
        "minimumStock": 5,
        "brand": "CareKosh",
        "notes": "Created by tests",
        "supplierName": "Test Supplier",
        "supplierContact": "supplier@example.com",
        "purchaseLink": "https://example.com/supplies",
        "isActive": True,
        "isCritical": False,
    }
    payload.update(overrides)
    resp = await client.post("/api/v1/items", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def order_item_payload(item: dict, *, quantity: int = 2, **overrides) -> dict:
    payload = {
        "itemId": item["id"],
        "name": item["name"],
        "brand": item.get("brand"),
        "unit": item["unit"],
        "quantity": quantity,
        "currentStock": item["quantity"],
        "minimumStock": item["minimumStock"],
        "imageUri": item.get("imageUri"),
        "supplierName": item.get("supplierName"),
        "purchaseLink": item.get("purchaseLink"),
    }
    payload.update(overrides)
    return payload


async def create_order(
    client: AsyncClient,
    headers: dict,
    *,
    items: list[dict],
    notes: str = "Test order",
    **overrides,
) -> dict:
    payload = {
        "orderId": "CLIENT-SIDE-ID",
        "items": items,
        "notes": notes,
    }
    payload.update(overrides)
    resp = await client.post("/api/v1/orders", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()
