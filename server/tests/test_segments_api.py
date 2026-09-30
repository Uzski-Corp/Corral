"""HTTP tests for saved segments: live rules plus pins, preview, members, isolation."""

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models import Company
from tests.leads_helpers import ClientFactory, World, act_as, client_factory, make_world
from tests.test_companies_api import new_company
from tests.workos_fakes import WorkOSHarness

API = "/api/v1"
KENYA = {"field": "country", "op": "is", "value": ["Kenya"]}


@pytest.fixture
async def world(db_engine: AsyncEngine, workos: WorkOSHarness) -> World:
    return await make_world(db_engine, workos)


@pytest.fixture
def make_client(migrated_database: str, clean_redis: str, workos: WorkOSHarness) -> ClientFactory:
    return client_factory(migrated_database, clean_redis, workos)


@pytest.fixture
async def api(make_client: ClientFactory, world: World) -> AsyncIterator[AsyncClient]:
    async with make_client() as c:
        yield act_as(c, world.cookie_a)


async def test_segment_lifecycle(api: AsyncClient) -> None:
    ke = [(await new_company(api, n, country="Kenya"))["id"] for n in ("Acme", "Beta", "Gamma")]
    ug = (await new_company(api, "Uganda Co", country="Uganda"))["id"]

    res = await api.post(
        f"{API}/segments", json={"name": "Kenya + one", "rules": [KENYA], "company_ids": [ug]}
    )
    assert res.status_code == 201, res.text
    seg = res.json()
    assert (seg["count"], seg["pinned"], seg["match"]) == (4, 1, "all")
    assert seg["rules"] == [{**KENYA, "product_id": None}]
    sid = seg["id"]

    listed = (await api.get(f"{API}/segments")).json()
    assert [(s["name"], s["match"]) for s in listed] == [("Kenya + one", "all")]
    assert (await api.get(f"{API}/segments/{sid}")).json()["count"] == 4

    res = await api.post(f"{API}/segments", json={"name": "Kenya + one"})
    assert (res.status_code, res.json()["error"]) == (409, "duplicate")

    uganda = {"field": "country", "op": "is", "value": ["Uganda"]}
    res = await api.patch(
        f"{API}/segments/{sid}", json={"rules": [uganda], "match": "any", "name": "Uganda"}
    )
    assert (res.json()["name"], res.json()["count"], res.json()["match"]) == ("Uganda", 1, "any")
    res = await api.patch(f"{API}/segments/{sid}", json={"rules": []})  # pins only
    assert (res.json()["rules"], res.json()["count"]) == ([], 1)
    res = await api.patch(f"{API}/segments/{sid}", json={"name": None})  # ignored
    assert res.json()["name"] == "Uganda"
    other = (await api.post(f"{API}/segments", json={"name": "Other"})).json()
    assert other["count"] == 0
    res = await api.patch(f"{API}/segments/{other['id']}", json={"name": "Uganda"})
    assert (res.status_code, res.json()["error"]) == (409, "duplicate")

    assert (await api.delete(f"{API}/segments/{sid}")).status_code == 204
    assert (await api.get(f"{API}/segments/{sid}")).status_code == 404
    assert len((await api.get(f"{API}/companies")).json()["data"]) == 4  # companies stay
    assert ke


async def test_segment_limits(make_client: ClientFactory, world: World) -> None:
    async with make_client(leads_max_rules=1, leads_bulk_max_ids=1) as c:
        api = act_as(c, world.cookie_a)
        res = await api.post(f"{API}/segments", json={"name": "x", "rules": [KENYA, KENYA]})
        assert (res.status_code, res.json()["error"]) == (422, "too_many_rules")
        ids = [str(uuid.uuid4()), str(uuid.uuid4())]
        res = await api.post(f"{API}/segments", json={"name": "x", "company_ids": ids})
        assert (res.status_code, res.json()["error"]) == (422, "too_many_ids")
        seg = (await api.post(f"{API}/segments", json={"name": "ok"})).json()
        res = await api.patch(f"{API}/segments/{seg['id']}", json={"rules": [KENYA, KENYA]})
        assert (res.status_code, res.json()["error"]) == (422, "too_many_rules")
        res = await api.post(f"{API}/segments/preview", json={"rules": [KENYA, KENYA]})
        assert (res.status_code, res.json()["error"]) == (422, "too_many_rules")
        bad = {"field": "reply", "op": "is", "value": ["Interested"]}
        assert (
            await api.post(f"{API}/segments", json={"name": "y", "rules": [bad]})
        ).status_code == 422


