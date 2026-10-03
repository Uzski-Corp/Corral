"""inbox messages, sequences, discovery, integrations and developer keys

Revision ID: 0008_activity
Revises: 0007_keep_uploaded_picture
Create Date: 2026-10-02

Expands the name-only sequence and inbox stubs and adds the tables the signed-in
screens read. New accounts stay empty; a demo workspace is filled by ``python -m app.seed``.
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_activity"
down_revision: str | None = "0007_keep_uploaded_picture"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "corral_app"
CURRENT_ORG = "NULLIF(current_setting('app.current_org', true), '')::uuid"
TABLES = (
    "inbox_messages",
    "inbox_drafts",
    "mailboxes",
    "discovery_runs",
    "integrations",
    "integration_logs",
    "api_keys",
    "mcp_connections",
    "mcp_calls",
)


def _id() -> sa.Column[Any]:
    return sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False)


def _org() -> sa.Column[Any]:
    return sa.Column("org_id", sa.Uuid(), nullable=False)


def _stamps() -> tuple[sa.Column[Any], sa.Column[Any]]:
    return (
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def upgrade() -> None:
    op.add_column("sequences", sa.Column("slug", sa.String(80)))
    op.add_column(
        "sequences",
        sa.Column("status", sa.String(16), server_default="draft", nullable=False),
    )
    op.add_column(
        "sequences",
        sa.Column("document", postgresql.JSONB(), server_default="{}", nullable=False),
    )
    op.create_unique_constraint(op.f("uq_sequences_org_id_slug"), "sequences", ["org_id", "slug"])
    op.create_check_constraint(
        op.f("ck_sequences_status"),
        "sequences",
        "status IN ('draft', 'launching', 'running', 'paused')",
    )

    op.add_column("inbox_threads", sa.Column("slug", sa.String(80)))
    op.add_column(
        "inbox_threads",
        sa.Column("handled", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column("inbox_threads", sa.Column("triage", sa.String(32)))
    op.add_column("inbox_threads", sa.Column("snoozed_until", sa.DateTime(timezone=True)))
    op.add_column(
        "inbox_threads",
        sa.Column("document", postgresql.JSONB(), server_default="{}", nullable=False),
    )
    op.create_unique_constraint(
        op.f("uq_inbox_threads_org_id_slug"), "inbox_threads", ["org_id", "slug"]
    )

    op.add_column(
        "organizations",
        sa.Column("discovery_credit_month", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "organizations",
        sa.Column("discovery_credit_used", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_check_constraint(
        op.f("ck_organizations_discovery_credit_month"),
        "organizations",
        "discovery_credit_month >= 0",
    )
    op.create_check_constraint(
        op.f("ck_organizations_discovery_credit_used"),
        "organizations",
        "discovery_credit_used >= 0",
    )

    created, updated = _stamps()
    op.create_table(
        "inbox_messages",
        _id(),
        _org(),
        sa.Column("thread_id", sa.Uuid(), nullable=False),
        sa.Column("direction", sa.String(8), nullable=False),
        sa.Column("author", sa.String(255), nullable=False, server_default=""),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("at_label", sa.String(80), nullable=False, server_default=""),
        sa.Column("document", postgresql.JSONB(), server_default="{}", nullable=False),
        created,
        updated,
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_inbox_messages_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["thread_id"],
            ["inbox_threads.id"],
            name=op.f("fk_inbox_messages_thread_id_inbox_threads"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_inbox_messages")),
    )
    created, updated = _stamps()
    op.create_table(
        "inbox_drafts",
        _id(),
        _org(),
        sa.Column("thread_id", sa.Uuid(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("kind", sa.String(32), nullable=False, server_default="ready"),
        sa.Column("document", postgresql.JSONB(), server_default="{}", nullable=False),
        created,
        updated,
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_inbox_drafts_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["thread_id"],
            ["inbox_threads.id"],
            name=op.f("fk_inbox_drafts_thread_id_inbox_threads"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_inbox_drafts")),
        sa.UniqueConstraint("thread_id", name=op.f("uq_inbox_drafts_thread_id")),
    )
    created, updated = _stamps()
    op.create_table(
        "mailboxes",
        _id(),
        _org(),
        sa.Column("address", sa.String(320), nullable=False),
        sa.Column("sent_today", sa.Integer(), server_default="0", nullable=False),
        sa.Column("daily_cap", sa.Integer(), server_default="35", nullable=False),
        sa.Column("attention", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("document", postgresql.JSONB(), server_default="{}", nullable=False),
        created,
        updated,
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_mailboxes_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_mailboxes")),
        sa.UniqueConstraint("org_id", "address", name=op.f("uq_mailboxes_org_id_address")),
    )
    created, updated = _stamps()
    op.create_table(
        "discovery_runs",
        _id(),
        _org(),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(80)),
        sa.Column("status", sa.String(16), server_default="queued", nullable=False),
        sa.Column("document", postgresql.JSONB(), server_default="{}", nullable=False),
        created,
        updated,
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_discovery_runs_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_discovery_runs")),
        sa.UniqueConstraint("org_id", "slug", name=op.f("uq_discovery_runs_org_id_slug")),
        sa.CheckConstraint(
            "status IN ('queued', 'running', 'paused', 'partial', 'failed', 'done', 'cancelled')",
            name=op.f("ck_discovery_runs_status"),
        ),
    )
    created, updated = _stamps()
    op.create_table(
        "integrations",
        _id(),
        _org(),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), server_default="off", nullable=False),
        sa.Column("config", postgresql.JSONB(), server_default="{}", nullable=False),
        created,
        updated,
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_integrations_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_integrations")),
        sa.UniqueConstraint("org_id", "provider", name=op.f("uq_integrations_org_id_provider")),
        sa.CheckConstraint(
            "provider IN ('cal', 'phoenix', 'autosend')",
            name=op.f("ck_integrations_provider"),
        ),
    )
    created, updated = _stamps()
    op.create_table(
        "integration_logs",
        _id(),
        _org(),
        sa.Column("integration_id", sa.Uuid(), nullable=False),
        sa.Column("document", postgresql.JSONB(), server_default="{}", nullable=False),
        created,
        updated,
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_integration_logs_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["integration_id"],
            ["integrations.id"],
            name=op.f("fk_integration_logs_integration_id_integrations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_integration_logs")),
    )
    created, updated = _stamps()
    op.create_table(
        "api_keys",
        _id(),
        _org(),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(80)),
        sa.Column("env", sa.String(8), server_default="live", nullable=False),
        sa.Column("last4", sa.String(8), nullable=False),
        sa.Column("secret_hash", sa.String(64), nullable=False),
        sa.Column("scopes", postgresql.JSONB(), server_default="[]", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("created_by", sa.String(255), nullable=False, server_default=""),
        sa.Column("calls_7d", sa.Integer(), server_default="0", nullable=False),
        sa.Column("document", postgresql.JSONB(), server_default="{}", nullable=False),
        created,
        updated,
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_api_keys_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_api_keys")),
        sa.UniqueConstraint("org_id", "slug", name=op.f("uq_api_keys_org_id_slug")),
        sa.CheckConstraint("env IN ('live', 'test')", name=op.f("ck_api_keys_env")),
    )
    created, updated = _stamps()
    op.create_table(
        "mcp_connections",
        _id(),
        _org(),
        sa.Column("slug", sa.String(80)),
        sa.Column("client", sa.String(32), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("document", postgresql.JSONB(), server_default="{}", nullable=False),
        created,
        updated,
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_mcp_connections_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_mcp_connections")),
        sa.UniqueConstraint("org_id", "slug", name=op.f("uq_mcp_connections_org_id_slug")),
    )
    created, updated = _stamps()
    op.create_table(
        "mcp_calls",
        _id(),
        _org(),
        sa.Column("connection_id", sa.Uuid(), nullable=False),
        sa.Column("document", postgresql.JSONB(), server_default="{}", nullable=False),
        created,
        updated,
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_mcp_calls_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["connection_id"],
            ["mcp_connections.id"],
            name=op.f("fk_mcp_calls_connection_id_mcp_connections"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_mcp_calls")),
    )

    op.create_index("ix_inbox_messages_thread_id", "inbox_messages", ["thread_id"])
    op.create_index("ix_integration_logs_integration_id", "integration_logs", ["integration_id"])
    op.create_index("ix_mcp_calls_connection_id", "mcp_calls", ["connection_id"])

    for table in TABLES:
        op.create_index(op.f(f"ix_{table}_org_id"), table, ["org_id"])
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"USING (org_id = {CURRENT_ORG}) WITH CHECK (org_id = {CURRENT_ORG})"
        )


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_table(table)
    op.drop_constraint(
        op.f("ck_organizations_discovery_credit_used"), "organizations", type_="check"
    )
    op.drop_constraint(
        op.f("ck_organizations_discovery_credit_month"), "organizations", type_="check"
    )
    op.drop_column("organizations", "discovery_credit_used")
    op.drop_column("organizations", "discovery_credit_month")
    op.drop_constraint(op.f("uq_inbox_threads_org_id_slug"), "inbox_threads", type_="unique")
    op.drop_column("inbox_threads", "document")
    op.drop_column("inbox_threads", "snoozed_until")
    op.drop_column("inbox_threads", "triage")
    op.drop_column("inbox_threads", "handled")
    op.drop_column("inbox_threads", "slug")
    op.drop_constraint(op.f("ck_sequences_status"), "sequences", type_="check")
    op.drop_constraint(op.f("uq_sequences_org_id_slug"), "sequences", type_="unique")
    op.drop_column("sequences", "document")
    op.drop_column("sequences", "status")
    op.drop_column("sequences", "slug")
