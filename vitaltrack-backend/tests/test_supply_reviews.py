"""Real guarded disposable-DB verification. All records are synthetic."""

import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import delete, func, select

from app.core.config import settings
from app.models import ClosedOrderSubmission, Item, Order, User
from app.models.supply_review import SupplyRevision, SupplyReviewConfirmation, SupplyReviewProposal, SupplyReviewRun
from app.services import supply_review
from tests.conftest import TestSession, create_category, create_item, create_order, order_item_payload, register_and_auth


@pytest.fixture(autouse=True)
def enable_reviews(monkeypatch):
    monkeypatch.setattr(settings, "SUPPLY_REVIEW_ENABLED", True)


async def fixture(client, **overrides):
    owner, headers = await register_and_auth(client, email=f"supply-{uuid4()}@example.com")
    category = await create_category(client, headers, name="Synthetic Supplies")
    values = {"quantity": 2, "minimumStock": 5, **overrides}
    item = await create_item(client, headers, category_id=category["id"], **values)
    return owner, headers, category, item


async def start(client, headers, request_id=None):
    response = await client.post("/api/v1/supply-reviews", headers=headers, json={"request_id": request_id or str(uuid4()), "target_mode": "minimum"})
    assert response.status_code == 200, response.text
    return response.json()


def confirmation(run, key=None):
    return {"expected_run_version": run["version"], "proposal_id": run["proposal"]["id"],
            "proposal_version": run["proposal"]["version"], "idempotency_key": key or str(uuid4())}


async def confirm(client, headers, run, key=None):
    return await client.post(f"/api/v1/supply-reviews/{run['id']}/confirm", headers=headers, json=confirmation(run, key))


async def test_owner_isolation_explicit_targets_and_no_provider_or_stock_write(client, monkeypatch):
    owner, headers, _, item = await fixture(client)
    _, other = await register_and_auth(client, email="other-review@example.com")
    request_id = str(uuid4())
    run = await start(client, headers, request_id)
    replay = await start(client, headers, request_id)
    assert run == replay and run["status"] == "awaiting_review"
    assert run["proposal"]["lines"][0]["order_quantity"] == 3
    assert (await client.get(f"/api/v1/supply-reviews/{run['id']}", headers=other)).status_code == 404
    assert (await client.get("/api/v1/supply-reviews", headers=other)).json() == {"runs": []}
    assert (await confirm(client, other, run)).status_code == 404
    assert (await client.get("/api/v1/supply-reviews")).status_code == 401
    assert (await client.get(f"/api/v1/items/{item['id']}", headers=headers)).json()["quantity"] == 2
    async with TestSession() as db:
        assert await db.scalar(select(func.count()).select_from(Order)) == 0
    history = (await client.get("/api/v1/supply-reviews", headers=headers)).json()["runs"]
    assert set(history[0]) == {"id", "version", "status", "created_at", "expires_at", "order_id"}


async def test_concurrent_first_writes_create_one_owner_revision_without_losing_changes(client):
    owner, headers = await register_and_auth(client, email="synthetic-first-writes@example.com")
    owner_id = owner["user"]["id"]
    async with TestSession() as db:
        assert await db.get(SupplyRevision, owner_id) is None
    results = await asyncio.gather(*(
        client.post("/api/v1/categories", headers=headers, json={"name": name})
        for name in ("First synthetic category", "Second synthetic category")
    ))
    assert [response.status_code for response in results] == [201, 201]
    async with TestSession() as db:
        assert (await db.get(SupplyRevision, owner_id)).revision == 2


