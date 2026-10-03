"""Read and write the activity tables. Callers already sit in a tenant transaction."""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import (
    ApiKey,
    DiscoveryRun,
    InboxDraft,
    InboxMessage,
    Integration,
    IntegrationLog,
    Mailbox,
    McpCall,
    McpConnection,
)
from app.models.domain import InboxThread, Sequence
from app.models.identity import Organization

PROVIDERS = ("cal", "phoenix", "autosend")
ROTATE_OVERLAP = timedelta(hours=24)


async def _by_key[Keyed: (InboxThread, Sequence, ApiKey, McpConnection)](
    session: AsyncSession, model: type[Keyed], org_id: uuid.UUID, key: str
) -> Keyed | None:
    """A row by its uuid or, failing that, its slug. Always inside ``org_id``."""
    stmt = select(model).where(model.org_id == org_id)
    try:
        uid: uuid.UUID | None = uuid.UUID(key)
    except ValueError:
        uid = None
    if uid is not None:
        row = (await session.execute(stmt.where(model.id == uid))).scalar_one_or_none()
        if row is not None:
            return row
    return (await session.execute(stmt.where(model.slug == key))).scalar_one_or_none()


def public_id(row: Any) -> str:
    slug = getattr(row, "slug", None)
    return slug or str(row.id)


def _doc(row: Any) -> dict[str, Any]:
    raw = row.document
    return dict(raw) if isinstance(raw, dict) else {}


async def _threads(session: AsyncSession, org_id: uuid.UUID) -> list[InboxThread]:
    rows = (
        (
            await session.execute(
                select(InboxThread)
                .where(InboxThread.org_id == org_id)
                .order_by(InboxThread.created_at.desc())
                .limit(200)
            )
        )
        .scalars()
        .all()
    )
    return list(rows)


