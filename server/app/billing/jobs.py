"""Retry unprocessed Paddle events and keep billing SMS from sending."""

import uuid
from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy import text

from app.billing.paddle_client import PaddleCallError, PaddleClient
from app.billing.service import apply_projection
from app.billing.sms import sms_sender
from app.billing.webhooks import BillingProjection, occurred_at, project_event, should_project
from app.core.config import Settings
from app.db.session import Database, tenant_transaction
from app.db.tenancy import enforce_app_role
from app.models.billing import WorkspaceBilling

log = structlog.get_logger(__name__)


async def defer_until_billable(
    ctx: dict[str, Any], org_id: str, job: str, args: tuple[Any, ...], job_id: str
) -> bool:
    """Leave an accepted upload in place and try the job again later.

    Enforcement is off by default, so this returns immediately for current workspaces.
    """
    settings: Settings = ctx["settings"]
    if not settings.billing_enforce_access:
        return False
    from app.billing.entitlements import workspace_may_start_work

    async with tenant_transaction(ctx["db"], uuid.UUID(org_id)) as session:
        allowed = await workspace_may_start_work(session, settings, uuid.UUID(org_id))
    if allowed:
        return False
    await ctx["redis"].enqueue_job(
        job,
        *args,
        _job_id=f"{job_id}:billing:{int(datetime.now(UTC).timestamp())}",
        _defer_by=settings.billing_recheck_delay_s,
    )
    log.info("billable_work_deferred", job=job, org_id=org_id)
    return True


async def record_webhook(database: Database, body: dict[str, Any]) -> bool:
    """Persist the receipt in its own transaction. True when this event id is new."""
    async with database.sessionmaker() as session:
        enforce_app_role(session)
        async with session.begin():
            inserted = (
                await session.execute(
                    text(
                        "SELECT app_billing_record_webhook(:event_id, :notification_id, "
                        ":event_type, :occurred_at, CAST(:payload AS jsonb))"
                    ),
                    {
                        "event_id": body["event_id"],
                        "notification_id": body.get("notification_id"),
                        "event_type": body["event_type"],
                        "occurred_at": occurred_at(body),
                        "payload": _json(body),
                    },
                )
            ).scalar_one()
    return bool(inserted)


def _json(body: dict[str, Any]) -> str:
    import json

    return json.dumps(body, separators=(",", ":"))


async def process_billing_event(ctx: dict[str, Any], event_id: str) -> str:
    settings: Settings = ctx["settings"]
    database: Database = ctx["db"]
    async with database.sessionmaker() as session:
        enforce_app_role(session)
        async with session.begin():
            row = (
                await session.execute(
                    text(
                        "SELECT event_type, occurred_at, payload, status "
                        "FROM app_billing_load_webhook(:event_id)"
                    ),
                    {"event_id": event_id},
                )
            ).one_or_none()
    if row is None:
        return "missing"
    event_type, occurred, payload, status = row
    if status == "processed":
        return "duplicate"
    if not isinstance(payload, dict):
        await _mark(database, event_id, "failed", None, "payload")
        return "failed"
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    projection = project_event(str(event_type), data, occurred)
    org_id = await _resolve(database, settings, projection)
    if org_id is None:
        await _mark(database, event_id, "unresolved", None, "no_local_mapping")
        return "unresolved"
    async with tenant_transaction(database, org_id) as session:
        billing = (
            await session.execute(
                text("SELECT id FROM workspace_billing WHERE org_id = :org FOR UPDATE"),
                {"org": org_id},
            )
        ).first()
        if billing is None:
            session.add(WorkspaceBilling(org_id=org_id))
            await session.flush()
        stored = (
            await session.execute(
                text("SELECT id FROM workspace_billing WHERE org_id = :org FOR UPDATE"),
                {"org": org_id},
            )
        ).first()
        assert stored is not None  # noqa: S101
        model = await session.get(WorkspaceBilling, stored[0])
        assert model is not None  # noqa: S101
        if projection.event_at and not should_project(
            model.subscription_event_at, projection.event_at
        ):
            pass
        else:
            apply_projection(model, projection, settings)
        if projection.transaction_id and projection.checkout_status:
            checkout = await session.execute(
                text(
                    "UPDATE billing_checkouts SET status = :status "
                    "WHERE org_id = :org AND paddle_transaction_id = :txn "
                    "AND status IN ('open', 'ambiguous')"
                ),
                {
                    "status": projection.checkout_status,
                    "org": org_id,
                    "txn": projection.transaction_id,
                },
            )
            del checkout
    await _mark(database, event_id, "processed", org_id, None)
    return "processed"


