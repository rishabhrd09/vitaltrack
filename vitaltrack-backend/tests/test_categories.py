"""Domain tests for category endpoints."""

import pytest
from httpx import AsyncClient

from tests.conftest import (
    auth_header,
    create_category,
    create_item,
    register_and_auth,
)


pytestmark = pytest.mark.asyncio


async def test_category_crud_lifecycle(client: AsyncClient):
    _, headers = await register_and_auth(
        client,
        name="Category Owner",
        email="category-owner@test.com",
    )

    category = await create_category(
        client,
        headers,
        name="Respiratory",
        description="Respiratory supplies",
        display_order=2,
    )
    assert category["name"] == "Respiratory"
    assert category["description"] == "Respiratory supplies"
    assert category["displayOrder"] == 2
    assert category["isDefault"] is False

    list_resp = await client.get("/api/v1/categories", headers=headers)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1
    assert list_resp.json()["categories"][0]["id"] == category["id"]

    get_resp = await client.get(
        f"/api/v1/categories/{category['id']}",
        headers=headers,
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Respiratory"

    update_resp = await client.put(
        f"/api/v1/categories/{category['id']}",
        headers=headers,
        json={
            "name": "Respiratory Gear",
            "description": "Updated",
            "display_order": 4,
            "is_default": False,
        },
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["name"] == "Respiratory Gear"
    assert updated["description"] == "Updated"
    assert updated["displayOrder"] == 4
    assert updated["isDefault"] is False

    delete_resp = await client.delete(
        f"/api/v1/categories/{category['id']}",
        headers=headers,
    )
    assert delete_resp.status_code == 200
    assert "Respiratory Gear" in delete_resp.json()["message"]

    missing_resp = await client.get(
        f"/api/v1/categories/{category['id']}",
        headers=headers,
    )
    assert missing_resp.status_code == 404


async def test_default_category_delete_is_rejected_without_leaking_scope(
    client: AsyncClient,
):
    _, owner_headers = await register_and_auth(
        client,
        name="Default Category Owner",
        email="default-category-owner@test.com",
    )
    _, other_headers = await register_and_auth(
        client,
        name="Default Category Stranger",
        email="default-category-stranger@test.com",
    )

    default_category = await create_category(
        client,
        owner_headers,
        name="Default Supplies",
        is_default=True,
    )
    custom_category = await create_category(
        client,
        owner_headers,
        name="Custom Supplies",
    )

    foreign_delete_resp = await client.delete(
        f"/api/v1/categories/{default_category['id']}",
        headers=other_headers,
    )
    assert foreign_delete_resp.status_code == 404

    default_delete_resp = await client.delete(
        f"/api/v1/categories/{default_category['id']}",
        headers=owner_headers,
    )
    assert default_delete_resp.status_code == 409
    assert (
        default_delete_resp.json()["detail"]
        == "Default categories cannot be deleted"
    )

    default_get_resp = await client.get(
        f"/api/v1/categories/{default_category['id']}",
        headers=owner_headers,
    )
    assert default_get_resp.status_code == 200
    assert default_get_resp.json()["isDefault"] is True

    custom_delete_resp = await client.delete(
        f"/api/v1/categories/{custom_category['id']}",
        headers=owner_headers,
    )
    assert custom_delete_resp.status_code == 200
    assert "Custom Supplies" in custom_delete_resp.json()["message"]

    missing_custom_resp = await client.get(
        f"/api/v1/categories/{custom_category['id']}",
        headers=owner_headers,
    )
    assert missing_custom_resp.status_code == 404


async def test_duplicate_category_names_are_rejected_per_user(
    client: AsyncClient,
):
    _, first_headers = await register_and_auth(
        client,
        name="First Owner",
        email="first-category-owner@test.com",
    )
    _, second_headers = await register_and_auth(
        client,
        name="Second Owner",
        email="second-category-owner@test.com",
    )

    await create_category(client, first_headers, name="Medication")

    duplicate_resp = await client.post(
        "/api/v1/categories",
        headers=first_headers,
        json={"name": " medication "},
    )
    assert duplicate_resp.status_code == 409

    other_user_resp = await client.post(
        "/api/v1/categories",
        headers=second_headers,
        json={"name": "Medication"},
    )
    assert other_user_resp.status_code == 201


async def test_category_counts_include_only_current_users_active_items(
    client: AsyncClient,
):
    _, owner_headers = await register_and_auth(
        client,
        name="Count Owner",
        email="count-owner@test.com",
    )
    _, other_headers = await register_and_auth(
        client,
        name="Other Count Owner",
        email="other-count-owner@test.com",
    )

    respiratory = await create_category(client, owner_headers, name="Respiratory")
    medication = await create_category(client, owner_headers, name="Medication")
    other_category = await create_category(client, other_headers, name="Respiratory")

    await create_item(
        client,
        owner_headers,
        category_id=respiratory["id"],
        name="Ventilator Circuit",
    )
    await create_item(
        client,
        owner_headers,
        category_id=respiratory["id"],
        name="Archived Mask",
        isActive=False,
    )
    await create_item(
        client,
        owner_headers,
        category_id=medication["id"],
        name="Saline Flush",
    )
    await create_item(
        client,
        other_headers,
        category_id=other_category["id"],
        name="Other User Circuit",
    )

    resp = await client.get("/api/v1/categories/with-counts", headers=owner_headers)
    assert resp.status_code == 200
    counts = {category["name"]: category["itemCount"] for category in resp.json()}
    assert counts == {"Respiratory": 1, "Medication": 1}

    other_resp = await client.get(
        "/api/v1/categories/with-counts",
        headers=other_headers,
    )
    assert other_resp.status_code == 200
    other_counts = {
        category["name"]: category["itemCount"] for category in other_resp.json()
    }
    assert other_counts == {"Respiratory": 1}


async def test_categories_are_scoped_to_authenticated_user(
    client: AsyncClient,
):
    first_user, first_headers = await register_and_auth(
        client,
        name="Scoped Category Owner",
        email="scoped-category-owner@test.com",
    )
    _, second_headers = await register_and_auth(
        client,
        name="Scoped Category Stranger",
        email="scoped-category-stranger@test.com",
    )
    category = await create_category(
        client,
        first_headers,
        name="Private Category",
    )

    list_resp = await client.get("/api/v1/categories", headers=second_headers)
    assert list_resp.status_code == 200
    assert list_resp.json() == {"categories": [], "total": 0}

    get_resp = await client.get(
        f"/api/v1/categories/{category['id']}",
        headers=second_headers,
    )
    assert get_resp.status_code == 404

    update_resp = await client.put(
        f"/api/v1/categories/{category['id']}",
        headers=second_headers,
        json={"name": "Hijacked"},
    )
    assert update_resp.status_code == 404

    delete_resp = await client.delete(
        f"/api/v1/categories/{category['id']}",
        headers=second_headers,
    )
    assert delete_resp.status_code == 404

    owner_resp = await client.get(
        f"/api/v1/categories/{category['id']}",
        headers=auth_header(first_user["access_token"]),
    )
    assert owner_resp.status_code == 200
    assert owner_resp.json()["name"] == "Private Category"
