"""Audit logging service — records every mutation with before/after snapshots."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


async def log_audit(
    db: AsyncSession,
    user_id: str,
    entity_type: str,
    entity_id: str,
    action: str,
    old_values: dict | None = None,
    new_values: dict | None = None,
) -> None:
    """Record an audit log entry. Called inside the same transaction as the mutation."""
    entry = AuditLog(
        user_id=user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        old_values=old_values,
        new_values=new_values,
    )
    db.add(entry)
    # Do NOT commit — let the caller's transaction commit both the mutation and the audit atomically
