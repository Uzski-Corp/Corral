"""who connected an integration, when its status changed, and Phoenix's saved mapping

Revision ID: 0009_integration_detail
Revises: 0008_activity
Create Date: 2026-10-03

The connected integration's page shows when it was connected and by whom, how long a
sign-in has been broken, and the field mapping someone saved. Existing rows stay null.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009_integration_detail"
down_revision: str | None = "0008_activity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("integrations", sa.Column("connected_at", sa.DateTime(timezone=True)))
    op.add_column("integrations", sa.Column("connected_by", sa.Uuid()))
    op.add_column("integrations", sa.Column("status_at", sa.DateTime(timezone=True)))
    op.add_column("integrations", sa.Column("mapping", postgresql.JSONB()))
    op.create_foreign_key(
        op.f("fk_integrations_connected_by_users"),
        "integrations",
        "users",
        ["connected_by"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_integrations_connected_by_users"), "integrations", type_="foreignkey"
    )
    op.drop_column("integrations", "mapping")
    op.drop_column("integrations", "status_at")
    op.drop_column("integrations", "connected_by")
    op.drop_column("integrations", "connected_at")
