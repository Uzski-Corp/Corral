"""Shared set-up for lead CRM tests: two workspaces, a product each, seeded companies."""

import random
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.auth.provisioning import ProvisionedIdentity
from app.leads.normalize import name_key
from app.leads.vocab import EMAIL_STATUSES, REPLY_STATUSES, SIZES, SOURCES
from app.main import create_app
from app.models import Company, CompanyFit, Lead, Product
from tests.conftest import FRONTEND_URL, _running_app, make_settings
from tests.tenancy_helpers import provision
from tests.workos_fakes import WorkOSHarness, user_payload

SESSION_COOKIE = "wos_session"
ClientFactory = Callable[..., Any]


@dataclass
class World:
    a: ProvisionedIdentity
    b: ProvisionedIdentity
    cookie_a: str
    cookie_b: str
    product_a: uuid.UUID
    product_b: uuid.UUID


async def make_world(engine: AsyncEngine, workos: WorkOSHarness) -> World:
    a = await provision(engine, "user_a", "a@a.io", "org_a")
    b = await provision(engine, "user_b", "b@b.io", "org_b")
    async with AsyncSession(engine) as s, s.begin():
        pa = Product(org_id=a.org_id, name="ColdTrace Sensors")
        pb = Product(org_id=b.org_id, name="Other")
        s.add_all([pa, pb])
        await s.flush()
        ids = (pa.id, pb.id)
    return World(
        a=a,
        b=b,
        cookie_a=workos.seal(user=user_payload("user_a", "a@a.io"), org_id="org_a"),
        cookie_b=workos.seal(user=user_payload("user_b", "b@b.io"), org_id="org_b"),
        product_a=ids[0],
        product_b=ids[1],
    )


def client_factory(
    migrated_database: str, clean_redis: str, workos: WorkOSHarness
) -> ClientFactory:
    @asynccontextmanager
    async def factory(**overrides: Any) -> AsyncIterator[AsyncClient]:
        settings = make_settings(database_url=migrated_database, redis_url=clean_redis, **overrides)
        async for c in _running_app(create_app(settings), workos):
            yield c

    return factory


def act_as(client: AsyncClient, cookie: str) -> AsyncClient:
    client.cookies.set(SESSION_COOKIE, cookie)
    client.headers["Origin"] = FRONTEND_URL
    return client


# --- seeding ------------------------------------------------------------------------------


def seeded_rng(seed: int) -> random.Random:
    """Deterministic test data (not security-relevant)."""
    return random.Random(seed)  # noqa: S311


@dataclass
class Seeded:
    company: dict[str, Any]
    primary: dict[str, Any] | None
    fit: int | None
    others: list[dict[str, Any]] = field(default_factory=list)


COUNTRIES = ["Kenya", "kenya", "Uganda", "Tanzania", None]
INDUSTRIES = ["Logistics", "Retail", "Agritech", None]
TITLES = ["Head of Ops", "CEO", "ops lead", "CTO_100%", None]
NAMES = ["Acme", "acme", "Beta", "Gamma", "Delta", "Kilima", "Zeta"]
FIRST = ["Amina", "amina", "Brian", "Wanjiru", None]


def random_seed(rng: random.Random, org_id: uuid.UUID, n: int) -> list[Seeded]:
    """``n`` companies with deliberately clashing sort keys, NULLs and missing people."""
    base = datetime(2026, 9, 1, tzinfo=UTC)
    out: list[Seeded] = []
    for i in range(n):
        name = rng.choice(NAMES)
        company = {
            "id": uuid.uuid4(),
            "org_id": org_id,
            "name": name,
            "name_key": name_key(name),
            "domain": f"c{i}.example" if rng.random() < 0.8 else None,
            "country": rng.choice(COUNTRIES),
            "industry": rng.choice(INDUSTRIES),
            "size": rng.choice([*SIZES, None]),
            "source": rng.choice(SOURCES),
            "reply_status": rng.choice(REPLY_STATUSES),
            "last_activity_at": rng.choice([None, base, base + timedelta(hours=rng.randint(1, 5))]),
            "created_at": base + timedelta(minutes=rng.randint(0, 3)),
        }
        primary = None
        if rng.random() < 0.8:
            primary = {
                "id": uuid.uuid4(),
                "org_id": org_id,
                "company_id": company["id"],
                "is_primary": True,
                "email": f"p{i}@c.example" if rng.random() < 0.9 else None,
                "email_status": rng.choice(EMAIL_STATUSES),
                "first_name": rng.choice(FIRST),
                "last_name": rng.choice(["Njeri", None]),
                "title": rng.choice(TITLES),
            }
        others = []
        if rng.random() < 0.3:  # a non-primary colleague never affects rules or sorting
            others.append(
                {
                    "id": uuid.uuid4(),
                    "org_id": org_id,
                    "company_id": company["id"],
                    "is_primary": False,
                    "email": f"o{i}@c.example",
                    "email_status": "verified",
                    "title": "Head of Ops",
                    "first_name": "Aaron",
                }
            )
        fit = rng.choice([None, 0, 50, 80, 80, 100])
        out.append(Seeded(company, primary, fit, others))
    return out


async def insert_seed(engine: AsyncEngine, rows: list[Seeded], product_id: uuid.UUID) -> None:
    async with AsyncSession(engine) as s, s.begin():
        await s.execute(insert(Company), [r.company for r in rows])
        people = [p for r in rows for p in ([r.primary] if r.primary else []) + r.others]
        if people:
            await s.execute(insert(Lead), people)
        fits = [
            {"org_id": r.company["org_id"], "company_id": r.company["id"], "product_id": product_id,
             "score": r.fit}
            for r in rows
            if r.fit is not None
        ]  # fmt: skip
        if fits:
            await s.execute(insert(CompanyFit), fits)
