"""Serialize name changes per owner without rewriting legacy duplicate records."""

import hashlib

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def lock_inventory_names(db: AsyncSession, user_id: str, kind: str) -> None:
    # Transaction-scoped, shared by workers. Namespaces separate item/category
    # writes; hash collisions only serialize unrelated writers, never lose data.
    key = int.from_bytes(
        hashlib.sha256(f"carekosh:names:{kind}:{user_id}".encode()).digest()[:8],
        "big", signed=True,
    )
    await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})
