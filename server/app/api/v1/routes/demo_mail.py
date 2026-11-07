"""One configured, tenant-bound demo mailbox. This is not a public mail relay."""

import hashlib
import json
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.auth.deps import AuthContextDep, DbDep, SettingsDep, require_trusted_origin
from app.core.errors import ApiProblem
from app.db.session import get_database, tenant_transaction
from app.mail.jobs import set_status
from app.mail.provider import verify_signature
from app.mail.service import available, enqueue_reply, require_recipient
from app.models.mail import MailDelivery, MailEvent

router = APIRouter(prefix="/inbox/demo", tags=["demo mailbox"])
webhook_router = APIRouter(prefix="/inbox/webhooks", tags=["mail webhooks"])
WRITE = [Depends(require_trusted_origin)]


class ComposeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: uuid.UUID
    recipient: EmailStr
    subject: str = Field(min_length=1, max_length=500)
    body: str = Field(min_length=1, max_length=20000)


@router.get("")
async def snapshot(ctx: AuthContextDep, db: DbDep, settings: SettingsDep) -> dict[str, Any]:
    enabled = available(settings, ctx.org.id)
    rows = list(
        (
            await db.execute(
                select(MailDelivery)
                .where(MailDelivery.org_id == ctx.org.id)
                .order_by(MailDelivery.created_at.desc())
                .limit(30)
            )
        ).scalars()
    )
    return {
        "available": enabled,
        "sender": settings.autosend_demo_from if enabled else None,
        "recipients": settings.autosend_demo_recipients if enabled else [],
        "can_compose": ctx.role in ("owner", "admin"),
        "deliveries": [
            {
                "id": str(r.id),
                "thread_id": str(r.thread_id),
                "recipient": r.recipient,
                "subject": r.subject,
                "status": r.status,
                "error": r.error,
                "provider_id": r.provider_id,
            }
            for r in rows
        ],
    }


@router.post("/compose", dependencies=WRITE, status_code=202)
async def compose(
    ctx: AuthContextDep, db: DbDep, settings: SettingsDep, body: ComposeIn
) -> dict[str, Any]:
    if ctx.role not in ("owner", "admin"):
        raise ApiProblem(403, "forbidden", "An owner or admin can start a demo conversation.")
    return await enqueue_reply(
        db,
        settings,
        ctx.org.id,
        body.request_id,
        body.body,
        recipient=str(body.recipient),
        subject=body.subject,
    )


@router.post("/deliveries/{delivery_id}/retry", dependencies=WRITE)
async def retry(
    ctx: AuthContextDep, db: DbDep, settings: SettingsDep, delivery_id: uuid.UUID
) -> dict[str, str]:
    if ctx.role not in ("owner", "admin"):
        raise ApiProblem(403, "forbidden", "An owner or admin can retry delivery.")
    row = (
        await db.execute(
            select(MailDelivery)
            .where(MailDelivery.id == delivery_id, MailDelivery.org_id == ctx.org.id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        raise ApiProblem(404, "not_found", "Delivery not found.")
    if row.status != "failed" or row.provider_id:
        raise ApiProblem(
            409,
            "retry_unsafe",
            "Only a confirmed submission failure can be retried. "
            "Check AutoSend for uncertain delivery.",
        )
    require_recipient(settings, ctx.org.id, row.recipient)
    await set_status(db, row, "queued")
    return {"status": "queued"}


@webhook_router.post("/autosend")
async def webhook(request: Request) -> dict[str, bool]:
    settings = request.app.state.settings
    secret = settings.autosend_webhook_secret.get_secret_value()
    try:
        org = uuid.UUID(settings.autosend_demo_org_id)
    except ValueError as exc:
        raise ApiProblem(
            503, "demo_mail_unavailable", "The demo mailbox is not configured."
        ) from exc
    if not secret:
        raise ApiProblem(503, "demo_mail_unavailable", "The webhook secret is not configured.")
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 256 * 1024:
            raise ApiProblem(413, "payload_too_large", "Webhook payload too large.")
    if not verify_signature(bytes(raw), request.headers.get("x-webhook-signature"), secret):
        raise ApiProblem(401, "invalid_signature", "Webhook signature rejected.")
    try:
        payload = json.loads(raw)
        if (
            not isinstance(payload, dict)
            or not isinstance(payload.get("data"), dict)
            or not isinstance(payload.get("type"), str)
        ):
            raise ValueError("invalid event")
    except (ValueError, UnicodeDecodeError) as exc:
        raise ApiProblem(400, "invalid_event", "Webhook event is invalid.") from exc
    # Delivery headers are unsigned. Deduplicate using the signed payload itself.
    inbound_id = (
        payload["data"].get("inboundEmailId") if payload["type"] == "email.received" else None
    )
    identity = (
        f"inbound:{inbound_id}"
        if inbound_id
        else json.dumps(payload, sort_keys=True, separators=(",", ":"))
    )
    fingerprint = hashlib.sha256(identity.encode()).hexdigest()
    async with tenant_transaction(get_database(request), org) as db:
        await db.execute(
            insert(MailEvent)
            .values(org_id=org, fingerprint=fingerprint, payload=payload, status="pending")
            .on_conflict_do_nothing(index_elements=["org_id", "fingerprint"])
        )
    return {"received": True}
