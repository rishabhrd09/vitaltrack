"""Add recoverable owned supply reviews and cooperating source revisions."""

from alembic import op
import sqlalchemy as sa

revision = "0013_supply_reviews"
down_revision = "0012_openai_personal_keys"
branch_labels = None
depends_on = None


def upgrade():
    def owner():
        return sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    op.create_table("supply_revisions", owner(), sa.Column("revision", sa.Integer(), nullable=False), sa.PrimaryKeyConstraint("user_id"))
    op.create_table("closed_order_submissions", owner(),
        sa.Column("local_id", sa.String(36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "local_id"))
    op.create_table("supply_review_runs",
        sa.Column("id", sa.String(36), primary_key=True), owner(), sa.Column("request_id", sa.String(36), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False), sa.Column("status", sa.String(24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("snapshot_at", sa.DateTime(timezone=True), nullable=False), sa.Column("supply_revision", sa.Integer(), nullable=False),
        sa.Column("proposal_version", sa.Integer(), nullable=False), sa.Column("rules_version", sa.String(40), nullable=False), sa.Column("answers", sa.JSON(), nullable=False),
        sa.Column("rounds", sa.Integer(), nullable=False), sa.Column("order_id", sa.String(50), nullable=True),
        sa.UniqueConstraint("user_id", "request_id", name="uq_supply_review_owner_request"))
    op.create_index("ix_supply_review_runs_user_id", "supply_review_runs", ["user_id"])
    op.create_index("ix_supply_review_runs_expires_at", "supply_review_runs", ["expires_at"])
    op.create_table("supply_review_proposals",
        sa.Column("id", sa.String(36), primary_key=True), owner(),
        sa.Column("run_id", sa.String(36), sa.ForeignKey("supply_review_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False), sa.UniqueConstraint("run_id", "version", name="uq_supply_review_proposal_version"))
    op.create_index("ix_supply_review_proposals_user_id", "supply_review_proposals", ["user_id"])
    op.create_index("ix_supply_review_proposals_run_id", "supply_review_proposals", ["run_id"])
    op.create_table("supply_review_confirmations",
        sa.Column("id", sa.String(36), primary_key=True), owner(),
        sa.Column("run_id", sa.String(36), sa.ForeignKey("supply_review_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("proposal_id", sa.String(36), sa.ForeignKey("supply_review_proposals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("idempotency_key", sa.String(36), nullable=False), sa.Column("order_id", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "idempotency_key", name="uq_supply_review_confirmation_key"))
    op.create_index("ix_supply_review_confirmations_user_id", "supply_review_confirmations", ["user_id"])
    op.create_index("ix_supply_review_confirmations_run_id", "supply_review_confirmations", ["run_id"])


def downgrade():
    op.drop_table("supply_review_confirmations")
    op.drop_table("supply_review_proposals")
    op.drop_table("supply_review_runs")
    op.drop_table("supply_revisions")
    op.drop_table("closed_order_submissions")
