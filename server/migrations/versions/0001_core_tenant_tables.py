"""core tenant tables: users, organizations, memberships

Revision ID: 0001_core_tenant_tables
Revises:
Create Date: 2026-09-29
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "0001_core_tenant_tables"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> list[sa.Column[Any]]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def _uuid_pk() -> sa.Column[Any]:
    return sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False)


def upgrade() -> None:
    op.create_table(
        "users",
        _uuid_pk(),
        sa.Column("workos_user_id", sa.String(64), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("email_verified", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("first_name", sa.String(255)),
        sa.Column("last_name", sa.String(255)),
        sa.Column("profile_picture_url", sa.String(2048)),
        sa.Column("last_sign_in_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("workos_user_id", name=op.f("uq_users_workos_user_id")),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"])

    op.create_table(
        "organizations",
        _uuid_pk(),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("workos_organization_id", sa.String(64)),
        sa.Column("personal_owner_user_id", sa.Uuid()),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_organizations")),
        sa.UniqueConstraint("slug", name=op.f("uq_organizations_slug")),
        sa.UniqueConstraint(
            "workos_organization_id", name=op.f("uq_organizations_workos_organization_id")
        ),
        sa.UniqueConstraint(
            "personal_owner_user_id", name=op.f("uq_organizations_personal_owner_user_id")
        ),
        sa.ForeignKeyConstraint(
            ["personal_owner_user_id"],
            ["users.id"],
            name=op.f("fk_organizations_personal_owner_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "(workos_organization_id IS NULL) <> (personal_owner_user_id IS NULL)",
            name=op.f("ck_organizations_exactly_one_identity_source"),
        ),
    )

    op.create_table(
        "memberships",
        _uuid_pk(),
        sa.Column("org_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(50), server_default=sa.text("'member'"), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_memberships")),
        sa.UniqueConstraint("org_id", "user_id", name=op.f("uq_memberships_org_id")),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_memberships_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_memberships_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "role IN ('owner', 'admin', 'member')", name=op.f("ck_memberships_valid_role")
        ),
    )
    op.create_index(op.f("ix_memberships_user_id"), "memberships", ["user_id"])


def downgrade() -> None:
    op.drop_table("memberships")
    op.drop_table("organizations")
    op.drop_table("users")
