"""Add isolated AI consent and content-free usage accounting.

Revision ID: 0008_ai_consent_usage
Revises: 0007_session_order_safety
"""

from alembic import op
import sqlalchemy as sa

revision = "0008_ai_consent_usage"
down_revision = "0007_session_order_safety"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ai_consents",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("version", sa.String(40), nullable=False),
        sa.Column("accepted", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "ai_usage",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("reserved_microusd", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("audio_seconds", sa.Integer(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
    )
    op.create_index("ix_ai_usage_user_id", "ai_usage", ["user_id"])
    op.create_index("ix_ai_usage_created_at", "ai_usage", ["created_at"])


def downgrade():
    # Metadata only; inventory and authentication schema are unaffected.
    op.drop_table("ai_usage")
    op.drop_table("ai_consents")
