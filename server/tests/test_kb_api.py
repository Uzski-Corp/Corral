"""HTTP tests for products and the knowledge base: contract, validation, limits, isolation."""

import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.kb.ingest import ingest_source
from app.main import create_app
from app.models import KbChunk, KbSource, KbSourceFile, Product
from app.worker.queue import QUEUE_NAME, JobQueue
from tests.conftest import _running_app, make_settings
from tests.kb_fixtures import GATEWAY_PAGES, PITCH_MD, make_docx, make_pdf
from tests.kb_helpers import job_ctx, reload
from tests.tenancy_helpers import provision
from tests.workos_fakes import WorkOSHarness, user_payload

FRONTEND = "http://localhost:3000"
ORIGIN = {"Origin": FRONTEND}
SESSION_COOKIE = "wos_session"
MD = ("Pitch.md", PITCH_MD.encode(), "text/markdown")

ClientFactory = Callable[..., Any]


@pytest.fixture
async def tenants(db_engine: AsyncEngine, workos: WorkOSHarness) -> dict[str, Any]:
    a = await provision(db_engine, "user_a", "a@a.io", "org_a")
    b = await provision(db_engine, "user_b", "b@b.io", "org_b")
    return {
        "a": workos.seal(user=user_payload("user_a", "a@a.io"), org_id="org_a"),
        "b": workos.seal(user=user_payload("user_b", "b@b.io"), org_id="org_b"),
        "ident_a": a,
        "ident_b": b,
    }


@pytest.fixture
def make_client(
    migrated_database: str, db_engine: AsyncEngine, clean_redis: str, workos: WorkOSHarness
) -> ClientFactory:
    @asynccontextmanager
    async def factory(**overrides: Any) -> AsyncIterator[AsyncClient]:
        settings = make_settings(
            database_url=migrated_database,
            redis_url=clean_redis,
            cors_origins=[FRONTEND],
            **overrides,
        )
        async for c in _running_app(create_app(settings), workos):
            yield c

    return factory


@pytest.fixture
async def kb(make_client: ClientFactory) -> AsyncIterator[AsyncClient]:
    async with make_client() as c:
        yield c


@pytest.fixture
async def queue(clean_redis: str) -> AsyncIterator[JobQueue]:
    q = JobQueue.from_settings(make_settings(redis_url=clean_redis))
    try:
        yield q
    finally:
        await q.close()


def act_as(client: AsyncClient, cookie: str) -> AsyncClient:
    client.cookies.set(SESSION_COOKIE, cookie)
    return client


async def new_product(c: AsyncClient, name: str = "ColdTrace") -> str:
    res = await c.post("/api/v1/products", json={"name": name}, headers=ORIGIN)
    assert res.status_code == 201, res.text
    return str(res.json()["id"])


def base(product_id: str) -> str:
    return f"/api/v1/products/{product_id}/knowledge"


async def upload(
    c: AsyncClient, product_id: str, file: tuple[str, bytes, str] = MD, **form: str
) -> Response:
    return await c.post(
        f"{base(product_id)}/sources/files", files={"file": file}, data=form, headers=ORIGIN
    )


async def process(engine: AsyncEngine, source_id: str) -> None:
    source = await reload(engine, uuid.UUID(source_id))
    ctx = job_ctx(engine, make_settings())
    await ingest_source(ctx, str(source.org_id), str(source.id), source.generation)


# --- products ----------------------------------------------------------------------------


async def test_product_crud(kb: AsyncClient, tenants: dict[str, Any]) -> None:
    c = act_as(kb, tenants["a"])
    pid = await new_product(c)
    assert (await c.get(f"/api/v1/products/{pid}")).json()["name"] == "ColdTrace"
    patched = await c.patch(
        f"/api/v1/products/{pid}", json={"description": "Sensors"}, headers=ORIGIN
    )
    assert patched.json()["description"] == "Sensors"
    assert [p["id"] for p in (await c.get("/api/v1/products")).json()] == [pid]
    assert (await c.delete(f"/api/v1/products/{pid}", headers=ORIGIN)).status_code == 204
    assert (await c.get(f"/api/v1/products/{pid}")).status_code == 404
    assert (
        await c.patch(f"/api/v1/products/{pid}", json={"name": "x"}, headers=ORIGIN)
    ).status_code == 404
    assert (await c.delete(f"/api/v1/products/{pid}", headers=ORIGIN)).status_code == 404


