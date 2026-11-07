"""Product-visible AI run state; Pi SQLite is only the execution log."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.domain import TenantModel

AI_TABLES = ("ai_runs",)


class AiRun(TenantModel):
    __tablename__ = "ai_runs"
    __table_args__ = (UniqueConstraint("org_id", "request_id"),)
    request_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    thread_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("inbox_threads.id", ondelete="CASCADE"))
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(24), server_default="queued")
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default="{}")
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(String(255))
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