async def test_confirm_is_atomic_idempotent_and_uses_server_snapshot(client):
    _, headers, _, item = await fixture(client)
    run = await start(client, headers)
    responses = await asyncio.gather(*(confirm(client, headers, run) for _ in range(3)))
    assert all(r.status_code == 200 for r in responses), [r.text for r in responses]
    assert len({r.json()["order_id"] for r in responses}) == 1
    saved = responses[0].json()
    assert saved["status"] == "completed"
    order = (await client.get(f"/api/v1/orders/{saved['order_id']}", headers=headers)).json()
    assert order["status"] == "pending" and order["items"][0]["quantity"] == 3
    assert order["items"][0]["currentStock"] == item["quantity"]
    assert (await client.get(f"/api/v1/items/{item['id']}", headers=headers)).json()["quantity"] == 2
    assert (await client.get("/api/v1/orders", headers=headers)).json()["total"] == 1
    # Even a later deletion cannot reopen the already-used approval.
    await client.delete(f"/api/v1/orders/{order['id']}", headers=headers)
    assert (await confirm(client, headers, run)).json()["order_id"] == saved["order_id"]
    assert (await client.get("/api/v1/orders", headers=headers)).json()["total"] == 0


async def test_same_key_for_other_proposal_is_rejected(client):
    _, headers, _, _ = await fixture(client)
    first, second = await start(client, headers), await start(client, headers)
    key = str(uuid4())
    assert (await confirm(client, headers, first, key)).status_code == 200
    assert (await confirm(client, headers, second, key)).status_code == 409


async def test_two_web_android_proposals_cannot_create_overlapping_orders(client):
    _, headers, _, _ = await fixture(client)
    first, second = await start(client, headers), await start(client, headers)
    results = await asyncio.gather(confirm(client, headers, first), confirm(client, headers, second))
    assert sorted(r.status_code for r in results) == [200, 409]
    assert (await client.get("/api/v1/orders", headers=headers)).json()["total"] == 1
    loser = second if results[0].status_code == 200 else first
    assert (await client.get(f"/api/v1/supply-reviews/{loser['id']}", headers=headers)).json()["status"] == "stale"
    fresh = await client.post(f"/api/v1/supply-reviews/{loser['id']}/refresh", headers=headers, json={"expected_run_version": loser["version"]})
    assert fresh.status_code == 200 and fresh.json()["questions"][0]["code"] == "pending_commitment"


async def test_changed_stock_requires_new_immutable_review(client):
    _, headers, _, item = await fixture(client)
    run = await start(client, headers)
    update = await client.patch(f"/api/v1/items/{item['id']}/stock", headers=headers, json={"quantity": 3, "version": item["version"]})
    assert update.status_code == 200, update.text
    assert (await confirm(client, headers, run)).status_code == 409
    response = await client.post(f"/api/v1/supply-reviews/{run['id']}/refresh", headers=headers, json={"expected_run_version": run["version"]})
    assert response.status_code == 200, response.text
    fresh = response.json()
    assert fresh["proposal"]["id"] != run["proposal"]["id"] and fresh["proposal"]["lines"][0]["order_quantity"] == 2
    assert (await confirm(client, headers, run)).status_code == 409
    async with TestSession() as db:
        assert await db.scalar(select(func.count()).select_from(SupplyReviewProposal)) == 2


async def test_expiry_and_cancel_have_no_business_effect(client):
    _, headers, _, _ = await fixture(client)
    run = await start(client, headers)
    async with TestSession.begin() as db:
        row = await db.get(SupplyReviewRun, run["id"])
        row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    assert (await confirm(client, headers, run)).status_code == 410
    assert (await client.get(f"/api/v1/supply-reviews/{run['id']}", headers=headers)).json()["status"] == "expired"
    newer = await start(client, headers)
    cancelled = await client.post(f"/api/v1/supply-reviews/{newer['id']}/cancel", headers=headers, json={"expected_run_version": newer["version"]})
    assert cancelled.json()["status"] == "cancelled"
    assert (await confirm(client, headers, newer)).status_code == 409
    assert (await client.get("/api/v1/orders", headers=headers)).json()["total"] == 0