async def test_product_names_are_unique_per_org(kb: AsyncClient, tenants: dict[str, Any]) -> None:
    a = act_as(kb, tenants["a"])
    await new_product(a, "Same")
    other = await new_product(a, "Other")
    res = await a.post("/api/v1/products", json={"name": "Same"}, headers=ORIGIN)
    assert (res.status_code, res.json()["error"]) == (409, "name_taken")
    res = await a.patch(f"/api/v1/products/{other}", json={"name": "Same"}, headers=ORIGIN)
    assert (res.status_code, res.json()["error"]) == (409, "name_taken")
    await new_product(act_as(kb, tenants["b"]), "Same")  # another org may reuse it


async def test_product_validation(kb: AsyncClient, tenants: dict[str, Any]) -> None:
    c = act_as(kb, tenants["a"])
    for body in ({"name": "  "}, {"name": "x", "org_id": str(uuid.uuid4())}, {}):
        assert (await c.post("/api/v1/products", json=body, headers=ORIGIN)).status_code == 422


async def test_products_are_isolated(
    kb: AsyncClient, tenants: dict[str, Any], db_engine: AsyncEngine
) -> None:
    pid = await new_product(act_as(kb, tenants["a"]))
    b = act_as(kb, tenants["b"])
    assert (await b.get("/api/v1/products")).json() == []
    assert (await b.get(f"/api/v1/products/{pid}")).status_code == 404
    assert (
        await b.patch(f"/api/v1/products/{pid}", json={"name": "p"}, headers=ORIGIN)
    ).status_code == 404
    assert (await b.delete(f"/api/v1/products/{pid}", headers=ORIGIN)).status_code == 404
    async with AsyncSession(db_engine) as s:
        assert (await s.get(Product, uuid.UUID(pid))) is not None


# --- uploads -----------------------------------------------------------------------------


async def test_upload_is_accepted_queued_read_and_searchable(
    kb: AsyncClient, tenants: dict[str, Any], db_engine: AsyncEngine, queue: JobQueue
) -> None:
    c = act_as(kb, tenants["a"])
    pid = await new_product(c)
    res = await upload(c, pid)
    assert res.status_code == 202, res.text
    body = res.json()
    assert {k: body[k] for k in ("kind", "name", "status", "stage", "progress", "byte_size")} == {
        "kind": "md",
        "name": "Pitch.md",
        "status": "processing",
        "stage": "scan",
        "progress": 20,
        "byte_size": len(PITCH_MD.encode()),
    }
    assert body["added_by_user_id"] == str(tenants["ident_a"].user_id)
    jobs = await queue.redis.queued_jobs(queue_name=QUEUE_NAME)
    assert [(j.function, j.job_id) for j in jobs] == [
        ("ingest_source", f"ingest_source:{body['id']}:0")
    ]

    await process(db_engine, body["id"])
    sid = body["id"]
    got = (await c.get(f"{base(pid)}/sources/{sid}")).json()
    assert (got["status"], got["progress"], got["passage_count"]) == ("ready", 100, 4)
    passages = (await c.get(f"{base(pid)}/sources/{sid}/passages", params={"limit": 2})).json()
    assert [p["loc"] for p in passages] == ["ColdTrace Sensors", "Alerts"]
    hits = (
        await c.post(
            f"{base(pid)}/search", json={"query": "battery life", "limit": 2}, headers=ORIGIN
        )
    ).json()
    assert len(hits) == 2
    assert (hits[0]["loc"], hits[0]["source_name"], hits[0]["source_kind"]) == (
        "Battery",
        "Pitch.md",
        "md",
    )
    assert hits[0]["source_id"] == sid


async def test_pdf_and_docx_uploads(kb: AsyncClient, tenants: dict[str, Any]) -> None:
    c = act_as(kb, tenants["a"])
    pid = await new_product(c)
    pdf = await upload(c, pid, ("Gateway.pdf", make_pdf(GATEWAY_PAGES), "application/pdf"))
    docx = await upload(
        c, pid, ("../../etc/O b.docx", make_docx([(None, "hello")]), "application/octet-stream")
    )
    assert (pdf.status_code, pdf.json()["kind"]) == (202, "pdf")
    assert (docx.status_code, docx.json()["kind"], docx.json()["name"]) == (202, "docx", "O b.docx")


