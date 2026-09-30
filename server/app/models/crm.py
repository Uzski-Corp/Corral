"""Lead CRM tables: companies (accounts), fits, segment pins, suppressions and imports.

People live in the existing ``leads`` table (``app.models.domain.Lead``), now linked to a
company. Children reference parents by the composite ``(id, org_id)`` key so a foreign key
can never cross tenants, on top of row-level security (same pattern as the KB tables).
"""

import uuid
from datetime import datetime
from typing import Any

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
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.leads.vocab import REPLY_STATUSES, SIZES, SOURCES, sql_in
from app.models.domain import TenantModel

IMPORT_STATUSES = ("queued", "running", "done", "failed")
IMPORT_POLICIES = ("skip", "fill", "overwrite")
SUPPRESSION_REASONS = ("unsubscribed", "bounced", "manual")


class Company(TenantModel):
    """An account in the master lead directory: one row per company per workspace."""

    __tablename__ = "companies"
    __table_args__ = (
        UniqueConstraint("id", "org_id", name="uq_companies_id_org_id"),
        # NULL domains don't collide: companies without a website are allowed.
        UniqueConstraint("org_id", "domain", name="uq_companies_org_id_domain"),
        CheckConstraint(sql_in("source", SOURCES), name="source"),
        CheckConstraint(sql_in("reply_status", REPLY_STATUSES), name="reply_status"),
        CheckConstraint("reply_status_set_by IN ('corral', 'user')", name="reply_status_set_by"),
        CheckConstraint(f"size IS NULL OR {sql_in('size', SIZES)}", name="size"),
        Index("ix_companies_org_id_name_key", "org_id", "name_key", "id"),
        Index("ix_companies_org_id_last_activity_at", "org_id", "last_activity_at"),
        Index("ix_companies_org_id_reply_status", "org_id", "reply_status"),
        Index("ix_companies_org_id_created_at", "org_id", "created_at"),
        Index("ix_companies_org_id_import_id", "org_id", "import_id"),
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    name_key: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[str | None] = mapped_column(String(255))
    country: Mapped[str | None] = mapped_column(String(100))
    size: Mapped[str | None] = mapped_column(String(10))
    industry: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(10), nullable=False, server_default="manual")
    reply_status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="not_contacted"
    )
    # "user" when someone set it by hand; it sticks until the next inbound reply.
    reply_status_set_by: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default="corral"
    )
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The import that last created or updated this company ("make a segment from it").
    import_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)


class CompanyFit(TenantModel):
    """A company's fit score for one product (written by scoring, ENG-55)."""

    __tablename__ = "company_fits"
    __table_args__ = (
        UniqueConstraint("company_id", "product_id", name="uq_company_fits_company_id_product_id"),
        ForeignKeyConstraint(
            ["company_id", "org_id"],
            ["companies.id", "companies.org_id"],
            name="fk_company_fits_company_org",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["product_id", "org_id"],
            ["products.id", "products.org_id"],
            name="fk_company_fits_product_org",
            ondelete="CASCADE",
        ),
        CheckConstraint("score BETWEEN 0 AND 100", name="score"),
        Index("ix_company_fits_product_id_score", "product_id", "score"),
    )

    company_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    score: Mapped[int] = mapped_column(SmallInteger, nullable=False)


class SegmentPin(TenantModel):
    """A company added to a segment by hand; it stays even if it stops matching the rules."""

    __tablename__ = "segment_pins"
    __table_args__ = (
        UniqueConstraint("segment_id", "company_id", name="uq_segment_pins_segment_id_company_id"),
        ForeignKeyConstraint(
            ["segment_id", "org_id"],
            ["segments.id", "segments.org_id"],
            name="fk_segment_pins_segment_org",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["company_id", "org_id"],
            ["companies.id", "companies.org_id"],
            name="fk_segment_pins_company_org",
            ondelete="CASCADE",
        ),
        Index("ix_segment_pins_company_id", "company_id"),
    )

    segment_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    company_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)


class Suppression(TenantModel):
    """An address Corral must never email again from this workspace."""

    __tablename__ = "suppressions"
    __table_args__ = (
        UniqueConstraint("org_id", "email", name="uq_suppressions_org_id_email"),
        CheckConstraint(sql_in("reason", SUPPRESSION_REASONS), name="reason"),
    )

    email: Mapped[str] = mapped_column(String(320), nullable=False)
    reason: Mapped[str] = mapped_column(String(20), nullable=False)


class LeadImport(TenantModel):
    """A CSV import: the upload, its mapping and policy, progress, and the receipt."""

    __tablename__ = "lead_imports"
    __table_args__ = (
        UniqueConstraint("id", "org_id", name="uq_lead_imports_id_org_id"),
        CheckConstraint(sql_in("status", IMPORT_STATUSES), name="status"),
        CheckConstraint(sql_in("policy", IMPORT_POLICIES), name="policy"),
        CheckConstraint("progress_pct BETWEEN 0 AND 100", name="progress_pct"),
        Index("ix_lead_imports_org_id_created_at", "org_id", "created_at"),
    )

    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    byte_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    policy: Mapped[str] = mapped_column(String(10), nullable=False)
    mapping: Mapped[list[Any]] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, server_default="queued")
    progress_pct: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    total_rows: Mapped[int | None] = mapped_column(Integer)
    created_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    updated_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    skipped_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    error_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    in_file_duplicates: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    existing_duplicates: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    people_created: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    failure: Mapped[str | None] = mapped_column(String(30))
    note: Mapped[str | None] = mapped_column(String(500))
    # The upload, kept until the import finishes (then dropped), and the rows left behind.
    data: Mapped[bytes | None] = mapped_column(LargeBinary)
    errors_csv: Mapped[bytes | None] = mapped_column(LargeBinary)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


CRM_TABLES: tuple[str, ...] = (
    Company.__tablename__,
    CompanyFit.__tablename__,
    SegmentPin.__tablename__,
    Suppression.__tablename__,
    LeadImport.__tablename__,
)
