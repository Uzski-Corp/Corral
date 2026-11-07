"""Trial start, checkout, portal, and the billing snapshot."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.billing.catalog import (
    CONFIRMED_LIMITS,
    TRIAL_ALLOWANCE,
    catalog_ready,
    configured_plans,
    plan_for_price,
    price_for,
)
from app.billing.entitlements import (
    effective_access,
    facts_from_row,
    load_billing,
)
from app.billing.paddle_client import PaddleCallError, PaddleClient
from app.billing.sms import CONSENT_VERSION, UnavailableSms, sms_sender
from app.billing.webhooks import BillingProjection, plan_fields, should_project
from app.core.config import Settings
from app.core.errors import ApiProblem
from app.db.session import Database, tenant_transaction
from app.models.billing import BillingCheckout, BillingSmsPreference, WorkspaceBilling

log = structlog.get_logger(__name__)

MANAGERS = frozenset({"owner", "admin"})


def can_manage(role: str) -> bool:
    return role in MANAGERS


async def start_trial(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    settings: Settings,
    now: datetime | None = None,
) -> None:
    """Start the workspace trial once. A repeat, even concurrent, does not move the dates."""
    moment = now or datetime.now(UTC)
    ends = moment + timedelta(days=settings.billing_trial_days)
    stmt = pg_insert(WorkspaceBilling).values(
        org_id=org_id,
        trial_started_at=moment,
        trial_ends_at=ends,
        trial_started_by_user_id=user_id,
    )
    stmt = stmt.on_conflict_do_update(
        constraint="uq_workspace_billing_org_id",
        set_={
            "trial_started_at": moment,
            "trial_ends_at": ends,
            "trial_started_by_user_id": user_id,
        },
        where=WorkspaceBilling.trial_started_at.is_(None),
    )
    await session.execute(stmt)


def _iso(value: datetime | None) -> str | None:
    return None if value is None else value.astimezone(UTC).isoformat()


def _preference(row: BillingSmsPreference | None, sender: UnavailableSms) -> dict[str, Any]:
    return {
        "available": sender.available,
        "reason": sender.reason,
        "consent_version": CONSENT_VERSION,
        "consented": False if row is None else row.consented and row.revoked_at is None,
        "phone_e164": None if row is None else row.phone_e164,
        "phone_verified": False if row is None else row.phone_verified_at is not None,
        "timezone": None if row is None else row.timezone,
        "quiet_start_minute": None if row is None else row.quiet_start_minute,
        "quiet_end_minute": None if row is None else row.quiet_end_minute,
        "notify_trial_ending": False if row is None else row.notify_trial_ending,
        "notify_payment_failed": False if row is None else row.notify_payment_failed,
        "notify_renewal": False if row is None else row.notify_renewal,
        "revoked_at": None if row is None else _iso(row.revoked_at),
    }


async def snapshot(
    session: AsyncSession,
    settings: Settings,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    role: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    moment = now or datetime.now(UTC)
    row = await load_billing(session, org_id)
    access = effective_access(facts_from_row(row, now=moment, settings=settings))
    pending = (
        await session.execute(
            select(BillingCheckout)
            .where(
                BillingCheckout.org_id == org_id,
                BillingCheckout.status.in_(("open", "ambiguous")),
            )
            .order_by(BillingCheckout.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    pref = (
        await session.execute(
            select(BillingSmsPreference).where(
                BillingSmsPreference.org_id == org_id,
                BillingSmsPreference.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    plan_id = None if row is None else row.plan_id
    return {
        "server_time": _iso(moment),
        "catalog_configured": catalog_ready(settings),
        "paddle_configured": settings.paddle_configured,
        "can_manage": can_manage(role),
        "enforcement": access.enforcement,
        "past_due_access": settings.billing_past_due_access,
        "trial": {
            "state": access.trial_state,
            "started_at": None if row is None else _iso(row.trial_started_at),
            "ends_at": None if row is None else _iso(row.trial_ends_at),
        },
        "subscription": {
            "state": access.subscription_state,
            "status": None if row is None else row.subscription_status,
            "plan_id": plan_id,
            "interval": None if row is None else row.billing_interval,
            "paid_through_at": None if row is None else _iso(row.paid_through_at),
            "cancellation_scheduled": access.cancellation_scheduled,
            "access_until": _iso(access.access_until),
        },
        "payment_problem": access.payment_problem,
        "access": {
            "entitlement": access.entitlement,
            "can_start_billable_work": access.can_start_billable_work,
            "reason": access.reason,
        },
        "pending_checkout": None
        if pending is None
        else {
            "id": str(pending.id),
            "transaction_id": pending.paddle_transaction_id,
            "plan_id": pending.plan_id,
            "interval": pending.interval,
            "status": pending.status,
        },
        "trial_allowance": TRIAL_ALLOWANCE,
        "limits_enforced": False,
        "plans": configured_plans(settings),
        "portal_available": bool(row and row.paddle_customer_id and settings.paddle_configured),
        "sms": _preference(pref, sms_sender()),
        "gated_operations": [
            "product knowledge file and url adds",
            "product knowledge re-reads",
            "lead CSV imports that write rows",
            "AI reply generation",
        ],
        "not_gated": [
            "reading existing records",
            "billing",
            "discovery",
            "sequences and email delivery",
            "knowledge search",
            "lead import dry runs",
        ],
    }


def _require_manager(role: str) -> None:
    if not can_manage(role):
        raise ApiProblem(403, "billing_forbidden", "Only an owner or admin can change billing.")


async def _lock_org(session: AsyncSession, org_id: uuid.UUID) -> None:
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"corral-billing:{org_id}"},
    )


def checkout_action(existing: BillingCheckout | None, plan_id: str, interval: str) -> str:
    """How a second checkout request should behave. Tested without Paddle."""
    if existing is None:
        return "create"
    if existing.status == "ambiguous":
        return "blocked_ambiguous"
    if (
        existing.plan_id == plan_id
        and existing.interval == interval
        and existing.paddle_transaction_id
    ):
        return "reuse"
    if existing.paddle_transaction_id:
        return "blocked_other"
    return "create"


async def _prepare_checkout(
    session: AsyncSession,
    settings: Settings,
    paddle: PaddleClient,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    role: str,
    plan_id: str,
    interval: str,
) -> dict[str, str]:
    _require_manager(role)
    if not settings.paddle_configured:
        raise ApiProblem(
            503,
            "billing_unconfigured",
            "Paddle isn't configured for this environment yet.",
        )
    mapped = price_for(settings, plan_id, interval)
    if mapped is None:
        if plan_id == "territory":
            raise ApiProblem(
                409,
                "contact_sales",
                "Territory doesn't have a confirmed price. Talk to us to pick it.",
            )
        raise ApiProblem(
            503,
            "billing_unconfigured",
            "That plan has no confirmed Paddle price yet.",
        )
    await _lock_org(session, org_id)
    billing = await load_billing(session, org_id)
    if (
        billing
        and billing.paddle_subscription_id
        and billing.subscription_status in ("active", "trialing", "past_due", "paused")
    ):
        raise ApiProblem(
            409, "subscription_exists", "Manage your existing subscription from billing."
        )
    existing = (
        await session.execute(
            select(BillingCheckout).where(
                BillingCheckout.org_id == org_id,
                BillingCheckout.status.in_(("open", "ambiguous")),
            )
        )
    ).scalar_one_or_none()
    action = checkout_action(existing, plan_id, interval)
    if action == "reuse" and existing is not None and existing.paddle_transaction_id:
        return {"transaction_id": existing.paddle_transaction_id}
    if action == "blocked_ambiguous":
        raise ApiProblem(
            409,
            "checkout_unconfirmed",
            "A checkout may already exist. It was not retried. Refresh billing in a moment.",
        )
    if action == "blocked_other":
        raise ApiProblem(
            409,
            "checkout_in_progress",
            "Finish or dismiss the checkout already open before starting another plan.",
        )
    try:
        remote = await paddle.get_price(mapped.price_id)
    except PaddleCallError as exc:
        raise ApiProblem(503, "billing_unavailable", "Paddle couldn't be reached.") from exc
    if remote.get("trial_period"):
        raise ApiProblem(
            409,
            "price_includes_trial",
            "That Paddle price includes a trial. Paid checkout must not add another one.",
        )
    price = remote.get("unit_price") or {}
    expected = CONFIRMED_LIMITS[plan_id]["monthly_usd"]
    if interval == "month" and (
        price.get("currency_code") != "USD"
        or str(price.get("amount")) != str(int(expected or 0) * 100)
    ):
        raise ApiProblem(
            409,
            "price_amount_mismatch",
            "The configured price doesn't match this plan. Contact support.",
        )
    cycle = remote.get("billing_cycle") or {}
    if cycle.get("interval") != interval or cycle.get("frequency") != 1:
        raise ApiProblem(
            409,
            "price_interval_mismatch",
            "The configured price doesn't bill on that interval.",
        )
    checkout = BillingCheckout(
        org_id=org_id,
        plan_id=plan_id,
        interval=interval,
        paddle_price_id=mapped.price_id,
        status="open",
        created_by_user_id=user_id,
    )
    session.add(checkout)
    await session.flush()
    # Commit an ambiguous intent BEFORE calling the external provider. A crash or
    # timeout must not roll back the only record preventing a duplicate checkout.
    checkout.status = "ambiguous"
    return {"checkout_id": str(checkout.id), "price_id": mapped.price_id}


async def start_checkout(
    database: Database,
    settings: Settings,
    paddle: PaddleClient,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    role: str,
    plan_id: str,
    interval: str,
) -> dict[str, str]:
    async with tenant_transaction(database, org_id) as session:
        prepared = await _prepare_checkout(
            session,
            settings,
            paddle,
            org_id=org_id,
            user_id=user_id,
            role=role,
            plan_id=plan_id,
            interval=interval,
        )
    if "transaction_id" in prepared:
        return prepared
    checkout_id = uuid.UUID(prepared["checkout_id"])
    try:
        txn = await paddle.create_transaction(
            price_id=prepared["price_id"],
            checkout_id=str(checkout_id),
            org_id=str(org_id),
        )
    except PaddleCallError as exc:
        if exc.kind == "rejected":
            async with tenant_transaction(database, org_id) as session:
                row = await session.get(BillingCheckout, checkout_id)
                if row is not None and row.status == "ambiguous":
                    row.status = "canceled"
            raise ApiProblem(502, "checkout_failed", "Paddle rejected the checkout.") from exc
        raise ApiProblem(
            503,
            "checkout_ambiguous",
            "Checkout confirmation is delayed. It was not retried; refresh billing shortly.",
        ) from exc
    txn_id = txn.get("id")
    if not isinstance(txn_id, str) or not txn_id.startswith("txn_"):
        raise ApiProblem(
            503, "checkout_ambiguous", "Checkout confirmation is delayed. It was not retried."
        )
    async with tenant_transaction(database, org_id) as session:
        row = await session.get(BillingCheckout, checkout_id, with_for_update=True)
        if row is not None:
            row.paddle_transaction_id = txn_id
            if row.status == "ambiguous":
                row.status = "open"
    return {"transaction_id": txn_id}


async def start_portal(
    session: AsyncSession,
    settings: Settings,
    paddle: PaddleClient,
    *,
    org_id: uuid.UUID,
    role: str,
) -> dict[str, str]:
    _require_manager(role)
    if not settings.paddle_configured:
        raise ApiProblem(
            503, "billing_unconfigured", "Paddle isn't configured for this environment yet."
        )
    row = await load_billing(session, org_id)
    if row is None or not row.paddle_customer_id:
        raise ApiProblem(
            409, "no_billing_customer", "There's no Paddle customer for this workspace yet."
        )
    try:
        portal = await paddle.create_portal_session(
            row.paddle_customer_id, row.paddle_subscription_id
        )
    except PaddleCallError as exc:
        raise ApiProblem(502, "portal_failed", "The billing portal couldn't be opened.") from exc
    urls = portal.get("urls")
    if not isinstance(urls, dict):
        urls = {}
    general = urls.get("general")
    if not isinstance(general, dict):
        general = {}
    overview = general.get("overview")
    if not isinstance(overview, str) or not overview.startswith("https://"):
        raise ApiProblem(502, "portal_failed", "Paddle didn't return a portal link.")
    return {"url": overview}


def apply_projection(
    row: WorkspaceBilling,
    projection: BillingProjection,
    settings: Settings,
) -> None:
    if projection.event_at is not None and not should_project(
        row.subscription_event_at, projection.event_at
    ):
        return
    if projection.customer_id:
        row.paddle_customer_id = projection.customer_id
    if projection.subscription_id:
        row.paddle_subscription_id = projection.subscription_id
    if projection.subscription_status:
        row.subscription_status = projection.subscription_status
    if projection.price_id:
        row.paddle_price_id = projection.price_id
        plan_id, interval = plan_fields(plan_for_price(settings, projection.price_id))
        if plan_id:
            row.plan_id = plan_id
            row.billing_interval = interval
    if projection.paid_through_at is not None:
        row.paid_through_at = projection.paid_through_at
    if projection.cancel_effective_at is not None:
        row.cancel_effective_at = projection.cancel_effective_at
    elif projection.clear_cancel:
        row.cancel_effective_at = None
    if projection.payment_problem is not None:
        row.payment_problem = projection.payment_problem
    if projection.payment_recovered:
        row.payment_problem = False
        row.payment_recovered_at = projection.event_at or datetime.now(UTC)
    if projection.event_at is not None and projection.subscription_status:
        row.subscription_event_at = projection.event_at


async def save_sms_preference(
    session: AsyncSession,
    *,
    org_id: uuid.UUID,
    user_id: uuid.UUID,
    role: str,
    body: dict[str, Any],
    now: datetime | None = None,
) -> dict[str, Any]:
    _require_manager(role)
    sender = sms_sender()
    if body.get("enable_delivery"):
        raise ApiProblem(409, "sms_unavailable", sender.reason)
    moment = now or datetime.now(UTC)
    row = (
        await session.execute(
            select(BillingSmsPreference).where(
                BillingSmsPreference.org_id == org_id,
                BillingSmsPreference.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        row = BillingSmsPreference(org_id=org_id, user_id=user_id)
        session.add(row)
    phone = body.get("phone_e164")
    if phone != row.phone_e164:
        row.phone_e164 = phone
        row.phone_verified_at = None
    consented = bool(body.get("consented"))
    if consented and not phone:
        raise ApiProblem(422, "phone_required", "Add a phone number before opting in.")
    if consented and not row.consented:
        row.consented = True
        row.consent_at = moment
        row.consent_version = CONSENT_VERSION
        row.revoked_at = None
    if not consented:
        row.consented = False
        if row.revoked_at is None and row.consent_at is not None:
            row.revoked_at = moment
    row.timezone = body.get("timezone")
    row.quiet_start_minute = body.get("quiet_start_minute")
    row.quiet_end_minute = body.get("quiet_end_minute")
    row.notify_trial_ending = bool(body.get("notify_trial_ending"))
    row.notify_payment_failed = bool(body.get("notify_payment_failed"))
    row.notify_renewal = bool(body.get("notify_renewal"))
    await session.flush()
    return _preference(row, sender)
