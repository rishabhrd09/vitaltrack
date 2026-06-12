"""Domain tests for inventory item endpoints."""

import pytest
from httpx import AsyncClient

from tests.conftest import (
    create_category,
    create_item,
    create_order,
    order_item_payload,
    register_and_auth,
)


pytestmark = pytest.mark.asyncio


def _names_from_items_response(resp) -> set[str]:
    assert resp.status_code == 200, resp.text
    return {item["name"] for item in resp.json()["items"]}


async def test_item_create_requires_owned_category(client: AsyncClient):
    _, owner_headers = await register_and_auth(
        client,
        name="Item Owner",
        email="item-owner@test.com",
    )
    _, other_headers = await register_and_auth(
        client,
        name="Foreign Category Owner",
        email="foreign-category-owner@test.com",
    )

    owned_category = await create_category(client, owner_headers, name="Owned")
    foreign_category = await create_category(client, other_headers, name="Foreign")

    item = await create_item(
        client,
        owner_headers,
        category_id=owned_category["id"],
        name="Owned Gloves",
    )
    assert item["categoryId"] == owned_category["id"]
    assert item["name"] == "Owned Gloves"

    missing_resp = await client.post(
        "/api/v1/items",
        headers=owner_headers,
        json={
            "categoryId": "00000000-0000-0000-0000-000000000000",
            "name": "Missing Category Item",
        },
    )
    assert missing_resp.status_code == 400

    foreign_resp = await client.post(
        "/api/v1/items",
        headers=owner_headers,
        json={
            "categoryId": foreign_category["id"],
            "name": "Foreign Category Item",
        },
    )
    assert foreign_resp.status_code == 400


