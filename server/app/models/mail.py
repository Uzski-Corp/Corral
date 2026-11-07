"""Tenant-scoped demo delivery outbox and verified provider receipts."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.domain import TenantModel

MAIL_TABLES = ("mail_deliveries", "mail_events")


class MailDelivery(TenantModel):
    __tablename__ = "mail_deliveries"
    __table_args__ = (UniqueConstraint("org_id", "request_id"), UniqueConstraint("provider_id"))

    thread_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("inbox_threads.id", ondelete="CASCADE"))
    message_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("inbox_messages.id", ondelete="CASCADE")
    )
    request_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    recipient: Mapped[str] = mapped_column(String(320))
    subject: Mapped[str] = mapped_column(String(500))
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), server_default="queued")
    provider_id: Mapped[str | None] = mapped_column(String(128))
    error: Mapped[str | None] = mapped_column(String(255))
    event_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MailEvent(TenantModel):
    __tablename__ = "mail_events"
    __table_args__ = (UniqueConstraint("org_id", "fingerprint"),)

    fingerprint: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(24), server_default="pending")
    detail: Mapped[str | None] = mapped_column(String(255))
