"""Strict interpretation specifications only; providers and data are synthetic."""
import asyncio
import json
import uuid

import pytest
from fastapi import HTTPException
from pydantic import SecretStr, ValidationError
from sqlalchemy import func, select

from app.core.config import settings
from app.models import ActivityLog, Item, Order
from app.schemas.ai import Specification
from app.services import ai_provider
from tests.conftest import TestSession, create_category, create_item, order_item_payload, register_and_auth


def spec(**patch):
    return {"version": 2, "intent": "draft_order", "draft_mode": "new", "query": None,
            "lines": [{"operation": "set", "item_query": "Synthetic gloves", "quantity": 20, "unit": "pairs"}],
            "include_low": False, "include_out": False, **patch}


@pytest.mark.parametrize("patch", [
    {"intent": "save_order"}, {"tool": "delete"}, {"draft_mode": None},
    {"lines": [{"operation": "apply", "item_query": "gloves", "quantity": 20, "unit": None}]},
    {"lines": [{"operation": "set", "item_query": "gloves", "quantity": 1000000, "unit": None}]},
    {"lines": [{"operation": "set", "item_query": "gloves", "quantity": True, "unit": None}]},
])
def test_draft_contract_excludes_server_actions_and_invalid_values(patch):
    with pytest.raises(ValidationError):
        Specification.model_validate(spec(**patch))


