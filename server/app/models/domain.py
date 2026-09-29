"""Tenant-owned domain tables (stubs for now).

Every table carries a NOT NULL ``org_id`` and is protected by a row-level security policy
keyed on ``app.current_org`` (see migration ``0003_row_level_security``).
"""

import uuid

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class TenantModel(TimestampMixin, Base):
    __abstract__ = True

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )


class Lead(TenantModel):
    __tablename__ = "leads"
    __table_args__ = (UniqueConstraint("org_id", "email"),)

    email: Mapped[str] = mapped_column(String(320), nullable=False)
    first_name: Mapped[str | None] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    company_name: Mapped[str | None] = mapped_column(String(255))


class Segment(TenantModel):
    __tablename__ = "segments"

    name: Mapped[str] = mapped_column(String(255), nullable=False)


class Sequence(TenantModel):
    __tablename__ = "sequences"

    name: Mapped[str] = mapped_column(String(255), nullable=False)


class InboxThread(TenantModel):
    __tablename__ = "inbox_threads"

    subject: Mapped[str | None] = mapped_column(String(500))


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
