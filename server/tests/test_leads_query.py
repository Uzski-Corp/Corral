"""Rules engine vs a Python reference, and keyset pagination vs a full ORDER BY."""

import random
import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncEngine

from app.leads.query import (
    CompanyQuery,
    InvalidCursor,
    Page,
    Sort,
    filter_clause,
    run_query,
)
from app.leads.rules import FIELD_OPS, VOCAB, Rule, rules_clause
from app.leads.vocab import EMAIL_ORDER, REPLY_ORDER
from app.models import Company
from tests.leads_helpers import (
    COUNTRIES,
    INDUSTRIES,
    Seeded,
    World,
    insert_seed,
    make_world,
    random_seed,
    seeded_rng,
)
from tests.tenancy_helpers import as_tenant
from tests.workos_fakes import WorkOSHarness

N = 90


@pytest.fixture
async def world(db_engine: AsyncEngine, workos: WorkOSHarness) -> World:
    return await make_world(db_engine, workos)


@pytest.fixture
async def seeded(db_engine: AsyncEngine, world: World) -> list[Seeded]:
    rows = random_seed(seeded_rng(7), world.a.org_id, N)
    await insert_seed(db_engine, rows, world.product_a)
    # Another workspace's rows never show up.
    await insert_seed(db_engine, random_seed(seeded_rng(8), world.b.org_id, 10), world.product_b)
    return rows


async def fetch(
    engine: AsyncEngine, world: World, query: CompanyQuery, *, limit: int = 1_000, scope: str = ""
) -> Page:
    async with as_tenant(engine, world.a) as s:
        where = filter_clause(query.rules, query.match)
        return await run_query(s, world.a.org_id, query, where=where, limit=limit, scope=scope)


# --- the reference evaluator ------------------------------------------------------------


def holds(rule: Rule, row: Seeded, product: uuid.UUID) -> bool:
    c, p = row.company, row.primary
    if rule.field == "fit":
        if row.fit is None or rule.product_id != product:
            return False
        return row.fit >= rule.value if rule.op == "gte" else row.fit <= rule.value  # type: ignore[operator]
    if rule.field == "title":
        return bool(p and p["title"] and str(rule.value).lower() in p["title"].lower())
    values = [v.lower() for v in rule.value]  # type: ignore[union-attr]
    if rule.field == "email":
        hit = bool(p and p["email_status"] in values)
        return hit if rule.op == "is" else not hit
    column = {"country": "country", "industry": "industry", "size": "size",
              "reply": "reply_status", "source": "source"}[rule.field]  # fmt: skip
    have = c[column]
    hit = have is not None and have.lower() in values
    return hit if rule.op == "is" else not hit


def random_rule(rng: random.Random, product: uuid.UUID) -> Rule:
    field = rng.choice(list(FIELD_OPS))
    kind, ops = FIELD_OPS[field]
    op = rng.choice(ops)
    value: Any
    extra: dict[str, Any] = {}
    if kind == "number":
        value = rng.choice([0, 50, 79, 80, 100])
        extra["product_id"] = str(rng.choice([product, product, uuid.uuid4()]))
    elif kind == "text":
        value = rng.choice(["ops", "OPS", "ceo", "_100%", "x"])
    else:
        pool = (
            VOCAB.get(field)
            or {
                "country": [c for c in COUNTRIES if c] + ["KENYA"],
                "industry": [i for i in INDUSTRIES if i],
            }[field]
        )
        value = rng.sample(list(pool), rng.randint(1, min(3, len(pool))))
    return Rule.model_validate({"field": field, "op": op, "value": value, **extra})


async def test_sql_rules_match_the_reference(
    db_engine: AsyncEngine, world: World, seeded: list[Seeded]
) -> None:
    rng = seeded_rng(2026)
    by_id = {r.company["id"]: r for r in seeded}
    for _ in range(120):
        rules = [random_rule(rng, world.product_a) for _ in range(rng.randint(0, 4))]
        match = rng.choice(["all", "any"])
        page = await fetch(db_engine, world, CompanyQuery(rules=rules, match=match))
        got = {row.company.id for row in page.rows}
        combine = all if match == "all" else any
        want = {
            cid
            for cid, row in by_id.items()
            if not rules or combine(holds(r, row, world.product_a) for r in rules)
        }
        assert got == want, (rules, match)
        assert page.total == len(want)


def test_empty_rules_mean_everything_for_filters_nothing_for_segments() -> None:
    assert str(rules_clause([], "all", empty=True).compile()) == "true"
    assert str(rules_clause([], "any", empty=False).compile()) == "false"


# --- pagination ---------------------------------------------------------------------------