@pytest.mark.parametrize(
    ("file", "status", "error"),
    [
        (("notes.txt", b"hello", "text/plain"), 415, "unsupported"),
        (("empty.md", b"", "text/markdown"), 422, "empty"),
        (("fake.pdf", b"PK\x03\x04 zip", "application/pdf"), 415, "type_mismatch"),
        (("big.md", b"x" * 2_001, "text/markdown"), 413, "too_large"),
        (("bin.md", b"\x00\x01\x02 binary", "text/markdown"), 415, "type_mismatch"),
    ],
)
async def test_bad_uploads_are_refused(
    make_client: ClientFactory,
    tenants: dict[str, Any],
    db_engine: AsyncEngine,
    file: tuple[str, bytes, str],
    status: int,
    error: str,
) -> None:
    async with make_client(kb_max_file_bytes=2_000) as kb:
        c = act_as(kb, tenants["a"])
        pid = await new_product(c)
        res = await upload(c, pid, file)
    assert (res.status_code, res.json()["error"]) == (status, error)
    async with AsyncSession(db_engine) as s:
        assert await s.scalar(select(func.count()).select_from(KbSource)) == 0


async def test_upload_needs_a_file_part(kb: AsyncClient, tenants: dict[str, Any]) -> None:
    c = act_as(kb, tenants["a"])
    pid = await new_product(c)
    res = await c.post(f"{base(pid)}/sources/files", data={"x": "y"}, headers=ORIGIN)
    assert res.status_code == 422


async def test_oversized_bodies_are_refused_before_reading(
    make_client: ClientFactory, tenants: dict[str, Any]
) -> None:
    async with make_client(kb_max_file_bytes=1_000) as kb:
        c = act_as(kb, tenants["a"])
        pid = await new_product(c)
        res = await upload(c, pid, ("big.md", b"x" * 70_000, "text/markdown"))
        assert (res.status_code, res.json()["error"]) == (413, "too_large")

        async def chunked() -> AsyncIterator[bytes]:
            yield b"--x\r\n"

        res = await c.post(
            f"{base(pid)}/sources/files",
            content=chunked(),
            headers={**ORIGIN, "content-type": "multipart/form-data; boundary=x"},
        )
        assert (res.status_code, res.json()["error"]) == (411, "length_required")
        # Other routes are untouched by the upload cap.
        assert (
            await c.post(f"{base(pid)}/search", json={"query": "q" * 1_500}, headers=ORIGIN)
        ).status_code == 200


async def test_writes_need_a_trusted_origin(kb: AsyncClient, tenants: dict[str, Any]) -> None:
    c = act_as(kb, tenants["a"])
    pid = await new_product(c)
    sid = (await upload(c, pid)).json()["id"]
    evil = {"Origin": "https://evil.example"}
    calls: list[tuple[str, str, dict[str, Any]]] = [
        ("POST", "/api/v1/products", {"json": {"name": "x"}}),
        ("PATCH", f"/api/v1/products/{pid}", {"json": {"name": "x"}}),
        ("DELETE", f"/api/v1/products/{pid}", {}),
        ("POST", f"{base(pid)}/sources/files", {"files": {"file": MD}}),
        ("POST", f"{base(pid)}/sources/urls", {"json": {"url": "https://coldtrace.io"}}),
        ("DELETE", f"{base(pid)}/sources/{sid}", {}),
        ("POST", f"{base(pid)}/sources/{sid}/restore", {}),
        ("POST", f"{base(pid)}/sources/{sid}/reread", {}),
    ]
    for method, url, kwargs in calls:
        for headers in ({}, evil):
            res = await c.request(method, url, headers=headers, **kwargs)
            assert res.status_code == 403, (method, url, headers)
    assert (await c.get(f"{base(pid)}/sources/{sid}")).json()["deleted_at"] is None


async def test_signed_out_callers_get_401(kb: AsyncClient) -> None:
    pid = uuid.uuid4()
    assert (await kb.get(f"{base(str(pid))}/sources")).status_code == 401
    assert (await kb.get("/api/v1/products")).status_code == 401


