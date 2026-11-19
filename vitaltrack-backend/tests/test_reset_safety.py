"""Reset-only guards protect records outside the phone's saved backup."""

import asyncio
from urllib.parse import quote

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Item

from tests.conftest import TestSession, create_category, create_item, register_and_auth

pytestmark = pytest.mark.asyncio


async def test_reset_delete_preserves_item_changed_after_backup(client):
    _, headers = await register_and_auth(client, email="reset-item@test.com")
    category = await create_category(client, headers, name="Reset supplies")
    item = await create_item(client, headers, category_id=category["id"], name="Gauze", quantity=4)
    update = await client.put(
        f"/api/v1/items/{item['id']}", headers=headers,
        json={"quantity": 9, "version": item["version"]},
    )
    assert update.status_code == 200
    refused = await client.delete(
        f"/api/v1/items/{item['id']}?version={item['version']}", headers=headers,
    )
    assert refused.status_code == 409
    current = await client.get(f"/api/v1/items/{item['id']}", headers=headers)
    assert current.status_code == 200
    assert current.json()["quantity"] == 9
    deleted = await client.delete(
        f"/api/v1/items/{item['id']}?version={update.json()['version']}", headers=headers,
    )
    assert deleted.status_code == 200


async def test_reset_category_delete_does_not_cascade_unbacked_items(client):
    _, headers = await register_and_auth(client, email="reset-category@test.com")
    category = await create_category(client, headers, name="New supplies")
    # This item represents another device adding a record after the reset backup.
    item = await create_item(client, headers, category_id=category["id"], name="New tubing")
    refused = await client.delete(
        f"/api/v1/categories/{category['id']}?onlyIfEmpty=true", headers=headers,
    )
    assert refused.status_code == 409
    assert (await client.get(f"/api/v1/items/{item['id']}", headers=headers)).status_code == 200
    # Ordinary deletion keeps the existing, intentionally cascading behaviour.
    deleted = await client.delete(f"/api/v1/categories/{category['id']}", headers=headers)
    assert deleted.status_code == 200
    assert (await client.get(f"/api/v1/items/{item['id']}", headers=headers)).status_code == 404


async def test_reset_can_delete_empty_category_and_cannot_delete_other_owner(client):
    _, owner = await register_and_auth(client, email="reset-owner@test.com")
    _, stranger = await register_and_auth(client, email="reset-stranger@test.com")
    category = await create_category(client, owner, name="Empty supplies")
    url = f"/api/v1/categories/{category['id']}?onlyIfEmpty=true"
    assert (await client.delete(url, headers=stranger)).status_code == 404
    assert (await client.delete(url, headers=owner)).status_code == 200


async def test_reset_category_delete_preserves_metadata_changed_after_backup(client):
    _, headers = await register_and_auth(client, email="reset-category-edit@test.com")
    category = await create_category(client, headers, name="Original supplies")
    updated = await client.put(
        f"/api/v1/categories/{category['id']}", headers=headers,
        json={"name": "Renamed supplies", "description": "New information after backup"},
    )
    assert updated.status_code == 200
    old_time = quote(category["updatedAt"], safe="")
    refused = await client.delete(
        f"/api/v1/categories/{category['id']}?onlyIfEmpty=true&expectedUpdatedAt={old_time}",
        headers=headers,
    )
    assert refused.status_code == 409
    current = await client.get(f"/api/v1/categories/{category['id']}", headers=headers)
    assert current.status_code == 200
    assert current.json()["name"] == "Renamed supplies"
    assert current.json()["description"] == "New information after backup"
    current_time = quote(updated.json()["updatedAt"], safe="")
    deleted = await client.delete(
        f"/api/v1/categories/{category['id']}?onlyIfEmpty=true&expectedUpdatedAt={current_time}",
        headers=headers,
    )
    assert deleted.status_code == 200


async def test_empty_only_delete_blocks_a_new_fk_insert_until_it_commits(client, monkeypatch):
    account, headers = await register_and_auth(client, email="reset-lock@test.com")
    category = await create_category(client, headers, name="Locked supplies")
    checked, release = asyncio.Event(), asyncio.Event()
    original = AsyncSession.scalar

    async def held_count(session, statement, *args, **kwargs):
        value = await original(session, statement, *args, **kwargs)
        if "count(items.id)" in str(statement) and "items.category_id" in str(statement):
            checked.set()
            await asyncio.wait_for(release.wait(), 5)
        return value

    monkeypatch.setattr(AsyncSession, "scalar", held_count)
    deleting = asyncio.create_task(client.delete(
        f"/api/v1/categories/{category['id']}?onlyIfEmpty=true", headers=headers,
    ))
    await asyncio.wait_for(checked.wait(), 5)

    async def insert_item():
        async with TestSession() as db:
            db.add(Item(user_id=account["user"]["id"], category_id=category["id"], name="Concurrent addition"))
            try:
                await db.commit()
                return True
            except IntegrityError:
                await db.rollback()
                return False

    inserting = asyncio.create_task(insert_item())
    waiting = False
    try:
        async with TestSession() as db:
            for _ in range(100):
                await db.execute(text("SELECT pg_stat_clear_snapshot()"))
                waiting = await db.scalar(text(
                    "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database() "
                    "AND wait_event_type='Lock' AND pid <> pg_backend_pid())"
                ))
                if waiting:
                    break
                await asyncio.sleep(0.01)
    finally:
        release.set()
    response, inserted = await asyncio.gather(deleting, inserting)
    assert waiting, "Concurrent insert never reached the category lock"
    assert response.status_code == 200
    assert inserted is False, "No new item can be silently cascaded after the empty check"
