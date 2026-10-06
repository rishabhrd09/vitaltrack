"""Make an order's localId unique per user so a retried create cannot duplicate it.

Revision ID: 0010_order_local_id_unique
Revises: 0009_ai_provider_scopes

Rows already duplicated by earlier retries are kept exactly as stored: the
oldest of each (user_id, local_id) group stays under the index (and is what a
replay returns); the later copies are exempted by id in the index predicate.
"""

import logging

from alembic import op
import sqlalchemy as sa

revision = "0010_order_local_id_unique"
down_revision = "0009_ai_provider_scopes"
branch_labels = None
depends_on = None

INDEX = "uq_orders_user_id_local_id"
log = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    connection = op.get_bind()
    # The index build takes this lock anyway; taking it first means no new
    # duplicate can be written between the check below and the build.
    op.execute("LOCK TABLE orders IN SHARE MODE")
    later_duplicates = connection.execute(sa.text("""
        SELECT id FROM (
            SELECT id, row_number() OVER (
                PARTITION BY user_id, local_id ORDER BY created_at, id
            ) AS position
            FROM orders
            WHERE local_id IS NOT NULL
        ) keyed
        WHERE position > 1
        ORDER BY id
    """)).scalars().all()

    predicate = "local_id IS NOT NULL"
    if later_duplicates:
        quote = sa.String().literal_processor(dialect=connection.dialect)
        exempt = ", ".join(quote(order_id) for order_id in later_duplicates)
        predicate += f" AND id NOT IN ({exempt})"
        log.warning(
            "Kept %d existing duplicate order(s) unchanged; exempted them from %s",
            len(later_duplicates),
            INDEX,
        )

    op.create_index(
        INDEX,
        "orders",
        ["user_id", "local_id"],
        unique=True,
        postgresql_where=sa.text(predicate),
    )


def downgrade() -> None:
    # Index only: dropping it restores the old (non-idempotent) behaviour and
    # leaves every order untouched.
    op.drop_index(INDEX, table_name="orders")
