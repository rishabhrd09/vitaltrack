"""Domain tests for order endpoints."""

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


async def _inventory_item(
    client: AsyncClient,
    headers: dict,
    *,
    category_name: str = "Order Items",
    item_name: str = "Orderable Item",
    quantity: int = 5,
    minimum_stock: int = 2,
) -> dict:
    category = await create_category(client, headers, name=category_name)
    return await create_item(
        client,
        headers,
        category_id=category["id"],
        name=item_name,
        quantity=quantity,
        minimumStock=minimum_stock,
    )


async def _set_order_status(
    client: AsyncClient,
    headers: dict,
    order_id: str,
    status: str,
) -> dict:
    resp = await client.patch(
        f"/api/v1/orders/{order_id}/status",
        headers=headers,
        json={"status": status},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_order_create_list_get_and_status_filter(client: AsyncClient):
    _, headers = await register_and_auth(
        client,
        name="Order Owner",
        email="order-owner@test.com",
    )
    item = await _inventory_item(client, headers, item_name="Nebulizer Kit")

    order = await create_order(
        client,
        headers,
        items=[order_item_payload(item, quantity=3)],
        notes="Order create test",
    )
    assert order["status"] == "pending"
    assert order["totalItems"] == 1
    assert order["totalUnits"] == 3
    assert order["items"][0]["itemId"] == item["id"]
    assert order["orderId"].startswith("ORD-")

    list_resp = await client.get("/api/v1/orders", headers=headers)
    assert list_resp.status_code == 200
    listed = list_resp.json()
    assert listed["total"] == 1
    assert listed["page"] == 1
    assert listed["pageSize"] == 20
    assert listed["hasMore"] is False
    assert listed["orders"][0]["id"] == order["id"]

    filtered_resp = await client.get(
        "/api/v1/orders",
        headers=headers,
        params={"status": "pending"},
    )
    assert filtered_resp.status_code == 200
    assert filtered_resp.json()["total"] == 1

    get_by_id = await client.get(f"/api/v1/orders/{order['id']}", headers=headers)
    assert get_by_id.status_code == 200
    assert get_by_id.json()["orderId"] == order["orderId"]

    get_by_public_id = await client.get(
        f"/api/v1/orders/{order['orderId']}",
        headers=headers,
    )
    assert get_by_public_id.status_code == 200
    assert get_by_public_id.json()["id"] == order["id"]


async def test_orders_are_scoped_to_authenticated_user(client: AsyncClient):
    _, owner_headers = await register_and_auth(
        client,
        name="Scoped Order Owner",
        email="scoped-order-owner@test.com",
    )
    _, stranger_headers = await register_and_auth(
        client,
        name="Scoped Order Stranger",
        email="scoped-order-stranger@test.com",
    )
    owner_item = await _inventory_item(
        client,
        owner_headers,
        category_name="Owner Order Items",
        item_name="Owner Item",
    )
    stranger_item = await _inventory_item(
        client,
        stranger_headers,
        category_name="Stranger Order Items",
        item_name="Stranger Item",
    )
    owner_order = await create_order(
        client,
        owner_headers,
        items=[order_item_payload(owner_item, quantity=1)],
    )
    stranger_order = await create_order(
        client,
        stranger_headers,
        items=[order_item_payload(stranger_item, quantity=1)],
    )

    list_resp = await client.get("/api/v1/orders", headers=stranger_headers)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1
    assert list_resp.json()["orders"][0]["id"] == stranger_order["id"]

    get_resp = await client.get(
        f"/api/v1/orders/{owner_order['id']}",
        headers=stranger_headers,
    )
    assert get_resp.status_code == 404

    status_resp = await client.patch(
        f"/api/v1/orders/{owner_order['id']}/status",
        headers=stranger_headers,
        json={"status": "ordered"},
    )
    assert status_resp.status_code == 404

    apply_resp = await client.post(
        f"/api/v1/orders/{owner_order['id']}/apply",
        headers=stranger_headers,
    )
    assert apply_resp.status_code == 404

    delete_resp = await client.delete(
        f"/api/v1/orders/{owner_order['id']}",
        headers=stranger_headers,
    )
    assert delete_resp.status_code == 404

    owner_get = await client.get(
        f"/api/v1/orders/{owner_order['id']}",
        headers=owner_headers,
    )
    assert owner_get.status_code == 200


async def test_order_lifecycle_apply_updates_stock_and_version(
    client: AsyncClient,
):
    _, headers = await register_and_auth(
        client,
        name="Lifecycle Owner",
        email="lifecycle-owner@test.com",
    )
    item = await _inventory_item(
        client,
        headers,
        item_name="Sterile Water",
        quantity=5,
    )
    order = await create_order(
        client,
        headers,
        items=[order_item_payload(item, quantity=4)],
    )

    ordered = await _set_order_status(client, headers, order["id"], "ordered")
    assert ordered["status"] == "ordered"
    assert ordered["orderedAt"] is not None

    received = await _set_order_status(client, headers, order["id"], "received")
    assert received["status"] == "received"
    assert received["receivedAt"] is not None

    apply_resp = await client.post(
        f"/api/v1/orders/{order['id']}/apply",
        headers=headers,
    )
    assert apply_resp.status_code == 200
    applied = apply_resp.json()
    assert applied["status"] == "stock_updated"
    assert applied["appliedAt"] is not None

    item_resp = await client.get(f"/api/v1/items/{item['id']}", headers=headers)
    assert item_resp.status_code == 200
    refreshed_item = item_resp.json()
    assert refreshed_item["quantity"] == 9
    assert refreshed_item["version"] == item["version"] + 1


async def test_order_apply_rejects_pending_and_second_apply_is_noop(
    client: AsyncClient,
):
    _, headers = await register_and_auth(
        client,
        name="Apply Guard Owner",
        email="apply-guard-owner@test.com",
    )
    item = await _inventory_item(
        client,
        headers,
        item_name="Feeding Tube",
        quantity=7,
    )
    order = await create_order(
        client,
        headers,
        items=[order_item_payload(item, quantity=2)],
    )

    pending_apply = await client.post(
        f"/api/v1/orders/{order['id']}/apply",
        headers=headers,
    )
    assert pending_apply.status_code == 400

    item_after_rejected_apply = await client.get(
        f"/api/v1/items/{item['id']}",
        headers=headers,
    )
    assert item_after_rejected_apply.status_code == 200
    assert item_after_rejected_apply.json()["quantity"] == 7
    assert item_after_rejected_apply.json()["version"] == item["version"]

    await _set_order_status(client, headers, order["id"], "received")
    first_apply = await client.post(
        f"/api/v1/orders/{order['id']}/apply",
        headers=headers,
    )
    assert first_apply.status_code == 200
    assert first_apply.json()["status"] == "stock_updated"

    after_first_apply = await client.get(f"/api/v1/items/{item['id']}", headers=headers)
    assert after_first_apply.status_code == 200
    assert after_first_apply.json()["quantity"] == 9
    assert after_first_apply.json()["version"] == item["version"] + 1

    second_apply = await client.post(
        f"/api/v1/orders/{order['id']}/apply",
        headers=headers,
    )
    assert second_apply.status_code == 400

    after_second_apply = await client.get(
        f"/api/v1/items/{item['id']}",
        headers=headers,
    )
    assert after_second_apply.status_code == 200
    assert after_second_apply.json()["quantity"] == 9
    assert after_second_apply.json()["version"] == item["version"] + 1


async def test_order_apply_missing_item_fails_without_partial_stock_update(
    client: AsyncClient,
):
    _, headers = await register_and_auth(
        client,
        name="Missing Item Owner",
        email="missing-item-owner@test.com",
    )
    first_item = await _inventory_item(
        client,
        headers,
        category_name="Missing Apply First",
        item_name="First Apply Item",
        quantity=5,
    )
    second_item = await _inventory_item(
        client,
        headers,
        category_name="Missing Apply Second",
        item_name="Second Apply Item",
        quantity=10,
    )
    order = await create_order(
        client,
        headers,
        items=[
            order_item_payload(first_item, quantity=4),
            order_item_payload(second_item, quantity=6),
        ],
    )
    await _set_order_status(client, headers, order["id"], "received")

    delete_item_resp = await client.delete(
        f"/api/v1/items/{second_item['id']}",
        headers=headers,
    )
    assert delete_item_resp.status_code == 200

    apply_resp = await client.post(
        f"/api/v1/orders/{order['id']}/apply",
        headers=headers,
    )
    assert apply_resp.status_code == 409
    assert "Second Apply Item" in apply_resp.json()["detail"]

    first_item_resp = await client.get(
        f"/api/v1/items/{first_item['id']}",
        headers=headers,
    )
    assert first_item_resp.status_code == 200
    assert first_item_resp.json()["quantity"] == 5
    assert first_item_resp.json()["version"] == first_item["version"]

    order_resp = await client.get(f"/api/v1/orders/{order['id']}", headers=headers)
    assert order_resp.status_code == 200
    assert order_resp.json()["status"] == "received"


async def test_order_delete_rules_for_pending_declined_received_and_applied(
    client: AsyncClient,
):
    _, headers = await register_and_auth(
        client,
        name="Delete Rule Owner",
        email="delete-rule-owner@test.com",
    )

    pending_item = await _inventory_item(
        client,
        headers,
        category_name="Pending Delete",
        item_name="Pending Delete Item",
    )
    pending_order = await create_order(
        client,
        headers,
        items=[order_item_payload(pending_item, quantity=1)],
    )
    pending_delete = await client.delete(
        f"/api/v1/orders/{pending_order['id']}",
        headers=headers,
    )
    assert pending_delete.status_code == 200
    pending_get = await client.get(
        f"/api/v1/orders/{pending_order['id']}",
        headers=headers,
    )
    assert pending_get.status_code == 404

    declined_item = await _inventory_item(
        client,
        headers,
        category_name="Declined Delete",
        item_name="Declined Delete Item",
    )
    declined_order = await create_order(
        client,
        headers,
        items=[order_item_payload(declined_item, quantity=1)],
    )
    await _set_order_status(client, headers, declined_order["id"], "declined")
    declined_delete = await client.delete(
        f"/api/v1/orders/{declined_order['id']}",
        headers=headers,
    )
    assert declined_delete.status_code == 200

    received_item = await _inventory_item(
        client,
        headers,
        category_name="Received Delete",
        item_name="Received Delete Item",
    )
    received_order = await create_order(
        client,
        headers,
        items=[order_item_payload(received_item, quantity=1)],
    )
    await _set_order_status(client, headers, received_order["id"], "received")
    received_delete = await client.delete(
        f"/api/v1/orders/{received_order['id']}",
        headers=headers,
    )
    assert received_delete.status_code == 400

    applied_item = await _inventory_item(
        client,
        headers,
        category_name="Applied Delete",
        item_name="Applied Delete Item",
    )
    applied_order = await create_order(
        client,
        headers,
        items=[order_item_payload(applied_item, quantity=1)],
    )
    await _set_order_status(client, headers, applied_order["id"], "received")
    apply_resp = await client.post(
        f"/api/v1/orders/{applied_order['id']}/apply",
        headers=headers,
    )
    assert apply_resp.status_code == 200
    applied_delete = await client.delete(
        f"/api/v1/orders/{applied_order['id']}",
        headers=headers,
    )
    assert applied_delete.status_code == 400
