"""Poll Postgres outbox: queue loss cannot lose a send. Ambiguous sends never auto-retry."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.activity import service as activity
from app.core.errors import ApiProblem
from app.db.session import tenant_transaction
from app.mail.provider import AutoSend, MailError
from app.mail.service import available, require_recipient
from app.models.activity import InboxMessage
from app.models.mail import MailDelivery, MailEvent

LABELS = {
    "queued": "Queued",
    "sending": "Submitting",
    "accepted": "Accepted by AutoSend",
    "sent": "Sent",
    "delivered": "Delivered",
    "failed": "Not sent",
    "uncertain": "Delivery uncertain · check AutoSend before resending",
    "bounced": "Bounced",
}


async def set_status(
    session: AsyncSession, row: MailDelivery, status: str, error: str | None = None
) -> None:
    row.status, row.error = status, error
    message = await session.get(InboxMessage, row.message_id)
    if message:
        message.document = {**message.document, "meta": f"{LABELS[status]} · Demo mailbox"}


async def deliver(ctx: dict[str, Any], org: uuid.UUID, delivery_id: uuid.UUID) -> None:
    settings = ctx["settings"]
    async with tenant_transaction(ctx["db"], org) as session:
        row = await session.get(MailDelivery, delivery_id, with_for_update=True)
        if row is None or row.status != "queued":
            return
        try:
            require_recipient(settings, org, row.recipient)
        except ApiProblem:
            await set_status(
                session, row, "failed", "Demo sender or recipient configuration changed."
            )
            return
        await set_status(session, row, "sending")
        recipient, subject, body = row.recipient, row.subject, row.body
        incoming = (
            await session.execute(
                select(InboxMessage)
                .where(
                    InboxMessage.org_id == org,
                    InboxMessage.thread_id == row.thread_id,
                    InboxMessage.direction == "them",
                )
                .order_by(InboxMessage.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        in_reply_to = incoming.document.get("rfc_message_id") if incoming else None
    # The sending state commits before the network call. No automatic replay on crash.
    try:
        provider_id = await AutoSend(settings).send(
            recipient, subject, body, in_reply_to=in_reply_to
        )
    except MailError as exc:
        async with tenant_transaction(ctx["db"], org) as session:
            row = await session.get(MailDelivery, delivery_id, with_for_update=True)
            if row:
                await set_status(session, row, "uncertain" if exc.uncertain else "failed", exc.code)
        return
    async with tenant_transaction(ctx["db"], org) as session:
        row = await session.get(MailDelivery, delivery_id, with_for_update=True)
        if row:
            row.provider_id = provider_id
            await set_status(session, row, "accepted")
            draft = await activity._draft(session, org, row.thread_id)
            if draft and draft.body == body:
                await session.delete(draft)


async def process_event(ctx: dict[str, Any], org: uuid.UUID, event_id: uuid.UUID) -> None:
    async with tenant_transaction(ctx["db"], org) as session:
        event = await session.get(MailEvent, event_id, with_for_update=True)
        if event is None or event.status not in ("pending", "unmatched"):
            return
        event.updated_at = datetime.now(UTC)
        kind, data = event.payload.get("type"), event.payload.get("data", {})
        if kind == "email.received":
            inbound_id = data.get("inboundEmailId")
            if not isinstance(inbound_id, str) or not inbound_id:
                event.status, event.detail = "ignored", "Missing inbound ID"
                return
            # Fingerprint uses this ID, not the delivery attempt ID, so replay is harmless.
            try:
                full = await AutoSend(ctx["settings"]).inbound(inbound_id)
            except MailError:
                return  # durable receipt stays pending
            sender = full.get("from", {}).get("email", "").lower()
            recipients = {
                x.get("email", "").lower() for x in full.get("to", []) if isinstance(x, dict)
            }
            if (
                sender not in {x.lower() for x in ctx["settings"].autosend_demo_recipients}
                or ctx["settings"].autosend_demo_reply_to.lower() not in recipients
                or full.get("spamVerdict") == "FAIL"
                or full.get("virusVerdict") == "FAIL"
            ):
                event.status, event.detail = (
                    "ignored",
                    "Recipient, sender or provider verdict rejected",
                )
                return
            outbound_id = full.get("inReplyToEmailActivityId") or data.get(
                "inReplyToEmailActivityId"
            )
            delivery = (
                (
                    await session.execute(
                        select(MailDelivery).where(
                            MailDelivery.org_id == org,
                            MailDelivery.provider_id == outbound_id,
                            MailDelivery.recipient == sender,
                        )
                    )
                ).scalar_one_or_none()
                if outbound_id
                else None
            )
            thread_id = delivery.thread_id if delivery else None
            parent = full.get("inReplyToInboundEmailId") or data.get("inReplyToInboundEmailId")
            if not thread_id and parent:
                previous = (
                    await session.execute(
                        select(InboxMessage).where(
                            InboxMessage.org_id == org,
                            InboxMessage.document["inbound_id"].astext == parent,
                        )
                    )
                ).scalar_one_or_none()
                if previous:
                    thread_id = previous.thread_id
            thread = await activity.get_thread(session, org, str(thread_id)) if thread_id else None
            if not thread or thread.document.get("email", "").lower() != sender:
                event.status, event.detail = (
                    "unmatched",
                    "No trusted outbound/thread mapping; retained for reconciliation",
                )
                return
            text = full.get("text")
            if not isinstance(text, str) or not text.strip():
                text = "This reply has no plain-text body. Read it in AutoSend."
            session.add(
                InboxMessage(
                    org_id=org,
                    thread_id=thread.id,
                    direction="them",
                    author=sender,
                    body=text[:20000],
                    at_label=str(full.get("receivedAt") or "Just now"),
                    document={
                        "inbound_id": inbound_id,
                        "rfc_message_id": full.get("messageId"),
                        "meta": "Received · Demo mailbox",
                    },
                )
            )
            thread.handled, thread.snoozed_until = False, None
            doc = dict(thread.document)
            doc.pop("snoozed", None)
            thread.document = {
                **doc,
                "unread": True,
                "snippet": text[:160],
                "time": "Just now",
                "draftStale": True,
            }
            event.status, event.detail = "processed", None
            return
        provider_id = data.get("emailId")
        status = {
            "email.sent": "sent",
            "email.delivered": "delivered",
            "email.bounced": "bounced",
        }.get(str(kind))
        if not status or not provider_id:
            event.status = "ignored"
            return
        delivery = (
            await session.execute(
                select(MailDelivery)
                .where(MailDelivery.org_id == org, MailDelivery.provider_id == provider_id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if not delivery:
            event.status = "unmatched"
            return
        try:
            at = datetime.fromisoformat(str(event.payload["createdAt"]).replace("Z", "+00:00"))
            if at.tzinfo is None:
                raise ValueError("timezone missing")
        except (ValueError, KeyError):
            event.status, event.detail = "ignored", "Invalid event time"
            return
        # A late sent event must not undo a confirmed delivery or bounce.
        if (delivery.event_at is None or at >= delivery.event_at) and (
            delivery.status not in ("delivered", "bounced") or status == "bounced"
        ):
            await set_status(session, delivery, status)
            delivery.event_at = at
        event.status = "processed"


async def poll_demo_mail(ctx: dict[str, Any]) -> None:
    settings = ctx["settings"]
    try:
        org = uuid.UUID(settings.autosend_demo_org_id)
    except ValueError:
        return
    if not available(settings, org):
        return
    async with tenant_transaction(ctx["db"], org) as session:
        stale = (
            await session.execute(
                select(MailDelivery)
                .where(
                    MailDelivery.org_id == org,
                    MailDelivery.status == "sending",
                    MailDelivery.updated_at < datetime.now(UTC) - timedelta(minutes=2),
                )
                .with_for_update()
            )
        ).scalars()
        for row in stale:
            await set_status(
                session, row, "uncertain", "Worker interrupted during provider submission."
            )
        pending = list(
            (
                await session.execute(
                    select(MailDelivery.id)
                    .where(MailDelivery.org_id == org, MailDelivery.status == "queued")
                    .order_by(MailDelivery.created_at)
                    .limit(10)
                )
            ).scalars()
        )
        events = list(
            (
                await session.execute(
                    select(MailEvent.id)
                    .where(MailEvent.org_id == org, MailEvent.status.in_(("pending", "unmatched")))
                    .order_by(MailEvent.updated_at)
                    .limit(30)
                )
            ).scalars()
        )
    for delivery_id in pending:
        await deliver(ctx, org, delivery_id)
    for event_id in events:
        await process_event(ctx, org, event_id)
