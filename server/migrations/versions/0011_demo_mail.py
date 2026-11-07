"""Durable demo mail outbox and tenant-scoped provider receipts."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0011_demo_mail"
down_revision = "0010_billing"
branch_labels = None
depends_on = None


def base():
    return [
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
    ]


def upgrade() -> None:
    op.create_table(
        "mail_deliveries",
        *base(),
        sa.Column(
            "thread_id",
            sa.Uuid(),
            sa.ForeignKey("inbox_threads.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "message_id",
            sa.Uuid(),
            sa.ForeignKey("inbox_messages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("recipient", sa.String(320), nullable=False),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="queued"),
        sa.Column("provider_id", sa.String(128)),
        sa.Column("error", sa.String(255)),
        sa.Column("event_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("org_id", "request_id"),
        sa.UniqueConstraint("provider_id"),
    )
    op.create_table(
        "mail_events",
        *base(),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="pending"),
        sa.Column("detail", sa.String(255)),
        sa.UniqueConstraint("org_id", "fingerprint"),
    )
    for table in ("mail_deliveries", "mail_events"):
        op.create_index(f"ix_{table}_org_id", table, ["org_id"])
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            "USING (org_id = NULLIF(current_setting('app.current_org', true), '')::uuid) "
            "WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::uuid)"
        )
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO corral_app")


def downgrade() -> None:
    op.drop_table("mail_events")
    op.drop_table("mail_deliveries")