async def test_unknown_product_is_404(kb: AsyncClient, tenants: dict[str, Any]) -> None:
    c = act_as(kb, tenants["a"])
    res = await upload(c, str(uuid.uuid4()))
    assert (res.status_code, res.json()["error"]) == (404, "not_found")


# --- dedupe, replace, capacity, rate limits ----------------------------------------------


async def test_the_same_file_twice_is_a_duplicate(kb: AsyncClient, tenants: dict[str, Any]) -> None:
    c = act_as(kb, tenants["a"])
    pid = await new_product(c)
    first = (await upload(c, pid)).json()
    res = await upload(c, pid, ("Renamed.md", PITCH_MD.encode(), "text/markdown"))
    assert res.status_code == 409
    assert res.json() == {
        "error": "duplicate",
        "detail": "Already in this knowledge base.",
        "existing_source_id": first["id"],
    }
    # Another product (dedupe scope "product") and another org are separate.
    assert (await upload(c, await new_product(c, "Second"))).status_code == 202
    b = act_as(kb, tenants["b"])
    assert (await upload(b, await new_product(b))).status_code == 202


@pytest.mark.parametrize(("scope", "second_status"), [("org", 409), ("off", 202)])
async def test_dedupe_scope_is_configurable(
    make_client: ClientFactory, tenants: dict[str, Any], scope: str, second_status: int
) -> None:
    async with make_client(kb_dedupe_scope=scope) as kb:
        c = act_as(kb, tenants["a"])
        pid = await new_product(c)
        assert (await upload(c, pid)).status_code == 202
        assert (await upload(c, await new_product(c, "Second"))).status_code == second_status
        if scope == "off":
            assert (await upload(c, pid)).status_code == 202


async def test_replace_removes_the_old_source(kb: AsyncClient, tenants: dict[str, Any]) -> None:
    c = act_as(kb, tenants["a"])
    pid = await new_product(c)
    old = (await upload(c, pid)).json()["id"]
    res = await upload(
        c, pid, ("Pitch.md", b"# Pitch v2\nnew text", "text/markdown"), replace_source_id=old
    )
    assert res.status_code == 202
    assert (await c.get(f"{base(pid)}/sources/{old}")).json()["deleted_at"] is not None
    listed = [s["id"] for s in (await c.get(f"{base(pid)}/sources")).json()]
    assert listed == [res.json()["id"]]
    missing = await upload(
        c, pid, ("x.md", b"# x", "text/markdown"), replace_source_id=str(uuid.uuid4())
    )
    assert (missing.status_code, missing.json()["error"]) == (404, "not_found")


async def test_replacing_with_the_same_content_is_allowed(
    kb: AsyncClient, tenants: dict[str, Any]
) -> None:
    c = act_as(kb, tenants["a"])
    pid = await new_product(c)
    old = (await upload(c, pid)).json()["id"]
    assert (await upload(c, pid, replace_source_id=old)).status_code == 202


async def test_source_count_capacity(make_client: ClientFactory, tenants: dict[str, Any]) -> None:
    async with make_client(kb_max_sources_per_product=1) as kb:
        c = act_as(kb, tenants["a"])
        pid = await new_product(c)
        first = (await upload(c, pid)).json()["id"]
        res = await upload(c, pid, ("b.md", b"# b", "text/markdown"))
        assert (res.status_code, res.json()["error"]) == (409, "kb_full")
        res = await c.post(
            f"{base(pid)}/sources/urls", json={"url": "https://coldtrace.io"}, headers=ORIGIN
        )
        assert (res.status_code, res.json()["error"]) == (409, "kb_full")
        # Replacing frees its own slot; removing frees one; restoring over capacity fails.
        assert (
            await upload(c, pid, ("b.md", b"# b", "text/markdown"), replace_source_id=first)
        ).status_code == 202
        res = await c.post(f"{base(pid)}/sources/{first}/restore", headers=ORIGIN)
        assert (res.status_code, res.json()["error"]) == (409, "kb_full")


