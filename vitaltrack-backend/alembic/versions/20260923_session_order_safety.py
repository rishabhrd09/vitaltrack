"""Add credential generations and durable order numbers without rewriting data.

Revision ID: 0007_session_order_safety
Revises: 0006_order_item_qty_positive
"""

from alembic import op
import sqlalchemy as sa

revision = "0007_session_order_safety"
down_revision = "0006_order_item_qty_positive"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("session_version", sa.Integer(), server_default="0", nullable=False))
    op.create_table(
        "order_number_counters",
        sa.Column("day", sa.String(8), primary_key=True),
        sa.Column("last_value", sa.BigInteger(), nullable=False),
    )
    # Seed from public IDs, not timestamps/counts. No existing order is changed.
    op.execute("""
        INSERT INTO order_number_counters (day, last_value)
        SELECT substring(order_id from 5 for 8),
               max(substring(order_id from 14)::bigint)
        FROM orders
        WHERE order_id ~ '^ORD-[0-9]{8}-[0-9]{4,18}$'
        GROUP BY substring(order_id from 5 for 8)
    """)
    for column in ("email_verification_token", "password_reset_token", "deletion_token"):
        op.create_index(f"ix_users_{column}", "users", [column])


def downgrade() -> None:
    # Deliberately keep the additive security/counter state. Removing generations
    # can resurrect legacy credentials; removing counters can reuse deleted IDs.
    # Roll back the application image while retaining this compatible schema.
    raise RuntimeError(
        "This additive safety migration must be retained during application rollback. "
        "Review credential invalidation and order-number history before any manual removal."
    )
