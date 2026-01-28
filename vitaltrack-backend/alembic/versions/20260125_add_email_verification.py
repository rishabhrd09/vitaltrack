"""Add email verification fields

Revision ID: 0003_email_verification
Revises: 0002_add_username
Create Date: 2026-01-25

Adds fields for email verification flow:
- is_email_verified: Track if email is verified
- email_verification_token: Hashed verification token
- email_verification_expiry: Token expiration
- Renames password_reset_expires to password_reset_expiry for consistency
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0003_email_verification'
down_revision: Union[str, None] = '0002_add_username'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add email verification fields
    op.add_column(
        'users',
        sa.Column('is_email_verified', sa.Boolean(), nullable=False, server_default='false')
    )
    op.add_column(
        'users',
        sa.Column('email_verification_token', sa.String(255), nullable=True)
    )
    op.add_column(
        'users',
        sa.Column('email_verification_expiry', sa.DateTime(timezone=True), nullable=True)
    )
    
    # Rename password_reset_expires to password_reset_expiry for consistency
    op.alter_column('users', 'password_reset_expires', new_column_name='password_reset_expiry')


def downgrade() -> None:
    # Rename back
    op.alter_column('users', 'password_reset_expiry', new_column_name='password_reset_expires')
    
    # Drop columns
    op.drop_column('users', 'email_verification_expiry')
    op.drop_column('users', 'email_verification_token')
    op.drop_column('users', 'is_email_verified')
