"""Add encrypted account-scoped Sarvam credentials without changing business data."""

from alembic import op
import sqlalchemy as sa

revision = "0011_sarvam_personal_keys"
down_revision = "0010_order_local_id_unique"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ai_sarvam_credentials",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("ciphertext", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.add_column(
        "ai_usage",
        sa.Column(
            "credential_source",
            sa.String(20),
            nullable=False,
            server_default="application",
        ),
    )


def downgrade():
    # Downgrading discards saved personal credentials, never inventory/order rows.
    op.drop_column("ai_usage", "credential_source")
    op.drop_table("ai_sarvam_credentials")
