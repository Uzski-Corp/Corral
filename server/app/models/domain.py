"""Tenant-owned domain tables (stubs for now).

Every table carries a NOT NULL ``org_id`` and is protected by a row-level security policy
keyed on ``app.current_org`` (see migration ``0003_row_level_security``).
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.leads.vocab import EMAIL_STATUSES, SOURCES, sql_in


class TenantModel(TimestampMixin, Base):
    __abstract__ = True

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )


class Lead(TenantModel):
    """A person (contact). Usually at a company; one person per company is its primary."""

    __tablename__ = "leads"
    __table_args__ = (
        UniqueConstraint("org_id", "email"),
        ForeignKeyConstraint(
            ["company_id", "org_id"],
            ["companies.id", "companies.org_id"],
            name="fk_leads_company_org",
            ondelete="CASCADE",
        ),
        CheckConstraint(sql_in("email_status", EMAIL_STATUSES), name="email_status"),
        CheckConstraint(sql_in("source", SOURCES), name="source"),
        Index("ix_leads_company_id", "company_id"),
        Index(
            "uq_leads_company_id_primary",
            "company_id",
            unique=True,
            postgresql_where=text("is_primary"),
        ),
    )

    # NULL for people imported without an address (NULLs never collide in the unique key).
    email: Mapped[str | None] = mapped_column(String(320))
    first_name: Mapped[str | None] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    company_name: Mapped[str | None] = mapped_column(String(255))
    company_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    title: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    linkedin_url: Mapped[str | None] = mapped_column(String(500))
    email_status: Mapped[str] = mapped_column(
        String(12), nullable=False, server_default="unverified"
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    source: Mapped[str] = mapped_column(String(10), nullable=False, server_default="manual")
    unsubscribed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Segment(TenantModel):
    """Saved rules (live membership) plus pinned companies (``segment_pins``)."""

    __tablename__ = "segments"
    __table_args__ = (
        UniqueConstraint("id", "org_id", name="uq_segments_id_org_id"),
        UniqueConstraint("org_id", "name", name="uq_segments_org_id_name"),
        CheckConstraint("match IN ('all', 'any')", name="match"),
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    rules: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, server_default="[]")
    match: Mapped[str] = mapped_column(String(3), nullable=False, server_default="all")


class Sequence(TenantModel):
    """A sequence document (steps, audience, stats). Sending mail is a later engine."""

    __tablename__ = "sequences"
    __table_args__ = (
        UniqueConstraint("org_id", "slug", name="uq_sequences_org_id_slug"),
        CheckConstraint("status IN ('draft', 'launching', 'running', 'paused')", name="status"),
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str | None] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="draft")
    document: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")


class InboxThread(TenantModel):
    """One Unibox conversation. Messages and the draft live in their own tables."""

    __tablename__ = "inbox_threads"
    __table_args__ = (UniqueConstraint("org_id", "slug", name="uq_inbox_threads_org_id_slug"),)

    subject: Mapped[str | None] = mapped_column(String(500))
    slug: Mapped[str | None] = mapped_column(String(80))
    handled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    triage: Mapped[str | None] = mapped_column(String(32))
    snoozed_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    document: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")


class KnowledgeItem(TenantModel):
    __tablename__ = "knowledge_items"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)


TENANT_TABLES: tuple[str, ...] = (
    Lead.__tablename__,
    Segment.__tablename__,
    Sequence.__tablename__,
    InboxThread.__tablename__,
    KnowledgeItem.__tablename__,
)
