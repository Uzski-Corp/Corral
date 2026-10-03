"""A connected integration's page: detail, who connected it, problems, mapping and the log."""

from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine

from app.activity import service
from app.models import Integration, IntegrationLog
from app.seed.demo import seed_org
from tests.leads_helpers import ClientFactory, World, act_as, client_factory, make_world
from tests.tenancy_helpers import as_tenant
from tests.workos_fakes import WorkOSHarness

pytestmark = pytest.mark.asyncio
API = "/api/v1/integrations"


@pytest.fixture
async def world(db_engine: AsyncEngine, workos: WorkOSHarness) -> World:
    w = await make_world(db_engine, workos)
    async with as_tenant(db_engine, w.a) as session:
        await seed_org(session, w.a.org_id, w.a.user_id)
    return w


@pytest.fixture
def make_client(migrated_database: str, clean_redis: str, workos: WorkOSHarness) -> ClientFactory:
    return client_factory(migrated_database, clean_redis, workos)


@pytest.fixture
async def api(make_client: ClientFactory, world: World) -> AsyncIterator[AsyncClient]:
    async with make_client() as client:
        yield act_as(client, world.cookie_a)


@pytest.fixture
async def api_b(make_client: ClientFactory, world: World) -> AsyncIterator[AsyncClient]:
    async with make_client() as client:
        yield act_as(client, world.cookie_b)


async def test_detail_of_a_seeded_integration(api: AsyncClient, world: World) -> None:
    cal = (await api.get(f"{API}/cal")).json()
    assert cal["id"] == "cal" and cal["status"] == "connected"
    assert cal["connectedById"] == str(world.a.user_id)
    assert cal["connectedAt"] is not None and cal["statusAt"] is not None
    assert (cal["account"], cal["problem"], cal["mapping"], cal["supportsTest"]) == (
        None,
        None,
        None,
        False,
    )
    assert cal["lastEvent"]["event"] == "connected" and cal["lastEvent"]["result"] == "ok"
    assert (await api.get(f"{API}/zoom")).status_code == 404

    listed = {row["provider"]: row for row in (await api.get(API)).json()}
    assert listed["phoenix"]["lastEvent"]["event"] == "connected"
    assert listed["phoenix"]["connectedAt"] is not None


async def test_never_connected_reads_as_off(api_b: AsyncClient) -> None:
    phoenix = (await api_b.get(f"{API}/phoenix")).json()
    assert phoenix["status"] == "off"
    assert (phoenix["connectedAt"], phoenix["connectedById"], phoenix["lastEvent"]) == (
        None,
        None,
        None,
    )
    assert phoenix["problem"] is None and phoenix["mapping"] is None


async def test_status_changes_track_who_and_when(api_b: AsyncClient, world: World) -> None:
    await api_b.patch(f"{API}/cal", json={"status": "connected"})
    first = (await api_b.get(f"{API}/cal")).json()
    assert first["connectedById"] == str(world.b.user_id)
    assert first["lastEvent"] is None
    assert (await api_b.get(API)).json()[0]["lastEvent"] is None

    await api_b.patch(f"{API}/cal", json={"status": "connected"})
    same = (await api_b.get(f"{API}/cal")).json()
    assert same["statusAt"] == first["statusAt"]  # nothing changed

    await api_b.patch(f"{API}/cal", json={"status": "reauth"})
    expired = (await api_b.get(f"{API}/cal")).json()
    assert expired["problem"] == {"kind": "token-expired", "since": expired["statusAt"]}
    assert expired["connectedAt"] == first["connectedAt"]

    await api_b.patch(f"{API}/cal", json={"status": "error"})
    assert (await api_b.get(f"{API}/cal")).json()["problem"]["kind"] == "refused"

    await api_b.patch(f"{API}/cal", json={"status": "connected"})
    back = (await api_b.get(f"{API}/cal")).json()
    assert back["problem"] is None and back["connectedAt"] == first["connectedAt"]

    await api_b.patch(f"{API}/cal", json={"status": "off"})
    off = (await api_b.get(f"{API}/cal")).json()
    assert (off["connectedAt"], off["connectedById"]) == (None, None)
    await api_b.patch(f"{API}/cal", json={"status": "connected"})
    again = (await api_b.get(f"{API}/cal")).json()
    assert again["connectedAt"] is not None and again["connectedAt"] > first["connectedAt"]


