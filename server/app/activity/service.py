"""Read and write the activity tables. Callers already sit in a tenant transaction."""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import ApiProblem
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


async def list_runs(
    session: AsyncSession, org_id: uuid.UUID, settings: Settings
) -> list[dict[str, Any]]:
    await release_queued(session, org_id, settings)
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


def run_cost(body: dict[str, Any]) -> int:
    """Same estimate the new-run form shows: people lookups plus email checks."""
    limit = body.get("limit")
    bar = body.get("enrichAt")
    if isinstance(limit, bool) or not isinstance(limit, int) or limit <= 0:
        return 0
    if isinstance(bar, bool) or not isinstance(bar, int):
        bar = 70
    share = 0.18 if bar >= 80 else 0.34 if bar >= 70 else 0.52
    lookups = round(limit * share)
    return lookups + round(lookups * 1.6)


def discovery_prompt(body: dict[str, Any]) -> str:
    criteria = body.get("criteria") if isinstance(body.get("criteria"), dict) else {}
    industries = criteria.get("industries") if isinstance(criteria.get("industries"), list) else []
    countries = criteria.get("countries") if isinstance(criteria.get("countries"), list) else []
    sizes = criteria.get("sizes") if isinstance(criteria.get("sizes"), list) else []
    product = body.get("product")
    product = product if isinstance(product, str) and product else "the product"
    name = body.get("name")
    name = name if isinstance(name, str) and name else "Discovery"
    limit = body.get("limit")
    limit = limit if isinstance(limit, int) and not isinstance(limit, bool) else 100
    bar = body.get("enrichAt")
    bar = bar if isinstance(bar, int) and not isinstance(bar, bool) else 70
    industry = ", ".join(str(item) for item in industries) or "any"
    country = ", ".join(str(item) for item in countries) or "any"
    size = ", ".join(str(item) for item in sizes) or "any"
    return (
        f"Discovery run “{name}” for {product}. Find up to {limit} companies. "
        f"Industries: {industry}. Countries: {country}. Sizes: {size}. "
        f"Find people when fit is at least {bar}."
    )


async def submit_discovery(
    settings: Settings, org_id: uuid.UUID, run_id: uuid.UUID, prompt: str
) -> None:
    """Hand the run to Pi. No token means this process is not wired to Pi."""
    token = settings.pi_service_token.get_secret_value()
    if not token:
        return
    deadline = (datetime.now(UTC) + timedelta(minutes=25)).isoformat()
    try:
        async with httpx.AsyncClient(
            base_url=settings.pi_service_url.rstrip("/"),
            timeout=8,
            headers={"Authorization": f"Bearer {token}"},
        ) as client:
            response = await client.put(
                f"/discovery/{org_id}/{run_id}",
                json={
                    "org_id": str(org_id),
                    "run_id": str(run_id),
                    "prompt": prompt,
                    "deadline": deadline,
                },
            )
    except httpx.HTTPError as exc:
        raise ApiProblem(
            502, "pi_unavailable", "Pi did not start this run. Try again in a moment."
        ) from exc
    if response.status_code >= 400:
        raise ApiProblem(
            502, "pi_unavailable", "Pi did not accept this run. Try again in a moment."
        )


def _charge(org: Organization, cost: int) -> None:
    left = org.discovery_credit_month - org.discovery_credit_used
    if cost > left:
        raise ApiProblem(
            402,
            "credits",
            f"This run needs about {cost} credits and {left} are left this month.",
        )
    org.discovery_credit_used += cost


def _running_document(body: dict[str, Any], cost: int) -> dict[str, Any]:
    waiting = {"done": 0, "total": None, "state": "waiting"}
    document = {k: v for k, v in body.items() if k not in {"id", "name", "status", "failure"}} | {
        "status": "running",
        "started": "just now",
        "credits": {"used": cost, "estimate": cost},
        "stages": {
            "search": {"done": 0, "total": None, "state": "running"},
            "read": waiting,
            "score": waiting,
            "people": waiting,
            "verify": waiting,
        },
    }
    return document