async def test_item_crud_and_duplicate_name_rejection(client: AsyncClient):
    _, headers = await register_and_auth(
        client,
        name="Item CRUD Owner",
        email="item-crud-owner@test.com",
    )
    category = await create_category(client, headers, name="CRUD Category")

    item = await create_item(
        client,
        headers,
        category_id=category["id"],
        name="Oxygen Tubing",
        quantity=6,
        minimumStock=3,
    )

    list_resp = await client.get("/api/v1/items", headers=headers)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1
    assert list_resp.json()["items"][0]["id"] == item["id"]

    get_resp = await client.get(f"/api/v1/items/{item['id']}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["name"] == "Oxygen Tubing"

    update_resp = await client.put(
        f"/api/v1/items/{item['id']}",
        headers=headers,
        json={
            "version": item["version"],
            "name": "Adult Oxygen Tubing",
            "quantity": 12,
            "minimumStock": 6,
            "isCritical": True,
        },
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["name"] == "Adult Oxygen Tubing"
    assert updated["quantity"] == 12
    assert updated["minimumStock"] == 6
    assert updated["isCritical"] is True
    assert updated["version"] == item["version"] + 1

    duplicate_create = await client.post(
        "/api/v1/items",
        headers=headers,
        json={
            "categoryId": category["id"],
            "name": " adult oxygen tubing ",
        },
    )
    assert duplicate_create.status_code == 409

    backup = await create_item(
        client,
        headers,
        category_id=category["id"],
        name="Backup Mask",
    )
    duplicate_update = await client.put(
        f"/api/v1/items/{backup['id']}",
        headers=headers,
        json={
            "version": backup["version"],
            "name": "Adult Oxygen Tubing",
        },
    )
    assert duplicate_update.status_code == 409

    delete_resp = await client.delete(f"/api/v1/items/{item['id']}", headers=headers)
    assert delete_resp.status_code == 200

    missing_resp = await client.get(f"/api/v1/items/{item['id']}", headers=headers)
    assert missing_resp.status_code == 404


async def test_item_update_and_stock_update_reject_stale_versions(
    client: AsyncClient,
):
    _, headers = await register_and_auth(
        client,
        name="Version Owner",
        email="version-owner@test.com",
    )
    category = await create_category(client, headers, name="Version Category")
    item = await create_item(
        client,
        headers,
        category_id=category["id"],
        name="Suction Catheter",
        quantity=8,
    )

    update_resp = await client.put(
        f"/api/v1/items/{item['id']}",
        headers=headers,
        json={"version": item["version"], "quantity": 9},
    )
    assert update_resp.status_code == 200
    current = update_resp.json()
    assert current["version"] == item["version"] + 1

    stale_update = await client.put(
        f"/api/v1/items/{item['id']}",
        headers=headers,
        json={"version": item["version"], "quantity": 10},
    )
    assert stale_update.status_code == 409
    assert stale_update.json()["server_version"] == current["version"]
    assert stale_update.json()["server_quantity"] == current["quantity"]

    stale_stock = await client.patch(
        f"/api/v1/items/{item['id']}/stock",
        headers=headers,
        json={"version": item["version"], "quantity": 11},
    )
    assert stale_stock.status_code == 409
    assert stale_stock.json()["server_version"] == current["version"]
    assert stale_stock.json()["server_quantity"] == current["quantity"]

    stock_resp = await client.patch(
        f"/api/v1/items/{item['id']}/stock",
        headers=headers,
        json={"version": current["version"], "quantity": 13},
    )
    assert stock_resp.status_code == 200
    assert stock_resp.json()["quantity"] == 13
    assert stock_resp.json()["version"] == current["version"] + 1


async def test_item_filters_cover_category_status_stock_and_search(
    client: AsyncClient,
):
    _, headers = await register_and_auth(
        client,
        name="Filter Owner",
        email="filter-owner@test.com",
    )
    respiratory = await create_category(client, headers, name="Respiratory")
    medication = await create_category(client, headers, name="Medication")

    await create_item(
        client,
        headers,
        category_id=respiratory["id"],
        name="Ventilator Circuit",
        quantity=1,
        minimumStock=5,
        brand="Hamilton",
        isCritical=True,
    )
    await create_item(
        client,
        headers,
        category_id=medication["id"],
        name="Saline Flush",
        quantity=0,
        minimumStock=10,
        brand="SyringeCo",
    )
    await create_item(
        client,
        headers,
        category_id=respiratory["id"],
        name="Archived Mask",
        quantity=8,
        minimumStock=2,
        isActive=False,
    )
    await create_item(
        client,
        headers,
        category_id=medication["id"],
        name="Stable Pump",
        quantity=20,
        minimumStock=5,
        brand="InfusionWorks",
    )

    all_resp = await client.get("/api/v1/items", headers=headers)
    assert all_resp.status_code == 200
    assert all_resp.json()["total"] == 4

    category_resp = await client.get(
        "/api/v1/items",
        headers=headers,
        params={"categoryId": respiratory["id"]},
    )
    assert _names_from_items_response(category_resp) == {
        "Archived Mask",
        "Ventilator Circuit",
    }

    inactive_resp = await client.get(
        "/api/v1/items",
        headers=headers,
        params={"isActive": "false"},
    )
    assert _names_from_items_response(inactive_resp) == {"Archived Mask"}

    critical_resp = await client.get(
        "/api/v1/items",
        headers=headers,
        params={"isCritical": "true"},
    )
    assert _names_from_items_response(critical_resp) == {"Ventilator Circuit"}

    low_stock_resp = await client.get(
        "/api/v1/items",
        headers=headers,
        params={"lowStockOnly": "true"},
    )
    assert _names_from_items_response(low_stock_resp) == {"Ventilator Circuit"}

    out_of_stock_resp = await client.get(
        "/api/v1/items",
        headers=headers,
        params={"outOfStockOnly": "true"},
    )
    assert _names_from_items_response(out_of_stock_resp) == {"Saline Flush"}

    brand_search_resp = await client.get(
        "/api/v1/items",
        headers=headers,
        params={"search": "hamil"},
    )
    assert _names_from_items_response(brand_search_resp) == {
        "Ventilator Circuit"
    }

    name_search_resp = await client.get(
        "/api/v1/items",
        headers=headers,
        params={"search": "flush"},
    )
    assert _names_from_items_response(name_search_resp) == {"Saline Flush"}


async def test_item_stats_and_needs_attention_are_user_scoped(
    client: AsyncClient,
):
    _, owner_headers = await register_and_auth(
        client,
        name="Stats Owner",
        email="stats-owner@test.com",
    )
    _, other_headers = await register_and_auth(
        client,
        name="Other Stats Owner",
        email="other-stats-owner@test.com",
    )
    respiratory = await create_category(client, owner_headers, name="Respiratory")
    medication = await create_category(client, owner_headers, name="Medication")
    other_category = await create_category(client, other_headers, name="Other")

    low_item = await create_item(
        client,
        owner_headers,
        category_id=respiratory["id"],
        name="Ventilator Circuit",
        quantity=1,
        minimumStock=5,
        isCritical=True,
    )
    await create_item(
        client,
        owner_headers,
        category_id=medication["id"],
        name="Saline Flush",
        quantity=0,
        minimumStock=10,
    )
    await create_item(
        client,
        owner_headers,
        category_id=medication["id"],
        name="Stable Pump",
        quantity=20,
        minimumStock=5,
    )
    await create_item(
        client,
        owner_headers,
        category_id=respiratory["id"],
        name="Inactive Empty Mask",
        quantity=0,
        minimumStock=5,
        isActive=False,
        isCritical=True,
    )
    await create_item(
        client,
        other_headers,
        category_id=other_category["id"],
        name="Other User Empty Item",
        quantity=0,
        minimumStock=5,
        isCritical=True,
    )
    await create_order(
        client,
        owner_headers,
        items=[order_item_payload(low_item, quantity=2)],
    )

    stats_resp = await client.get("/api/v1/items/stats", headers=owner_headers)
    assert stats_resp.status_code == 200
    assert stats_resp.json() == {
        "totalItems": 3,
        "totalCategories": 2,
        "outOfStockCount": 1,
        "lowStockCount": 1,
        "criticalItems": 1,
        "pendingOrdersCount": 1,
    }

    attention_resp = await client.get(
        "/api/v1/items/needs-attention",
        headers=owner_headers,
    )
    assert attention_resp.status_code == 200
    attention = attention_resp.json()
    assert attention["total"] == 2
    assert [item["name"] for item in attention["items"]] == [
        "Saline Flush",
        "Ventilator Circuit",
    ]

    other_stats_resp = await client.get("/api/v1/items/stats", headers=other_headers)
    assert other_stats_resp.status_code == 200
    assert other_stats_resp.json()["totalItems"] == 1
    assert other_stats_resp.json()["outOfStockCount"] == 1


async def test_items_are_scoped_to_authenticated_user(client: AsyncClient):
    _, owner_headers = await register_and_auth(
        client,
        name="Scoped Item Owner",
        email="scoped-item-owner@test.com",
    )
    _, stranger_headers = await register_and_auth(
        client,
        name="Scoped Item Stranger",
        email="scoped-item-stranger@test.com",
    )
    owner_category = await create_category(client, owner_headers, name="Owner Items")
    stranger_category = await create_category(
        client,
        stranger_headers,
        name="Stranger Items",
    )
    owner_item = await create_item(
        client,
        owner_headers,
        category_id=owner_category["id"],
        name="Owner Private Item",
    )
    await create_item(
        client,
        stranger_headers,
        category_id=stranger_category["id"],
        name="Stranger Item",
    )

    list_resp = await client.get("/api/v1/items", headers=stranger_headers)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1
    assert list_resp.json()["items"][0]["name"] == "Stranger Item"

    foreign_category_resp = await client.get(
        "/api/v1/items",
        headers=stranger_headers,
        params={"categoryId": owner_category["id"]},
    )
    assert foreign_category_resp.status_code == 200
    assert foreign_category_resp.json() == {"items": [], "total": 0}

    get_resp = await client.get(
        f"/api/v1/items/{owner_item['id']}",
        headers=stranger_headers,
    )
    assert get_resp.status_code == 404

    update_resp = await client.put(
        f"/api/v1/items/{owner_item['id']}",
        headers=stranger_headers,
        json={"version": owner_item["version"], "quantity": 1},
    )
    assert update_resp.status_code == 404

    stock_resp = await client.patch(
        f"/api/v1/items/{owner_item['id']}/stock",
        headers=stranger_headers,
        json={"version": owner_item["version"], "quantity": 1},
    )
    assert stock_resp.status_code == 404

    delete_resp = await client.delete(
        f"/api/v1/items/{owner_item['id']}",
        headers=stranger_headers,
    )
    assert delete_resp.status_code == 404

    owner_get_resp = await client.get(
        f"/api/v1/items/{owner_item['id']}",
        headers=owner_headers,
    )
    assert owner_get_resp.status_code == 200
    assert owner_get_resp.json()["name"] == "Owner Private Item"
