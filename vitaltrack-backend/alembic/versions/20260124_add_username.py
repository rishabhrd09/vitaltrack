"""
Add username column for username-based authentication.
Users can now register/login with either email OR username.

Revision ID: 0002_add_username
Revises: 0001_initial
Create Date: 2026-01-24
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0002_add_username'
down_revision = '0001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add username column to users table."""
    # Add username column (nullable for existing users)
    op.add_column(
        'users',
        sa.Column('username', sa.String(50), nullable=True)
    )
    
    # Create unique constraint
    op.create_unique_constraint(
        'uq_users_username',
        'users',
        ['username']
    )
    
    # Create index for faster lookups
    op.create_index(
        'ix_users_username',
        'users',
        ['username']
    )
    
    # Make email nullable for username-only users
    op.alter_column(
        'users',
        'email',
        existing_type=sa.String(255),
        nullable=True
    )
    
    # Add check constraint: user must have email OR username
    # Note: Some DBs don't support CHECK constraints well via Alembic
    # PostgreSQL handles this fine
    op.execute("""
        ALTER TABLE users
        ADD CONSTRAINT ck_users_email_or_username
        CHECK (email IS NOT NULL OR username IS NOT NULL)
    """)


def downgrade() -> None:
    """Remove username column from users table."""
    # Drop check constraint
    op.execute("""
        ALTER TABLE users
        DROP CONSTRAINT IF EXISTS ck_users_email_or_username
    """)
    
    # Make email required again (will fail if there are username-only users!)
    op.alter_column(
        'users',
        'email',
        existing_type=sa.String(255),
        nullable=False
    )
    
    # Drop index
    op.drop_index('ix_users_username', table_name='users')
    
    # Drop unique constraint
    op.drop_constraint('uq_users_username', 'users', type_='unique')
    
    # Drop column
    op.drop_column('users', 'username')