async def _resolve(
    database: Database, settings: Settings, projection: BillingProjection
) -> uuid.UUID | None:
    async with database.sessionmaker() as session:
        enforce_app_role(session)
        async with session.begin():
            checkout_id = projection.checkout_id
            if checkout_id and projection.transaction_id:
                try:
                    uuid.UUID(checkout_id)
                except ValueError:
                    checkout_id = None
            if checkout_id and projection.transaction_id:
                await session.execute(
                    text("SELECT app_billing_attach_transaction(CAST(:checkout AS uuid), :txn)"),
                    {"checkout": checkout_id, "txn": projection.transaction_id},
                )
            org = (
                await session.execute(
                    text("SELECT app_billing_resolve_org(:txn, :customer, :subscription)"),
                    {
                        "txn": projection.transaction_id,
                        "customer": projection.customer_id,
                        "subscription": projection.subscription_id,
                    },
                )
            ).scalar_one_or_none()
    if org is None:
        return None
    return org if isinstance(org, uuid.UUID) else uuid.UUID(str(org))


async def _mark(
    database: Database,
    event_id: str,
    status: str,
    org_id: uuid.UUID | None,
    detail: str | None,
) -> None:
    async with database.sessionmaker() as session:
        enforce_app_role(session)
        async with session.begin():
            await session.execute(
                text("SELECT app_billing_mark_webhook(:event_id, :status, :org, :detail)"),
                {
                    "event_id": event_id,
                    "status": status,
                    "org": org_id,
                    "detail": detail,
                },
            )


async def reconcile_billing(ctx: dict[str, Any]) -> None:
    """Re-drive receipts that were stored before projection, then refresh known subscriptions."""
    settings: Settings = ctx["settings"]
    database: Database = ctx["db"]
    if not settings.paddle_configured:
        return
    async with database.sessionmaker() as session:
        enforce_app_role(session)
        async with session.begin():
            events = (
                (
                    await session.execute(
                        text("SELECT event_id FROM app_billing_unprocessed(:limit)"),
                        {"limit": settings.billing_reconcile_limit},
                    )
                )
                .scalars()
                .all()
            )
    for event_id in events:
        await process_billing_event(ctx, event_id)
    async with database.sessionmaker() as session:
        enforce_app_role(session)
        async with session.begin():
            targets = (
                await session.execute(
                    text(
                        "SELECT org_id, paddle_subscription_id "
                        "FROM app_billing_subscription_targets(:limit)"
                    ),
                    {"limit": settings.billing_reconcile_limit},
                )
            ).all()
    paddle = PaddleClient(settings)
    try:
        for org_id, subscription_id in targets:
            try:
                remote = await paddle.get_subscription(subscription_id)
            except PaddleCallError:
                log.warning("billing_reconcile_skipped", subscription_id=subscription_id)
                continue
            projection = project_event("subscription.updated", remote, datetime.now(UTC))
            async with tenant_transaction(database, org_id) as tenant:
                row = (
                    await tenant.execute(
                        text("SELECT id FROM workspace_billing WHERE org_id = :org FOR UPDATE"),
                        {"org": org_id},
                    )
                ).scalar_one_or_none()
                if row is None:
                    continue
                model = await tenant.get(WorkspaceBilling, row)
                if model is not None:
                    apply_projection(model, projection, settings)
    finally:
        await paddle.aclose()


async def schedule_billing_reminders(ctx: dict[str, Any]) -> None:
    """A reminder hook. It does not send, and it marks nothing delivered."""
    del ctx
    sender = sms_sender()
    if sender.available:
        return
    log.info("billing_sms_unavailable")
