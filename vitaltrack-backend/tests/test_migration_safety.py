"""Upgrade a populated real prior schema; compare every existing table's data."""
from datetime import datetime, timedelta, timezone
from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest
from sqlalchemy import MetaData, text
from sqlalchemy.exc import IntegrityError

from app.api.v1.orders import allocate_order_id
from app.core.database import Base
from app.core.security import create_access_token
from tests.conftest import TestSession, auth_header, order_item_payload, test_engine


def migrate(connection, revision):
    backend = Path(__file__).resolve().parents[1]
    config = Config(str(backend / 'alembic.ini'))
    config.set_main_option('script_location', str(backend / 'alembic'))
    config.attributes['connection'] = connection
    command.upgrade(config, revision)


TABLES = ('users', 'categories', 'items', 'orders', 'order_items', 'activity_logs', 'audit_log', 'refresh_tokens')


async def fingerprints(connection):
    # Table names are the static allowlist above. Only fingerprints leave the DB.
    return {
        table: (await connection.execute(text(
            f"SELECT count(*), md5(coalesce(string_agg((to_jsonb(t)-'session_version')::text, '|' ORDER BY id), '')) FROM {table} t"
        ))).one()
        for table in TABLES
    }


@pytest.mark.asyncio
async def test_upgrade_preserves_every_existing_record_and_seeds_highest_order_id():
    now = datetime.now(timezone.utc)
    day = now.strftime('%Y%m%d')
    async with test_engine.begin() as connection:
        # The standard guarded fixture owns this disposable DB. Rebuild its
        # empty schema from the real previous revision, not ORM metadata.
        await connection.run_sync(Base.metadata.drop_all)
        await connection.execute(text('DROP TABLE IF EXISTS alembic_version'))
        await connection.run_sync(lambda conn: migrate(conn, '0006_order_item_qty_positive'))
        metadata = MetaData()
        await connection.run_sync(metadata.reflect)
        stamps = {'created_at': now, 'updated_at': now}
        rows = {
            'users': [{'id': 'legacy-user', 'email': 'legacy@example.com', 'hashed_password': 'synthetic-opaque-hash', 'name': 'Legacy Owner', 'phone': 'synthetic-phone', 'is_active': True, 'is_verified': False, 'is_superuser': False, 'is_email_verified': True, **stamps}],
            # Existing duplicates are intentionally preserved, never merged.
            'categories': [{'id': f'category-{i}', 'user_id': 'legacy-user', 'name': 'Legacy Supplies', 'display_order': i, 'is_default': False, **stamps} for i in (1, 2)],
            'items': [{'id': 'legacy-item', 'user_id': 'legacy-user', 'category_id': 'category-1', 'name': 'Legacy Item', 'quantity': 12, 'unit': 'pieces', 'minimum_stock': 5, 'is_active': True, 'is_critical': True, 'version': 3, 'notes': 'Keep these notes', **stamps}],
            'orders': [{'id': f'order-{i}', 'user_id': 'legacy-user', 'order_id': f'ORD-{day}-{i:04d}', 'total_items': 1, 'total_units': 2, 'status': 'STOCK_UPDATED' if i == 1 else 'PENDING', 'exported_at': now, 'applied_at': now if i == 1 else None, 'notes': 'Preserve history', **stamps} for i in (1, 9)],
            'order_items': [{'id': f'line-{i}', 'order_id': f'order-{i}', 'item_id': 'legacy-item', 'name': 'Historical item snapshot', 'unit': 'pieces', 'quantity': 2, 'current_stock': 10, 'minimum_stock': 5, **stamps} for i in (1, 9)],
            'activity_logs': [{'id': 'legacy-activity', 'user_id': 'legacy-user', 'action': 'ORDER_APPLIED', 'item_name': 'Legacy Item', 'item_id': 'legacy-item', 'order_id': f'ORD-{day}-0001', 'details': 'Stock updated', **stamps}],
            'audit_log': [{'id': 'legacy-audit', 'user_id': 'legacy-user', 'entity_type': 'item', 'entity_id': 'legacy-item', 'action': 'stock_update', 'old_values': {'quantity': 10}, 'new_values': {'quantity': 12}, 'created_at': now}],
            'refresh_tokens': [{'id': 'legacy-refresh', 'jti': 'legacy-refresh-jti', 'user_id': 'legacy-user', 'is_revoked': False, 'expires_at': now + timedelta(days=1), **stamps}],
        }
        for table in TABLES:
            await connection.execute(metadata.tables[table].insert(), rows[table])
        before = await fingerprints(connection)
        await connection.run_sync(lambda conn: migrate(conn, 'head'))
        assert await fingerprints(connection) == before
        assert await connection.scalar(text('SELECT session_version FROM users')) == 0
        assert await connection.scalar(text('SELECT last_value FROM order_number_counters')) == 9
        assert await connection.scalar(text('SELECT version_num FROM alembic_version')) == '0010_order_local_id_unique'
    async with TestSession() as db:
        assert await allocate_order_id(db, now) == f'ORD-{day}-0010'
        await db.rollback()