async def test_account_comes_from_what_connect_stored(api_b: AsyncClient) -> None:
    async def account(config: dict[str, object]) -> object:
        await api_b.patch(f"{API}/phoenix", json={"status": "connected", "config": config})
        return (await api_b.get(f"{API}/phoenix")).json()["account"]

    assert await account({"account": {"name": "erp.example.com"}}) == {"name": "erp.example.com"}
    assert await account({"account": {"name": "AutoSend", "email": "you@example.com"}}) == {
        "name": "AutoSend",
        "email": "you@example.com",
    }
    assert await account({"account": {"name": "x", "email": ""}}) == {"name": "x"}
    assert await account({"account": {"name": ""}}) is None
    assert await account({"account": "erp"}) is None


async def test_phoenix_mapping_saves_and_resets(api: AsyncClient, api_b: AsyncClient) -> None:
    rows = [{"erp": "account.name", "from": "company"}, {"erp": "deal.source", "as": "text"}]
    saved = await api.put(f"{API}/phoenix/mapping", json={"rows": rows})
    assert saved.status_code == 200, saved.text
    assert saved.json()["mapping"] == rows
    assert (await api.get(f"{API}/phoenix")).json()["mapping"] == rows

    reset = await api.put(f"{API}/phoenix/mapping", json={"rows": []})
    assert reset.json()["mapping"] is None

    twice = [{"erp": "deal.stage", "from": "stage"}, {"erp": "deal.stage", "from": "owner"}]
    dup = await api.put(f"{API}/phoenix/mapping", json={"rows": twice})
    assert (dup.status_code, dup.json()["error"]) == (422, "duplicate_field")
    extra = await api.put(f"{API}/phoenix/mapping", json={"rows": [{"erp": "a", "x": 1}]})
    assert extra.status_code == 422
    bad_type = await api.put(f"{API}/phoenix/mapping", json={"rows": [{"erp": "a", "as": "blob"}]})
    assert bad_type.status_code == 422

    cal = await api.put(f"{API}/cal/mapping", json={"rows": rows})
    assert cal.status_code == 404
    assert (await api.put(f"{API}/zoom/mapping", json={"rows": rows})).status_code == 404
    unconnected = await api_b.put(f"{API}/phoenix/mapping", json={"rows": rows})
    assert (unconnected.status_code, unconnected.json()["error"]) == (409, "not_connected")
    await api.patch(f"{API}/phoenix", json={"status": "off"})
    off = await api.put(f"{API}/phoenix/mapping", json={"rows": rows})
    assert off.status_code == 409

    # Only Phoenix shows a mapping, whatever is stored.
    assert (await api.get(f"{API}/cal")).json()["mapping"] is None


async def test_logs_read_in_one_shape(
    api: AsyncClient, db_engine: AsyncEngine, world: World
) -> None:
    async with as_tenant(db_engine, world.a) as session:
        cal = (
            await session.execute(select(Integration).where(Integration.provider == "cal"))
        ).scalar_one()
        session.add(
            IntegrationLog(
                org_id=world.a.org_id,
                integration_id=cal.id,
                document={"dir": "in", "event": "BOOKING_CREATED", "result": "duplicate"},
            )
        )
        session.add(
            IntegrationLog(
                org_id=world.a.org_id,
                integration_id=cal.id,
                document={"event": "", "result": "exploded", "detail": 7},
            )
        )
        await session.commit()
    logs = (await api.get(f"{API}/cal/logs")).json()
    shapes = {(row["dir"], row["event"], row["result"], row["detail"]) for row in logs}
    assert ("in", "BOOKING_CREATED", "duplicate", None) in shapes
    assert ("out", "note", "ok", None) in shapes
    assert all(row["at"] and row["id"] for row in logs)


async def test_detail_without_a_row_is_built_not_stored(
    db_engine: AsyncEngine, world: World
) -> None:
    async with as_tenant(db_engine, world.b) as session:
        detail = await service.integration_detail(session, world.b.org_id, "autosend")
        assert detail is not None and detail["status"] == "off"
        assert await service.integration_detail(session, world.b.org_id, "zoom") is None
        stored = (await session.execute(select(Integration))).scalars().all()
        assert stored == []
