"""Domain tests for order endpoints."""

import asyncio
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select

from app.api.v1 import orders as orders_api
from app.models import OrderNumberCounter
from tests.conftest import (
    TestSession,
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


async def test_order_create_rejects_missing_and_foreign_item_ids_without_partial_create(
    client: AsyncClient,
):
    _, owner_headers = await register_and_auth(
        client,
        name="Order Validation Owner",
        email="order-validation-owner@test.com",
    )
    _, stranger_headers = await register_and_auth(
        client,
        name="Order Validation Stranger",
        email="order-validation-stranger@test.com",
    )
    owner_item = await _inventory_item(
        client,
        owner_headers,
        category_name="Validation Owner Items",
        item_name="Owned Validation Item",
    )
    stranger_item = await _inventory_item(
        client,
        stranger_headers,
        category_name="Validation Stranger Items",
        item_name="Foreign Validation Item",
    )

    missing_item_resp = await client.post(
        "/api/v1/orders",
        headers=owner_headers,
        json={
            "orderId": "CLIENT-SIDE-ID",
            "items": [
                order_item_payload(
                    owner_item,
                    quantity=1,
                    itemId="00000000-0000-0000-0000-000000000000",
                )
            ],
        },
    )
    assert missing_item_resp.status_code == 400
    assert "invalid inventory item" in missing_item_resp.json()["detail"].lower()

    foreign_item_resp = await client.post(
        "/api/v1/orders",
        headers=owner_headers,
        json={
            "orderId": "CLIENT-SIDE-ID",
            "items": [order_item_payload(stranger_item, quantity=1)],
        },
    )
    assert foreign_item_resp.status_code == 400
    assert "invalid inventory item" in foreign_item_resp.json()["detail"].lower()

    list_resp = await client.get("/api/v1/orders", headers=owner_headers)
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 0


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


async def test_order_status_transitions_preserve_mobile_flow_and_reject_illegal(
    client: AsyncClient,
):
    _, headers = await register_and_auth(
        client,
        name="Transition Owner",
        email="transition-owner@test.com",
    )
    item = await _inventory_item(
        client,
        headers,
        item_name="Transition Item",
    )

    mobile_order = await create_order(
        client,
        headers,
        items=[order_item_payload(item, quantity=1)],
    )

    same_pending = await _set_order_status(
        client,
        headers,
        mobile_order["id"],
        "pending",
    )
    assert same_pending["status"] == "pending"
    assert same_pending["receivedAt"] is None

    direct_stock_update = await client.patch(
        f"/api/v1/orders/{mobile_order['id']}/status",
        headers=headers,
        json={"status": "stock_updated"},
    )
    assert direct_stock_update.status_code == 400

    mobile_received = await _set_order_status(
        client,
        headers,
        mobile_order["id"],
        "received",
    )
    assert mobile_received["status"] == "received"
    assert mobile_received["receivedAt"] is not None

    same_received = await _set_order_status(
        client,
        headers,
        mobile_order["id"],
        "received",
    )
    assert same_received["status"] == "received"

    received_to_stock_updated = await client.patch(
        f"/api/v1/orders/{mobile_order['id']}/status",
        headers=headers,
        json={"status": "stock_updated"},
    )
    assert received_to_stock_updated.status_code == 400

    backward_to_ordered = await client.patch(
        f"/api/v1/orders/{mobile_order['id']}/status",
        headers=headers,
        json={"status": "ordered"},
    )
    assert backward_to_ordered.status_code == 400

    partial_order = await create_order(
        client,
        headers,
        items=[order_item_payload(item, quantity=1)],
    )
    await _set_order_status(client, headers, partial_order["id"], "ordered")
    partially_received = await _set_order_status(
        client,
        headers,
        partial_order["id"],
        "partially_received",
    )
    assert partially_received["status"] == "partially_received"
    partial_to_received = await _set_order_status(
        client,
        headers,
        partial_order["id"],
        "received",
    )
    assert partial_to_received["status"] == "received"

    declined_order = await create_order(
        client,
        headers,
        items=[order_item_payload(item, quantity=1)],
    )
    await _set_order_status(client, headers, declined_order["id"], "declined")
    declined_to_ordered = await client.patch(
        f"/api/v1/orders/{declined_order['id']}/status",
        headers=headers,
        json={"status": "ordered"},
    )
    assert declined_to_ordered.status_code == 400


async def test_order_apply_concurrent_requests_update_stock_once(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
):
    _, headers = await register_and_auth(
        client,
        name="Concurrent Apply Owner",
        email="concurrent-apply-owner@test.com",
    )
    item = await _inventory_item(
        client,
        headers,
        item_name="Concurrent Feeding Bags",
        quantity=5,
    )
    order = await create_order(
        client,
        headers,
        items=[order_item_payload(item, quantity=4)],
    )
    await _set_order_status(client, headers, order["id"], "received")

    original_log_audit = orders_api.log_audit
    audit_call_count = 0
    audit_gate = asyncio.Event()
    audit_lock = asyncio.Lock()

    async def delayed_log_audit(*args, **kwargs):
        nonlocal audit_call_count
        async with audit_lock:
            audit_call_count += 1
            if audit_call_count == 2:
                audit_gate.set()

        try:
            await asyncio.wait_for(audit_gate.wait(), timeout=0.2)
        except TimeoutError:
            pass

        return await original_log_audit(*args, **kwargs)

    monkeypatch.setattr(orders_api, "log_audit", delayed_log_audit)

    responses = await asyncio.gather(
        client.post(f"/api/v1/orders/{order['id']}/apply", headers=headers),
        client.post(f"/api/v1/orders/{order['id']}/apply", headers=headers),
    )

    status_codes = sorted(resp.status_code for resp in responses)
    assert status_codes == [200, 400], [resp.text for resp in responses]

    item_resp = await client.get(f"/api/v1/items/{item['id']}", headers=headers)
    assert item_resp.status_code == 200
    refreshed_item = item_resp.json()
    assert refreshed_item["quantity"] == 9
    assert refreshed_item["version"] == item["version"] + 1

    activity_resp = await client.get("/api/v1/activities", headers=headers)
    assert activity_resp.status_code == 200
    apply_activities = [
        activity
        for activity in activity_resp.json()["activities"]
        if activity["action"] == "order_applied"
        and activity["orderId"] == order["orderId"]
    ]
    assert len(apply_activities) == 1


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


async def test_order_create_rejects_non_positive_quantity(client: AsyncClient):
    """Order-item quantity must be > 0 (VAL-1): zero/negative is rejected at the edge."""
    _, headers = await register_and_auth(
        client,
        name="Quantity Guard Owner",
        email="quantity-guard-owner@test.com",
    )
    item = await _inventory_item(client, headers, item_name="Guarded Syringe", quantity=10)

    for bad_quantity in (0, -5):
        resp = await client.post(
            "/api/v1/orders",
            headers=headers,
            json={
                "orderId": "CLIENT-SIDE-ID",
                "items": [order_item_payload(item, quantity=bad_quantity)],
                "notes": "invalid quantity",
            },
        )
        assert resp.status_code == 422, resp.text


async def test_order_status_transition_is_atomic_under_concurrency(client: AsyncClient):
    """Two concurrent transitions from pending: exactly one wins (CONC-3).

    The transition now runs as a conditional UPDATE guarded on the old status,
    so two simultaneous changes cannot both commit (no last-writer-wins).
    """
    _, headers = await register_and_auth(
        client,
        name="Concurrent Status Owner",
        email="concurrent-status-owner@test.com",
    )
    item = await _inventory_item(client, headers, item_name="Status Race Bags", quantity=5)
    order = await create_order(
        client,
        headers,
        items=[order_item_payload(item, quantity=2)],
    )

    received, declined = await asyncio.gather(
        client.patch(
            f"/api/v1/orders/{order['id']}/status",
            headers=headers,
            json={"status": "received"},
        ),
        client.patch(
            f"/api/v1/orders/{order['id']}/status",
            headers=headers,
            json={"status": "declined"},
        ),
    )

    codes = [received.status_code, declined.status_code]
    # Exactly one transition wins; the loser is a 4xx (conflict or illegal-from-new-state).
    assert codes.count(200) == 1, [received.text, declined.text]
    assert all(code == 200 or code in (400, 409) for code in codes), codes

    final = await client.get(f"/api/v1/orders/{order['id']}", headers=headers)
    assert final.status_code == 200
    assert final.json()["status"] in ("received", "declined")


async def _allocated_order_numbers() -> int:
    async with TestSession() as db:
        return await db.scalar(select(func.coalesce(func.sum(OrderNumberCounter.last_value), 0)))


async def test_order_create_replay_with_same_local_id_returns_original_order(
    client: AsyncClient,
):
    """Retry after a lost response returns the first order, not a duplicate (F-2)."""
    _, headers = await register_and_auth(
        client,
        name="Replay Order Owner",
        email="replay-order-owner@test.com",
    )
    item = await _inventory_item(client, headers, item_name="Replay Gauze")
    payload = {
        "orderId": "CLIENT-SIDE-ID",
        "localId": str(uuid.uuid4()),
        "items": [order_item_payload(item, quantity=2)],
    }

    first = await client.post("/api/v1/orders", headers=headers, json=payload)
    replay = await client.post("/api/v1/orders", headers=headers, json=payload)

    assert first.status_code == 201, first.text
    assert replay.status_code == 200, replay.text
    assert replay.json()["id"] == first.json()["id"]
    assert replay.json()["orderId"] == first.json()["orderId"]
    assert replay.json()["localId"] == payload["localId"]
    assert replay.json()["items"] == first.json()["items"]

    list_resp = await client.get("/api/v1/orders", headers=headers)
    assert list_resp.json()["total"] == 1
    activity_resp = await client.get("/api/v1/activities", headers=headers)
    created = [
        activity
        for activity in activity_resp.json()["activities"]
        if activity["action"] == "order_created"
    ]
    assert len(created) == 1
    assert await _allocated_order_numbers() == 1


async def test_order_create_different_local_ids_create_separate_orders(
    client: AsyncClient,
):
    _, headers = await register_and_auth(
        client,
        name="Separate Orders Owner",
        email="separate-orders-owner@test.com",
    )
    item = await _inventory_item(client, headers, item_name="Separate Syringes")

    keyed = [
        await create_order(
            client,
            headers,
            items=[order_item_payload(item, quantity=1)],
            localId=str(uuid.uuid4()),
        )
        for _ in range(2)
    ]
    # Clients that send no localId keep the old behaviour: every POST is new.
    keyless = [
        await create_order(client, headers, items=[order_item_payload(item, quantity=1)])
        for _ in range(2)
    ]

    orders = keyed + keyless
    assert len({order["id"] for order in orders}) == 4
    assert len({order["orderId"] for order in orders}) == 4
    list_resp = await client.get("/api/v1/orders", headers=headers)
    assert list_resp.json()["total"] == 4


async def test_order_local_id_never_matches_another_account(client: AsyncClient):
    _, owner_headers = await register_and_auth(
        client,
        name="Local Key Owner",
        email="local-key-owner@test.com",
    )
    _, other_headers = await register_and_auth(
        client,
        name="Local Key Other",
        email="local-key-other@test.com",
    )
    owner_item = await _inventory_item(
        client,
        owner_headers,
        category_name="Local Key Owner Items",
        item_name="Owner Bandage",
    )
    other_item = await _inventory_item(
        client,
        other_headers,
        category_name="Local Key Other Items",
        item_name="Other Bandage",
    )
    local_id = str(uuid.uuid4())
    owner_payload = {
        "orderId": "CLIENT-SIDE-ID",
        "localId": local_id,
        "items": [order_item_payload(owner_item, quantity=1)],
    }
    owner_order = (
        await client.post("/api/v1/orders", headers=owner_headers, json=owner_payload)
    ).json()

    # Replaying the owner's exact submission from another account must not
    # return (and so leak) the owner's order.
    foreign_replay = await client.post(
        "/api/v1/orders", headers=other_headers, json=owner_payload
    )
    assert foreign_replay.status_code == 400, foreign_replay.text

    other_order = await create_order(
        client,
        other_headers,
        items=[order_item_payload(other_item, quantity=1)],
        localId=local_id,
    )
    assert other_order["id"] != owner_order["id"]
    assert other_order["orderId"] != owner_order["orderId"]
    assert other_order["userId"] != owner_order["userId"]

    owner_replay = await client.post(
        "/api/v1/orders", headers=owner_headers, json=owner_payload
    )
    assert owner_replay.status_code == 200
    assert owner_replay.json()["id"] == owner_order["id"]
    for headers in (owner_headers, other_headers):
        list_resp = await client.get("/api/v1/orders", headers=headers)
        assert list_resp.json()["total"] == 1


async def test_order_create_concurrent_replays_create_one_order(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
):
    """Replays that all miss the lookup race on the unique index; losers re-read."""
    _, headers = await register_and_auth(
        client,
        name="Replay Race Owner",
        email="replay-race-owner@test.com",
    )
    item = await _inventory_item(client, headers, item_name="Replay Race Masks")
    payload = {
        "orderId": "CLIENT-SIDE-ID",
        "localId": str(uuid.uuid4()),
        "items": [order_item_payload(item, quantity=1)],
    }

    original_allocate = orders_api.allocate_order_id
    arrived = 0
    all_looked_up = asyncio.Event()

    async def allocate_after_every_lookup(db, now):
        nonlocal arrived
        arrived += 1
        if arrived == 3:
            all_looked_up.set()
        await asyncio.wait_for(all_looked_up.wait(), timeout=5)
        return await original_allocate(db, now)

    monkeypatch.setattr(orders_api, "allocate_order_id", allocate_after_every_lookup)

    responses = await asyncio.gather(
        *(client.post("/api/v1/orders", headers=headers, json=payload) for _ in range(3))
    )

    assert sorted(resp.status_code for resp in responses) == [200, 200, 201], [
        resp.text for resp in responses
    ]
    assert len({resp.json()["id"] for resp in responses}) == 1
    assert len({resp.json()["orderId"] for resp in responses}) == 1
    list_resp = await client.get("/api/v1/orders", headers=headers)
    assert list_resp.json()["total"] == 1
    # The losers' rollback also released the numbers they had allocated.
    assert await _allocated_order_numbers() == 1


@pytest.mark.parametrize("with_local_id", [True, False])
async def test_order_create_other_integrity_errors_are_not_treated_as_replays(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    with_local_id: bool,
):
    """Only a localId conflict is answered with the existing order."""
    _, headers = await register_and_auth(
        client,
        name="Integrity Owner",
        email="integrity-owner@test.com",
    )
    item = await _inventory_item(client, headers, item_name="Integrity Tape")
    taken = await create_order(client, headers, items=[order_item_payload(item, quantity=1)])

    async def reuse_taken_number(db, now):
        return taken["orderId"]

    monkeypatch.setattr(orders_api, "allocate_order_id", reuse_taken_number)
    payload = {"orderId": "CLIENT-SIDE-ID", "items": [order_item_payload(item, quantity=1)]}
    if with_local_id:
        payload["localId"] = str(uuid.uuid4())

    resp = await client.post("/api/v1/orders", headers=headers, json=payload)

    assert resp.status_code == 409, resp.text
    list_resp = await client.get("/api/v1/orders", headers=headers)
    assert list_resp.json()["total"] == 1

async def test_order_create_rejects_blank_or_oversized_local_id(client: AsyncClient):
    _, headers = await register_and_auth(
        client,
        name="Local Key Bounds Owner",
        email="local-key-bounds-owner@test.com",
    )
    item = await _inventory_item(client, headers, item_name="Bounded Swabs")

    for bad_local_id in ("", "x" * 37):
        resp = await client.post(
            "/api/v1/orders",
            headers=headers,
            json={
                "orderId": "CLIENT-SIDE-ID",
                "localId": bad_local_id,
                "items": [order_item_payload(item, quantity=1)],
            },
        )
        assert resp.status_code == 422, resp.text

    list_resp = await client.get("/api/v1/orders", headers=headers)
    assert list_resp.json()["total"] == 0


async def test_concurrent_applies_sharing_items_do_not_deadlock(client: AsyncClient):
    """Applies lock items in item-id order, so overlapping orders queue instead of deadlocking."""
    _, headers = await register_and_auth(client, name="Apply Order Owner", email="apply-order@test.com")
    category = await create_category(client, headers, name="Apply Order Category")
    items = [
        await create_item(client, headers, category_id=category["id"], name=f"Line {i}", quantity=1)
        for i in range(20)
    ]
    forward = await create_order(client, headers, items=[order_item_payload(i, quantity=1) for i in items])
    backward = await create_order(
        client, headers, items=[order_item_payload(i, quantity=1) for i in reversed(items)]
    )
    for order in (forward, backward):
        resp = await client.patch(
            f"/api/v1/orders/{order['id']}/status", headers=headers, json={"status": "received"}
        )
        assert resp.status_code == 200, resp.text

    results = await asyncio.gather(
        client.post(f"/api/v1/orders/{forward['id']}/apply", headers=headers),
        client.post(f"/api/v1/orders/{backward['id']}/apply", headers=headers),
    )
    assert [r.status_code for r in results] == [200, 200], [r.text for r in results]
    listed = (await client.get("/api/v1/items?pageSize=100", headers=headers)).json()["items"]
    assert {i["quantity"] for i in listed} == {3}  # 1 + 1 from each order, applied once each


@pytest.mark.parametrize(
    "overrides",
    [
        {"name": "N" * 256},
        {"unit": "u" * 51},
        {"brand": "b" * 256},
        {"supplierName": "s" * 256},
        {"imageUri": "file:///" + "x" * 500},
        {"currentStock": 2**31},
        {"currentStock": -1},
        {"minimumStock": -1},
        {"itemId": ""},
    ],
)
async def test_order_item_fields_out_of_range_are_rejected_not_500(client: AsyncClient, overrides):
    _, headers = await register_and_auth(client, name="Bounds Owner", email="bounds-owner@test.com")
    category = await create_category(client, headers, name="Bounds Category")
    item = await create_item(client, headers, category_id=category["id"], name="Saline")
    resp = await client.post(
        "/api/v1/orders",
        headers=headers,
        json={"orderId": "CLIENT", "items": [order_item_payload(item, quantity=1, **overrides)]},
    )
    assert resp.status_code == 422, resp.text
    assert (await client.get("/api/v1/orders", headers=headers)).json()["total"] == 0


@pytest.mark.parametrize("payload", [{"orderId": "CLIENT", "items": []}, {"orderId": "CLIENT"}])
async def test_order_without_lines_is_rejected(client: AsyncClient, payload):
    _, headers = await register_and_auth(client, name="Empty Owner", email="empty-owner@test.com")
    resp = await client.post("/api/v1/orders", headers=headers, json=payload)
    assert resp.status_code == 422, resp.text


async def test_order_item_non_http_purchase_link_is_dropped(client: AsyncClient):
    _, headers = await register_and_auth(client, name="Link Owner", email="link-owner@test.com")
    category = await create_category(client, headers, name="Link Category")
    item = await create_item(client, headers, category_id=category["id"], name="Gauze")
    order = await create_order(
        client,
        headers,
        items=[order_item_payload(item, quantity=1, purchaseLink="javascript:alert(1)")],
    )
    assert order["items"][0]["purchaseLink"] is None
    kept = await create_order(
        client,
        headers,
        items=[order_item_payload(item, quantity=1, purchaseLink=" https://example.com/x ")],
    )
    assert kept["items"][0]["purchaseLink"] == "https://example.com/x"


async def test_order_delete_is_recorded_in_activity_and_audit(client: AsyncClient):
    from app.models import ActivityLog, AuditLog

    _, headers = await register_and_auth(client, name="Delete Owner", email="delete-owner@test.com")
    category = await create_category(client, headers, name="Delete Category")
    item = await create_item(client, headers, category_id=category["id"], name="Swabs")
    order = await create_order(client, headers, items=[order_item_payload(item, quantity=2)])
    resp = await client.delete(f"/api/v1/orders/{order['id']}", headers=headers)
    assert resp.status_code == 200, resp.text

    async with TestSession() as session:
        activity = (
            await session.scalars(select(ActivityLog).where(ActivityLog.details == "Order deleted"))
        ).one()
        audit = (
            await session.scalars(
                select(AuditLog).where(AuditLog.entity_type == "order", AuditLog.action == "delete")
            )
        ).one()
    assert activity.order_id == order["orderId"] and activity.item_name == f"Order {order['orderId']}"
    assert audit.entity_id == order["id"]
    assert audit.old_values == {
        "order_id": order["orderId"],
        "status": "pending",
        "total_items": 1,
        "total_units": 2,
    }
