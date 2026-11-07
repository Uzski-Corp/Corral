"""Workspace onboarding is stored on the organization, and a site read is the site itself."""

from collections.abc import AsyncIterator
from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.kb.web import FetchFailure
from app.models.billing import WorkspaceBilling
from app.models.identity import Organization
from app.models.knowledge import KbSource
from app.onboarding.site import SitePage, SiteRead
from tests.leads_helpers import ClientFactory, World, act_as, client_factory, make_world
from tests.workos_fakes import WorkOSHarness

API = "/api/v1/workspace"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


class MemoryStore:
    def __init__(self) -> None:
        self.puts: list[tuple[str, bytes, str]] = []

    async def put_public(self, *, key: str, body: bytes, content_type: str) -> str:
        self.puts.append((key, body, content_type))
        return f"https://assets.test/{key}"


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


async def test_profile_round_trips_and_completion_sticks(
    api: AsyncClient, db_engine: AsyncEngine, world: World
) -> None:
    got = (await api.get(API)).json()
    assert got["onboarded"] is False and got["name"] == "org_a"
    assert got["product"]["name"] == "ColdTrace Sensors"

    res = await api.patch(
        API,
        json={
            "name": "Northwind",
            "slug": "northwind",
            "timezone": "nbo",
            "team_size": "small",
            "skipped": [4],
            "invites": [
                {"email": "amina@northwind.io", "role": "admin"},
                {"email": "", "role": "member"},
            ],
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["name"], body["slug"], body["timezone"], body["team_size"]) == (
        "Northwind",
        "northwind",
        "nbo",
        "small",
    )
    assert body["skipped"] == [4]
    [invite] = body["invites"]
    assert (invite["email"], invite["role"]) == ("amina@northwind.io", "admin")
    first = invite["invited_at"]
    assert first is not None
    more = await api.patch(
        API,
        json={"invites": [{"email": "Amina@northwind.io"}, {"email": "sales@northwind.io"}]},
    )
    kept, added = more.json()["invites"]
    assert kept["invited_at"] == first  # still pending: keeps the time it was first sent
    assert added["email"] == "sales@northwind.io" and added["invited_at"] >= first
    assert body["onboarded"] is False

    done = await api.patch(API, json={"complete": True})
    assert done.json()["onboarded"] is True
    again = await api.patch(API, json={"name": "Northwind Sensors"})
    assert again.json()["onboarded"] is True  # finishing once is enough

    me = await api.get("/api/v1/auth/me")
    assert me.json()["organization"]["onboarded"] is True
    assert me.json()["organization"]["name"] == "Northwind Sensors"

    async with AsyncSession(db_engine) as s:
        org = (
            await s.execute(select(Organization).where(Organization.id == world.a.org_id))
        ).scalar_one()
    assert org.slug == "northwind" and org.onboarded_at is not None
    billing = (
        await s.execute(select(WorkspaceBilling).where(WorkspaceBilling.org_id == world.a.org_id))
    ).scalar_one()
    assert billing.trial_ends_at is not None and billing.trial_started_at is not None
    assert billing.trial_ends_at - billing.trial_started_at == timedelta(days=7)
    started = billing.trial_started_at
    repeat = await api.patch(API, json={"complete": True})
    assert repeat.json()["onboarded"] is True
    async with AsyncSession(db_engine) as s:
        again = (
            await s.execute(
                select(WorkspaceBilling).where(WorkspaceBilling.org_id == world.a.org_id)
            )
        ).scalar_one()
    assert again.trial_started_at == started


async def test_slug_collision_and_private_urls(make_client: ClientFactory, world: World) -> None:
    async with make_client() as c:
        other = act_as(c, world.cookie_b)
        slug = (await other.get(API)).json()["slug"]
        api = act_as(c, world.cookie_a)
        taken = await api.patch(API, json={"slug": slug})
        assert (taken.status_code, taken.json()["error"]) == (409, "slug_taken")
        bad = await api.patch(API, json={"slug": "Not A Slug"})
        assert bad.status_code == 422
        site = await api.post(f"{API}/site", json={"url": "http://127.0.0.1/secret"})
        assert (site.status_code, site.json()["error"]) == (422, "url_not_public")


async def test_logo_needs_r2_until_keys_exist(api: AsyncClient) -> None:
    res = await api.post(f"{API}/logo", files={"file": ("logo.png", PNG, "image/png")})
    assert res.status_code == 503
    assert res.json()["error"] == "storage_unconfigured"
    assert "R2_ACCOUNT_ID" in res.json()["detail"]


async def test_logo_is_stored_and_a_site_read_is_what_was_fetched(
    make_client: ClientFactory,
    world: World,
    monkeypatch: pytest.MonkeyPatch,
    db_engine: AsyncEngine,
) -> None:
    store = MemoryStore()

    def build(settings: object) -> MemoryStore:
        return store

    async def fake_read(fetcher: object, raw_url: str, *, max_pages: int = 6) -> SiteRead:
        assert "northwind.io" in raw_url
        assert max_pages >= 1
        return SiteRead(
            url="https://northwind.io/",
            pages=(SitePage("/", "Northwind Sensors"), SitePage("/pricing", "Pricing")),
            highlights=("Page the right person",),
        )

    monkeypatch.setattr("app.api.v1.routes.workspace.build_object_store", build)
    monkeypatch.setattr("app.api.v1.routes.workspace.read_public_site", fake_read)
    async with make_client() as c:
        api = act_as(c, world.cookie_a)
        logo = await api.post(f"{API}/logo", files={"file": ("logo.png", PNG, "image/png")})
        assert logo.status_code == 200, logo.text
        assert logo.json()["logo_url"].startswith("https://assets.test/logos/")
        assert store.puts and store.puts[0][2] == "image/png"

        bad = await api.post(
            f"{API}/logo", files={"file": ("x.svg", b"<svg></svg>", "image/svg+xml")}
        )
        assert (bad.status_code, bad.json()["error"]) == (415, "unsupported")

        site = await api.post(f"{API}/site", json={"url": "northwind.io"})
        assert site.status_code == 200, site.text
        body = site.json()
        assert body["website"] == "https://northwind.io/"
        assert body["site_pages"] == [
            {"path": "/", "title": "Northwind Sensors"},
            {"path": "/pricing", "title": "Pricing"},
        ]
        assert body["site_highlights"] == ["Page the right person"]

        again = await api.get(API)
        assert again.json()["site_pages"] == body["site_pages"]
        assert again.json()["logo_url"] == logo.json()["logo_url"]

    async with AsyncSession(db_engine) as s:
        sources = list(
            (await s.execute(select(KbSource).where(KbSource.org_id == world.a.org_id))).scalars()
        )
    assert any(s.url == "https://northwind.io/" for s in sources)


async def test_unreachable_site_does_not_invent_pages(
    make_client: ClientFactory, world: World, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_read(fetcher: object, raw_url: str, *, max_pages: int = 6) -> SiteRead:
        raise FetchFailure("unreachable", "The page returned 404.")

    monkeypatch.setattr("app.api.v1.routes.workspace.read_public_site", fake_read)
    async with make_client() as c:
        api = act_as(c, world.cookie_a)
        res = await api.post(f"{API}/site", json={"url": "https://missing.example"})
    assert (res.status_code, res.json()["error"], res.json()["detail"]) == (
        422,
        "site_unreachable",
        "The page returned 404.",
    )
