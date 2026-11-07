"""Local billing projection. Paddle remains the source of payment records.

Four facts stay in separate columns: the Corral trial, the Paddle subscription status,
the paid-through / scheduled-cancellation dates, and (derived, not stored) effective access.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.models.domain import TenantModel

PLAN_IDS = ("field", "range", "territory")
INTERVALS = ("month", "year")
SUBSCRIPTION_STATUSES = ("active", "trialing", "past_due", "paused", "canceled")
CHECKOUT_STATUSES = ("open", "ambiguous", "completed", "canceled")
WEBHOOK_STATUSES = ("received", "processed", "unresolved", "failed")
SMS_KINDS = ("trial_ending", "payment_failed", "renewal")
SMS_STATUSES = ("unavailable", "skipped_revoked", "suppressed_recovered")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class WorkspaceBilling(TenantModel):
    """One row per workspace. Trial dates are set once, when onboarding completes."""

    __tablename__ = "workspace_billing"
    __table_args__ = (
        UniqueConstraint("org_id", name="uq_workspace_billing_org_id"),
        CheckConstraint(
            f"plan_id IS NULL OR {_in('plan_id', PLAN_IDS)}",
            name="plan_id",
        ),
        CheckConstraint(
            f"billing_interval IS NULL OR {_in('billing_interval', INTERVALS)}",
            name="billing_interval",
        ),
        CheckConstraint(
            f"subscription_status IS NULL OR {_in('subscription_status', SUBSCRIPTION_STATUSES)}",
            name="subscription_status",
        ),
        CheckConstraint(
            "(trial_started_at IS NULL) = (trial_ends_at IS NULL)",
            name="trial_pair",
        ),
        CheckConstraint(
            "trial_ends_at IS NULL OR trial_ends_at > trial_started_at",
            name="trial_order",
        ),
        Index(
            "uq_workspace_billing_paddle_customer",
            "paddle_customer_id",
            unique=True,
            postgresql_where=text("paddle_customer_id IS NOT NULL"),
        ),
        Index(
            "uq_workspace_billing_paddle_subscription",
            "paddle_subscription_id",
            unique=True,
            postgresql_where=text("paddle_subscription_id IS NOT NULL"),
        ),
    )

    trial_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    trial_started_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    paddle_customer_id: Mapped[str | None] = mapped_column(String(30))
    paddle_subscription_id: Mapped[str | None] = mapped_column(String(30))
    subscription_status: Mapped[str | None] = mapped_column(String(16))
    paddle_price_id: Mapped[str | None] = mapped_column(String(30))
    plan_id: Mapped[str | None] = mapped_column(String(16))
    billing_interval: Mapped[str | None] = mapped_column(String(8))
    paid_through_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_effective_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    subscription_event_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    payment_problem: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    payment_recovered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BillingCheckout(TenantModel):
    """A server-created Paddle transaction. The browser never supplies the price id."""

    __tablename__ = "billing_checkouts"
    __table_args__ = (
        UniqueConstraint("paddle_transaction_id", name="uq_billing_checkouts_transaction"),
        CheckConstraint(_in("plan_id", PLAN_IDS), name="plan_id"),
        CheckConstraint(_in("interval", INTERVALS), name="interval"),
        CheckConstraint(_in("status", CHECKOUT_STATUSES), name="status"),
        Index(
            "uq_billing_checkouts_one_open",
            "org_id",
            unique=True,
            postgresql_where=text("status IN ('open', 'ambiguous')"),
        ),
        Index("ix_billing_checkouts_org_id_created_at", "org_id", "created_at"),
    )

    plan_id: Mapped[str] = mapped_column(String(16), nullable=False)
    interval: Mapped[str] = mapped_column(String(8), nullable=False)
    paddle_price_id: Mapped[str] = mapped_column(String(30), nullable=False)
    paddle_transaction_id: Mapped[str | None] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="open")
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )


class BillingSmsPreference(TenantModel):
    """Opt-in for billing administrators. Delivery stays off until a provider exists."""

    __tablename__ = "billing_sms_preferences"
    __table_args__ = (
        UniqueConstraint("org_id", "user_id", name="uq_billing_sms_preferences_org_user"),
        CheckConstraint(
            "quiet_start_minute IS NULL OR quiet_start_minute BETWEEN 0 AND 1439",
            name="quiet_start",
        ),
        CheckConstraint(
            "quiet_end_minute IS NULL OR quiet_end_minute BETWEEN 0 AND 1439",
            name="quiet_end",
        ),
        CheckConstraint(
            "(quiet_start_minute IS NULL) = (quiet_end_minute IS NULL)",
            name="quiet_pair",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    phone_e164: Mapped[str | None] = mapped_column(String(20))
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consented: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consent_version: Mapped[str | None] = mapped_column(String(40))
    timezone: Mapped[str | None] = mapped_column(String(64))
    quiet_start_minute: Mapped[int | None] = mapped_column(Integer)
    quiet_end_minute: Mapped[int | None] = mapped_column(Integer)
    notify_trial_ending: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    notify_payment_failed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    notify_renewal: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BillingSmsNotification(TenantModel):
    """Deduped reminder intent. Nothing in this table is marked delivered."""

    __tablename__ = "billing_sms_notifications"
    __table_args__ = (
        UniqueConstraint("org_id", "dedupe_key", name="uq_billing_sms_notifications_dedupe"),
        CheckConstraint(_in("kind", SMS_KINDS), name="kind"),
        CheckConstraint(_in("status", SMS_STATUSES), name="status"),
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    dedupe_key: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)


class PaddleWebhookEvent(Base):
    """Provider receipt. Not org-scoped: RLS denies ``corral_app``; definer functions write it.

    ``org_id`` is filled only after a local checkout or customer mapping resolves the tenant.
    """

    __tablename__ = "paddle_webhook_events"
    __table_args__ = (
        CheckConstraint(_in("status", WEBHOOK_STATUSES), name="status"),
        Index("ix_paddle_webhook_events_status", "status"),
    )

    event_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    notification_id: Mapped[str | None] = mapped_column(String(40))
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="received")
    org_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("organizations.id", ondelete="SET NULL")
    )
    detail: Mapped[str | None] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


BILLING_TABLES: tuple[str, ...] = (
    WorkspaceBilling.__tablename__,
    BillingCheckout.__tablename__,
    BillingSmsPreference.__tablename__,
    BillingSmsNotification.__tablename__,
)
OPERATIONAL_TABLES: tuple[str, ...] = (PaddleWebhookEvent.__tablename__,)
