"""The ingestion job against a real database: stages, outcomes, retries and guards."""

import asyncio
import uuid
from collections.abc import Sequence
from typing import Any

import pytest
from arq import Retry, Worker
from sqlalchemy import delete, update
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.kb import ingest as ingest_module
from app.kb.embeddings import EmbeddingRejected, EmbeddingUnavailable, HashingEmbedder
from app.kb.errors import FileKind, IngestFailure
from app.kb.ingest import IngestJob, ingest_source
from app.kb.service import KnowledgeBaseService
from app.models import KbSource, KbSourceFile
from app.worker.main import build_worker_kwargs
from app.worker.queue import QUEUE_NAME, JobQueue
from tests.conftest import make_settings
from tests.kb_fixtures import GATEWAY_PAGES, OBJECTIONS, PITCH_MD, encrypt_pdf, make_docx, make_pdf
from tests.kb_helpers import KbWorld, add_file, add_url, chunks_of, job_ctx, kb_world, reload
from tests.tenancy_helpers import as_tenant
from tests.test_kb_web import PUBLIC_IP, Web

SETTINGS = make_settings()
MACRO = {"word/vbaProject.bin": b"x"}


@pytest.fixture
async def world(db_engine: AsyncEngine) -> KbWorld:
    return await kb_world(db_engine)


async def run(engine: AsyncEngine, source: KbSource, **ctx: Any) -> str:
    settings = ctx.pop("settings", SETTINGS)
    return await ingest_source(
        job_ctx(engine, settings, **ctx), str(source.org_id), str(source.id), source.generation
    )


async def test_markdown_becomes_ready_with_located_passages(
    db_engine: AsyncEngine, world: KbWorld
) -> None:
    src = await add_file(
        db_engine,
        world.a,
        world.product_a,
        SETTINGS,
        name="Pitch.md",
        kind="md",
        data=PITCH_MD.encode(),
    )
    assert (src.status, src.stage, src.generation) == ("processing", "scan", 0)
    assert await run(db_engine, src) == "ready"
    done = await reload(db_engine, src.id)
    assert (done.status, done.stage, done.stage_pct, done.failure) == ("ready", None, 100, None)
    assert done.processed_at is not None
    chunks = await chunks_of(db_engine, src.id)
    assert done.passage_count == len(chunks) == 4
    assert [c.loc for c in chunks] == ["ColdTrace Sensors", "Alerts", "Pricing", "Battery"]
    assert all(c.org_id == world.a.org_id and c.product_id == world.product_a for c in chunks)
    assert len(chunks[0].embedding) == 1536


async def test_scanned_pages_make_the_source_partial(
    db_engine: AsyncEngine, world: KbWorld
) -> None:
    src = await add_file(
        db_engine,
        world.a,
        world.product_a,
        SETTINGS,
        name="Gateway.pdf",
        kind="pdf",
        data=make_pdf(GATEWAY_PAGES),
    )
    assert await run(db_engine, src) == "partial"
    done = await reload(db_engine, src.id)
    assert (done.status, done.pages_total, done.pages_read, done.skipped) == (
        "partial",
        3,
        2,
        "page 2",
    )
    assert (done.skipped_reason, done.attempts) == ("scanned", 1)
    assert done.note == "1 page is a scanned image with no text layer."
    assert [c.loc for c in await chunks_of(db_engine, src.id)] == ["p.1", "p.3"]


async def test_docx_is_read(db_engine: AsyncEngine, world: KbWorld) -> None:
    src = await add_file(
        db_engine,
        world.a,
        world.product_a,
        SETTINGS,
        name="Objections.docx",
        kind="docx",
        data=make_docx(OBJECTIONS),
    )
    assert await run(db_engine, src) == "ready"
    assert (await reload(db_engine, src.id)).passage_count == 3


