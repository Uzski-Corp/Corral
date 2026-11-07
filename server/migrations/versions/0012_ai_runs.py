"""Tenant-scoped reply suggestion runs and evidence."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0012_ai_runs"
down_revision = "0011_demo_mail"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_runs",
        sa.Column("id", sa.Uuid(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "org_id",
            sa.Uuid(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column(
            "thread_id",
            sa.Uuid(),
            sa.ForeignKey("inbox_threads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            sa.Uuid(),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(24), nullable=False, server_default="queued"),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("evidence", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("result", postgresql.JSONB()),
        sa.Column("error", sa.String(255)),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("org_id", "request_id"),
    )
    op.create_index("ix_ai_runs_org_id", "ai_runs", ["org_id"])
    op.execute("ALTER TABLE ai_runs ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON ai_runs "
        "USING (org_id = NULLIF(current_setting('app.current_org', true), '')::uuid) "
        "WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::uuid)"
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ai_runs TO corral_app")


def downgrade() -> None:
    op.drop_table("ai_runs")