async def test_disabled_provider_and_disabled_feature_keep_recovery(client, monkeypatch):
    _, headers, _, _ = await fixture(client)
    monkeypatch.setattr(settings, "AI_ENABLED", False)
    run = await start(client, headers)
    saved = await confirm(client, headers, run)
    assert saved.status_code == 200
    monkeypatch.setattr(settings, "SUPPLY_REVIEW_ENABLED", False)
    assert (await client.get(f"/api/v1/supply-reviews/{run['id']}", headers=headers)).json()["order_id"] == saved.json()["order_id"]
    assert (await client.get("/api/v1/supply-reviews", headers=headers)).status_code == 200
    assert (await client.post("/api/v1/supply-reviews", headers=headers, json={"request_id": str(uuid4()), "target_mode": "minimum"})).status_code == 503
    assert (await confirm(client, headers, run)).status_code == 503


@pytest.mark.parametrize("order_status,code", [("pending", "pending_commitment"), ("partially_received", "partial_receipt"), ("received", "received_not_applied")])
async def test_unresolved_commitments_cannot_be_overridden_by_target(client, order_status, code):
    _, headers, _, item = await fixture(client)
    order = await create_order(client, headers, items=[order_item_payload(item, quantity=1)])
    if order_status == "partially_received":
        await client.patch(f"/api/v1/orders/{order['id']}/status", headers=headers, json={"status": "ordered"})
    if order_status != "pending":
        assert (await client.patch(f"/api/v1/orders/{order['id']}/status", headers=headers, json={"status": order_status})).status_code == 200
    run = await start(client, headers)
    assert run["questions"][0]["code"] == code
    endpoint = f"/api/v1/supply-reviews/{run['id']}/answers"
    result = await client.post(endpoint, headers=headers, json={"expected_run_version": run["version"], "answers": [{"item_id": item["id"], "target_quantity": 8}]})
    assert result.status_code == 422
    excluded = await client.post(endpoint, headers=headers, json={"expected_run_version": run["version"], "answers": [{"item_id": item["id"], "exclude": True}]})
    assert excluded.status_code == 200 and excluded.json()["questions"] == []
    assert (await confirm(client, headers, excluded.json())).status_code == 422


async def test_missing_target_answers_are_bounded_and_versioned(client):
    _, headers, _, item = await fixture(client, minimumStock=0, quantity=0)
    run = await start(client, headers)
    assert run["questions"][0]["code"] == "missing_target"
    endpoint = f"/api/v1/supply-reviews/{run['id']}/answers"
    for invalid in [True, -1, 1000000, "2"]:
        assert (await client.post(endpoint, headers=headers, json={"expected_run_version": run["version"], "answers": [{"item_id": item["id"], "target_quantity": invalid}]})).status_code == 422
    answer = await client.post(endpoint, headers=headers, json={"expected_run_version": run["version"], "answers": [{"item_id": item["id"], "target_quantity": 2}]})
    assert answer.status_code == 200 and answer.json()["proposal"]["lines"][0]["order_quantity"] == 2
    assert (await client.post(endpoint, headers=headers, json={"expected_run_version": run["version"], "answers": [{"item_id": item["id"], "exclude": True}]})).status_code == 409


async def test_confirmation_audit_failure_rolls_order_and_result_back(client, monkeypatch):
    _, headers, _, _ = await fixture(client)
    run = await start(client, headers)
    async def fail(*args, **kwargs):
        raise RuntimeError("synthetic audit failure")
    monkeypatch.setattr(supply_review, "log_audit", fail)
    # ASGITransport deliberately re-raises server exceptions in this harness.
    with pytest.raises(RuntimeError, match="synthetic audit failure"):
        await confirm(client, headers, run)
    async with TestSession() as db:
        assert await db.scalar(select(func.count()).select_from(Order)) == 0
        assert await db.scalar(select(func.count()).select_from(SupplyReviewConfirmation)) == 0
        assert (await db.get(SupplyReviewRun, run["id"])).status == "awaiting_review"


