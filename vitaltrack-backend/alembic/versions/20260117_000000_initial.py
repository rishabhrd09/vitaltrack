"""Initial database schema

Revision ID: 0001_initial
Revises: 
Create Date: 2026-01-17

Creates all tables for VitalTrack:
- users
- refresh_tokens
- categories
- items
- orders
- order_items
- activity_logs
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users table
    op.create_table(
        'users',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('email', sa.String(255), unique=True, nullable=False, index=True),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True, nullable=False),
        sa.Column('is_verified', sa.Boolean(), default=False, nullable=False),
        sa.Column('is_superuser', sa.Boolean(), default=False, nullable=False),
        sa.Column('verification_token', sa.String(255), nullable=True),
        sa.Column('password_reset_token', sa.String(255), nullable=True),
        sa.Column('password_reset_expires', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_login', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    
    # Refresh tokens table
    op.create_table(
        'refresh_tokens',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('jti', sa.String(36), unique=True, nullable=False, index=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('is_revoked', sa.Boolean(), default=False, nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('device_name', sa.String(255), nullable=True),
        sa.Column('device_type', sa.String(50), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    
    # Categories table
    op.create_table(
        'categories',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('display_order', sa.Integer(), default=0, nullable=False),
        sa.Column('is_default', sa.Boolean(), default=False, nullable=False),
        sa.Column('local_id', sa.String(36), nullable=True, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    
    # Items table
    op.create_table(
        'items',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('category_id', sa.String(36), sa.ForeignKey('categories.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(255), nullable=False, index=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('quantity', sa.Integer(), default=0, nullable=False),
        sa.Column('unit', sa.String(50), default='pieces', nullable=False),
        sa.Column('minimum_stock', sa.Integer(), default=0, nullable=False),
        sa.Column('expiry_date', sa.Date(), nullable=True),
        sa.Column('brand', sa.String(255), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('supplier_name', sa.String(255), nullable=True),
        sa.Column('supplier_contact', sa.String(255), nullable=True),
        sa.Column('purchase_link', sa.String(500), nullable=True),
        sa.Column('image_uri', sa.String(500), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True, nullable=False),
        sa.Column('is_critical', sa.Boolean(), default=False, nullable=False),
        sa.Column('local_id', sa.String(36), nullable=True, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    
    # Orders table
    op.create_table(
        'orders',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('order_id', sa.String(50), unique=True, nullable=False, index=True),
        sa.Column('pdf_path', sa.String(500), nullable=True),
        sa.Column('total_items', sa.Integer(), default=0, nullable=False),
        sa.Column('total_units', sa.Integer(), default=0, nullable=False),
        sa.Column('status', sa.String(20), default='pending', nullable=False),
        sa.Column('exported_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('ordered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('received_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('applied_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('declined_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('local_id', sa.String(36), nullable=True, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    
    # Order items table
    op.create_table(
        'order_items',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('order_id', sa.String(36), sa.ForeignKey('orders.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('item_id', sa.String(36), nullable=False, index=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('brand', sa.String(255), nullable=True),
        sa.Column('unit', sa.String(50), default='pieces', nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('current_stock', sa.Integer(), nullable=False),
        sa.Column('minimum_stock', sa.Integer(), nullable=False),
        sa.Column('image_uri', sa.String(500), nullable=True),
        sa.Column('supplier_name', sa.String(255), nullable=True),
        sa.Column('purchase_link', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    
    # Activity logs table
    op.create_table(
        'activity_logs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('action', sa.String(30), nullable=False, index=True),
        sa.Column('item_name', sa.String(255), nullable=False),
        sa.Column('item_id', sa.String(36), nullable=True, index=True),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('order_id', sa.String(50), nullable=True, index=True),
        sa.Column('client_timestamp', sa.String(50), nullable=True),
        sa.Column('local_id', sa.String(36), nullable=True, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('activity_logs')
    op.drop_table('order_items')
    op.drop_table('orders')
    op.drop_table('items')
    op.drop_table('categories')
    op.drop_table('refresh_tokens')
    op.drop_table('users')
