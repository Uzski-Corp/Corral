"""Product knowledge base: products, their sources, the stored upload and searchable chunks.

One knowledge base per product (the M2 design): a source belongs to exactly one product,
and a chunk to exactly one source. Child rows reference their parent by the composite
``(id, org_id)`` key, so even a row inserted by a buggy query can't point at another
tenant's parent: the foreign key itself checks the org, on top of row-level security.
"""

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    LargeBinary,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.domain import TenantModel

EMBEDDING_DIMENSIONS = 1536
"""Fixed by the ``kb_chunks.embedding`` column; changing it is a migration + re-embed."""

SOURCE_KINDS = ("pdf", "docx", "md", "url")
SOURCE_STATUSES = ("processing", "ready", "partial", "failed")
STAGES = ("upload", "scan", "parse", "chunk", "embed")
FAILURES = (
    "interrupted",
    "encrypted",
    "no-text",
    "rejected",
    "unreadable",
    "unreachable",
    "blocked",
)
URL_SCOPES = ("page", "section")
SKIP_REASONS = ("scanned", "size-limit", "unreadable", "mixed")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Product(TenantModel):
    __tablename__ = "products"
    __table_args__ = (
        UniqueConstraint("org_id", "name", name="uq_products_org_id_name"),
        UniqueConstraint("id", "org_id", name="uq_products_id_org_id"),
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class KbSource(TenantModel):
    """A file or web page added to a product's knowledge base, and its pipeline state."""

    __tablename__ = "kb_sources"
    __table_args__ = (
        UniqueConstraint("id", "org_id", name="uq_kb_sources_id_org_id"),
        ForeignKeyConstraint(
            ["product_id", "org_id"],
            ["products.id", "products.org_id"],
            name="fk_kb_sources_product_org",
            ondelete="CASCADE",
        ),
        CheckConstraint(_in("kind", SOURCE_KINDS), name="kind"),
        CheckConstraint(_in("status", SOURCE_STATUSES), name="status"),
        CheckConstraint(f"stage IS NULL OR {_in('stage', STAGES)}", name="stage"),
        CheckConstraint(f"failure IS NULL OR {_in('failure', FAILURES)}", name="failure"),
        CheckConstraint(f"scope IS NULL OR {_in('scope', URL_SCOPES)}", name="scope"),
        CheckConstraint(
            f"skipped_reason IS NULL OR {_in('skipped_reason', SKIP_REASONS)}",
            name="skipped_reason",
        ),
        CheckConstraint("(skipped IS NULL) = (skipped_reason IS NULL)", name="skip_has_reason"),
        CheckConstraint("stage_pct BETWEEN 0 AND 100", name="stage_pct"),
        CheckConstraint("attempts >= 0", name="attempts"),
        CheckConstraint("(kind = 'url') = (url IS NOT NULL)", name="url_iff_web"),
        Index("ix_kb_sources_product_id", "product_id"),
        Index("ix_kb_sources_product_id_content_sha256", "product_id", "content_sha256"),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    url: Mapped[str | None] = mapped_column(Text)
    scope: Mapped[str | None] = mapped_column(String(10))
    content_sha256: Mapped[str | None] = mapped_column(String(64))
    byte_size: Mapped[int | None] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    stage: Mapped[str | None] = mapped_column(String(10))
    stage_pct: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    failure: Mapped[str | None] = mapped_column(String(20))
    failure_stage: Mapped[str | None] = mapped_column(String(10))
    pages_total: Mapped[int | None] = mapped_column(Integer)
    pages_read: Mapped[int | None] = mapped_column(Integer)
    skipped: Mapped[str | None] = mapped_column(String(255))
    skipped_reason: Mapped[str | None] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(String(500))
    passage_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    # Bumped on every (re)ingest; a job only writes results for the generation it was
    # started for, so a stale job can't overwrite a newer read or a removed source.
    generation: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    # Worker tries of the current generation: 0 while queued, 1 on the first read, 2+ after
    # retries (bounded by WORKER_MAX_TRIES). Reset by a re-read.
    attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    added_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class KbSourceFile(TenantModel):
    """The uploaded bytes, kept so a file can be re-read without a new upload."""

    __tablename__ = "kb_source_files"
    __table_args__ = (
        UniqueConstraint("source_id", name="uq_kb_source_files_source_id"),
        ForeignKeyConstraint(
            ["source_id", "org_id"],
            ["kb_sources.id", "kb_sources.org_id"],
            name="fk_kb_source_files_source_org",
            ondelete="CASCADE",
        ),
    )

    source_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)


class KbChunk(TenantModel):
    """A searchable passage of a source, with where it came from (page, heading or path)."""

    __tablename__ = "kb_chunks"
    __table_args__ = (
        UniqueConstraint("source_id", "ordinal", name="uq_kb_chunks_source_id_ordinal"),
        ForeignKeyConstraint(
            ["source_id", "org_id"],
            ["kb_sources.id", "kb_sources.org_id"],
            name="fk_kb_chunks_source_org",
            ondelete="CASCADE",
        ),
        Index("ix_kb_chunks_product_id", "product_id"),
        Index(
            "ix_kb_chunks_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    source_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    loc: Mapped[str | None] = mapped_column(String(255))
    text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIMENSIONS), nullable=False)


KB_TABLES: tuple[str, ...] = (
    Product.__tablename__,
    KbSource.__tablename__,
    KbSourceFile.__tablename__,
    KbChunk.__tablename__,
)

__all__ = [
    "EMBEDDING_DIMENSIONS",
    "FAILURES",
    "KB_TABLES",
    "SOURCE_KINDS",
    "SOURCE_STATUSES",
    "STAGES",
    "URL_SCOPES",
    "KbChunk",
    "KbSource",
    "KbSourceFile",
    "Product",
]
