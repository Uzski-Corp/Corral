"""Activity APIs stay empty for a new account. The demo seed fills only the org it is given."""

from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine

from app.seed.demo import seed_org
from tests.leads_helpers import ClientFactory, World, act_as, client_factory, make_world
from tests.tenancy_helpers import as_tenant
from tests.workos_fakes import WorkOSHarness

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def world(db_engine: AsyncEngine, workos: WorkOSHarness) -> World:
    return await make_world(db_engine, workos)


@pytest.fixture
def make_client(migrated_database: str, clean_redis: str, workos: WorkOSHarness) -> ClientFactory:
    return client_factory(migrated_database, clean_redis, workos)


@pytest.fixture
async def api_a(make_client: ClientFactory, world: World) -> AsyncIterator[AsyncClient]:
    async with make_client() as client:
        yield act_as(client, world.cookie_a)


@pytest.fixture
async def api_b(make_client: ClientFactory, world: World) -> AsyncIterator[AsyncClient]:
    async with make_client() as client:
        yield act_as(client, world.cookie_b)


async def test_a_new_account_has_no_activity(api_b: AsyncClient) -> None:
    assert (await api_b.get("/api/v1/inbox")).json() == []
    assert (await api_b.get("/api/v1/inbox/summary")).json() == {"needs_you": 0}
    assert (await api_b.get("/api/v1/sequences")).json() == []
    assert (await api_b.get("/api/v1/mailboxes")).json()["mailboxes"] == []
    runs = (await api_b.get("/api/v1/discovery/runs")).json()
    assert runs["runs"] == []
    assert runs["credits"] == {"month": 0, "used": 0, "left": 0}
    assert (await api_b.get("/api/v1/integrations")).json() == []
    assert (await api_b.get("/api/v1/developers/keys")).json() == []
    assert (await api_b.get("/api/v1/developers/connections")).json() == []
    members = (await api_b.get("/api/v1/workspace/members")).json()
    assert len(members) == 1
    assert members[0]["email"] == "b@b.io"


async def test_seed_fills_only_the_named_org(
    api_a: AsyncClient, api_b: AsyncClient, db_engine: AsyncEngine, world: World
) -> None:
    async with as_tenant(db_engine, world.a) as session:
        secret = await seed_org(session, world.a.org_id, world.a.user_id)
    assert secret is not None
    assert secret.startswith("crl_live_")

    inbox = (await api_a.get("/api/v1/inbox")).json()
    assert {row["id"] for row in inbox} >= {"brian", "wanjiru", "grace", "daniel"}
    assert (await api_a.get("/api/v1/inbox/summary")).json()["needs_you"] == 3
    sequences = (await api_a.get("/api/v1/sequences")).json()
    assert {row["id"] for row in sequences} == {"pilot", "proof"}
    assert (await api_a.get("/api/v1/mailboxes")).json()["sent"] == 72
    runs = (await api_a.get("/api/v1/discovery/runs")).json()
    assert {row["id"] for row in runs["runs"]} == {"dairy", "fish"}
    assert runs["credits"]["left"] == 1460
    providers = {
        row["provider"]: row["status"] for row in (await api_a.get("/api/v1/integrations")).json()
    }
    assert providers == {"cal": "connected", "phoenix": "connected", "autosend": "connected"}
    keys = (await api_a.get("/api/v1/developers/keys")).json()
    assert keys[0]["id"] == "key_n8n"
    assert "secret" not in keys[0]

    assert (await api_b.get("/api/v1/inbox")).json() == []
    assert (await api_b.get("/api/v1/sequences")).json() == []
    assert (await api_b.get("/api/v1/discovery/runs")).json()["credits"]["month"] == 0


async def test_writes_persist_on_an_empty_account(api_b: AsyncClient) -> None:
    created = await api_b.post("/api/v1/sequences", json={"name": "First touch", "status": "draft"})
    assert created.status_code == 201, created.text
    seq_id = created.json()["id"]
    paused = await api_b.patch(f"/api/v1/sequences/{seq_id}", json={"status": "paused"})
    assert paused.json()["status"] == "paused"

    run = await api_b.post("/api/v1/discovery/runs", json={"name": "Bakeries"})
    assert run.status_code == 201
    assert run.json()["status"] == "queued"
    assert (await api_b.get("/api/v1/discovery/runs")).json()["runs"][0]["status"] == "queued"

    key = await api_b.post(
        "/api/v1/developers/keys", json={"name": "Sheets", "env": "test", "scopes": ["leads:read"]}
    )
    assert key.status_code == 201
    secret = key.json()["secret"]
    assert secret.startswith("crl_test_")
    listed = (await api_b.get("/api/v1/developers/keys")).json()
    assert listed[0]["last4"] == secret[-4:]
    assert "secret" not in listed[0]
    assert (await api_b.post(f"/api/v1/developers/keys/{listed[0]['id']}/revoke")).json()["revoked"]

    connected = await api_b.patch(
        "/api/v1/integrations/cal", json={"status": "connected", "config": {}}
    )
    assert connected.json()["status"] == "connected"
    assert (await api_b.get("/api/v1/integrations")).json()[0]["provider"] == "cal"
