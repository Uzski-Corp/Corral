"""lead CRM: companies, people on companies, fits, segment rules and pins, suppressions, imports

Revision ID: 0005_lead_crm
Revises: 0004_knowledge_base
Create Date: 2026-09-30

``leads`` becomes the people table: it gains a company (composite ``(company_id, org_id)``
key, so a person can't be attached to another tenant's company), contact fields, an email
status and a primary flag (at most one primary per company). ``email`` becomes nullable:
imports may carry people without an address. ``segments`` gain rules and a match mode.

New tables get the same ``tenant_isolation`` policy and grants as ``0003``/``0004``.
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0005_lead_crm"
down_revision: str | None = "0004_knowledge_base"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "corral_app"
CURRENT_ORG = "NULLIF(current_setting('app.current_org', true), '')::uuid"
TABLES = ("companies", "company_fits", "segment_pins", "suppressions", "lead_imports")

REPLY_STATUSES = (
    "not_contacted",
    "contacted",
    "interested",
    "objection",
    "referral",
    "meeting_booked",
    "not_interested",
    "ooo",
    "unsubscribed",
)
EMAIL_STATUSES = ("verified", "catch_all", "unverified", "bounced")
SOURCES = ("search", "import", "manual")
SIZES = ("1-50", "51-200", "201-1000", "1000+")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def _tenant_columns(name: str) -> list[Any]:
    return [
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("org_id", sa.Uuid(), nullable=False),
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
    ]


def _composite_fk(table: str, parent: str, column: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        [column, "org_id"],
        [f"{parent}.id", f"{parent}.org_id"],
        name=f"fk_{table}_{parent.rstrip('s')}_org",
        ondelete="CASCADE",
    )


def upgrade() -> None:
    op.create_table(
        "companies",
        *_tenant_columns("companies"),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("name_key", sa.String(255), nullable=False),
        sa.Column("domain", sa.String(255)),
        sa.Column("country", sa.String(100)),
        sa.Column("size", sa.String(10)),
        sa.Column("industry", sa.String(120)),
        sa.Column("notes", sa.Text()),
        sa.Column("source", sa.String(10), server_default="manual", nullable=False),
        sa.Column("reply_status", sa.String(20), server_default="not_contacted", nullable=False),
        sa.Column("reply_status_set_by", sa.String(10), server_default="corral", nullable=False),
        sa.Column("last_activity_at", sa.DateTime(timezone=True)),
        sa.Column("import_id", sa.Uuid()),
        sa.UniqueConstraint("id", "org_id", name="uq_companies_id_org_id"),
        sa.UniqueConstraint("org_id", "domain", name="uq_companies_org_id_domain"),
        sa.CheckConstraint(_in("source", SOURCES), name=op.f("ck_companies_source")),
        sa.CheckConstraint(
            _in("reply_status", REPLY_STATUSES), name=op.f("ck_companies_reply_status")
        ),
        sa.CheckConstraint(
            "reply_status_set_by IN ('corral', 'user')",
            name=op.f("ck_companies_reply_status_set_by"),
        ),
        sa.CheckConstraint("size IS NULL OR " + _in("size", SIZES), name=op.f("ck_companies_size")),
    )
    op.create_index("ix_companies_org_id_name_key", "companies", ["org_id", "name_key", "id"])
    op.create_index(
        "ix_companies_org_id_last_activity_at", "companies", ["org_id", "last_activity_at"]
    )
    op.create_index("ix_companies_org_id_reply_status", "companies", ["org_id", "reply_status"])
    op.create_index("ix_companies_org_id_created_at", "companies", ["org_id", "created_at"])
    op.create_index("ix_companies_org_id_import_id", "companies", ["org_id", "import_id"])

    op.create_table(
        "company_fits",
        *_tenant_columns("company_fits"),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("score", sa.SmallInteger(), nullable=False),
        sa.UniqueConstraint(
            "company_id", "product_id", name="uq_company_fits_company_id_product_id"
        ),
        _composite_fk("company_fits", "companies", "company_id"),
        _composite_fk("company_fits", "products", "product_id"),
        sa.CheckConstraint("score BETWEEN 0 AND 100", name=op.f("ck_company_fits_score")),
    )
    op.create_index("ix_company_fits_product_id_score", "company_fits", ["product_id", "score"])

    # People: the existing leads table.
    op.alter_column("leads", "email", existing_type=sa.String(320), nullable=True)
    op.add_column("leads", sa.Column("company_id", sa.Uuid()))
    op.add_column("leads", sa.Column("title", sa.String(255)))
    op.add_column("leads", sa.Column("phone", sa.String(50)))
    op.add_column("leads", sa.Column("linkedin_url", sa.String(500)))
    op.add_column(
        "leads",
        sa.Column("email_status", sa.String(12), server_default="unverified", nullable=False),
    )
    op.add_column(
        "leads", sa.Column("is_primary", sa.Boolean(), server_default="false", nullable=False)
    )
    op.add_column(
        "leads", sa.Column("source", sa.String(10), server_default="manual", nullable=False)
    )
    op.add_column("leads", sa.Column("unsubscribed_at", sa.DateTime(timezone=True)))
    op.create_foreign_key(
        "fk_leads_company_org",
        "leads",
        "companies",
        ["company_id", "org_id"],
        ["id", "org_id"],
        ondelete="CASCADE",
    )
    op.create_check_constraint(
        op.f("ck_leads_email_status"), "leads", _in("email_status", EMAIL_STATUSES)
    )
    op.create_check_constraint(op.f("ck_leads_source"), "leads", _in("source", SOURCES))
    op.create_index("ix_leads_company_id", "leads", ["company_id"])
    op.create_index(
        "uq_leads_company_id_primary",
        "leads",
        ["company_id"],
        unique=True,
        postgresql_where=sa.text("is_primary"),
    )

    # Segments: rules + match, and a composite key for pins.
    op.add_column("segments", sa.Column("rules", JSONB(), server_default="[]", nullable=False))
    op.add_column(
        "segments", sa.Column("match", sa.String(3), server_default="all", nullable=False)
    )
    op.create_unique_constraint("uq_segments_id_org_id", "segments", ["id", "org_id"])
    op.create_unique_constraint("uq_segments_org_id_name", "segments", ["org_id", "name"])
    op.create_check_constraint(op.f("ck_segments_match"), "segments", "match IN ('all', 'any')")

    op.create_table(
        "segment_pins",
        *_tenant_columns("segment_pins"),
        sa.Column("segment_id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.UniqueConstraint(
            "segment_id", "company_id", name="uq_segment_pins_segment_id_company_id"
        ),
        _composite_fk("segment_pins", "segments", "segment_id"),
        _composite_fk("segment_pins", "companies", "company_id"),
    )
    op.create_index("ix_segment_pins_company_id", "segment_pins", ["company_id"])

    op.create_table(
        "suppressions",
        *_tenant_columns("suppressions"),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("reason", sa.String(20), nullable=False),
        sa.UniqueConstraint("org_id", "email", name="uq_suppressions_org_id_email"),
        sa.CheckConstraint(
            _in("reason", ("unsubscribed", "bounced", "manual")),
            name=op.f("ck_suppressions_reason"),
        ),
    )

    op.create_table(
        "lead_imports",
        *_tenant_columns("lead_imports"),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("policy", sa.String(10), nullable=False),
        sa.Column("mapping", JSONB(), nullable=False),
        sa.Column("status", sa.String(10), server_default="queued", nullable=False),
        sa.Column("progress_pct", sa.SmallInteger(), server_default="0", nullable=False),
        sa.Column("total_rows", sa.Integer()),
        sa.Column("created_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("updated_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("skipped_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("error_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("in_file_duplicates", sa.Integer(), server_default="0", nullable=False),
        sa.Column("existing_duplicates", sa.Integer(), server_default="0", nullable=False),
        sa.Column("people_created", sa.Integer(), server_default="0", nullable=False),
        sa.Column("failure", sa.String(30)),
        sa.Column("note", sa.String(500)),
        sa.Column("data", sa.LargeBinary()),
        sa.Column("errors_csv", sa.LargeBinary()),
        sa.Column("created_by_user_id", sa.Uuid()),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("id", "org_id", name="uq_lead_imports_id_org_id"),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name=op.f("fk_lead_imports_created_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.CheckConstraint(
            _in("status", ("queued", "running", "done", "failed")),
            name=op.f("ck_lead_imports_status"),
        ),
        sa.CheckConstraint(
            _in("policy", ("skip", "fill", "overwrite")), name=op.f("ck_lead_imports_policy")
        ),
        sa.CheckConstraint(
            "progress_pct BETWEEN 0 AND 100", name=op.f("ck_lead_imports_progress_pct")
        ),
    )
    op.create_index("ix_lead_imports_org_id_created_at", "lead_imports", ["org_id", "created_at"])

    for table in TABLES:
        op.create_index(op.f(f"ix_{table}_org_id"), table, ["org_id"])
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP_ROLE}")
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"USING (org_id = {CURRENT_ORG}) WITH CHECK (org_id = {CURRENT_ORG})"
        )


def downgrade() -> None:
    op.drop_table("lead_imports")
    op.drop_table("suppressions")
    op.drop_table("segment_pins")
    op.drop_constraint(op.f("ck_segments_match"), "segments", type_="check")
    op.drop_constraint("uq_segments_org_id_name", "segments", type_="unique")
    op.drop_constraint("uq_segments_id_org_id", "segments", type_="unique")
    op.drop_column("segments", "match")
    op.drop_column("segments", "rules")

    op.drop_index("uq_leads_company_id_primary", table_name="leads")
    op.drop_index("ix_leads_company_id", table_name="leads")
    op.drop_constraint(op.f("ck_leads_source"), "leads", type_="check")
    op.drop_constraint(op.f("ck_leads_email_status"), "leads", type_="check")
    op.drop_constraint("fk_leads_company_org", "leads", type_="foreignkey")
    for column in (
        "unsubscribed_at",
        "source",
        "is_primary",
        "email_status",
        "linkedin_url",
        "phone",
        "title",
        "company_id",
    ):
        op.drop_column("leads", column)
    # People imported without an address can't survive the old NOT NULL.
    op.execute("DELETE FROM leads WHERE email IS NULL")
    op.alter_column("leads", "email", existing_type=sa.String(320), nullable=False)

    op.drop_table("company_fits")
    op.drop_table("companies")