@pytest.mark.asyncio
@pytest.mark.parametrize("response,question,accepted", [
    (spec(), "Prepare an order for twenty pairs of Synthetic gloves", True),
    (spec(), "Prepare an order for 20 pairs of Synthetic gloves", True),
    (spec(), "Create a purchase order draft: for Synthetic gloves I would need twenty pairs please", True),
    (spec(), "In my draft, Synthetic gloves: please make it 20 pairs", True),
    (spec(), "Put 20 pairs of the Synthetic gloves into an unsaved order", True),
    (spec(), "Prepare an order for 5 pairs of Synthetic gloves", False),
    (spec(), "Prepare an order for 20 boxes of Synthetic gloves", False),
    (spec(), "Prepare an order for 20 pairs of unknown item", False),
    (spec(), "Prepare an order for 5 pairs of Synthetic gloves and 20 boxes of masks", False),
    (spec(), "Prepare an order for one two pairs of Synthetic gloves", False),
    (spec(), "Prepare an order for 20 boxes of Synthetic gloves and 5 pairs of masks", False),
    (spec(), "For Synthetic gloves I need 5 pairs, and for masks make it 20 boxes", False),
    (spec(), "For Synthetic gloves I need 20 boxes, and for masks make it 5 pairs", False),
    (spec(), "For Synthetic gloves I need 5 pairs instead of 20 boxes", False),
    (spec(lines=[{"operation": "set", "item_query": "Synthetic gloves", "quantity": 20, "unit": None}]),
     "Prepare an order for 20 pairs of Synthetic gloves", False),
])
async def test_provider_draft_parameters_are_grounded_in_reviewed_text(monkeypatch, response, question, accepted):
    async def fake(url, headers, **kwargs):
        assert kwargs["json"]["response_format"]["json_schema"]["schema"]["additionalProperties"] is False
        assert "tool" not in kwargs["json"]
        return json.dumps({"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(response)}}]}).encode()
    monkeypatch.setattr(ai_provider, "bounded_call", fake)
    if accepted:
        result, _ = await ai_provider.interpret(question, False, 2)
        assert result.lines[0].quantity == 20
    else:
        with pytest.raises(HTTPException) as exc:
            await ai_provider.interpret(question, False, 2)
        assert exc.value.status_code == 502


@pytest.mark.asyncio
async def test_interpret_v2_never_writes_inventory_or_orders(client, monkeypatch):
    _, headers = await register_and_auth(client)
    category = await create_category(client, headers)
    item = await create_item(client, headers, category_id=category["id"], name="Synthetic gloves", quantity=3)
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DATA_CONTROLS_REVIEWED", True)
    monkeypatch.setattr(settings, "GROQ_API_KEY", SecretStr("synthetic-key"))
    await client.put('/api/v1/ai/consent', headers=headers, json={"version":"voice-2026-10-06","accepted":True,"scopes":["groq_text"]})
    async def fake(question, previous, version):
        assert version == 2
        return Specification.model_validate(spec()), {"prompt_tokens":1,"completion_tokens":1}
    monkeypatch.setattr(ai_provider, "interpret", fake)
    response = await client.post('/api/v1/ai/interpret', headers=headers, json={"question":"Prepare an order for 20 pairs of Synthetic gloves","contract_version":2})
    assert response.status_code == 200, response.text
    assert response.json()["lines"][0]["quantity"] == 20
    async with TestSession() as db:
        assert await db.scalar(select(func.count()).select_from(Order)) == 0
        assert (await db.get(Item, item["id"])).quantity == 3
    caps = (await client.get('/api/v1/ai/capabilities', headers=headers)).json()
    assert caps['interpret_contracts'] == [1,2] and caps['order_review_guard'] is True


@pytest.mark.asyncio
@pytest.mark.parametrize("question", [
    "Create a saved order draft for the following items: first is two units of Ambu bag, and second is all the items which are low in stock or out of stock, create a saved order draft.",
    "Could you put together a draft with Ambu bag: I need two units; include anything running low and anything out of stock",
])
async def test_mixed_draft_route_validates_provider_then_reads_owned_inventory_without_saving(client, monkeypatch, question):
    _, headers = await register_and_auth(client)
    category = await create_category(client, headers)
    bag = await create_item(client, headers, category_id=category["id"], name="Ambu Bag", quantity=1, unit="unit")
    gloves = await create_item(client, headers, category_id=category["id"], name="Hand gloves", quantity=2, unit="pairs")
    masks = await create_item(client, headers, category_id=category["id"], name="Masks", quantity=0, unit="boxes", minimumStock=4)
    _, foreign = await register_and_auth(client, email="foreign-mixed@test.com")
    foreign_category = await create_category(client, foreign)
    await create_item(client, foreign, category_id=foreign_category["id"], name="Foreign item", quantity=0)
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_DATA_CONTROLS_REVIEWED", True)
    monkeypatch.setattr(settings, "GROQ_API_KEY", SecretStr("synthetic-key"))
    response = spec(lines=[{"operation":"set","item_query":"Ambu bag","quantity":2,"unit":"units"}], include_low=True, include_out=True)
    calls = []

    async def fake_provider(url, headers, **kwargs):
        calls.append(url)
        request = kwargs["json"]
        assert json.loads(request["messages"][1]["content"]) == {"question":question,"has_previous_item":False}
        assert "tools" not in request
        assert request["response_format"]["json_schema"]["strict"] is True
        return json.dumps({"choices":[{"finish_reason":"stop","message":{"content":json.dumps(response)}}],"usage":{"prompt_tokens":20,"completion_tokens":40}}).encode()

    # Replace external HTTP only. Authentication, consent/quota, schemas and the
    # actual provider grounding adapter all run against the disposable database.
    monkeypatch.setattr(ai_provider, "bounded_call", fake_provider)
    request = {"question":question,"contract_version":2}
    assert (await client.post('/api/v1/ai/interpret', headers=headers, json=request)).status_code == 403
    assert calls == []
    assert (await client.put('/api/v1/ai/consent', headers=headers, json={"version":"voice-2026-10-06","accepted":True,"scopes":["groq_text"]})).status_code == 200
    async with TestSession() as db:
        before = tuple([await db.scalar(select(func.count()).select_from(model)) for model in (Item, Order, ActivityLog)])
    result = await client.post('/api/v1/ai/interpret', headers=headers, json=request)
    assert result.status_code == 200, result.text
    assert result.json() == response
    assert len(calls) == 1
    stock = await client.get('/api/v1/items?page=1&pageSize=100', headers=headers)
    assert stock.status_code == 200
    assert {row["id"] for row in stock.json()["items"]} == {bag["id"],gloves["id"],masks["id"]}
    assert {row["id"]:row["quantity"] for row in stock.json()["items"]} == {bag["id"]:1,gloves["id"]:2,masks["id"]:0}
    async with TestSession() as db:
        after = tuple([await db.scalar(select(func.count()).select_from(model)) for model in (Item, Order, ActivityLog)])
        assert after == before
        assert await db.scalar(select(func.count()).select_from(Order)) == 0


@pytest.mark.asyncio
async def test_guarded_order_rejects_changed_inactive_or_foreign_items_and_preserves_stock(client):
    _, headers = await register_and_auth(client)
    category = await create_category(client, headers)
    item = await create_item(client, headers, category_id=category["id"], name="Review item", quantity=3)
    async def submit(version, local_id=None):
        return await client.post('/api/v1/orders', headers=headers, json={"orderId":"placeholder","localId":local_id or str(uuid.uuid4()),"items":[{**order_item_payload(item, quantity=20), "expectedVersion":version}]})
    assert (await submit(item['version']+1)).status_code == 409
    local_id = str(uuid.uuid4())
    responses = await asyncio.gather(submit(item['version'],local_id), submit(item['version'],local_id))
    assert sorted(r.status_code for r in responses) == [200,201]
    assert responses[0].json()['id'] == responses[1].json()['id']
    async with TestSession() as db:
        assert (await db.get(Item,item['id'])).quantity == 3
        assert await db.scalar(select(func.count()).select_from(Order)) == 1
        current = await db.get(Item,item['id'])
        current.is_active = False
        current.version += 1
        await db.commit()
    assert (await submit(item['version'])).status_code == 409
    # A retry of a saved localId still returns its original order after stock changes.
    assert (await submit(item['version'],local_id)).status_code == 200
    _, other = await register_and_auth(client,email='foreign-voice@test.com')
    response = await client.post('/api/v1/orders',headers=other,json={"orderId":"placeholder","items":[{**order_item_payload(item),"expectedVersion":item['version']}]})
    assert response.status_code == 400