async def test_stages_are_reported_in_order(
    db_engine: AsyncEngine, world: KbWorld, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: list[tuple[str, int]] = []
    original = IngestJob.progress

    async def spy(self: IngestJob, stage: str, pct: int, **values: Any) -> None:
        await original(self, stage, pct, **values)  # type: ignore[arg-type]
        row = await reload(db_engine, self.source_id)
        seen.append((row.stage or "", row.stage_pct))

    monkeypatch.setattr(IngestJob, "progress", spy)
    src = await add_file(
        db_engine,
        world.a,
        world.product_a,
        SETTINGS,
        name="p.md",
        kind="md",
        data=PITCH_MD.encode(),
    )
    await run(db_engine, src, settings=make_settings(kb_embedding_batch_size=2))
    assert seen == [
        ("scan", 0),
        ("parse", 100),
        ("chunk", 0),
        ("embed", 0),
        ("embed", 50),
        ("embed", 99),
    ]


@pytest.mark.parametrize(
    ("name", "kind", "data", "failure", "stage"),
    [
        (
            "locked.pdf",
            "pdf",
            encrypt_pdf(make_pdf(["some secret text"]), user_password="pw"),
            "encrypted",
            "scan",
        ),
        ("scan.pdf", "pdf", make_pdf([None]), "no-text", "parse"),
        (
            "macro.docx",
            "docx",
            make_docx([(None, "hi")], extra={"word/vbaProject.bin": b"x"}),
            "rejected",
            "scan",
        ),
        ("broken.pdf", "pdf", b"%PDF-1.4 truncated", "unreadable", "parse"),
    ],
)
async def test_bad_files_fail_with_a_code(
    db_engine: AsyncEngine,
    world: KbWorld,
    name: str,
    kind: FileKind,
    data: bytes,
    failure: str,
    stage: str,
) -> None:
    src = await add_file(
        db_engine, world.a, world.product_a, SETTINGS, name=name, kind=kind, data=data
    )
    assert await run(db_engine, src) == "failed"
    done = await reload(db_engine, src.id)
    assert (done.status, done.failure, done.failure_stage, done.passage_count) == (
        "failed",
        failure,
        stage,
        0,
    )
    assert await chunks_of(db_engine, src.id) == []


async def test_a_missing_upload_is_interrupted(db_engine: AsyncEngine, world: KbWorld) -> None:
    src = await add_file(
        db_engine, world.a, world.product_a, SETTINGS, name="a.md", kind="md", data=b"# a\nb"
    )
    async with AsyncSession(db_engine) as s, s.begin():
        await s.execute(delete(KbSourceFile).where(KbSourceFile.source_id == src.id))
    assert await run(db_engine, src) == "failed"
    done = await reload(db_engine, src.id)
    assert (done.failure, done.failure_stage) == ("interrupted", "upload")


async def test_parse_timeout_is_unreadable(
    db_engine: AsyncEngine, world: KbWorld, monkeypatch: pytest.MonkeyPatch
) -> None:
    import time

    def slow(*args: object) -> None:
        time.sleep(0.3)

    monkeypatch.setattr(ingest_module, "parse_document", slow)
    src = await add_file(
        db_engine, world.a, world.product_a, SETTINGS, name="a.md", kind="md", data=b"x"
    )
    assert await run(db_engine, src, settings=make_settings(kb_parse_timeout_s=0.05)) == "failed"
    done = await reload(db_engine, src.id)
    assert (done.failure, done.note) == ("unreadable", "Reading the file took too long.")


# --- guards -------------------------------------------------------------------------------


async def test_a_reread_source_makes_old_jobs_stale(db_engine: AsyncEngine, world: KbWorld) -> None:
    src = await add_file(
        db_engine, world.a, world.product_a, SETTINGS, name="a.md", kind="md", data=b"# a\nbody"
    )
    async with as_tenant(db_engine, world.a) as s:
        fresh = await KnowledgeBaseService(s, world.a.org_id, SETTINGS).get_source(
            world.product_a, src.id
        )
        assert fresh is not None
        await KnowledgeBaseService(s, world.a.org_id, SETTINGS).start_reread(fresh)
    assert await run(db_engine, src) == "stale"  # generation 0 job
    assert (await reload(db_engine, src.id)).status == "processing"
    newer = await reload(db_engine, src.id)
    assert newer.generation == 1
    assert await run(db_engine, newer) == "ready"


async def test_a_removed_source_is_not_read(db_engine: AsyncEngine, world: KbWorld) -> None:
    src = await add_file(
        db_engine, world.a, world.product_a, SETTINGS, name="a.md", kind="md", data=b"# a\nbody"
    )
    async with AsyncSession(db_engine) as s, s.begin():
        await s.execute(
            update(KbSource).where(KbSource.id == src.id).values(deleted_at=KbSource.created_at)
        )
    assert await run(db_engine, src) == "stale"
    assert await chunks_of(db_engine, src.id) == []


class RereadDuring(HashingEmbedder):
    """Bumps the generation while embedding: the store must refuse the stale result."""

    def __init__(self, engine: AsyncEngine, source_id: uuid.UUID) -> None:
        super().__init__()
        self.engine, self.source_id = engine, source_id

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        async with AsyncSession(self.engine) as s, s.begin():
            await s.execute(
                update(KbSource).where(KbSource.id == self.source_id).values(generation=5)
            )
        return await super().embed(texts)


async def test_work_finished_after_a_reread_is_dropped(
    db_engine: AsyncEngine, world: KbWorld
) -> None:
    src = await add_file(
        db_engine, world.a, world.product_a, SETTINGS, name="a.md", kind="md", data=b"# a\nbody"
    )
    outcome = await run(
        db_engine,
        src,
        embedder=RereadDuring(db_engine, src.id),
        settings=make_settings(kb_embedding_batch_size=100),
    )
    assert outcome == "stale"
    assert await chunks_of(db_engine, src.id) == []


async def test_store_refuses_a_source_removed_at_the_last_moment(
    db_engine: AsyncEngine, world: KbWorld, monkeypatch: pytest.MonkeyPatch
) -> None:
    src = await add_file(
        db_engine, world.a, world.product_a, SETTINGS, name="a.md", kind="md", data=b"# a\nbody"
    )
    original = IngestJob._embed

    async def then_remove(self: IngestJob, chunks: Any) -> Any:
        vectors = await original(self, chunks)
        async with AsyncSession(db_engine) as s, s.begin():
            await s.execute(update(KbSource).where(KbSource.id == src.id).values(generation=9))
        return vectors

    monkeypatch.setattr(IngestJob, "_embed", then_remove)
    assert await run(db_engine, src) == "stale"
    assert await chunks_of(db_engine, src.id) == []


async def test_failing_a_stale_source_changes_nothing(
    db_engine: AsyncEngine, world: KbWorld
) -> None:
    src = await add_file(
        db_engine, world.a, world.product_a, SETTINGS, name="a.md", kind="md", data=b"# a\nbody"
    )
    assert await run(db_engine, src) == "ready"
    job = IngestJob(
        db=job_ctx(db_engine, SETTINGS)["db"],
        settings=SETTINGS,
        embedder=HashingEmbedder(),
        org_id=src.org_id,
        source_id=src.id,
        generation=src.generation + 1,
    )
    await job.fail(IngestFailure("no-text", "parse"))
    done = await reload(db_engine, src.id)
    assert done.status == "ready"
    assert len(await chunks_of(db_engine, src.id)) == done.passage_count


async def test_a_reread_replaces_passages(db_engine: AsyncEngine, world: KbWorld) -> None:
    long_doc = "# Guide\n\n" + "\n\n".join(f"Paragraph {i} " + "word " * 40 for i in range(12))
    src = await add_file(
        db_engine,
        world.a,
        world.product_a,
        SETTINGS,
        name="g.md",
        kind="md",
        data=long_doc.encode(),
    )
    await run(db_engine, src, job_try=2)
    assert (await reload(db_engine, src.id)).attempts == 2
    before = len(await chunks_of(db_engine, src.id))
    async with as_tenant(db_engine, world.a) as s:
        service = KnowledgeBaseService(s, world.a.org_id, SETTINGS)
        fresh = await service.get_source(world.product_a, src.id)
        assert fresh is not None
        await service.start_reread(fresh)
    assert (await reload(db_engine, src.id)).attempts == 0  # a re-read starts counting again
    small = make_settings(kb_chunk_chars=250, kb_chunk_overlap_chars=20)
    assert await run(db_engine, await reload(db_engine, src.id), settings=small) == "ready"
    chunks = await chunks_of(db_engine, src.id)
    assert len(chunks) > before
    assert [c.ordinal for c in chunks] == list(range(len(chunks)))
    assert (await reload(db_engine, src.id)).passage_count == len(chunks)


@pytest.mark.parametrize(
    "values",
    [
        {"skipped": "page 2"},  # a skip always says why
        {"skipped": "page 2", "skipped_reason": "bored"},
        {"skipped_reason": "scanned"},  # and a reason needs a skip
        {"attempts": -1},
    ],
)
async def test_the_database_enforces_skip_reasons_and_attempts(
    db_engine: AsyncEngine, world: KbWorld, values: dict[str, Any]
) -> None:
    src = await add_file(
        db_engine, world.a, world.product_a, SETTINGS, name="a.md", kind="md", data=b"# a\nbody"
    )
    with pytest.raises(IntegrityError):
        async with as_tenant(db_engine, world.a) as s:
            await s.execute(update(KbSource).where(KbSource.id == src.id).values(**values))


# --- retries --------------------------------------------------------------------------


async def test_a_job_for_an_uncommitted_source_retries_then_gives_up(
    db_engine: AsyncEngine, world: KbWorld
) -> None:
    ctx = job_ctx(db_engine, SETTINGS)
    with pytest.raises(Retry):
        await ingest_source(ctx, str(world.a.org_id), str(uuid.uuid4()), 0)
    ctx["job_try"] = 3
    assert await ingest_source(ctx, str(world.a.org_id), str(uuid.uuid4()), 0) == "missing"


async def test_another_orgs_source_is_invisible_to_the_job(
    db_engine: AsyncEngine, world: KbWorld
) -> None:
    src = await add_file(
        db_engine, world.a, world.product_a, SETTINGS, name="a.md", kind="md", data=b"# a\nbody"
    )
    ctx = job_ctx(db_engine, SETTINGS, job_try=3)
    # Wrong org in the job arguments: RLS hides the row, so nothing is read or written.
    assert await ingest_source(ctx, str(world.b.org_id), str(src.id), 0) == "missing"
    assert (await reload(db_engine, src.id)).status == "processing"


class Down(HashingEmbedder):
    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        raise EmbeddingUnavailable("503")


async def test_transient_failures_retry_with_backoff_then_give_up(
    db_engine: AsyncEngine, world: KbWorld
) -> None:
    src = await add_file(
        db_engine, world.a, world.product_a, SETTINGS, name="a.md", kind="md", data=b"# a\nbody"
    )
    assert (await reload(db_engine, src.id)).attempts == 0  # queued, not started
    with pytest.raises(Retry) as info:
        await run(db_engine, src, embedder=Down(), job_try=2)
    assert info.value.defer_score == 4000
    waiting = await reload(db_engine, src.id)
    assert (waiting.status, waiting.attempts) == ("processing", 2)
    assert await run(db_engine, src, embedder=Down(), job_try=SETTINGS.worker_max_tries) == "failed"
    done = await reload(db_engine, src.id)
    assert (done.failure, done.note) == ("interrupted", "Corral couldn't finish reading it.")
    assert done.attempts == SETTINGS.worker_max_tries


async def test_database_errors_are_transient(
    db_engine: AsyncEngine, world: KbWorld, monkeypatch: pytest.MonkeyPatch
) -> None:
    src = await add_file(
        db_engine, world.a, world.product_a, SETTINGS, name="a.md", kind="md", data=b"# a\nbody"
    )

    async def down(self: IngestJob) -> None:
        raise OperationalError("SELECT 1", {}, Exception("server closed the connection"))

    monkeypatch.setattr(IngestJob, "_load", down)
    with pytest.raises(Retry):
        await run(db_engine, src)


class Refuses(HashingEmbedder):
    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        raise EmbeddingRejected("401")


async def test_a_refused_embedding_fails_the_source(db_engine: AsyncEngine, world: KbWorld) -> None:
    src = await add_file(
        db_engine, world.a, world.product_a, SETTINGS, name="a.md", kind="md", data=b"# a\nbody"
    )
    assert await run(db_engine, src, embedder=Refuses()) == "failed"
    assert (await reload(db_engine, src.id)).failure_stage == "embed"


class Bug(HashingEmbedder):
    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        raise RuntimeError("bug")


async def test_a_bug_marks_the_source_and_surfaces(db_engine: AsyncEngine, world: KbWorld) -> None:
    src = await add_file(
        db_engine, world.a, world.product_a, SETTINGS, name="a.md", kind="md", data=b"# a\nbody"
    )
    with pytest.raises(RuntimeError, match="bug"):
        await run(db_engine, src, embedder=Bug())
    assert (await reload(db_engine, src.id)).failure == "interrupted"


async def test_malformed_arguments_fail_fast() -> None:
    with pytest.raises(ValueError):
        await ingest_source({"db": None, "settings": SETTINGS, "embedder": None}, "nope", "nope", 0)


# --- web sources ----------------------------------------------------------------------


def web_factory(web: Web) -> Any:
    import httpx

    from app.kb.web import SafeFetcher

    return lambda config: SafeFetcher(
        config, resolver=web.resolve, transport=httpx.MockTransport(web.handle)
    )


async def test_a_web_page_is_fetched_and_read(db_engine: AsyncEngine, world: KbWorld) -> None:
    web = Web(dns={"coldtrace.io": [PUBLIC_IP]})
    web.add(
        "coldtrace.io",
        "/pharmacy",
        body="<h1>Pharmacies</h1><p>Prove vaccines stayed between 2 and 8 C.</p>",
    )
    src = await add_url(
        db_engine, world.a, world.product_a, SETTINGS, "https://coldtrace.io/pharmacy"
    )
    assert (src.kind, src.name, src.stage) == ("url", "coldtrace.io/pharmacy", "upload")
    assert await run(db_engine, src, fetcher_factory=web_factory(web)) == "ready"
    chunks = await chunks_of(db_engine, src.id)
    assert {c.loc for c in chunks} == {"/pharmacy"}
    assert (await reload(db_engine, src.id)).pages_total == 1


async def test_a_section_crawl_reports_page_progress(
    db_engine: AsyncEngine, world: KbWorld, monkeypatch: pytest.MonkeyPatch
) -> None:
    web = Web(dns={"coldtrace.io": [PUBLIC_IP]})
    web.add("coldtrace.io", "/blog", body="<p>Index page</p><a href='/blog/a'>a</a>")
    web.add("coldtrace.io", "/blog/a", body="<p>Post A text</p>")
    stages: list[tuple[str, int]] = []
    original = IngestJob.progress

    async def spy(self: IngestJob, stage: str, pct: int, **values: Any) -> None:
        stages.append((stage, pct))
        await original(self, stage, pct, **values)  # type: ignore[arg-type]

    monkeypatch.setattr(IngestJob, "progress", spy)
    src = await add_url(
        db_engine, world.a, world.product_a, SETTINGS, "https://coldtrace.io/blog", "section"
    )
    settings = make_settings(kb_crawl_max_pages=4)
    assert await run(db_engine, src, settings=settings, fetcher_factory=web_factory(web)) == "ready"
    assert stages[:2] == [("upload", 0), ("upload", 50)]
    assert (await reload(db_engine, src.id)).pages_total == 2


async def test_a_blocked_page_fails(db_engine: AsyncEngine, world: KbWorld) -> None:
    web = Web(dns={"coldtrace.io": [PUBLIC_IP]})
    web.add(
        "coldtrace.io", "/robots.txt", body="User-agent: *\nDisallow: /", content_type="text/plain"
    )
    src = await add_url(db_engine, world.a, world.product_a, SETTINGS, "https://coldtrace.io/x")
    assert await run(db_engine, src, fetcher_factory=web_factory(web)) == "failed"
    done = await reload(db_engine, src.id)
    assert (done.failure, done.failure_stage) == ("blocked", "upload")


async def test_the_default_fetcher_refuses_private_dns(
    db_engine: AsyncEngine, world: KbWorld, monkeypatch: pytest.MonkeyPatch
) -> None:
    """No injected fetcher: the real SafeFetcher + resolver run (DNS answer is private)."""

    async def private(host: str, port: int) -> list[str]:
        return ["10.0.0.7"]

    from app.kb import web as web_module

    monkeypatch.setattr(web_module.SafeFetcher.__init__, "__defaults__", (private, None))
    src = await add_url(
        db_engine, world.a, world.product_a, SETTINGS, "https://intranet-looking.example.com/"
    )
    assert await run(db_engine, src) == "failed"
    assert (await reload(db_engine, src.id)).failure == "blocked"


# --- through a real worker and queue ------------------------------------------------------


async def test_enqueued_ingest_runs_in_the_worker(
    clean_redis: str, migrated_database: str, db_engine: AsyncEngine, world: KbWorld
) -> None:
    src = await add_file(
        db_engine,
        world.a,
        world.product_a,
        SETTINGS,
        name="p.md",
        kind="md",
        data=PITCH_MD.encode(),
    )
    settings = make_settings(database_url=migrated_database, redis_url=clean_redis)
    queue = JobQueue.from_settings(settings)
    try:
        assert await queue.enqueue_ingest_source(src.org_id, src.id, src.generation) is not None
        assert await queue.enqueue_ingest_source(src.org_id, src.id, src.generation) is None
        kwargs = build_worker_kwargs(settings)
        kwargs.pop("queue_name")
        worker = Worker(
            **kwargs,
            redis_pool=queue.redis,
            queue_name=QUEUE_NAME,
            burst=True,
            handle_signals=False,
            poll_delay=0.05,
        )
        await asyncio.wait_for(worker.async_run(), timeout=20)
        await worker.close()
    finally:
        await queue.close()
    assert (await reload(db_engine, src.id)).status == "ready"