async def release_queued(session: AsyncSession, org_id: uuid.UUID, settings: Settings) -> None:
    """Send runs that were left queued straight to Pi and spend their credits."""
    if not settings.pi_service_token.get_secret_value():
        return
    org = await session.get(Organization, org_id, with_for_update=True)
    if org is None:
        return
    rows = (
        (
            await session.execute(
                select(DiscoveryRun)
                .where(DiscoveryRun.org_id == org_id, DiscoveryRun.status == "queued")
                .with_for_update(skip_locked=True)
            )
        )
        .scalars()
        .all()
    )
    for row in rows:
        doc = _doc(row)
        cost = run_cost(doc)
        charged = False
        try:
            _charge(org, cost)
            charged = True
            prompt = discovery_prompt({**doc, "name": row.name})
            await submit_discovery(settings, org_id, row.id, prompt)
        except ApiProblem as problem:
            if charged and cost:
                org.discovery_credit_used = max(0, org.discovery_credit_used - cost)
            row.status = "failed"
            title = (
                "Not enough credits" if problem.error == "credits" else "Pi did not start this run"
            )
            row.document = doc | {
                "status": "failed",
                "failure": {"title": title, "fix": problem.detail},
            }
            continue
        row.status = "running"
        row.document = _running_document({**doc, "name": row.name}, cost)


async def create_run(
    session: AsyncSession, org_id: uuid.UUID, body: dict[str, Any], settings: Settings
) -> dict[str, Any]:
    """Start the run on Pi and spend the credit estimate now."""
    org = await session.get(Organization, org_id, with_for_update=True)
    if org is None:
        raise ApiProblem(404, "not_found", "Workspace not found.")
    cost = run_cost(body)
    _charge(org, cost)
    document = _running_document(body, cost)
    row = DiscoveryRun(
        org_id=org_id,
        name=str(body.get("name") or "Untitled run"),
        status="running",
        document=document,
    )
    session.add(row)
    await session.flush()
    try:
        await submit_discovery(settings, org_id, row.id, discovery_prompt(body))
    except ApiProblem as problem:
        if cost:
            org.discovery_credit_used = max(0, org.discovery_credit_used - cost)
        row.status = "failed"
        row.document = document | {
            "status": "failed",
            "credits": {"used": 0, "estimate": cost},
            "failure": {"title": "Pi did not start this run", "fix": problem.detail},
        }
    return run_out(row)


# The log results the screen knows. Anything else reads as delivered ("ok").
LOG_RESULTS = ("ok", "failed", "retrying", "rejected", "duplicate")


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def log_out(row: IntegrationLog) -> dict[str, Any]:
    """One log row as the screen reads it: time, direction, event, result, one line."""
    doc = _doc(row)
    result = doc.get("result")
    event = doc.get("event")
    detail = doc.get("detail", doc.get("summary"))
    return {
        "id": str(row.id),
        "at": row.created_at.isoformat(),
        "dir": "in" if doc.get("dir") == "in" else "out",
        "event": event if isinstance(event, str) and event else "note",
        "result": result if result in LOG_RESULTS else "ok",
        "detail": detail if isinstance(detail, str) else None,
    }


async def _integration(
    session: AsyncSession, org_id: uuid.UUID, provider: str
) -> Integration | None:
    return (
        await session.execute(
            select(Integration).where(
                Integration.org_id == org_id, Integration.provider == provider
            )
        )
    ).scalar_one_or_none()