async def _messages(
    session: AsyncSession, org_id: uuid.UUID, thread_id: uuid.UUID
) -> list[InboxMessage]:
    rows = (
        (
            await session.execute(
                select(InboxMessage)
                .where(InboxMessage.org_id == org_id, InboxMessage.thread_id == thread_id)
                .order_by(InboxMessage.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    return list(rows)


async def _draft(
    session: AsyncSession, org_id: uuid.UUID, thread_id: uuid.UUID
) -> InboxDraft | None:
    return (
        await session.execute(
            select(InboxDraft).where(InboxDraft.org_id == org_id, InboxDraft.thread_id == thread_id)
        )
    ).scalar_one_or_none()


def thread_out(
    thread: InboxThread, messages: list[InboxMessage], draft: InboxDraft | None
) -> dict[str, Any]:
    doc = _doc(thread)
    doc["id"] = public_id(thread)
    if thread.subject:
        doc["subject"] = thread.subject
    doc["handled"] = thread.handled
    if thread.triage:
        doc["triage"] = thread.triage
    if thread.snoozed_until is not None:
        doc["snoozed"] = doc.get("snoozed") or thread.snoozed_until.isoformat()
    if messages:
        doc["history"] = [
            {
                "from": m.direction,
                "who": m.author,
                "at": m.at_label,
                "body": m.body,
                **(_doc(m)),
            }
            for m in messages
        ]
    if draft is not None:
        paras = _doc(draft).get("paras")
        doc["draft"] = (
            paras if isinstance(paras, list) else [p for p in draft.body.split("\n\n") if p]
        )
        doc["draftKind"] = draft.kind
    doc["needs_you"] = (
        not thread.handled and thread.snoozed_until is None and not doc.get("snoozed")
    )
    return doc


async def list_threads(
    session: AsyncSession, org_id: uuid.UUID, *, tab: str | None = None
) -> list[dict[str, Any]]:
    threads = await _threads(session, org_id)
    ids = [thread.id for thread in threads]
    messages: dict[uuid.UUID, list[InboxMessage]] = {i: [] for i in ids}
    drafts: dict[uuid.UUID, InboxDraft] = {}
    if ids:
        # Two queries for the page, not two per thread.
        for message in (
            await session.execute(
                select(InboxMessage)
                .where(InboxMessage.org_id == org_id, InboxMessage.thread_id.in_(ids))
                .order_by(InboxMessage.created_at.asc())
            )
        ).scalars():
            messages[message.thread_id].append(message)
        for draft in (
            await session.execute(
                select(InboxDraft).where(InboxDraft.org_id == org_id, InboxDraft.thread_id.in_(ids))
            )
        ).scalars():
            drafts[draft.thread_id] = draft
    out = []
    for thread in threads:
        item = thread_out(thread, messages[thread.id], drafts.get(thread.id))
        if tab == "needs" and not item["needs_you"]:
            continue
        if tab == "handled" and not thread.handled:
            continue
        out.append(item)
    return out


async def needs_you(session: AsyncSession, org_id: uuid.UUID) -> int:
    stmt = (
        select(func.count())
        .select_from(InboxThread)
        .where(
            InboxThread.org_id == org_id,
            InboxThread.handled.is_(False),
            InboxThread.snoozed_until.is_(None),
        )
    )
    return int((await session.execute(stmt)).scalar_one())


async def get_thread(session: AsyncSession, org_id: uuid.UUID, key: str) -> InboxThread | None:
    return await _by_key(session, InboxThread, org_id, key)


async def patch_thread(
    session: AsyncSession, org_id: uuid.UUID, key: str, patch: dict[str, Any]
) -> dict[str, Any] | None:
    thread = await get_thread(session, org_id, key)
    if thread is None:
        return None
    doc = _doc(thread)
    for field in ("triage", "status", "unread", "snoozed", "handled"):
        if field in patch:
            doc[field] = patch[field]
    if "handled" in patch and patch["handled"] is not None:
        thread.handled = bool(patch["handled"])
    if "triage" in patch:
        thread.triage = patch["triage"]
    if "snoozed" in patch:
        thread.snoozed_until = datetime.now(UTC) if patch["snoozed"] else None
        if not patch["snoozed"]:
            doc.pop("snoozed", None)
    thread.document = doc
    await session.flush()
    return thread_out(
        thread,
        await _messages(session, org_id, thread.id),
        await _draft(session, org_id, thread.id),
    )


async def send_reply(
    session: AsyncSession, org_id: uuid.UUID, key: str, body: str
) -> dict[str, Any] | None:
    """Record a reply. Nothing is handed to a mail server."""
    thread = await get_thread(session, org_id, key)
    if thread is None:
        return None
    session.add(
        InboxMessage(
            org_id=org_id,
            thread_id=thread.id,
            direction="you",
            author="You",
            body=body,
            at_label="Just now",
            document={"meta": "Sent"},
        )
    )
    draft = await _draft(session, org_id, thread.id)
    if draft is not None:
        await session.delete(draft)
    doc = _doc(thread)
    doc.pop("draft", None)
    thread.document = doc
    await session.flush()
    return thread_out(thread, await _messages(session, org_id, thread.id), None)


def sequence_out(row: Sequence) -> dict[str, Any]:
    doc = _doc(row)
    doc["id"] = public_id(row)
    doc["name"] = row.name
    doc["status"] = row.status
    return doc


async def list_sequences(session: AsyncSession, org_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = (
        (
            await session.execute(
                select(Sequence)
                .where(Sequence.org_id == org_id)
                .order_by(Sequence.created_at.desc())
                .limit(200)
            )
        )
        .scalars()
        .all()
    )
    return [sequence_out(row) for row in rows]


async def get_sequence(session: AsyncSession, org_id: uuid.UUID, key: str) -> Sequence | None:
    return await _by_key(session, Sequence, org_id, key)


class SlugTaken(Exception):
    """A new row asked for a public id this workspace already uses."""


async def save_sequence(
    session: AsyncSession,
    org_id: uuid.UUID,
    body: dict[str, Any],
    *,
    key: str | None = None,
    slug: str | None = None,
) -> dict[str, Any]:
    """Update the sequence ``key`` names, or create one; ``slug`` keeps the client's id."""
    row = await get_sequence(session, org_id, key) if key else None
    document = {k: v for k, v in body.items() if k not in {"id", "name", "status"}}
    if row is None:
        if slug is not None and await get_sequence(session, org_id, slug) is not None:
            raise SlugTaken(slug)
        row = Sequence(
            org_id=org_id,
            name=str(body.get("name") or "Untitled sequence"),
            slug=slug,
            status=str(body.get("status") or "draft"),
            document=document,
        )
        session.add(row)
    else:
        if "name" in body:
            row.name = str(body["name"])
        if "status" in body:
            row.status = str(body["status"])
        row.document = {**_doc(row), **document}
    await session.flush()
    return sequence_out(row)


def mailbox_out(row: Mailbox) -> dict[str, Any]:
    doc = _doc(row)
    doc.setdefault("id", str(row.id))
    doc["address"] = row.address
    doc["sentToday"] = row.sent_today
    doc["cap"] = row.daily_cap
    return doc


async def list_mailboxes(session: AsyncSession, org_id: uuid.UUID) -> dict[str, Any]:
    rows = (
        (
            await session.execute(
                select(Mailbox).where(Mailbox.org_id == org_id).order_by(Mailbox.address)
            )
        )
        .scalars()
        .all()
    )
    mailboxes = [mailbox_out(row) for row in rows]
    return {
        "mailboxes": mailboxes,
        "sent": sum(row.sent_today for row in rows),
        "cap": sum(row.daily_cap for row in rows),
        "attention": sum(1 for row in rows if row.attention),
    }


def run_out(row: DiscoveryRun) -> dict[str, Any]:
    doc = _doc(row)
    doc["id"] = public_id(row)
    doc["name"] = row.name
    doc["status"] = row.status
    return doc


async def list_runs(session: AsyncSession, org_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = (
        (
            await session.execute(
                select(DiscoveryRun)
                .where(DiscoveryRun.org_id == org_id)
                .order_by(DiscoveryRun.created_at.desc())
                .limit(200)
            )
        )
        .scalars()
        .all()
    )
    return [run_out(row) for row in rows]


async def credits(session: AsyncSession, org: Organization) -> dict[str, int]:
    month = org.discovery_credit_month
    used = org.discovery_credit_used
    return {"month": month, "used": used, "left": max(0, month - used)}


async def create_run(
    session: AsyncSession, org_id: uuid.UUID, body: dict[str, Any]
) -> dict[str, Any]:
    """A new run is queued. Nothing is crawled."""
    row = DiscoveryRun(
        org_id=org_id,
        name=str(body.get("name") or "Untitled run"),
        status="queued",
        document={k: v for k, v in body.items() if k not in {"id", "name", "status"}}
        | {"status": "queued"},
    )
    session.add(row)
    await session.flush()
    return run_out(row)


async def list_integrations(session: AsyncSession, org_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = (
        (await session.execute(select(Integration).where(Integration.org_id == org_id)))
        .scalars()
        .all()
    )
    return [{"provider": row.provider, "status": row.status, "config": row.config} for row in rows]


async def upsert_integration(
    session: AsyncSession,
    org_id: uuid.UUID,
    provider: str,
    *,
    status: str,
    config: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if provider not in PROVIDERS:
        return None
    row = (
        await session.execute(
            select(Integration).where(
                Integration.org_id == org_id, Integration.provider == provider
            )
        )
    ).scalar_one_or_none()
    if row is None:
        row = Integration(org_id=org_id, provider=provider, status=status, config=config or {})
        session.add(row)
    else:
        row.status = status
        if config is not None:
            row.config = config
    await session.flush()
    return {"provider": row.provider, "status": row.status, "config": row.config}


async def integration_logs(
    session: AsyncSession, org_id: uuid.UUID, provider: str
) -> list[dict[str, Any]]:
    row = (
        await session.execute(
            select(Integration).where(
                Integration.org_id == org_id, Integration.provider == provider
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return []
    logs = (
        (
            await session.execute(
                select(IntegrationLog)
                .where(IntegrationLog.org_id == org_id, IntegrationLog.integration_id == row.id)
                .order_by(IntegrationLog.created_at.desc())
                .limit(50)
            )
        )
        .scalars()
        .all()
    )
    return [_doc(item) for item in logs]


def _key_out(row: ApiKey) -> dict[str, Any]:
    # The document holds display extras (lastFrom, oldUntil). The columns are the truth.
    doc = {k: v for k, v in _doc(row).items() if k not in {"id", "secret", "secret_hash"}}
    return {
        **doc,
        "id": public_id(row),
        "name": row.name,
        "env": row.env,
        "last4": row.last4,
        "scopes": list(row.scopes),
        "by": row.created_by,
        "created": row.created_at.isoformat(),
        "expires": row.expires_at.isoformat() if row.expires_at else None,
        "revoked": row.revoked_at.isoformat() if row.revoked_at else None,
        "calls7d": row.calls_7d,
    }


async def list_keys(session: AsyncSession, org_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = (
        (
            await session.execute(
                select(ApiKey)
                .where(ApiKey.org_id == org_id)
                .order_by(ApiKey.created_at.desc())
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    return [_key_out(row) for row in rows]


def issue_secret(env: str) -> tuple[str, str, str]:
    """A new secret, its sha256 and its last four. Only the hash and last four are stored."""
    raw = secrets.token_urlsafe(24)
    prefix = "live" if env == "live" else "test"
    secret = f"crl_{prefix}_{raw}"
    digest = hashlib.sha256(secret.encode()).hexdigest()
    return secret, digest, secret[-4:]


async def create_key(
    session: AsyncSession,
    org_id: uuid.UUID,
    *,
    name: str,
    env: str,
    scopes: list[str],
    created_by: str,
    expires_at: datetime | None = None,
) -> dict[str, Any]:
    if env not in {"live", "test"}:
        raise ValueError(f"unknown key env {env!r}")
    secret, digest, last4 = issue_secret(env)
    row = ApiKey(
        org_id=org_id,
        name=name,
        env=env,
        last4=last4,
        secret_hash=digest,
        scopes=scopes,
        created_by=created_by,
        expires_at=expires_at,
        document={},
    )
    session.add(row)
    await session.flush()
    await session.refresh(row)
    return {**_key_out(row), "secret": secret}


async def get_key(session: AsyncSession, org_id: uuid.UUID, key: str) -> ApiKey | None:
    return await _by_key(session, ApiKey, org_id, key)


async def revoke_key(session: AsyncSession, org_id: uuid.UUID, key: str) -> dict[str, Any] | None:
    row = await get_key(session, org_id, key)
    if row is None:
        return None
    if row.revoked_at is None:  # revoking twice keeps the first time
        row.revoked_at = datetime.now(UTC)
        await session.flush()
    return _key_out(row)


async def rotate_key(
    session: AsyncSession, org_id: uuid.UUID, key: str, *, overlap: bool
) -> dict[str, Any] | None:
    """A new secret for the same key. ``oldUntil`` records the overlap the screen promises."""
    row = await get_key(session, org_id, key)
    if row is None or row.revoked_at is not None:
        return None
    secret, digest, last4 = issue_secret(row.env)
    row.secret_hash = digest
    row.last4 = last4
    doc = _doc(row)
    if overlap:
        doc["oldUntil"] = (datetime.now(UTC) + ROTATE_OVERLAP).isoformat()
    else:
        doc.pop("oldUntil", None)
    row.document = doc
    await session.flush()
    return {**_key_out(row), "secret": secret}


def connection_out(row: McpConnection) -> dict[str, Any]:
    doc = _doc(row)
    doc["id"] = public_id(row)
    doc["client"] = row.client
    doc["name"] = row.name
    return doc


async def list_connections(session: AsyncSession, org_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = (
        (
            await session.execute(
                select(McpConnection)
                .where(McpConnection.org_id == org_id)
                .order_by(McpConnection.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [connection_out(row) for row in rows]


async def create_connection(
    session: AsyncSession, org_id: uuid.UUID, body: dict[str, Any]
) -> dict[str, Any]:
    row = McpConnection(
        org_id=org_id,
        client=str(body.get("client") or "cursor"),
        name=str(body.get("name") or "Connection"),
        document={k: v for k, v in body.items() if k not in {"id", "client", "name"}},
    )
    session.add(row)
    await session.flush()
    return connection_out(row)


async def delete_connection(session: AsyncSession, org_id: uuid.UUID, key: str) -> bool:
    row = await _by_key(session, McpConnection, org_id, key)
    if row is None:
        return False
    await session.delete(row)
    await session.flush()
    return True


async def list_calls(
    session: AsyncSession, org_id: uuid.UUID, key: str
) -> list[dict[str, Any]] | None:
    """The connection's last calls, newest first. ``None`` when there is no such connection."""
    row = await _by_key(session, McpConnection, org_id, key)
    if row is None:
        return None
    calls = (
        (
            await session.execute(
                select(McpCall)
                .where(McpCall.org_id == org_id, McpCall.connection_id == row.id)
                .order_by(McpCall.created_at.desc())
                .limit(50)
            )
        )
        .scalars()
        .all()
    )
    return [_doc(call) for call in calls]
