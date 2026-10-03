"""Fill one existing workspace with the ColdTrace story. Re-running updates in place.

A brand-new account is untouched: ``provision_identity`` does not call ``seed_org``.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.activity.service import issue_secret
from app.leads.normalize import name_key
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
from app.models.crm import Company, CompanyFit
from app.models.domain import InboxThread, Lead, Segment, Sequence
from app.models.identity import Organization
from app.models.knowledge import KbSource, Product


async def _one(session: AsyncSession, stmt: Any) -> Any:
    return (await session.execute(stmt)).scalar_one_or_none()


async def seed_org(
    session: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID | None
) -> str | None:
    """Idempotent ColdTrace corpus for ``org_id``.

    Returns the demo API key's secret the first time it is made (only its hash is stored), and
    ``None`` on a re-run, when the key already exists. The secret is random per workspace: a
    fixed one in the source would be a key anyone with the repo could use.
    """
    org = await session.get(Organization, org_id)
    if org is None:
        raise LookupError(f"no organization {org_id}")
    org.discovery_credit_month = 2000
    org.discovery_credit_used = 540

    product = await _one(
        session,
        select(Product).where(Product.org_id == org_id, Product.name == "ColdTrace Sensors"),
    )
    if product is None:
        product = Product(
            org_id=org_id,
            name="ColdTrace Sensors",
            description="Wireless cold-room sensors that call the duty manager within two minutes.",
        )
        session.add(product)
        await session.flush()

    for name, words in (
        ("ColdTrace pitch 2026.md", 420),
        ("Pricing and terms.md", 180),
    ):
        existing = await _one(
            session,
            select(KbSource).where(
                KbSource.org_id == org_id, KbSource.product_id == product.id, KbSource.name == name
            ),
        )
        if existing is None:
            session.add(
                KbSource(
                    org_id=org_id,
                    product_id=product.id,
                    kind="md",
                    name=name,
                    status="ready",
                    stage_pct=100,
                    passage_count=4,
                    word_count=words,
                    heading_count=2,
                    generation=1,
                    attempts=1,
                    added_by_user_id=user_id,
                )
            )

    companies: dict[str, Company] = {}
    for spec in _COMPANIES:
        row = await _one(
            session,
            select(Company).where(Company.org_id == org_id, Company.domain == spec["domain"]),
        )
        if row is None:
            row = Company(
                org_id=org_id,
                domain=spec["domain"],
                name_key=name_key(spec["name"]),
                **_company(spec),
            )
            session.add(row)
            await session.flush()
        else:
            for key, value in _company(spec).items():
                setattr(row, key, value)
            row.name_key = name_key(spec["name"])
        companies[spec["domain"]] = row
        fit = await _one(
            session,
            select(CompanyFit).where(
                CompanyFit.org_id == org_id,
                CompanyFit.company_id == row.id,
                CompanyFit.product_id == product.id,
            ),
        )
        if fit is None:
            session.add(
                CompanyFit(
                    org_id=org_id, company_id=row.id, product_id=product.id, score=spec["fit"]
                )
            )
        else:
            fit.score = spec["fit"]

    for spec in _PEOPLE:
        row = await _one(
            session, select(Lead).where(Lead.org_id == org_id, Lead.email == spec["email"])
        )
        company = companies[spec["domain"]]
        fields = {
            "first_name": spec["first"],
            "last_name": spec["last"],
            "title": spec["title"],
            "company_name": company.name,
            "company_id": company.id,
            "email_status": "verified",
            "is_primary": True,
            "source": "manual",
        }
        if row is None:
            session.add(Lead(org_id=org_id, email=spec["email"], **fields))
        else:
            for key, value in fields.items():
                setattr(row, key, value)

    for name, rules in _SEGMENTS:
        row = await _one(
            session, select(Segment).where(Segment.org_id == org_id, Segment.name == name)
        )
        if row is None:
            session.add(Segment(org_id=org_id, name=name, rules=rules, match="all"))
        else:
            row.rules = rules

    for spec in _THREADS:
        row = await _one(
            session,
            select(InboxThread).where(
                InboxThread.org_id == org_id, InboxThread.slug == spec["slug"]
            ),
        )
        if row is None:
            row = InboxThread(org_id=org_id, slug=spec["slug"], subject=spec["subject"])
            session.add(row)
        row.subject = spec["subject"]
        row.handled = spec["handled"]
        row.triage = spec.get("triage")
        row.document = spec["document"]
        await session.flush()
        await _replace_messages(session, org_id, row.id, spec["messages"])
        await _replace_draft(session, org_id, row.id, spec.get("draft"))

    for spec in _SEQUENCES:
        row = await _one(
            session,
            select(Sequence).where(Sequence.org_id == org_id, Sequence.slug == spec["slug"]),
        )
        if row is None:
            row = Sequence(org_id=org_id, slug=spec["slug"], name=spec["name"])
            session.add(row)
        row.name = spec["name"]
        row.status = spec["status"]
        row.document = spec["document"]

    for spec in _MAILBOXES:
        row = await _one(
            session,
            select(Mailbox).where(Mailbox.org_id == org_id, Mailbox.address == spec["address"]),
        )
        if row is None:
            row = Mailbox(org_id=org_id, address=spec["address"])
            session.add(row)
        row.sent_today = spec["sent"]
        row.daily_cap = spec["cap"]
        row.attention = spec["attention"]
        row.document = spec["document"]

    for spec in _RUNS:
        row = await _one(
            session,
            select(DiscoveryRun).where(
                DiscoveryRun.org_id == org_id, DiscoveryRun.slug == spec["slug"]
            ),
        )
        if row is None:
            row = DiscoveryRun(org_id=org_id, slug=spec["slug"], name=spec["name"])
            session.add(row)
        row.name = spec["name"]
        row.status = spec["status"]
        row.document = spec["document"]

    for provider, status, note in (
        ("cal", "connected", "Cal.com booking link is on."),
        ("phoenix", "connected", "Deals open in Phoenix."),
        ("autosend", "connected", "Before-your-call journey is on."),
    ):
        row = await _one(
            session,
            select(Integration).where(
                Integration.org_id == org_id, Integration.provider == provider
            ),
        )
        if row is None:
            now = datetime.now(UTC)
            row = Integration(
                org_id=org_id,
                provider=provider,
                status=status,
                config={},
                connected_at=now,
                connected_by=user_id,
                status_at=now,
            )
            session.add(row)
            await session.flush()
            session.add(
                IntegrationLog(
                    org_id=org_id,
                    integration_id=row.id,
                    document={"dir": "out", "event": "connected", "result": "ok", "detail": note},
                )
            )
        else:
            row.status = status

    secret: str | None = None
    api_key = await _one(
        session, select(ApiKey).where(ApiKey.org_id == org_id, ApiKey.slug == "key_n8n")
    )
    if api_key is None:
        secret, digest, last4 = issue_secret("live")
        api_key = ApiKey(
            org_id=org_id,
            slug="key_n8n",
            name="n8n lead sync",
            env="live",
            last4=last4,
            secret_hash=digest,
            scopes=["leads:read", "leads:write", "segments:read"],
            created_by="Tomás Ibarra",
            calls_7d=1204,
            document={"lastFrom": "n8n Cloud"},
        )
        session.add(api_key)

    conn = await _one(
        session,
        select(McpConnection).where(
            McpConnection.org_id == org_id, McpConnection.slug == "cn_cursor"
        ),
    )
    if conn is None:
        conn = McpConnection(
            org_id=org_id,
            slug="cn_cursor",
            client="cursor",
            name="Cursor",
            document={
                "device": "Tomas's MacBook Pro",
                "auth": "oauth",
                "health": "ok",
                "calls7d": 212,
            },
        )
        session.add(conn)
        await session.flush()
        session.add(
            McpCall(
                org_id=org_id,
                connection_id=conn.id,
                document={
                    "at": "09:41:12",
                    "tool": "get_thread",
                    "args": "brian",
                    "status": 200,
                    "ms": 182,
                },
            )
        )

    await session.flush()
    return secret


async def _replace_messages(
    session: AsyncSession, org_id: uuid.UUID, thread_id: uuid.UUID, messages: list[dict[str, str]]
) -> None:
    existing = (
        (
            await session.execute(
                select(InboxMessage).where(
                    InboxMessage.org_id == org_id, InboxMessage.thread_id == thread_id
                )
            )
        )
        .scalars()
        .all()
    )
    if existing:
        return
    for message in messages:
        session.add(
            InboxMessage(
                org_id=org_id,
                thread_id=thread_id,
                direction=message["from"],
                author=message["who"],
                body=message["body"],
                at_label=message["at"],
                document={"note": message.get("note", ""), "meta": message.get("meta", "")},
            )
        )


async def _replace_draft(
    session: AsyncSession, org_id: uuid.UUID, thread_id: uuid.UUID, body: str | None
) -> None:
    row = await _one(
        session,
        select(InboxDraft).where(InboxDraft.org_id == org_id, InboxDraft.thread_id == thread_id),
    )
    if body is None:
        if row is not None:
            await session.delete(row)
        return
    if row is None:
        session.add(
            InboxDraft(
                org_id=org_id,
                thread_id=thread_id,
                body=body,
                kind="ready",
                document={"paras": [body]},
            )
        )
    else:
        row.body = body


def _company(spec: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": spec["name"],
        "country": spec["country"],
        "size": spec["size"],
        "industry": spec["industry"],
        "source": "manual",
        "reply_status": spec["reply"],
        "reply_status_set_by": "corral",
    }


_COMPANIES: list[dict[str, Any]] = [
    {
        "name": "Kilima Dairies",
        "domain": "kilima.co.ke",
        "country": "Kenya",
        "size": "51-200",
        "industry": "Dairy",
        "reply": "interested",
        "fit": 91,
    },
    {
        "name": "Pwani Fresh",
        "domain": "pwanifresh.com",
        "country": "Kenya",
        "size": "201-1000",
        "industry": "Seafood",
        "reply": "interested",
        "fit": 88,
    },
    {
        "name": "Nyota Beverages",
        "domain": "nyota.co.tz",
        "country": "Tanzania",
        "size": "201-1000",
        "industry": "Beverages",
        "reply": "meeting_booked",
        "fit": 84,
    },
    {
        "name": "Rift Valley Grain",
        "domain": "rvgrain.co.ke",
        "country": "Kenya",
        "size": "51-200",
        "industry": "Bakery",
        "reply": "ooo",
        "fit": 76,
    },
    {
        "name": "Tamu Bakeries",
        "domain": "tamubakeries.ug",
        "country": "Uganda",
        "size": "51-200",
        "industry": "Bakery",
        "reply": "not_interested",
        "fit": 71,
    },
    {
        "name": "Savanna Juice",
        "domain": "savannajuice.africa",
        "country": "Kenya",
        "size": "1-50",
        "industry": "Beverages",
        "reply": "contacted",
        "fit": 80,
    },
]

_PEOPLE = [
    {
        "email": "wanjiru@kilima.co.ke",
        "first": "Wanjiru",
        "last": "Mwangi",
        "title": "Operations Director",
        "domain": "kilima.co.ke",
    },
    {
        "email": "brian@pwanifresh.com",
        "first": "Brian",
        "last": "Kamau",
        "title": "Cold Chain Lead",
        "domain": "pwanifresh.com",
    },
    {
        "email": "grace@nyota.co.tz",
        "first": "Grace",
        "last": "Holloway",
        "title": "VP Operations",
        "domain": "nyota.co.tz",
    },
    {
        "email": "daniel.weber@rvgrain.co.ke",
        "first": "Daniel",
        "last": "Weber",
        "title": "Plant Manager",
        "domain": "rvgrain.co.ke",
    },
    {
        "email": "reza@tamubakeries.ug",
        "first": "Reza",
        "last": "Namazzi",
        "title": "Owner",
        "domain": "tamubakeries.ug",
    },
    {
        "email": "amara@savannajuice.africa",
        "first": "Amara",
        "last": "Diallo",
        "title": "Founder",
        "domain": "savannajuice.africa",
    },
]

_SEGMENTS = [
    (
        "F&B · East Africa",
        [{"field": "industry", "op": "is", "value": ["Dairy", "Seafood", "Beverages"]}],
    ),
    ("Replied, no meeting", [{"field": "reply", "op": "is", "value": ["interested", "objection"]}]),
]


def _thread(
    slug: str,
    name: str,
    company: str,
    title: str,
    email: str,
    fit: int,
    status: str,
    snippet: str,
    subject: str,
    body: str,
    **extra: Any,
) -> dict[str, Any]:
    document = {
        "name": name,
        "company": company,
        "title": title,
        "email": email,
        "fit": fit,
        "status": status,
        "snippet": snippet,
        "body": body,
        "avatar": "",
        "receipts": [],
        "time": extra.pop("time", "09:12"),
        "unread": extra.pop("unread", False),
    }
    # History and the draft get their own rows; they don't belong in the thread's document.
    history = extra.pop("history", None)
    draft = extra.pop("draft_body", None)
    document.update(extra)
    return {
        "slug": slug,
        "subject": subject,
        "handled": document.get("handled", False),
        "triage": document.get("triage"),
        "document": document,
        "messages": history or [{"from": "them", "who": name, "at": "Today, 09:10", "body": body}],
        "draft": draft,
    }


_THREADS = [
    _thread(
        "brian",
        "Brian Kamau",
        "Pwani Fresh",
        "Cold Chain Lead",
        "brian@pwanifresh.com",
        88,
        "Interested",
        "Four rooms, fish and dairy — who gets the call?",
        "Re: Spoilage across your Mombasa cold rooms",
        "This is worth a look. Can you do Thursday?",
        unread=True,
        time="09:40",
        draft_body="Thursday works. I'll send a 20-minute link and the Kilima one-pager.",
        history=[
            {
                "from": "them",
                "who": "Brian Kamau",
                "at": "Today, 09:40",
                "body": "This is worth a look. Can you do Thursday?",
            }
        ],
    ),
    _thread(
        "wanjiru",
        "Wanjiru Mwangi",
        "Kilima Dairies",
        "Operations Director",
        "wanjiru@kilima.co.ke",
        91,
        "Interested",
        "Three Nakuru sites, one gateway each.",
        "Re: Spoilage found in the morning",
        "Send the pilot terms. Up to three rooms is what we can try this quarter.",
        time="08:55",
        history=[
            {
                "from": "them",
                "who": "Wanjiru Mwangi",
                "at": "Today, 08:55",
                "body": "Send the pilot terms. Up to three rooms is what we can try this quarter.",
            }
        ],
    ),
    _thread(
        "grace",
        "Grace Holloway",
        "Nyota Beverages",
        "VP Operations",
        "grace@nyota.co.tz",
        84,
        "Meeting booked",
        "Mercy asks two things before Thursday.",
        "Re: Thursday 10:30",
        "Booked for Thursday 10:30. Adding our QA lead, Mercy.",
        time="08:55",
        handoff={"meeting": "booked", "deal": "PX-2288", "nurture": "scheduled"},
        history=[
            {
                "from": "them",
                "who": "Grace Holloway",
                "at": "Yesterday, 16:20",
                "body": "Booked for Thursday 10:30. Adding our QA lead, Mercy.",
            }
        ],
    ),
    _thread(
        "daniel",
        "Daniel Weber",
        "Rift Valley Grain",
        "Plant Manager",
        "daniel.weber@rvgrain.co.ke",
        76,
        "OOO",
        "Out until 14 October.",
        "Automatic reply: out of office",
        "I am out of the office until 14 October.",
        handled=True,
        triage="ooo",
        time="07:12",
        history=[
            {
                "from": "them",
                "who": "Daniel Weber",
                "at": "Today, 07:12",
                "body": "I am out of the office until 14 October.",
            }
        ],
    ),
]

_SEQUENCES = [
    {
        "slug": "pilot",
        "name": "Cold-room pilot",
        "status": "running",
        "document": {
            "product": "ColdTrace Sensors",
            "audience": {"label": "F&B · East Africa", "count": 6},
            "steps": [
                {
                    "id": "p1",
                    "thread": "new",
                    "subject": "Three sites, one alert",
                    "body": "Hi {{first_name}},\n\nWorth 20 minutes?\n\n{{sender_first_name}}",
                },
                {
                    "id": "p2",
                    "thread": "reply",
                    "subject": "",
                    "body": "{{first_name}}, Kilima cut spoilage by 31% in a quarter.",
                },
            ],
            "window": "Their morning, 08:00-11:00",
            "by": "Tomás Ibarra",
            "updated": "Sep 14",
            "missing": {},
            "run": {
                "enrolled": 6,
                "active": 4,
                "replied": 3,
                "meetings": 1,
                "bounced": 0,
                "unsubscribed": 0,
            },
        },
    },
    {
        "slug": "proof",
        "name": "Dairy proof drip",
        "status": "paused",
        "document": {
            "product": "ColdTrace Sensors",
            "audience": {"label": "Replied, no meeting", "count": 2},
            "steps": [
                {
                    "id": "q1",
                    "thread": "new",
                    "subject": "What Kilima's audit looked like",
                    "body": "Hi {{first_name}},",
                }
            ],
            "window": "Business hours, 08:00-17:00",
            "by": "Tomás Ibarra",
            "updated": "Sep 28",
            "missing": {},
            "paused": {"by": "Tomás Ibarra", "at": "Sep 28, 16:40", "held": 2},
            "run": {
                "enrolled": 2,
                "active": 2,
                "replied": 1,
                "meetings": 0,
                "bounced": 0,
                "unsubscribed": 0,
            },
        },
    },
]

_MAILBOXES = [
    {
        "address": "tomas@coldtrace.io",
        "sent": 31,
        "cap": 35,
        "attention": False,
        "document": {
            "id": "tomas",
            "owner": "Tomas Ibarra",
            "provider": "google",
            "state": "warm",
            "bouncedToday": 0,
            "bounce30": 0,
            "complaints30": 0,
            "auth": {"spf": True, "dkim": True, "dmarc": True},
            "sequences": 2,
        },
    },
    {
        "address": "wanjiru@coldtrace.io",
        "sent": 29,
        "cap": 35,
        "attention": False,
        "document": {
            "id": "wanjiru",
            "owner": "Wanjiru Kamau",
            "provider": "google",
            "state": "warm",
            "bouncedToday": 0,
            "bounce30": 0,
            "complaints30": 0,
            "auth": {"spf": True, "dkim": True, "dmarc": True},
            "sequences": 1,
        },
    },
    {
        "address": "ops@coldtrace.io",
        "sent": 12,
        "cap": 35,
        "attention": True,
        "document": {
            "id": "ops",
            "owner": "Ops",
            "provider": "google",
            "state": "warming",
            "day": 4,
            "bouncedToday": 0,
            "bounce30": 0,
            "complaints30": 0,
            "auth": {"spf": True, "dkim": True, "dmarc": True},
            "sequences": 1,
        },
    },
]


def _stage(done: int, total: int | None, state: str) -> dict[str, Any]:
    return {"done": done, "total": total, "state": state}


_RUNS = [
    {
        "slug": "dairy",
        "name": "Dairy & cold rooms · East Africa",
        "status": "running",
        "document": {
            "product": "ColdTrace Sensors",
            "by": "Tomás Ibarra",
            "criteria": {
                "industries": ["Dairy", "Seafood"],
                "countries": ["Kenya", "Tanzania"],
                "sizes": ["51-200", "201-1000"],
                "queries": ["dairy processor Kenya cold room"],
            },
            "limit": 250,
            "enrichAt": 70,
            "started": "12 min ago",
            "stages": {
                "search": _stage(6, 6, "done"),
                "read": _stage(4, 6, "running"),
                "score": _stage(3, 4, "running"),
                "people": _stage(2, 3, "running"),
                "verify": _stage(2, 3, "running"),
            },
            "found": 6,
            "added": 0,
            "updated": 0,
            "fits": 4,
            "credits": {"used": 50, "estimate": 80},
        },
    },
    {
        "slug": "fish",
        "name": "Fisheries · Lake Victoria",
        "status": "done",
        "document": {
            "product": "ColdTrace Sensors",
            "by": "Amina Yusuf",
            "criteria": {
                "industries": ["Seafood"],
                "countries": ["Kenya", "Tanzania", "Uganda"],
                "sizes": ["51-200"],
                "queries": [],
            },
            "limit": 100,
            "enrichAt": 70,
            "started": "yesterday 14:10",
            "finished": "yesterday 14:52",
            "stages": {
                k: _stage(1, 1, "done") for k in ("search", "read", "score", "people", "verify")
            },
            "found": 6,
            "added": 4,
            "updated": 2,
            "fits": 3,
            "credits": {"used": 43, "estimate": 70},
        },
    },
]