async def test_owner_account_deletion_cascades_review_state(client):
    owner, headers, _, _ = await fixture(client)
    run = await start(client, headers)
    assert (await confirm(client, headers, run)).status_code == 200
    assert (await client.post(f"/api/v1/orders/submission/{uuid4()}/resolve", headers=headers)).json()["state"] == "closed"
    async with TestSession.begin() as db:
        await db.execute(delete(User).where(User.id == owner["user"]["id"]))
    async with TestSession() as db:
        for model in (ClosedOrderSubmission, SupplyRevision, SupplyReviewRun, SupplyReviewProposal, SupplyReviewConfirmation):
            assert await db.scalar(select(func.count()).select_from(model)) == 0


async def test_lookup_known_manual_submission_never_writes_or_crosses_owners(client):
    _, headers, _, item = await fixture(client)
    _, other = await register_and_auth(client, email="lookup-other@example.com")
    key = str(uuid4())
    order = await create_order(client, headers, items=[order_item_payload(item)], localId=key)
    endpoint = f"/api/v1/orders/submission/{key}"
    assert (await client.get(endpoint, headers=headers)).json()["id"] == order["id"]
    assert (await client.get(endpoint, headers=other)).status_code == 404
    assert (await client.get("/api/v1/orders/submission/not-a-uuid", headers=headers)).status_code == 422


async def test_explicit_submission_resolution_fences_delayed_posts_and_is_owner_scoped(client):
    _, headers, _, item = await fixture(client)
    _, other = await register_and_auth(client, email="resolve-other@example.com")
    key = str(uuid4())
    endpoint = f"/api/v1/orders/submission/{key}/resolve"
    assert (await client.post(endpoint)).status_code == 401
    assert (await client.post(endpoint, headers=other)).json() == {"state": "closed", "order": None}
    payload = {"orderId": "SYNTHETIC-CLIENT-ID", "localId": key, "items": [order_item_payload(item)]}
    # Another account closing its own same UUID does not close this account's key.
    saved = await client.post("/api/v1/orders", headers=headers, json=payload)
    assert saved.status_code == 201
    resolution = await client.post(endpoint, headers=headers)
    assert resolution.json()["state"] == "saved" and resolution.json()["order"]["id"] == saved.json()["id"]
    assert (await client.post("/api/v1/orders", headers=headers, json=payload)).status_code == 200
    closed_key = str(uuid4())
    endpoint = f"/api/v1/orders/submission/{closed_key}/resolve"
    for _ in range(2):
        assert (await client.post(endpoint, headers=headers)).json() == {"state": "closed", "order": None}
    payload["localId"] = closed_key
    assert (await client.post("/api/v1/orders", headers=headers, json=payload)).status_code == 409
    assert (await client.get("/api/v1/orders", headers=headers)).json()["total"] == 1


@pytest.mark.parametrize("close_first", [False, True])
async def test_resolve_and_create_race_has_exactly_one_fenced_outcome(client, close_first):
    _, headers, _, item = await fixture(client)
    key = str(uuid4())
    create = client.post("/api/v1/orders", headers=headers, json={
        "orderId": "SYNTHETIC-RACE", "localId": key, "items": [order_item_payload(item)]})
    close = client.post(f"/api/v1/orders/submission/{key}/resolve", headers=headers)
    jobs = (close, create) if close_first else (create, close)
    results = await asyncio.gather(*jobs)
    close_result, create_result = results if close_first else results[::-1]
    assert close_result.status_code == 200, close_result.text
    if close_result.json()["state"] == "saved":
        assert create_result.status_code == 201
        assert close_result.json()["order"]["id"] == create_result.json()["id"]
    else:
        assert create_result.status_code == 409
        assert (await client.get("/api/v1/orders", headers=headers)).json()["total"] == 0