SORTS = [
    Sort.model_validate({"key": k, "dir": d})
    for k in ("company", "person", "fit", "email", "reply", "last", "created")
    for d in ("asc", "desc")
]


async def walk(
    engine: AsyncEngine, world: World, query: CompanyQuery, limit: int
) -> list[uuid.UUID]:
    ids: list[uuid.UUID] = []
    cursor = None
    for _ in range(N + 2):
        page = await fetch(engine, world, query.model_copy(update={"cursor": cursor}), limit=limit)
        ids += [r.company.id for r in page.rows]
        assert len(page.rows) <= limit
        cursor = page.next_cursor
        if cursor is None:
            return ids
    raise AssertionError("pagination did not terminate")


@pytest.mark.parametrize("sort", SORTS, ids=lambda s: f"{s.key}-{s.dir}")
async def test_keyset_walk_equals_the_full_order(
    db_engine: AsyncEngine, world: World, seeded: list[Seeded], sort: Sort
) -> None:
    query = CompanyQuery(sort=sort, product_id=world.product_a)
    full = [r.company.id for r in (await fetch(db_engine, world, query)).rows]
    assert len(full) == N
    for limit in (1, 7, N):
        assert await walk(db_engine, world, query, limit) == full


async def test_sort_semantics(db_engine: AsyncEngine, world: World, seeded: list[Seeded]) -> None:
    async def order(key: str, direction: str) -> list[Any]:
        q = CompanyQuery(
            sort=Sort.model_validate({"key": key, "dir": direction}), product_id=world.product_a
        )
        return (await fetch(db_engine, world, q)).rows

    reply = [REPLY_ORDER.index(r.company.reply_status) for r in await order("reply", "asc")]
    assert reply == sorted(reply)
    email = [
        EMAIL_ORDER.index(r.primary.email_status) if r.primary else len(EMAIL_ORDER)
        for r in await order("email", "desc")
    ]
    assert email == sorted(email, reverse=True)
    fits = [r.fit if r.fit is not None else -1 for r in await order("fit", "desc")]
    assert fits == sorted(fits, reverse=True)
    names = [r.company.name_key for r in await order("company", "asc")]
    assert names == sorted(names)
    for direction in ("asc", "desc"):
        stamps = [r.company.last_activity_at for r in await order("last", direction)]
        seen = [t for t in stamps if t is not None]
        assert stamps == seen + [None] * (len(stamps) - len(seen))  # never is last both ways
        assert seen == sorted(seen, reverse=direction == "asc")  # asc = most recent first


async def test_pagination_edges(db_engine: AsyncEngine, world: World) -> None:
    empty = await fetch(db_engine, world, CompanyQuery(), limit=5)
    assert (empty.rows, empty.next_cursor, empty.total) == ([], None, 0)

    rows = random_seed(seeded_rng(1), world.a.org_id, 14)
    await insert_seed(db_engine, rows, world.product_a)
    query = CompanyQuery(sort=Sort(key="company", dir="asc"))
    first = await fetch(db_engine, world, query, limit=7)
    assert len(first.rows) == 7 and first.next_cursor and first.total == 14
    second = await fetch(
        db_engine, world, query.model_copy(update={"cursor": first.next_cursor}), limit=7
    )
    assert len(second.rows) == 7 and second.next_cursor is None  # an exact multiple ends cleanly

    # The row a cursor points at can disappear; the walk still continues after its key.
    async with as_tenant(db_engine, world.a) as s:
        await s.execute(delete(Company).where(Company.id == first.rows[-1].company.id))
    resumed = await fetch(
        db_engine, world, query.model_copy(update={"cursor": first.next_cursor}), limit=7
    )
    assert [r.company.id for r in resumed.rows] == [r.company.id for r in second.rows]

    # A cursor is bound to its query: other rules, sort, product or scope are refused.
    other = CompanyQuery(sort=Sort(key="company", dir="desc"), cursor=first.next_cursor)
    with pytest.raises(InvalidCursor):
        await fetch(db_engine, world, other, limit=7)
    with pytest.raises(InvalidCursor):
        await fetch(
            db_engine,
            world,
            query.model_copy(update={"cursor": first.next_cursor}),
            scope="segment:x",
        )


async def test_cursor_carries_timestamps(
    db_engine: AsyncEngine, world: World, seeded: list[Seeded]
) -> None:
    query = CompanyQuery(sort=Sort(key="last", dir="desc"))
    page = await fetch(db_engine, world, query, limit=3)
    assert page.next_cursor
    assert isinstance(page.rows[0].company.created_at, datetime)
    assert (
        page.rows[0].company.created_at.tzinfo == UTC
        or page.rows[0].company.created_at.utcoffset() is not None
    )
