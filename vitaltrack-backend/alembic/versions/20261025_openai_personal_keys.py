"""Add encrypted personal OpenAI keys without changing inventory or orders."""

from alembic import op
import sqlalchemy as sa

revision = "0012_openai_personal_keys"
down_revision = "0011_sarvam_personal_keys"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ai_openai_credentials",
        sa.Column(
            "user_id", sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True,
        ),
        sa.Column("ciphertext", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    # Only the newly introduced personal keys are discarded.
    op.drop_table("ai_openai_credentials")
