"""HTTP-level IDOR tests: a signed-in member of org B cannot touch org A's leads."""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models import Lead, Segment
from tests.conftest import FRONTEND_URL
from tests.tenancy_helpers import provision
from tests.workos_fakes import WorkOSHarness, user_payload

SESSION_COOKIE = "wos_session"


@pytest.fixture
async def tenants(db_engine: AsyncEngine, workos: WorkOSHarness) -> dict[str, str]:
    """Provision two orgs and return a sealed session cookie for each member."""
    await provision(db_engine, "user_a", "a@a.io", "org_a")
    await provision(db_engine, "user_b", "b@b.io", "org_b")
    return {
        "a": workos.seal(user=user_payload("user_a", "a@a.io"), org_id="org_a"),
        "b": workos.seal(user=user_payload("user_b", "b@b.io"), org_id="org_b"),
    }


def act_as(client: AsyncClient, cookie: str) -> AsyncClient:
    """Sign the client in as a tenant; it sends the frontend's Origin like a browser would."""
    client.cookies.set(SESSION_COOKIE, cookie)
    client.headers["Origin"] = FRONTEND_URL
    return client


async def test_lead_crud_happy_path(db_client: AsyncClient, tenants: dict[str, str]) -> None:
    c = act_as(db_client, tenants["a"])
    created = await c.post("/api/v1/leads", json={"email": "Lead@Acme.io", "first_name": "L"})
    assert created.status_code == 201
    lead = created.json()
    assert lead["email"] == "lead@acme.io"
    assert "org_id" not in lead
    assert (await c.get(f"/api/v1/leads/{lead['id']}")).json()["first_name"] == "L"
    patched = await c.patch(f"/api/v1/leads/{lead['id']}", json={"company_name": "Acme"})
    assert patched.status_code == 200
    assert patched.json()["company_name"] == "Acme"
    assert patched.json()["first_name"] == "L"
    listed = await c.get("/api/v1/leads")
    assert [x["id"] for x in listed.json()] == [lead["id"]]
    assert (await c.delete(f"/api/v1/leads/{lead['id']}")).status_code == 204
    assert (await c.get(f"/api/v1/leads/{lead['id']}")).status_code == 404


async def test_other_org_cannot_read_or_modify(
    db_client: AsyncClient, tenants: dict[str, str], db_engine: AsyncEngine
) -> None:
    lead_id = (
        await act_as(db_client, tenants["a"]).post("/api/v1/leads", json={"email": "x@a.io"})
    ).json()["id"]

    b = act_as(db_client, tenants["b"])
    assert (await b.get("/api/v1/leads")).json() == []
    assert (await b.get(f"/api/v1/leads/{lead_id}")).status_code == 404
    assert (await b.patch(f"/api/v1/leads/{lead_id}", json={"first_name": "p"})).status_code == 404
    assert (await b.delete(f"/api/v1/leads/{lead_id}")).status_code == 404

    async with AsyncSession(db_engine) as s:
        lead = await s.get(Lead, uuid.UUID(lead_id))
        assert lead is not None
        assert lead.first_name is None


async def test_client_cannot_choose_org(db_client: AsyncClient, tenants: dict[str, str]) -> None:
    c = act_as(db_client, tenants["b"])
    res = await c.post("/api/v1/leads", json={"email": "x@b.io", "org_id": str(uuid.uuid4())})
    assert res.status_code == 422


async def test_same_email_allowed_per_org_but_unique_within(
    db_client: AsyncClient, tenants: dict[str, str]
) -> None:
    a = act_as(db_client, tenants["a"])
    assert (await a.post("/api/v1/leads", json={"email": "dup@x.io"})).status_code == 201
    assert (await a.post("/api/v1/leads", json={"email": "DUP@x.io"})).status_code == 409
    # The request transaction survives the conflict (savepoint), so later writes work.
    b = act_as(db_client, tenants["b"])
    assert (await b.post("/api/v1/leads", json={"email": "dup@x.io"})).status_code == 201


@pytest.mark.parametrize(
    "body",
    [{"email": "not-an-email"}, {"email": "a@b.io", "first_name": "x" * 101}, {}],
)
async def test_lead_validation(
    db_client: AsyncClient, tenants: dict[str, str], body: dict[str, str]
) -> None:
    res = await act_as(db_client, tenants["a"]).post("/api/v1/leads", json=body)
    assert res.status_code == 422


@pytest.mark.parametrize("params", [{"limit": 0}, {"limit": 201}, {"offset": -1}])
async def test_pagination_bounds(
    db_client: AsyncClient, tenants: dict[str, str], params: dict[str, int]
) -> None:
    res = await act_as(db_client, tenants["a"]).get("/api/v1/leads", params=params)
    assert res.status_code == 422


async def test_malformed_id_is_422(db_client: AsyncClient, tenants: dict[str, str]) -> None:
    assert (await act_as(db_client, tenants["a"]).get("/api/v1/leads/abc")).status_code == 422


@pytest.mark.parametrize(
    ("resource", "field"),
    [("segments", "name"), ("sequences", "name"), ("inbox", "subject"), ("knowledge", "title")],
)
async def test_list_endpoints_are_org_scoped(
    db_client: AsyncClient,
    tenants: dict[str, str],
    db_engine: AsyncEngine,
    resource: str,
    field: str,
) -> None:
    from app.models import InboxThread, KnowledgeItem
    from app.models import Sequence as SequenceModel

    model = {
        "segments": Segment,
        "sequences": SequenceModel,
        "inbox": InboxThread,
        "knowledge": KnowledgeItem,
    }[resource]
    async with AsyncSession(db_engine) as s, s.begin():
        from sqlalchemy import select

        from app.models import Organization

        orgs = {
            o.workos_organization_id: o.id
            for o in (await s.execute(select(Organization))).scalars()
        }
        s.add(model(org_id=orgs["org_a"], **{field: "belongs to A"}))
        s.add(model(org_id=orgs["org_b"], **{field: "belongs to B"}))

    rows_b = (await act_as(db_client, tenants["b"]).get(f"/api/v1/{resource}")).json()
    assert [r[field] for r in rows_b] == ["belongs to B"]


@pytest.mark.parametrize(
    "origin", [None, "https://evil.example", "null", "http://evil.frontend.test"]
)
async def test_lead_writes_need_a_trusted_origin(
    db_client: AsyncClient, tenants: dict[str, str], db_engine: AsyncEngine, origin: str | None
) -> None:
    c = act_as(db_client, tenants["a"])
    lead_id = (await c.post("/api/v1/leads", json={"email": "keep@a.io"})).json()["id"]
    headers = {} if origin is None else {"Origin": origin}
    del c.headers["Origin"]
    calls = [
        c.post("/api/v1/leads", json={"email": "new@a.io"}, headers=headers),
        c.patch(f"/api/v1/leads/{lead_id}", json={"first_name": "x"}, headers=headers),
        c.delete(f"/api/v1/leads/{lead_id}", headers=headers),
    ]
    for call in calls:
        res = await call
        assert (res.status_code, res.json()) == (403, {"detail": "Origin not allowed"})
    async with AsyncSession(db_engine) as s:
        lead = await s.get(Lead, uuid.UUID(lead_id))
        assert lead is not None and lead.first_name is None
        assert len((await s.execute(select(Lead))).scalars().all()) == 1


async def test_reads_do_not_need_an_origin(db_client: AsyncClient, tenants: dict[str, str]) -> None:
    c = act_as(db_client, tenants["a"])
    del c.headers["Origin"]
    assert (await c.get("/api/v1/leads")).status_code == 200
