"""product knowledge base: products, kb_sources, kb_source_files, kb_chunks (pgvector)

Revision ID: 0004_knowledge_base
Revises: 0003_row_level_security
Create Date: 2026-09-30

Requires the ``vector`` extension (pgvector >= 0.5 for HNSW). ``CREATE EXTENSION`` needs a
role allowed to create it (a superuser, the database owner on managed Postgres such as
Neon/Supabase/Render, or ``rds_superuser``). The extension is left in place on downgrade,
like the ``corral_app`` role, because other objects may depend on it.

Every table gets the same ``tenant_isolation`` policy as ``0003`` and the same grants to
``corral_app``. Children reference parents by ``(id, org_id)`` so a foreign key can never
cross tenants.
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "0004_knowledge_base"
down_revision: str | None = "0003_row_level_security"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_ROLE = "corral_app"
CURRENT_ORG = "NULLIF(current_setting('app.current_org', true), '')::uuid"
TABLES = ("products", "kb_sources", "kb_source_files", "kb_chunks")
EMBEDDING_DIMENSIONS = 1536


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


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "products",
        *_tenant_columns("products"),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.UniqueConstraint("org_id", "name", name="uq_products_org_id_name"),
        sa.UniqueConstraint("id", "org_id", name="uq_products_id_org_id"),
    )

    op.create_table(
        "kb_sources",
        *_tenant_columns("kb_sources"),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("name", sa.String(512), nullable=False),
        sa.Column("url", sa.Text()),
        sa.Column("scope", sa.String(10)),
        sa.Column("content_sha256", sa.String(64)),
        sa.Column("byte_size", sa.BigInteger()),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("stage", sa.String(10)),
        sa.Column("stage_pct", sa.SmallInteger(), server_default="0", nullable=False),
        sa.Column("failure", sa.String(20)),
        sa.Column("failure_stage", sa.String(10)),
        sa.Column("pages_total", sa.Integer()),
        sa.Column("pages_read", sa.Integer()),
        sa.Column("skipped", sa.String(255)),
        sa.Column("note", sa.String(500)),
        sa.Column("passage_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("generation", sa.Integer(), server_default="0", nullable=False),
        sa.Column("added_by_user_id", sa.Uuid()),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("id", "org_id", name="uq_kb_sources_id_org_id"),
        sa.ForeignKeyConstraint(
            ["product_id", "org_id"],
            ["products.id", "products.org_id"],
            name="fk_kb_sources_product_org",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["added_by_user_id"],
            ["users.id"],
            name=op.f("fk_kb_sources_added_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.CheckConstraint(
            _in("kind", ("pdf", "docx", "md", "url")), name=op.f("ck_kb_sources_kind")
        ),
        sa.CheckConstraint(
            _in("status", ("processing", "ready", "partial", "failed")),
            name=op.f("ck_kb_sources_status"),
        ),
        sa.CheckConstraint(
            "stage IS NULL OR " + _in("stage", ("upload", "scan", "parse", "chunk", "embed")),
            name=op.f("ck_kb_sources_stage"),
        ),
        sa.CheckConstraint(
            "failure IS NULL OR "
            + _in(
                "failure",
                (
                    "interrupted",
                    "encrypted",
                    "no-text",
                    "rejected",
                    "unreadable",
                    "unreachable",
                    "blocked",
                ),
            ),
            name=op.f("ck_kb_sources_failure"),
        ),
        sa.CheckConstraint(
            "scope IS NULL OR " + _in("scope", ("page", "section")),
            name=op.f("ck_kb_sources_scope"),
        ),
        sa.CheckConstraint("stage_pct BETWEEN 0 AND 100", name=op.f("ck_kb_sources_stage_pct")),
        sa.CheckConstraint(
            "(kind = 'url') = (url IS NOT NULL)", name=op.f("ck_kb_sources_url_iff_web")
        ),
    )
    op.create_index("ix_kb_sources_product_id", "kb_sources", ["product_id"])
    op.create_index(
        "ix_kb_sources_product_id_content_sha256", "kb_sources", ["product_id", "content_sha256"]
    )

    op.create_table(
        "kb_source_files",
        *_tenant_columns("kb_source_files"),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.UniqueConstraint("source_id", name="uq_kb_source_files_source_id"),
        sa.ForeignKeyConstraint(
            ["source_id", "org_id"],
            ["kb_sources.id", "kb_sources.org_id"],
            name="fk_kb_source_files_source_org",
            ondelete="CASCADE",
        ),
    )

    op.create_table(
        "kb_chunks",
        *_tenant_columns("kb_chunks"),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.Uuid(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("loc", sa.String(255)),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIMENSIONS), nullable=False),
        sa.UniqueConstraint("source_id", "ordinal", name="uq_kb_chunks_source_id_ordinal"),
        sa.ForeignKeyConstraint(
            ["source_id", "org_id"],
            ["kb_sources.id", "kb_sources.org_id"],
            name="fk_kb_chunks_source_org",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_kb_chunks_product_id", "kb_chunks", ["product_id"])
    op.create_index(
        "ix_kb_chunks_embedding_hnsw",
        "kb_chunks",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )

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
