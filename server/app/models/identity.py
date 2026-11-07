"""Tenant identity tables: organizations (workspaces), users and memberships.

A WorkOS organization maps to exactly one Corral organization. Users who sign in without
a WorkOS organization get a personal workspace owned by them.
"""

import uuid
from datetime import datetime
from typing import Any, Final

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

ROLE_OWNER: Final = "owner"
ROLE_ADMIN: Final = "admin"
ROLE_MEMBER: Final = "member"
VALID_ROLES: Final = frozenset({ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER})


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _uuid_pk()
    workos_user_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(320), index=True, nullable=False)
    email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    first_name: Mapped[str | None] = mapped_column(String(255))
    last_name: Mapped[str | None] = mapped_column(String(255))
    profile_picture_url: Mapped[str | None] = mapped_column(String(2048))
    last_sign_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Organization(TimestampMixin, Base):
    __tablename__ = "organizations"
    __table_args__ = (
        CheckConstraint(
            "(workos_organization_id IS NULL) <> (personal_owner_user_id IS NULL)",
            name="exactly_one_identity_source",
        ),
        CheckConstraint(
            "team_size IS NULL OR team_size IN ('solo', 'small', 'sales')",
            name="team_size",
        ),
        CheckConstraint("discovery_credit_month >= 0", name="discovery_credit_month"),
        CheckConstraint("discovery_credit_used >= 0", name="discovery_credit_used"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    workos_organization_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    personal_owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    timezone: Mapped[str | None] = mapped_column(String(64))
    team_size: Mapped[str | None] = mapped_column(String(16))
    logo_url: Mapped[str | None] = mapped_column(String(2048))
    website: Mapped[str | None] = mapped_column(String(2048))
    onboarded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    skipped_steps: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, server_default="[]")
    site_pages: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, server_default="[]")
    site_highlights: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, server_default="[]")
    pending_invites: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, server_default="[]")
    discovery_credit_month: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="200"
    )
    discovery_credit_used: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    @property
    def onboarded(self) -> bool:
        return self.onboarded_at is not None


class Membership(TimestampMixin, Base):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("org_id", "user_id"),
        CheckConstraint("role IN ('owner', 'admin', 'member')", name="valid_role"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    role: Mapped[str] = mapped_column(
        String(50), nullable=False, default=ROLE_MEMBER, server_default=text("'member'")
    )