@pytest.mark.asyncio
async def test_local_id_index_keeps_existing_duplicate_orders_and_replays_the_oldest(client):
    now = datetime.now(timezone.utc)
    stamps = {'created_at': now, 'updated_at': now}
    async with test_engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.execute(text('DROP TABLE IF EXISTS alembic_version'))
        await connection.run_sync(lambda conn: migrate(conn, '0009_ai_provider_scopes'))
        metadata = MetaData()
        await connection.run_sync(metadata.reflect)
        orders = metadata.tables['orders']
        await connection.execute(metadata.tables['users'].insert(), {'id': 'retry-user', 'email': 'retry@example.com', 'hashed_password': 'synthetic-opaque-hash', 'name': 'Retry Owner', 'phone': 'synthetic-phone', 'is_active': True, 'is_verified': False, 'is_superuser': False, 'is_email_verified': True, **stamps})
        await connection.execute(metadata.tables['categories'].insert(), {'id': 'retry-category', 'user_id': 'retry-user', 'name': 'Ward', 'display_order': 1, 'is_default': False, **stamps})
        await connection.execute(metadata.tables['items'].insert(), {'id': 'retry-item', 'user_id': 'retry-user', 'category_id': 'retry-category', 'name': 'Saline', 'quantity': 10, 'unit': 'pieces', 'minimum_stock': 5, 'is_active': True, 'is_critical': False, 'version': 1, **stamps})
        # Two stored copies of one retried submission (F-2), another keyed order, two keyless orders.
        keys = {'original': 'retried-key', 'retry-copy': 'retried-key', 'keyed': 'other-key', 'keyless-1': None, 'keyless-2': None}
        await connection.execute(orders.insert(), [
            {'id': f'order-{name}', 'user_id': 'retry-user', 'order_id': f'ORD-20260101-{i:04d}', 'local_id': key, 'total_items': 1, 'total_units': 1, 'status': 'PENDING', 'exported_at': now, 'created_at': now + timedelta(seconds=i), 'updated_at': now}
            for i, (name, key) in enumerate(keys.items(), start=1)
        ])
        before = await fingerprints(connection)
        await connection.run_sync(lambda conn: migrate(conn, 'head'))
        assert await fingerprints(connection) == before
        index = await connection.scalar(text("SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_orders_user_id_local_id'"))
        assert 'UNIQUE' in index and "'order-retry-copy'" in index and "'order-original'" not in index
        # Keys already stored, the duplicated one included, still refuse another copy.
        for key in ('retried-key', 'other-key'):
            with pytest.raises(IntegrityError):
                async with connection.begin_nested():
                    await connection.execute(orders.insert(), {'id': f'new-{key}', 'user_id': 'retry-user', 'order_id': f'ORD-NEW-{key}', 'local_id': key, 'total_items': 1, 'total_units': 1, 'status': 'PENDING', 'exported_at': now, **stamps})
    headers = auth_header(create_access_token('retry-user'))
    item = {'id': 'retry-item', 'name': 'Saline', 'unit': 'pieces', 'quantity': 10, 'minimumStock': 5}
    replay = await client.post('/api/v1/orders', headers=headers, json={'orderId': 'CLIENT-SIDE-ID', 'localId': 'retried-key', 'items': [order_item_payload(item, quantity=1)]})
    assert replay.status_code == 200 and replay.json()['id'] == 'order-original'
    assert (await client.get('/api/v1/orders', headers=headers)).json()['total'] == 5
