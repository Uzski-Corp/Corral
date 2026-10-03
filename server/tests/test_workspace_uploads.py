"""Workspace edge cases: stored documents that drifted, upload limits, photos, and site re-reads."""

from collections.abc import AsyncIterator

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.api.v1.routes import workspace as ws
from app.models.identity import Organization, User
from app.models.knowledge import KbSource, Product
from app.onboarding.site import SitePage, SiteRead
from tests.leads_helpers import ClientFactory, World, act_as, client_factory, make_world
from tests.workos_fakes import WorkOSHarness

API = "/api/v1/workspace"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


class MemoryStore:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.keys: list[str] = []

    async def put_public(self, *, key: str, body: bytes, content_type: str) -> str:
        if self.fail:
            raise OSError("R2 answered 500")
        self.keys.append(key)
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


def _store(monkeypatch: pytest.MonkeyPatch, store: MemoryStore | None) -> None:
    monkeypatch.setattr(ws, "build_object_store", lambda settings: store)


def test_stored_documents_are_read_defensively() -> None:
    assert ws._strings("x") == [] and ws._strings(["a", 1]) == ["a"]
    assert ws._pages(None) == []
    assert [p.path for p in ws._pages([1, {"path": "/a"}, {"path": "/b", "title": "B"}])] == ["/b"]
    assert ws._invites({}) == []
    invites = ws._invites([1, {"email": 2}, {"email": "a@x.io", "role": "owner"}])
    assert [(i.email, i.role) for i in invites] == [("a@x.io", "member")]
    assert ws._from_mail(None) is False and ws._from_mail("") is False
    assert ws._from_mail("https://assets.test/avatars/u/1.png") is False
    assert ws._from_mail("https://lh3.googleusercontent.com/a.png") is True


async def test_drifted_documents_come_back_clean(
    api: AsyncClient, db_engine: AsyncEngine, world: World
) -> None:
    async with AsyncSession(db_engine) as s, s.begin():
        await s.execute(
            update(Organization)
            .where(Organization.id == world.a.org_id)
            .values(
                site_pages=[{"path": "/"}, "x"],
                pending_invites=[{"email": "a@x.io", "role": "boss"}],
            )
        )
    body = (await api.get(API)).json()
    assert body["site_pages"] == [] and body["invites"] == [{"email": "a@x.io", "role": "member"}]


async def test_logo_limits_and_storage_failure(
    api: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _store(monkeypatch, MemoryStore())
    big = PNG + b"\x00" * (2 * 1024 * 1024)
    res = await api.post(f"{API}/logo", files={"file": ("logo.png", big, "image/png")})
    assert (res.status_code, res.json()["error"]) == (413, "too_large")
    _store(monkeypatch, MemoryStore(fail=True))
    res = await api.post(f"{API}/logo", files={"file": ("logo.png", PNG, "image/png")})
    assert (res.status_code, res.json()["error"]) == (502, "storage_failed")


async def test_picture_upload_paths(
    api: AsyncClient, monkeypatch: pytest.MonkeyPatch, db_engine: AsyncEngine, world: World
) -> None:
    files = {"file": ("me.png", PNG, "image/png")}
    _store(monkeypatch, None)
    res = await api.post(f"{API}/picture", files=files)
    assert (res.status_code, res.json()["error"]) == (503, "storage_unconfigured")
    assert "Photo storage" in res.json()["detail"]

    store = MemoryStore()
    _store(monkeypatch, store)
    big = PNG + b"\x00" * (2 * 1024 * 1024)
    res = await api.post(f"{API}/picture", files={"file": ("me.png", big, "image/png")})
    assert (res.status_code, res.json()["error"]) == (413, "too_large")
    res = await api.post(f"{API}/picture", files={"file": ("me.svg", b"<svg/>", "image/svg+xml")})
    assert (res.status_code, res.json()["error"]) == (415, "unsupported")

    res = await api.post(f"{API}/picture", files=files)
    assert res.status_code == 200, res.text
    url = res.json()["profile_picture_url"]
    assert url.startswith("https://assets.test/avatars/") and store.keys[0].startswith("avatars/")
    again = await api.post(f"{API}/picture", files=files)
    assert again.status_code == 200  # a photo we stored can be replaced

    _store(monkeypatch, MemoryStore(fail=True))
    res = await api.post(f"{API}/picture", files=files)
    assert (res.status_code, res.json()["error"]) == (502, "storage_failed")

    async with AsyncSession(db_engine) as s, s.begin():
        await s.execute(
            update(User)
            .where(User.id == world.a.user_id)
            .values(profile_picture_url="https://lh3.googleusercontent.com/a.png")
        )
    res = await api.post(f"{API}/picture", files=files)
    assert (res.status_code, res.json()["error"]) == (409, "picture_from_mail")


def _fake_site(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_read(fetcher: object, raw_url: str, *, max_pages: int = 6) -> SiteRead:
        return SiteRead(url="https://northwind.io/", pages=(SitePage("/", "Home"),), highlights=())

    monkeypatch.setattr(ws, "read_public_site", fake_read)


async def test_reading_the_site_again_rereads_the_source(
    api: AsyncClient, monkeypatch: pytest.MonkeyPatch, db_engine: AsyncEngine, world: World
) -> None:
    _fake_site(monkeypatch)
    assert (await api.post(f"{API}/site", json={"url": "northwind.io"})).status_code == 200
    assert (await api.post(f"{API}/site", json={"url": "northwind.io"})).status_code == 200
    async with AsyncSession(db_engine) as s:
        rows = list(
            (await s.execute(select(KbSource).where(KbSource.org_id == world.a.org_id))).scalars()
        )
    assert len([r for r in rows if r.url == "https://northwind.io/"]) == 1


async def test_a_queue_failure_keeps_the_pages(
    api: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _fake_site(monkeypatch)

    class Broken:
        async def enqueue_ingest_source(self, *args: object) -> None:
            raise RuntimeError("redis down")

    monkeypatch.setattr(ws, "get_queue", lambda request: Broken())
    res = await api.post(f"{API}/site", json={"url": "northwind.io"})
    assert res.status_code == 200 and res.json()["site_pages"] == [{"path": "/", "title": "Home"}]


async def test_no_product_means_nothing_to_enqueue(
    make_client: ClientFactory,
    monkeypatch: pytest.MonkeyPatch,
    db_engine: AsyncEngine,
    world: World,
) -> None:
    async with AsyncSession(db_engine) as s, s.begin():
        await s.execute(delete(Product).where(Product.org_id == world.b.org_id))
    _fake_site(monkeypatch)
    async with make_client() as c:
        res = await act_as(c, world.cookie_b).post(f"{API}/site", json={"url": "northwind.io"})
    assert res.status_code == 200
    async with AsyncSession(db_engine) as s:
        rows = list(
            (await s.execute(select(KbSource).where(KbSource.org_id == world.b.org_id))).scalars()
        )
    assert rows == []