async def test_byte_capacity(make_client: ClientFactory, tenants: dict[str, Any]) -> None:
    async with make_client(kb_max_file_bytes=1_000, kb_max_bytes_per_product=1_500) as kb:
        c = act_as(kb, tenants["a"])
        pid = await new_product(c)
        assert (await upload(c, pid, ("a.md", b"a" * 900, "text/markdown"))).status_code == 202
        res = await upload(c, pid, ("b.md", b"b" * 900, "text/markdown"))
        assert (res.status_code, res.json()["error"]) == (409, "kb_full")


async def test_adds_are_rate_limited_per_user(
    make_client: ClientFactory, tenants: dict[str, Any]
) -> None:
    async with make_client(kb_uploads_per_user=2) as kb:
        a = act_as(kb, tenants["a"])
        pid = await new_product(a)
        sid = (await upload(a, pid)).json()["id"]
        assert (
            await a.post(f"{base(pid)}/sources/{sid}/reread", headers=ORIGIN)
        ).status_code == 202
        res = await upload(a, pid, ("b.md", b"# b", "text/markdown"))
        assert (res.status_code, res.json()["error"]) == (429, "rate_limited")
        assert int(res.headers["Retry-After"]) > 0
        b = act_as(kb, tenants["b"])
        assert (await upload(b, await new_product(b))).status_code == 202


