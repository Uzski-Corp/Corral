"""Prepare durable, tenant-bound send intents; never send within an HTTP transaction."""

import uuid
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.activity import service as activity
from app.core.config import Settings
from app.core.errors import ApiProblem
from app.models.activity import InboxMessage
from app.models.domain import InboxThread
from app.models.mail import MailDelivery


def available(settings: Settings, org_id: uuid.UUID) -> bool:
    return bool(
        str(org_id) == settings.autosend_demo_org_id
        and settings.autosend_api_key.get_secret_value()
        and settings.autosend_demo_from
        and settings.autosend_demo_reply_to
        and settings.autosend_demo_recipients
    )


def require_recipient(settings: Settings, org_id: uuid.UUID, recipient: str) -> str:
    if not available(settings, org_id):
        raise ApiProblem(
            503, "demo_mail_unavailable", "The demo mailbox isn't configured for this workspace."
        )
    email = recipient.strip().lower()
    if email not in {s.strip().lower() for s in settings.autosend_demo_recipients}:
        raise ApiProblem(403, "demo_recipient_not_allowed", "Use an approved demo recipient.")
    return email


async def thread_result(
    session: AsyncSession, org_id: uuid.UUID, thread: InboxThread
) -> dict[str, Any]:
    return activity.thread_out(
        thread,
        await activity._messages(session, org_id, thread.id),
        await activity._draft(session, org_id, thread.id),
    )


async def enqueue_reply(
    session: AsyncSession,
    settings: Settings,
    org_id: uuid.UUID,
    request_id: uuid.UUID,
    body: str,
    *,
    thread_key: str | None = None,
    recipient: str | None = None,
    subject: str = "Corral demo",
) -> dict[str, Any]:
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"mail:{org_id}:{request_id}"},
    )
    old = (
        await session.execute(
            select(MailDelivery).where(
                MailDelivery.org_id == org_id, MailDelivery.request_id == request_id
            )
        )
    ).scalar_one_or_none()
    if old:
        thread = await activity.get_thread(session, org_id, str(old.thread_id))
        if (
            old.body != body
            or (
                thread_key
                and thread_key not in {str(old.thread_id), thread.slug if thread else None}
            )
            or (recipient and old.recipient != recipient.strip().lower())
            or (not thread_key and old.subject != subject)
        ):
            raise ApiProblem(
                409, "request_id_reused", "This request already belongs to a different message."
            )
        if thread is None:
            raise ApiProblem(404, "not_found", "Thread not found.")
        return await thread_result(session, org_id, thread)
    thread = await activity.get_thread(session, org_id, thread_key) if thread_key else None
    if thread_key and thread is None:
        raise ApiProblem(404, "not_found", "Thread not found.")
    if thread:
        if thread.document.get("transport") != "autosend_demo":
            raise ApiProblem(
                409, "mailbox_not_connected", "Use the demo mailbox to start a real conversation."
            )
        recipient = str(thread.document.get("email") or "")
        subject = thread.subject or subject
    recipient = require_recipient(settings, org_id, recipient or "")
    if not body.strip():
        raise ApiProblem(422, "empty_message", "Write a message before sending.")
    if thread is None:
        thread = InboxThread(
            org_id=org_id,
            subject=subject,
            document={
                "transport": "autosend_demo",
                "email": recipient,
                "name": recipient,
                "company": "Demo recipient",
                "avatar": "",
                "title": "",
                "fit": 0,
                "status": "Awaiting reply",
                "time": "Just now",
                "snippet": body[:160],
                "body": "",
                "receipts": [],
                "mailbox": settings.autosend_demo_from,
            },
        )
        session.add(thread)
        await session.flush()
    message = InboxMessage(
        org_id=org_id,
        thread_id=thread.id,
        direction="you",
        author="You",
        body=body,
        at_label="Just now",
        document={"meta": "Queued · Demo mailbox"},
    )
    session.add(message)
    await session.flush()
    session.add(
        MailDelivery(
            org_id=org_id,
            thread_id=thread.id,
            message_id=message.id,
            request_id=request_id,
            recipient=recipient,
            subject=subject,
            body=body,
            status="queued",
        )
    )
    await session.flush()
    # Keep the draft until actual acceptance. A failed send must never erase it.
    return await thread_result(session, org_id, thread)
