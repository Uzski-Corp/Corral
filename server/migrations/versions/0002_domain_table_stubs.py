"""org-scoped domain table stubs: leads, segments, sequences, inbox_threads, knowledge_items

Revision ID: 0002_domain_table_stubs
Revises: 0001_core_tenant_tables
Create Date: 2026-09-29
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "0002_domain_table_stubs"
down_revision: str | None = "0001_core_tenant_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _tenant_table(name: str, *columns: Any) -> None:
    op.create_table(
        name,
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("org_id", sa.Uuid(), nullable=False),
        *columns,
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{name}")),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f(f"fk_{name}_org_id_organizations"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(op.f(f"ix_{name}_org_id"), name, ["org_id"])


def upgrade() -> None:
    _tenant_table(
        "leads",
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("first_name", sa.String(100)),
        sa.Column("last_name", sa.String(100)),
        sa.Column("company_name", sa.String(255)),
        sa.UniqueConstraint("org_id", "email", name=op.f("uq_leads_org_id")),
    )
    _tenant_table("segments", sa.Column("name", sa.String(255), nullable=False))
    _tenant_table("sequences", sa.Column("name", sa.String(255), nullable=False))
    _tenant_table("inbox_threads", sa.Column("subject", sa.String(500)))
    _tenant_table(
        "knowledge_items",
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text()),
    )


def downgrade() -> None:
    for name in ("knowledge_items", "inbox_threads", "sequences", "segments", "leads"):
        op.drop_table(name)