async def _last_logs(session: AsyncSession, org_id: uuid.UUID) -> dict[uuid.UUID, IntegrationLog]:
    """The newest log row of each integration, in one query."""
    rows = (
        (
            await session.execute(
                select(IntegrationLog)
                .where(IntegrationLog.org_id == org_id)
                .ext(distinct_on(IntegrationLog.integration_id))
                .order_by(IntegrationLog.integration_id, IntegrationLog.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return {row.integration_id: row for row in rows}


def _summary(row: Integration, last: IntegrationLog | None) -> dict[str, Any]:
    event = None
    if last is not None:
        entry = log_out(last)
        event = {"event": entry["event"], "at": entry["at"], "result": entry["result"]}
    return {
        "provider": row.provider,
        "status": row.status,
        "config": row.config,
        "connectedAt": _iso(row.connected_at),
        "lastEvent": event,
    }


def _account(config: dict[str, Any]) -> dict[str, str] | None:
    """The account on the other side, if the connect flow stored what the integration reported."""
    raw = config.get("account")
    if not isinstance(raw, dict) or not isinstance(raw.get("name"), str) or not raw["name"]:
        return None
    out = {"name": raw["name"]}
    if isinstance(raw.get("email"), str) and raw["email"]:
        out["email"] = raw["email"]
    return out


def _problem(row: Integration) -> dict[str, Any] | None:
    kind = {"reauth": "token-expired", "error": "refused"}.get(row.status)
    if kind is None:
        return None
    return {"kind": kind, "since": _iso(row.status_at or row.updated_at)}


def detail_out(row: Integration, last: IntegrationLog | None) -> dict[str, Any]:
    """What a connected integration's page reads. Logs come from /logs, so they can load after."""
    return {
        **_summary(row, last),
        "id": row.provider,
        "account": _account(row.config),
        "connectedById": str(row.connected_by) if row.connected_by is not None else None,
        "statusAt": _iso(row.status_at),
        "problem": _problem(row),
        "mapping": row.mapping if row.provider == "phoenix" else None,
        # Corral holds no credential for any of them yet, so nothing can be sent a test.
        "supportsTest": False,
    }


async def list_integrations(session: AsyncSession, org_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = (
        (await session.execute(select(Integration).where(Integration.org_id == org_id)))
        .scalars()
        .all()
    )
    last = await _last_logs(session, org_id)
    return [_summary(row, last.get(row.id)) for row in rows]


async def integration_detail(
    session: AsyncSession, org_id: uuid.UUID, provider: str
) -> dict[str, Any] | None:
    """None for an unknown provider. One never connected reads as off, with nothing in it."""
    if provider not in PROVIDERS:
        return None
    row = await _integration(session, org_id, provider)
    if row is None:
        row = Integration(org_id=org_id, provider=provider, status="off", config={})
        return detail_out(row, None)
    last = await _last_logs(session, org_id)
    return detail_out(row, last.get(row.id))


async def upsert_integration(
    session: AsyncSession,
    org_id: uuid.UUID,
    provider: str,
    *,
    status: str,
    config: dict[str, Any] | None,
    user_id: uuid.UUID | None = None,
) -> dict[str, Any] | None:
    if provider not in PROVIDERS:
        return None
    now = datetime.now(UTC)
    row = await _integration(session, org_id, provider)
    if row is None:
        row = Integration(org_id=org_id, provider=provider, status="off", config=config or {})
        session.add(row)
    elif config is not None:
        row.config = config
    if row.status_at is None or status != row.status:
        row.status_at = now
    if status == "connected" and (row.status == "off" or row.connected_at is None):
        row.connected_at, row.connected_by = now, user_id
    elif status == "off":
        row.connected_at, row.connected_by = None, None
    row.status = status
    await session.flush()
    return {"provider": row.provider, "status": row.status, "config": row.config}


async def save_mapping(
    session: AsyncSession, org_id: uuid.UUID, provider: str, rows: list[dict[str, Any]]
) -> dict[str, Any] | str:
    """Phoenix's field mapping. An empty list goes back to Corral's defaults (null)."""
    if provider != "phoenix":
        return "no_mapping"
    row = await _integration(session, org_id, provider)
    if row is None or row.status == "off":
        return "not_connected"
    row.mapping = rows or None
    await session.flush()
    last = await _last_logs(session, org_id)
    return detail_out(row, last.get(row.id))


async def integration_logs(
    session: AsyncSession, org_id: uuid.UUID, provider: str
) -> list[dict[str, Any]]:
    row = await _integration(session, org_id, provider)
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
    return [log_out(item) for item in logs]


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
    first = dict(
        (
            await session.execute(
                select(McpCall.connection_id, func.min(McpCall.created_at))
                .where(McpCall.org_id == org_id)
                .group_by(McpCall.connection_id)
            )
        ).all()
    )
    # MCP sends no clientInfo Corral keeps: a connection reads by its name and its oldest call.
    return [connection_out(row) | {"firstCallAt": _iso(first.get(row.id))} for row in rows]


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
