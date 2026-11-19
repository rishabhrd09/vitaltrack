"""Separate consent and usage by provider; never migrate old consent into new scopes."""

from alembic import op
import sqlalchemy as sa

revision = "0009_ai_provider_scopes"
down_revision = "0008_ai_consent_usage"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "ai_consents",
        sa.Column("scopes", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "ai_usage",
        sa.Column("provider", sa.String(20), nullable=False, server_default="groq"),
    )
    # Existing speech reservations used the Alba service, not Groq.
    op.execute("UPDATE ai_usage SET provider = 'alba' WHERE kind = 'speak'")


def downgrade():
    op.drop_column("ai_usage", "provider")
    op.drop_column("ai_consents", "scopes")