async def test_disabled_capabilities_advertise_only_owned_recoverable_history(client, monkeypatch):
    _, headers, _, _ = await fixture(client)
    _, other = await register_and_auth(client, email="history-other@example.com")
    assert not (await client.get("/api/v1/supply-reviews/capabilities", headers=headers)).json()["has_history"]
    await start(client, headers)
    monkeypatch.setattr(settings, "SUPPLY_REVIEW_ENABLED", False)
    caps = (await client.get("/api/v1/supply-reviews/capabilities", headers=headers)).json()
    assert not caps["enabled"] and caps["has_history"]
    assert not (await client.get("/api/v1/supply-reviews/capabilities", headers=other)).json()["has_history"]


async def test_policy_version_and_revision_limit_fail_closed(client):
    _, headers, _, _ = await fixture(client)
    run = await start(client, headers)
    async with TestSession.begin() as db:
        proposal = await db.get(SupplyReviewProposal, run["proposal"]["id"])
        proposal.payload = {**proposal.payload, "rules_version": "previous-policy"}
    assert (await confirm(client, headers, run)).status_code == 409
    assert (await client.get(f"/api/v1/supply-reviews/{run['id']}", headers=headers)).json()["status"] == "stale"
    for _ in range(9):
        response = await client.post(f"/api/v1/supply-reviews/{run['id']}/refresh", headers=headers, json={"expected_run_version": run["version"]})
        assert response.status_code == 200, response.text
        run = response.json()
    assert (await client.post(f"/api/v1/supply-reviews/{run['id']}/refresh", headers=headers, json={"expected_run_version": run["version"]})).status_code == 422


async def test_body_and_full_batch_bounds(client):
    owner, headers, category, _ = await fixture(client)
    async with TestSession.begin() as db:
        for number in range(101):
            db.add(Item(user_id=owner["user"]["id"], category_id=category["id"], name=f"Synthetic empty {number}",
                        quantity=0, minimum_stock=0, unit="pieces", is_active=True, is_critical=False))
    run = await start(client, headers)
    assert len(run["questions"]) == 101
    response = await client.post(f"/api/v1/supply-reviews/{run['id']}/answers", headers=headers, json={
        "expected_run_version": run["version"], "answers": [{"item_id": q["item_id"], "target_quantity": 1} for q in run["questions"]]})
    assert response.status_code == 200 and not response.json()["questions"]
    assert len(response.json()["proposal"]["lines"]) == 102
    assert (await client.post("/api/v1/supply-reviews", headers=headers, content=b" " * 64001)).status_code == 413


async def test_every_normal_writer_changes_review_source_revision(client):
    owner, headers, category, item = await fixture(client)
    async def revision():
        async with TestSession() as db:
            return await db.scalar(select(SupplyRevision.revision).where(SupplyRevision.user_id == owner["user"]["id"]))
    previous = await revision()
    mutations = [
        ("put", f"/api/v1/items/{item['id']}", {"name": "Renamed synthetic item", "version": item["version"]}),
        ("put", f"/api/v1/categories/{category['id']}", {"name": "Renamed synthetic category"}),
    ]
    for method, url, data in mutations:
        assert (await getattr(client, method)(url, headers=headers, json=data)).status_code == 200
        current = await revision()
        assert current > previous
        previous = current
    fresh = (await client.get(f"/api/v1/items/{item['id']}", headers=headers)).json()
    order = await create_order(client, headers, items=[order_item_payload(fresh)])
    assert await revision() > previous
    previous = await revision()
    assert (await client.patch(f"/api/v1/orders/{order['id']}/status", headers=headers, json={"status": "received"})).status_code == 200
    assert await revision() > previous
    previous = await revision()
    assert (await client.post(f"/api/v1/orders/{order['id']}/apply", headers=headers)).status_code == 200
    assert await revision() > previous
    previous = await revision()
    assert (await client.delete(f"/api/v1/categories/{category['id']}", headers=headers)).status_code == 200
    assert await revision() > previous
    async with TestSession() as db:
        assert await db.get(Item, item["id"]) is None
