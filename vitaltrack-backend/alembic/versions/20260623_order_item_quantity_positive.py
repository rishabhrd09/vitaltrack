"""Add positive-quantity check constraint to order_items

Revision ID: 0006_order_item_qty_positive
Revises: 0005_account_deletion_token
Create Date: 2026-06-23

Pre-launch hardening (VAL-1): defence-in-depth at the database level so a
negative/zero order-item quantity can never reach the apply-to-stock path,
even if a future code path bypasses the Pydantic `gt=0` validation.
"""
from typing import Sequence, Union

from alembic import op


revision: str = '0006_order_item_qty_positive'
down_revision: Union[str, None] = '0005_account_deletion_token'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_check_constraint(
        'chk_order_items_quantity_positive',
        'order_items',
        'quantity > 0',
    )


def downgrade() -> None:
    op.drop_constraint(
        'chk_order_items_quantity_positive',
        'order_items',
        type_='check',
    )
