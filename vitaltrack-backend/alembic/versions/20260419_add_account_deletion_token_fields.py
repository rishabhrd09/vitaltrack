"""Add account deletion token fields to users table

Revision ID: 0005_account_deletion_token
Revises: 0004_version_audit_log
Create Date: 2026-04-19

Adds two nullable columns to support the email-confirmed account deletion flow:
- deletion_token: SHA-256 hash of the raw confirmation token
- deletion_token_expires: 24-hour expiry for the deletion link
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0005_account_deletion_token'
down_revision: Union[str, None] = '0004_version_audit_log'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('deletion_token', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('deletion_token_expires', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'deletion_token_expires')
    op.drop_column('users', 'deletion_token')
