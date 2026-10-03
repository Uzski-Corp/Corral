"""Org-scoped activity: inbox messages, mailboxes, discovery, integrations, developer keys.

The screens read and write these rows. Nothing here calls an outside system: a queued
discovery run stays queued, a sent reply is a message, a connected integration is a status.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.domain import TenantModel

ACTIVITY_TABLES: tuple[str, ...] = (
    "inbox_messages",
    "inbox_drafts",
    "mailboxes",
    "discovery_runs",
    "integrations",
    "integration_logs",
    "api_keys",
    "mcp_connections",
    "mcp_calls",
)


class InboxMessage(TenantModel):
    __tablename__ = "inbox_messages"
    __table_args__ = (
        ForeignKeyConstraint(
            ["thread_id"],
            ["inbox_threads.id"],
            name="fk_inbox_messages_thread_id_inbox_threads",
            ondelete="CASCADE",
        ),
        Index("ix_inbox_messages_thread_id", "thread_id"),
    )

    thread_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    direction: Mapped[str] = mapped_column(String(8), nullable=False)
    author: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    body: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    at_label: Mapped[str] = mapped_column(String(80), nullable=False, server_default="")
    document: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")


class InboxDraft(TenantModel):
    __tablename__ = "inbox_drafts"
    __table_args__ = (
        ForeignKeyConstraint(
            ["thread_id"],
            ["inbox_threads.id"],
            name="fk_inbox_drafts_thread_id_inbox_threads",
            ondelete="CASCADE",
        ),
        UniqueConstraint("thread_id", name="uq_inbox_drafts_thread_id"),
    )

    thread_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    kind: Mapped[str] = mapped_column(String(32), nullable=False, server_default="ready")
    document: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")


class Mailbox(TenantModel):
    __tablename__ = "mailboxes"
    __table_args__ = (UniqueConstraint("org_id", "address", name="uq_mailboxes_org_id_address"),)

    address: Mapped[str] = mapped_column(String(320), nullable=False)
    sent_today: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    daily_cap: Mapped[int] = mapped_column(Integer, nullable=False, server_default="35")
    attention: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    document: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")


class DiscoveryRun(TenantModel):
    __tablename__ = "discovery_runs"
    __table_args__ = (
        UniqueConstraint("org_id", "slug", name="uq_discovery_runs_org_id_slug"),
        CheckConstraint(
            "status IN ('queued', 'running', 'paused', 'partial', 'failed', 'done', 'cancelled')",
            name="status",
        ),
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str | None] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="queued")
    document: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")


class Integration(TenantModel):
    __tablename__ = "integrations"
    __table_args__ = (
        UniqueConstraint("org_id", "provider", name="uq_integrations_org_id_provider"),
        CheckConstraint("provider IN ('cal', 'phoenix', 'autosend')", name="provider"),
        ForeignKeyConstraint(
            ["connected_by"],
            ["users.id"],
            name="fk_integrations_connected_by_users",
            ondelete="SET NULL",
        ),
    )

    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="off")
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    # When it was last connected from off, and by which user. Kept through a reauth.
    connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    connected_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    # When the status last changed: "Sign-in expired 2h ago" reads this.
    status_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Phoenix's saved field mapping. Null until someone saves one (Corral uses its defaults).
    mapping: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)


class IntegrationLog(TenantModel):
    __tablename__ = "integration_logs"
    __table_args__ = (
        ForeignKeyConstraint(
            ["integration_id"],
            ["integrations.id"],
            name="fk_integration_logs_integration_id_integrations",
            ondelete="CASCADE",
        ),
        Index("ix_integration_logs_integration_id", "integration_id"),
    )

    integration_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    document: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")


class ApiKey(TenantModel):
    __tablename__ = "api_keys"
    __table_args__ = (
        UniqueConstraint("org_id", "slug", name="uq_api_keys_org_id_slug"),
        CheckConstraint("env IN ('live', 'test')", name="env"),
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str | None] = mapped_column(String(80))
    env: Mapped[str] = mapped_column(String(8), nullable=False, server_default="live")
    last4: Mapped[str] = mapped_column(String(8), nullable=False)
    secret_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    scopes: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, server_default="[]")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[str] = mapped_column(String(255), nullable=False, server_default="")
    calls_7d: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    document: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")


class McpConnection(TenantModel):
    __tablename__ = "mcp_connections"
    __table_args__ = (UniqueConstraint("org_id", "slug", name="uq_mcp_connections_org_id_slug"),)

    slug: Mapped[str | None] = mapped_column(String(80))
    client: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    document: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")


class McpCall(TenantModel):
    __tablename__ = "mcp_calls"
    __table_args__ = (
        ForeignKeyConstraint(
            ["connection_id"],
            ["mcp_connections.id"],
            name="fk_mcp_calls_connection_id_mcp_connections",
            ondelete="CASCADE",
        ),
        Index("ix_mcp_calls_connection_id", "connection_id"),
    )

    connection_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    document: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