async def test_a_failed_enqueue_rolls_back_the_add(
    kb: AsyncClient,
    tenants: dict[str, Any],
    db_engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def down(*args: object) -> None:
        raise ConnectionError("redis down")

    c = act_as(kb, tenants["a"])
    pid = await new_product(c)
    monkeypatch.setattr(JobQueue, "enqueue_ingest_source", down)
    with pytest.raises(ConnectionError):
        await upload(c, pid)
    async with AsyncSession(db_engine) as s:
        assert await s.scalar(select(func.count()).select_from(KbSource)) == 0
        assert await s.scalar(select(func.count()).select_from(KbSourceFile)) == 0


# --- web sources -------------------------------------------------------------------------


async def test_add_a_web_page(kb: AsyncClient, tenants: dict[str, Any], queue: JobQueue) -> None:
    c = act_as(kb, tenants["a"])
    pid = await new_product(c)
    res = await c.post(
        f"{base(pid)}/sources/urls",
        json={"url": "HTTPS://ColdTrace.io/Blog/#top", "scope": "section"},
        headers=ORIGIN,
    )
    assert res.status_code == 202
    body = res.json()
    assert (body["kind"], body["url"], body["scope"], body["stage"], body["progress"]) == (
        "url",
        "https://coldtrace.io/Blog/",
        "section",
        "upload",
        0,
    )
    dup = await c.post(
        f"{base(pid)}/sources/urls", json={"url": "https://coldtrace.io/Blog/"}, headers=ORIGIN
    )
    assert (dup.status_code, dup.json()["existing_source_id"]) == (409, body["id"])
    assert len(await queue.redis.queued_jobs(queue_name=QUEUE_NAME)) == 1


@pytest.mark.parametrize(
    ("url", "error"),
    [
        ("ftp://coldtrace.io/", "url_invalid"),
        ("https://user:pw@coldtrace.io/", "url_invalid"),
        ("https://coldtrace.io:8080/", "url_not_public"),
        ("http://127.0.0.1/", "url_not_public"),
        ("http://localhost/", "url_not_public"),
        ("http://[::1]/", "url_not_public"),
    ],
)
async def test_bad_urls_are_refused(
    kb: AsyncClient, tenants: dict[str, Any], url: str, error: str
) -> None:
    c = act_as(kb, tenants["a"])
    pid = await new_product(c)
    res = await c.post(f"{base(pid)}/sources/urls", json={"url": url}, headers=ORIGIN)
    assert (res.status_code, res.json()["error"]) == (422, error)


async def test_url_body_validation(kb: AsyncClient, tenants: dict[str, Any]) -> None:
    c = act_as(kb, tenants["a"])
    pid = await new_product(c)
    for body in (
        {"url": ""},
        {"url": "https://a.io", "scope": "site"},
        {"url": "https://a.io", "x": 1},
    ):
        assert (
            await c.post(f"{base(pid)}/sources/urls", json=body, headers=ORIGIN)
        ).status_code == 422


# --- listing, lifecycle ------------------------------------------------------------------


async def test_list_orders_problems_first_and_filters(
    kb: AsyncClient, tenants: dict[str, Any], db_engine: AsyncEngine
) -> None:
    c = act_as(kb, tenants["a"])
    pid = await new_product(c)
    ready = (await upload(c, pid)).json()["id"]
    failed = (await upload(c, pid, ("scan.pdf", make_pdf([None]), "application/pdf"))).json()["id"]
    partial = (await upload(c, pid, ("gw.pdf", make_pdf(GATEWAY_PAGES), "application/pdf"))).json()[
        "id"
    ]
    processing = (
        await c.post(
            f"{base(pid)}/sources/urls", json={"url": "https://coldtrace.io"}, headers=ORIGIN
        )
    ).json()["id"]
    for sid in (ready, failed, partial):
        await process(db_engine, sid)

    def ids(res: Response) -> list[str]:
        return [s["id"] for s in res.json()]

    src = f"{base(pid)}/sources"
    assert ids(await c.get(src)) == [failed, partial, processing, ready]
    got = (await c.get(f"{src}/{failed}")).json()
    assert (got["failure"], got["failure_stage"], got["progress"]) == ("no-text", "parse", None)
    got = (await c.get(f"{src}/{partial}")).json()
    assert (got["pages_read"], got["pages_total"], got["skipped"]) == (2, 3, "page 2")
    assert (got["skipped_reason"], got["attempts"]) == ("scanned", 1)
    got = (await c.get(f"{src}/{processing}")).json()
    assert (got["skipped_reason"], got["attempts"]) == (None, 0)
    assert ids(await c.get(src, params={"kind": "url"})) == [processing]
    assert ids(await c.get(src, params={"kind": "file"})) == [failed, partial, ready]
    assert ids(await c.get(src, params={"status": "ready"})) == [ready]
    assert ids(await c.get(src, params={"limit": 2, "offset": 1})) == [partial, processing]
    assert (await c.get(src, params={"status": "weird"})).status_code == 422

    await c.delete(f"{src}/{ready}", headers=ORIGIN)
    assert ready not in ids(await c.get(src))
    assert ready in ids(await c.get(src, params={"include_removed": True}))


async def test_remove_restore_and_reread(
    kb: AsyncClient, tenants: dict[str, Any], db_engine: AsyncEngine, queue: JobQueue
) -> None:
    c = act_as(kb, tenants["a"])
    pid = await new_product(c)
    sid = (await upload(c, pid)).json()["id"]
    await process(db_engine, sid)
    src = f"{base(pid)}/sources/{sid}"
    search = {"query": "battery"}

    removed = await c.delete(src, headers=ORIGIN)
    assert removed.status_code == 200 and removed.json()["deleted_at"] is not None
    assert (await c.delete(src, headers=ORIGIN)).json()["deleted_at"] == removed.json()[
        "deleted_at"
    ]
    assert (await c.post(f"{base(pid)}/search", json=search, headers=ORIGIN)).json() == []
    res = await c.post(f"{src}/reread", headers=ORIGIN)
    assert (res.status_code, res.json()["error"]) == (409, "removed")

    restored = await c.post(f"{src}/restore", headers=ORIGIN)
    assert (restored.status_code, restored.json()["deleted_at"]) == (200, None)
    assert (await c.post(f"{src}/restore", headers=ORIGIN)).status_code == 200  # idempotent
    assert len((await c.post(f"{base(pid)}/search", json=search, headers=ORIGIN)).json()) > 0

    reread = await c.post(f"{src}/reread", headers=ORIGIN)
    assert reread.status_code == 202
    assert (reread.json()["status"], reread.json()["stage"]) == ("processing", "scan")
    assert reread.json()["attempts"] == 0
    job_ids = {j.job_id for j in await queue.redis.queued_jobs(queue_name=QUEUE_NAME)}
    assert f"ingest_source:{sid}:1" in job_ids
    async with AsyncSession(db_engine) as s:  # old passages stay searchable until replaced
        assert await s.scalar(select(func.count()).select_from(KbChunk)) == 4
    await process(db_engine, sid)
    assert (await c.get(src)).json()["status"] == "ready"


async def test_restoring_over_a_newer_copy_is_a_duplicate(
    kb: AsyncClient, tenants: dict[str, Any]
) -> None:
    c = act_as(kb, tenants["a"])
    pid = await new_product(c)
    old = (await upload(c, pid)).json()["id"]
    await c.delete(f"{base(pid)}/sources/{old}", headers=ORIGIN)
    new = (await upload(c, pid)).json()["id"]
    res = await c.post(f"{base(pid)}/sources/{old}/restore", headers=ORIGIN)
    assert (res.status_code, res.json()["existing_source_id"]) == (409, new)


async def test_unknown_source_is_404(kb: AsyncClient, tenants: dict[str, Any]) -> None:
    c = act_as(kb, tenants["a"])
    pid = await new_product(c)
    res = await c.get(f"{base(pid)}/sources/{uuid.uuid4()}")
    assert (res.status_code, res.json()["error"]) == (404, "not_found")


async def test_search_validation_and_limit(
    make_client: ClientFactory, tenants: dict[str, Any], db_engine: AsyncEngine
) -> None:
    async with make_client(kb_search_max_results=2) as kb:
        c = act_as(kb, tenants["a"])
        pid = await new_product(c)
        await process(db_engine, (await upload(c, pid)).json()["id"])
        url = f"{base(pid)}/search"
        assert (
            len((await c.post(url, json={"query": "sensor", "limit": 50}, headers=ORIGIN)).json())
            == 2
        )
        for body in ({"query": " "}, {"query": "x", "limit": 0}, {"query": "x", "limit": 101}, {}):
            assert (await c.post(url, json=body, headers=ORIGIN)).status_code == 422


# --- isolation ---------------------------------------------------------------------------


async def test_another_org_cannot_see_or_touch_a_knowledge_base(
    kb: AsyncClient, tenants: dict[str, Any], db_engine: AsyncEngine
) -> None:
    a = act_as(kb, tenants["a"])
    pid = await new_product(a)
    sid = (await upload(a, pid)).json()["id"]
    await process(db_engine, sid)

    b = act_as(kb, tenants["b"])
    own = await new_product(b)
    for product in (pid, own):  # A's product id, and B's own product with A's source id
        src = f"{base(product)}/sources/{sid}"
        calls = [
            b.get(src),
            b.get(f"{src}/passages"),
            b.delete(src, headers=ORIGIN),
            b.post(f"{src}/restore", headers=ORIGIN),
            b.post(f"{src}/reread", headers=ORIGIN),
        ]
        if product == pid:
            calls += [
                b.get(f"{base(pid)}/sources"),
                upload(b, pid),
                b.post(f"{base(pid)}/sources/urls", json={"url": "https://a.io"}, headers=ORIGIN),
                b.post(f"{base(pid)}/search", json={"query": "battery"}, headers=ORIGIN),
            ]
        for call in calls:
            res = await call
            assert res.status_code == 404, res.request.url
    assert (
        await b.post(f"{base(own)}/search", json={"query": "battery"}, headers=ORIGIN)
    ).json() == []
    # B uploading the same file is not a "duplicate" of A's.
    assert (await upload(b, own)).status_code == 202
    source = await reload(db_engine, uuid.UUID(sid))
    assert (source.deleted_at, source.generation) == (None, 0)


async def test_deleting_a_product_deletes_its_knowledge_base(
    kb: AsyncClient, tenants: dict[str, Any], db_engine: AsyncEngine
) -> None:
    c = act_as(kb, tenants["a"])
    pid = await new_product(c)
    await process(db_engine, (await upload(c, pid)).json()["id"])
    assert (await c.delete(f"/api/v1/products/{pid}", headers=ORIGIN)).status_code == 204
    async with AsyncSession(db_engine) as s:
        for model in (KbSource, KbSourceFile, KbChunk):
            assert await s.scalar(select(func.count()).select_from(model)) == 0


async def test_openapi_documents_the_contract(kb: AsyncClient) -> None:
    spec = (await kb.get("/openapi.json")).json()
    upload_op = spec["paths"]["/api/v1/products/{product_id}/knowledge/sources/files"]["post"]
    assert {"202", "409", "411", "413", "415", "422", "429"} <= set(upload_op["responses"])
    assert "/api/v1/products/{product_id}/knowledge/search" in spec["paths"]