async def test_preview(api: AsyncClient) -> None:
    for n in ("Echo", "Delta", "Charlie", "Bravo", "Alpha"):
        await new_company(api, n, country="Kenya")
    await new_company(api, "Other", country="Uganda")
    res = (await api.post(f"{API}/segments/preview", json={"rules": [KENYA]})).json()
    assert res["count"] == 5
    assert [p["name"] for p in res["peek"]] == ["Alpha", "Bravo", "Charlie", "Delta"]
    assert (await api.post(f"{API}/segments/preview", json={"rules": []})).json() == {
        "count": 0,
        "peek": [],
    }


async def test_segment_members(api: AsyncClient, db_engine: AsyncEngine) -> None:
    for n in ("Acme", "Beta", "Gamma"):
        await new_company(
            api, n, country="Kenya", industry="Retail" if n != "Beta" else "Logistics"
        )
    pinned = (await new_company(api, "Pinned", country="Uganda"))["id"]
    sid = (
        await api.post(
            f"{API}/segments", json={"name": "S", "rules": [KENYA], "company_ids": [pinned]}
        )
    ).json()["id"]
    other = (await api.post(f"{API}/segments", json={"name": "T", "rules": [KENYA]})).json()["id"]

    body = {"sort": {"key": "company", "dir": "asc"}, "limit": 2}
    page = (await api.post(f"{API}/segments/{sid}/companies", json=body)).json()
    assert [r["name"] for r in page["data"]] == ["Acme", "Beta"] and page["total"] == 4
    rest = (
        await api.post(
            f"{API}/segments/{sid}/companies", json={**body, "cursor": page["next_cursor"]}
        )
    ).json()
    assert [r["name"] for r in rest["data"]] == ["Gamma", "Pinned"] and not rest["has_more"]
    # The cursor belongs to that segment's list.
    res = await api.post(
        f"{API}/segments/{other}/companies", json={**body, "cursor": page["next_cursor"]}
    )
    assert (res.status_code, res.json()["error"]) == (400, "invalid_cursor")

    retail = {"field": "industry", "op": "is", "value": ["retail"]}
    narrowed = (await api.post(f"{API}/segments/{sid}/companies", json={"rules": [retail]})).json()
    assert sorted(r["name"] for r in narrowed["data"]) == ["Acme", "Gamma"]

    # Live: a company that starts matching joins; a pin stays when it stops matching.
    async with AsyncSession(db_engine) as s, s.begin():
        await s.execute(update(Company).values(country="Tanzania"))
    left = (await api.post(f"{API}/segments/{sid}/companies", json={})).json()
    assert [r["name"] for r in left["data"]] == ["Pinned"]
    assert (await api.post(f"{API}/segments/{uuid.uuid4()}/companies", json={})).status_code == 404


async def test_segment_from_an_import(
    api: AsyncClient, world: World, db_engine: AsyncEngine
) -> None:
    import_id = uuid.uuid4()
    a = (await new_company(api, "A"))["id"]
    await new_company(api, "B")
    async with AsyncSession(db_engine) as s, s.begin():
        await s.execute(
            update(Company).where(Company.id == uuid.UUID(a)).values(import_id=import_id)
        )
    seg = (
        await api.post(
            f"{API}/segments", json={"name": "From import", "from_import_id": str(import_id)}
        )
    ).json()
    assert (seg["pinned"], seg["count"]) == (1, 1)


async def test_segments_are_isolated(make_client: ClientFactory, world: World) -> None:
    async with make_client() as c:
        a = act_as(c, world.cookie_a)
        company = (await new_company(a, "Acme", country="Kenya"))["id"]
        sid = (await a.post(f"{API}/segments", json={"name": "Mine", "rules": [KENYA]})).json()[
            "id"
        ]
    async with make_client() as c:
        b = act_as(c, world.cookie_b)
        assert (await b.get(f"{API}/segments")).json() == []
        for call in (
            b.get(f"{API}/segments/{sid}"),
            b.patch(f"{API}/segments/{sid}", json={"name": "x"}),
            b.delete(f"{API}/segments/{sid}"),
            b.post(f"{API}/segments/{sid}/companies", json={}),
        ):
            assert (await call).status_code == 404
        # Pinning another workspace's company by id pins nothing; its rules see nothing.
        seg = (
            await b.post(
                f"{API}/segments", json={"name": "Mine", "rules": [KENYA], "company_ids": [company]}
            )
        ).json()
        assert (seg["count"], seg["pinned"]) == (0, 0)
        assert (await b.post(f"{API}/segments/preview", json={"rules": [KENYA]})).json()[
            "count"
        ] == 0
