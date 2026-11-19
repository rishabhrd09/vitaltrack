"""P3 regression checks: disposable database and synthetic data only."""
import asyncio
import uuid

import pytest
from pydantic import ValidationError
from app.api.v1 import auth
from app.core.config import settings
from app.schemas.item import ItemCreate, ItemUpdate
from app.schemas.category import CategoryCreate, CategoryUpdate
from app.schemas.order import OrderItemCreate
from app.api.v1.web_auth import cookie_settings
from tests.conftest import register_and_auth, create_category, create_item, create_order, order_item_payload

WEB = {"Origin": "https://app.carekosh.com", "X-CareKosh-Web": "1", "Sec-Fetch-Site": "same-site"}

@pytest.mark.parametrize("required", [False, True])
async def test_browser_registration_reports_actual_verification_requirement(client, monkeypatch, required):
    monkeypatch.setattr(settings, "WEB_AUTH_ENABLED", True)
    monkeypatch.setattr(settings, "WEB_APP_ORIGINS", [WEB["Origin"]])
    monkeypatch.setattr(settings, "REQUIRE_EMAIL_VERIFICATION", required)
    monkeypatch.setattr(auth, "is_email_configured", lambda: True)
    async def no_email(**kwargs):
        return True
    monkeypatch.setattr(auth, "send_verification_email", no_email)
    response = await client.post("/api/v1/web-auth/register", headers=WEB, json={"name":"Local browser", "email":"p3@test.com", "password":"TestPass1"})
    assert response.status_code == 201, response.text
    assert response.json()["verificationRequired"] is required
    assert "set-cookie" not in response.headers

async def test_browser_registration_without_email_delivery_matches_sign_in(client, monkeypatch):
    # Local/testing mode keeps its no-email workflow; hosted startup now rejects
    # this configuration. The local registration message must match sign-in.
    monkeypatch.setattr(settings, "WEB_AUTH_ENABLED", True)
    monkeypatch.setattr(settings, "WEB_APP_ORIGINS", [WEB["Origin"]])
    monkeypatch.setattr(settings, "REQUIRE_EMAIL_VERIFICATION", True)
    monkeypatch.setattr(auth, "is_email_configured", lambda: False)
    response = await client.post("/api/v1/web-auth/register", headers=WEB, json={"name":"No email", "email":"no-email@test.com", "password":"TestPass1"})
    assert response.status_code == 201, response.text
    assert response.json()["verificationRequired"] is False
    login = await client.post("/api/v1/web-auth/login", headers=WEB, json={"identifier":"no-email@test.com", "password":"TestPass1"})
    assert login.status_code == 200

async def test_native_refresh_refuses_browser_token_without_consuming_it(client, monkeypatch):
    monkeypatch.setattr(settings, "WEB_AUTH_ENABLED", True)
    monkeypatch.setattr(settings, "WEB_APP_ORIGINS", [WEB["Origin"]])
    native, _ = await register_and_auth(client, email="transport@test.com")
    signed_in = await client.post("/api/v1/web-auth/login", headers=WEB, json={"identifier":"transport@test.com", "password":"TestPass1"})
    assert signed_in.status_code == 200
    token = signed_in.cookies.get(cookie_settings()[0])
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token":token})).status_code == 401
    assert (await client.post("/api/v1/web-auth/refresh", headers=WEB)).status_code == 200
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token":native["refresh_token"]})).status_code == 200

@pytest.mark.parametrize("state", ["ordered", "partially_received", "received"])
async def test_unapplied_order_can_be_closed_without_changing_stock(client, state):
    _, headers = await register_and_auth(client)
    cat = await create_category(client, headers)
    item = await create_item(client, headers, category_id=cat['id'])
    order = await create_order(client, headers, items=[order_item_payload(item)])
    assert (await client.patch(f"/api/v1/orders/{order['id']}/status", headers=headers, json={"status":"ordered"})).status_code == 200
    if state != "ordered":
        assert (await client.patch(f"/api/v1/orders/{order['id']}/status", headers=headers, json={"status":state})).status_code == 200
    result = await client.patch(f"/api/v1/orders/{order['id']}/status", headers=headers, json={"status":"declined"})
    assert result.status_code == 200
    after = (await client.get(f"/api/v1/items/{item['id']}", headers=headers)).json()
    assert (after['quantity'], after['version']) == (item['quantity'], item['version'])
    assert (await client.delete(f"/api/v1/orders/{order['id']}", headers=headers)).status_code == 200

async def test_decline_racing_apply_never_closes_an_applied_order(client):
    _, headers = await register_and_auth(client)
    cat = await create_category(client, headers)
    item = await create_item(client, headers, category_id=cat['id'])
    order = await create_order(client, headers, items=[order_item_payload(item, quantity=2)])
    await client.patch(f"/api/v1/orders/{order['id']}/status", headers=headers, json={"status":"received"})
    results = await asyncio.gather(client.post(f"/api/v1/orders/{order['id']}/apply", headers=headers), client.patch(f"/api/v1/orders/{order['id']}/status", headers=headers, json={"status":"declined"}))
    assert sum(r.status_code == 200 for r in results) == 1
    final = (await client.get(f"/api/v1/orders/{order['id']}", headers=headers)).json()
    after = (await client.get(f"/api/v1/items/{item['id']}", headers=headers)).json()
    assert after['quantity'] == item['quantity'] + (2 if final['status'] == 'stock_updated' else 0)

async def test_reused_submission_key_rejects_changed_payload(client):
    _, headers = await register_and_auth(client)
    cat = await create_category(client, headers)
    item = await create_item(client, headers, category_id=cat['id'])
    body = {'orderId':'MOBILE-ID', 'localId':str(uuid.uuid4()), 'items':[order_item_payload(item, quantity=2)]}
    first = await client.post('/api/v1/orders', headers=headers, json=body)
    assert first.status_code == 201
    body['items'][0]['quantity'] = 9
    assert (await client.post('/api/v1/orders', headers=headers, json=body)).status_code == 409
    assert (await client.get('/api/v1/orders', headers=headers)).json()['total'] == 1

@pytest.mark.parametrize('name', ['   ', '<b></b>'])
@pytest.mark.parametrize('model,extra', [(ItemCreate, {'categoryId':'id'}), (ItemUpdate, {'version':1}), (CategoryCreate, {}), (CategoryUpdate, {}), (OrderItemCreate, {'itemId':'id', 'quantity':1})])
def test_empty_sanitized_names_are_rejected(name, model, extra):
    with pytest.raises(ValidationError):
        model(name=name, **extra)

def test_contacts_urls_and_category_punctuation_are_preserved():
    contact = 'a' * 255
    item = ItemCreate(categoryId='id', name='Gloves', supplierContact=contact, purchaseLink='HTTPS://example.com/supply')
    assert item.supplier_contact == contact
    assert item.purchase_link == 'HTTPS://example.com/supply'
    assert CategoryCreate(name="Caregiver's supplies").name == "Caregiver's supplies"
    with pytest.raises(ValidationError):
        OrderItemCreate(itemId='id', name='Gloves')

@pytest.mark.parametrize('environment', ['staging', 'production'])
async def test_hsts_is_present_in_both_hosted_environments(client, monkeypatch, environment):
    monkeypatch.setattr(settings, 'ENVIRONMENT', environment)
    assert 'max-age=31536000' in (await client.get('/live')).headers['strict-transport-security']
