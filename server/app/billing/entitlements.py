"""Effective access. Trial, subscription, payment trouble, and enforcement stay distinct."""

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import ApiProblem
from app.models.billing import WorkspaceBilling

TrialState = Literal["none", "active", "expired"]
SubscriptionState = Literal["none", "active", "trialing", "past_due", "paused", "canceled"]
Entitlement = Literal["trial", "paid", "none"]


@dataclass(frozen=True, slots=True)
class AccessFacts:
    now: datetime
    enforce: bool
    past_due_access: Literal["unresolved", "retain", "revoke"]
    trial_started_at: datetime | None
    trial_ends_at: datetime | None
    subscription_status: str | None
    paid_through_at: datetime | None
    cancel_effective_at: datetime | None
    payment_problem: bool


@dataclass(frozen=True, slots=True)
class EffectiveAccess:
    trial_state: TrialState
    subscription_state: SubscriptionState
    cancellation_scheduled: bool
    access_until: datetime | None
    payment_problem: bool
    entitlement: Entitlement
    can_start_billable_work: bool
    enforcement: Literal["off", "on"]

    @property
    def reason(self) -> str:
        if not self.can_start_billable_work and self.enforcement == "on":
            if self.payment_problem and self.subscription_state == "past_due":
                return "payment_problem"
            if self.trial_state == "expired" and self.subscription_state in (
                "none",
                "canceled",
                "paused",
            ):
                return "trial_expired"
            if self.subscription_state == "canceled":
                return "subscription_canceled"
            return "not_entitled"
        if self.enforcement == "off":
            return "enforcement_off"
        if self.entitlement == "paid":
            return "paid"
        if self.entitlement == "trial":
            return "trial"
        return "enforcement_off"


def effective_access(facts: AccessFacts) -> EffectiveAccess:
    """``now == trial_ends_at`` is expired. A scheduled cancel keeps access until then."""
    if facts.trial_ends_at is None:
        trial_state: TrialState = "none"
    elif facts.now < facts.trial_ends_at:
        trial_state = "active"
    else:
        trial_state = "expired"

    status = facts.subscription_status
    cancel_at = facts.cancel_effective_at
    scheduled = bool(status == "active" and cancel_at is not None and facts.now < cancel_at)
    ended_schedule = bool(status == "active" and cancel_at is not None and facts.now >= cancel_at)
    if ended_schedule or status == "canceled":
        subscription_state: SubscriptionState = "canceled"
    elif status in ("active", "trialing", "past_due", "paused"):
        subscription_state = status  # type: ignore[assignment]
    else:
        subscription_state = "none"

    paid_open = False
    if subscription_state == "active":
        paid_open = facts.paid_through_at is None or facts.now < facts.paid_through_at
    elif subscription_state == "past_due" and facts.past_due_access == "retain":
        paid_open = True
    # A Paddle `trialing` subscription is not paid access. Corral's trial is local.

    if paid_open:
        entitlement: Entitlement = "paid"
    elif trial_state == "active":
        entitlement = "trial"
    else:
        entitlement = "none"

    access_until: datetime | None = None
    if scheduled:
        access_until = cancel_at
    elif subscription_state == "active" and paid_open:
        access_until = facts.paid_through_at
    elif trial_state == "active":
        access_until = facts.trial_ends_at

    # Unresolved past-due policy does not grant paid access. An active local trial still does.
    payment_blocks_paid = (
        facts.past_due_access != "retain"
        and (facts.payment_problem or subscription_state == "past_due")
        and entitlement == "paid"
    )
    if payment_blocks_paid:
        entitlement = "trial" if trial_state == "active" else "none"

    can_start = True if not facts.enforce else entitlement != "none"

    return EffectiveAccess(
        trial_state=trial_state,
        subscription_state=subscription_state,
        cancellation_scheduled=scheduled,
        access_until=access_until,
        payment_problem=facts.payment_problem or subscription_state == "past_due",
        entitlement=entitlement,
        can_start_billable_work=can_start,
        enforcement="on" if facts.enforce else "off",
    )


def facts_from_row(
    row: WorkspaceBilling | None, *, now: datetime, settings: Settings
) -> AccessFacts:
    return AccessFacts(
        now=now,
        enforce=settings.billing_enforce_access,
        past_due_access=settings.billing_past_due_access,
        trial_started_at=None if row is None else row.trial_started_at,
        trial_ends_at=None if row is None else row.trial_ends_at,
        subscription_status=None if row is None else row.subscription_status,
        paid_through_at=None if row is None else row.paid_through_at,
        cancel_effective_at=None if row is None else row.cancel_effective_at,
        payment_problem=False if row is None else row.payment_problem,
    )


async def load_billing(session: AsyncSession, org_id: uuid.UUID) -> WorkspaceBilling | None:
    return (
        await session.execute(select(WorkspaceBilling).where(WorkspaceBilling.org_id == org_id))
    ).scalar_one_or_none()


async def workspace_may_start_work(
    session: AsyncSession, settings: Settings, org_id: uuid.UUID, *, now: datetime | None = None
) -> bool:
    if not settings.billing_enforce_access:
        return True
    from datetime import UTC

    moment = now or datetime.now(UTC)
    row = await load_billing(session, org_id)
    return effective_access(
        facts_from_row(row, now=moment, settings=settings)
    ).can_start_billable_work


async def require_billable_work(
    session: AsyncSession, settings: Settings, org_id: uuid.UUID
) -> None:
    """Gate new knowledge reads and lead imports. Reads and billing stay open."""
    if await workspace_may_start_work(session, settings, org_id):
        return
    raise ApiProblem(
        402,
        "billing_required",
        "New knowledge reads, lead imports and AI drafts are paused. "
        "Existing records stay available, and billing is still open.",
    )
