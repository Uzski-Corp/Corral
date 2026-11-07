import hashlib
import hmac
import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.activity import service as activity
from app.billing.entitlements import require_billable_work
from app.core.config import Settings
from app.core.errors import ApiProblem
from app.models.ai import AiRun
from app.models.domain import InboxThread
from app.models.knowledge import Product


def run_token(settings: Settings, org_id: uuid.UUID, run_id: uuid.UUID) -> str:
    return hmac.new(
        settings.pi_service_token.get_secret_value().encode(),
        f"corral-reply:{org_id}:{run_id}".encode(),
        hashlib.sha256,
    ).hexdigest()


async def thread_snapshot(
    session: AsyncSession, org: uuid.UUID, thread: InboxThread
) -> dict[str, Any]:
    messages = await activity._messages(session, org, thread.id)
    content = {
        "subject": thread.subject,
        "body": str(thread.document.get("body", ""))[:4000],
        "messages": [
            {"id": str(m.id), "from": m.direction, "body": m.body[:2000]} for m in messages[-10:]
        ],
    }
    content["version"] = hashlib.sha256(json.dumps(content, sort_keys=True).encode()).hexdigest()
    return content


async def start(
    session: AsyncSession,
    settings: Settings,
    org: uuid.UUID,
    thread_key: str,
    product_id: uuid.UUID,
    request_id: uuid.UUID,
) -> AiRun:
    if (
        not settings.pi_service_token.get_secret_value()
        or str(org) != settings.autosend_demo_org_id
    ):
        raise ApiProblem(
            503, "ai_unavailable", "Reply generation isn't configured for this workspace."
        )
    await require_billable_work(session, settings, org)
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": f"ai:{org}"}
    )
    thread = await activity.get_thread(session, org, thread_key)
    product = (
        await session.execute(
            select(Product).where(Product.id == product_id, Product.org_id == org)
        )
    ).scalar_one_or_none()
    if not thread or not product:
        raise ApiProblem(404, "not_found", "Thread or product not found.")
    existing = (
        await session.execute(
            select(AiRun).where(AiRun.org_id == org, AiRun.request_id == request_id)
        )
    ).scalar_one_or_none()
    if existing:
        if existing.thread_id != thread.id or existing.product_id != product_id:
            raise ApiProblem(409, "request_id_reused", "This request belongs to another draft.")
        return existing
    running = (
        await session.execute(
            select(func.count())
            .select_from(AiRun)
            .where(AiRun.org_id == org, AiRun.status.in_(("queued", "running", "canceling")))
        )
    ).scalar_one()
    if running >= 2:
        raise ApiProblem(429, "ai_busy", "Two drafts are already running. Wait or cancel one.")
    snapshot = await thread_snapshot(session, org, thread)
    snapshot["product"] = {"name": product.name, "description": (product.description or "")[:8000]}
    run = AiRun(
        org_id=org,
        request_id=request_id,
        thread_id=thread.id,
        product_id=product_id,
        snapshot=snapshot,
        status="queued",
        deadline=datetime.now(UTC) + timedelta(minutes=3),
    )
    session.add(run)
    await session.flush()
    return run


async def output(session: AsyncSession, org: uuid.UUID, row: AiRun) -> dict[str, Any]:
    thread = await activity.get_thread(session, org, str(row.thread_id))
    current = await thread_snapshot(session, org, thread) if thread else {}
    return {
        "id": str(row.id),
        "status": row.status,
        "error": row.error,
        "result": row.result,
        "stale": current.get("version") != row.snapshot.get("version"),
        "sources": [
            {"id": key, "name": value["source_name"], "text": value["text"]}
            for key, value in row.evidence.items()
        ],
    }
