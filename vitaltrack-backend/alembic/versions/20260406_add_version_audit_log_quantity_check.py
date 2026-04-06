"""Add version column, audit log table, and quantity check constraint

Revision ID: 0004_version_audit_log
Revises: 0003_email_verification
Create Date: 2026-04-06

Phase 1 of server-first architecture:
- version column on items (INTEGER, DEFAULT 1) for optimistic concurrency control
- audit_log table for mutation logging with JSONB old/new snapshots
- CHECK constraint on items.quantity >= 0
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '0004_version_audit_log'
down_revision: Union[str, None] = '0003_email_verification'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add version column to items table
    op.add_column(
        'items',
        sa.Column('version', sa.Integer(), nullable=False, server_default='1')
    )

    # 2. Create audit_log table
    op.create_table(
        'audit_log',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=False),
        sa.Column('entity_id', sa.String(36), nullable=False),
        sa.Column('action', sa.String(20), nullable=False),
        sa.Column('old_values', postgresql.JSONB, nullable=True),
        sa.Column('new_values', postgresql.JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_audit_log_entity', 'audit_log', ['entity_type', 'entity_id'])
    op.create_index('ix_audit_log_user', 'audit_log', ['user_id', 'created_at'])

    # 3. Add CHECK constraint for non-negative quantity
    op.create_check_constraint('chk_items_quantity_non_negative', 'items', 'quantity >= 0')


def downgrade() -> None:
    op.drop_constraint('chk_items_quantity_non_negative', 'items', type_='check')
    op.drop_index('ix_audit_log_user', table_name='audit_log')
    op.drop_index('ix_audit_log_entity', table_name='audit_log')
    op.drop_table('audit_log')
    op.drop_column('items', 'version')
