"""The ingestion job: scan -> parse -> chunk -> embed -> store, with progress on the row.

Each progress update and the final write are short, separate tenant transactions, so
the client (polling the source) sees stages move. Every write is guarded by the source's
``generation`` and ``deleted_at``: a job whose source was re-read or removed meanwhile
drops its work instead of resurrecting stale passages.

Failures are classified once, here:

* ``IngestFailure`` (bad file, blocked page...): the source is ``failed`` with that code.
* Transient (database, network, embedding provider down): ``Retry`` with backoff; when
  the last try fails too, the source is ``failed`` / ``interrupted``.
* Anything else is a bug: logged, the source is ``failed`` / ``interrupted``, re-raised.
"""

import asyncio
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

import structlog
from arq import Retry
from sqlalchemy import delete, insert, select, update

from app.core.config import Settings
from app.db.session import Database, tenant_transaction
from app.kb.chunking import Chunk, chunk_sections
from app.kb.embeddings import Embedder, EmbeddingRejected, EmbeddingUnavailable
from app.kb.errors import FileKind, IngestFailure, Stage
from app.kb.parsing import ParsedDocument, ParseLimits, parse_document
from app.kb.web import FetchConfig, SafeFetcher, read_web_source
from app.models.knowledge import KbChunk, KbSource, KbSourceFile
from app.worker.jobs import TRANSIENT_ERRORS, retry_delay_s

log = structlog.get_logger(__name__)

MISSING_SOURCE_TRIES = 3  # the enqueueing request may not have committed yet
Outcome = Literal["ready", "partial", "failed", "stale", "missing"]
FetcherFactory = Callable[[FetchConfig], SafeFetcher]
RETRYABLE: tuple[type[BaseException], ...] = (*TRANSIENT_ERRORS, EmbeddingUnavailable)


@dataclass(frozen=True, slots=True)
class _Loaded:
    kind: str
    url: str | None
    scope: str | None
    data: bytes | None


class _Stale(Exception):
    """The source was removed or re-read after this job started."""


class IngestJob:
    def __init__(
        self,
        *,
        db: Database,
        settings: Settings,
        embedder: Embedder,
        org_id: uuid.UUID,
        source_id: uuid.UUID,
        generation: int,
        fetcher_factory: FetcherFactory | None = None,
    ) -> None:
        self.db = db
        self.settings = settings
        self.embedder = embedder
        self.org_id = org_id
        self.source_id = source_id
        self.generation = generation
        self.fetcher_factory = fetcher_factory or (lambda config: SafeFetcher(config))
        self.limits = ParseLimits.from_settings(settings)

    def _current(self) -> Any:
        return (
            (KbSource.org_id == self.org_id)
            & (KbSource.id == self.source_id)
            & (KbSource.generation == self.generation)
            & KbSource.deleted_at.is_(None)
        )

    async def _load(self) -> _Loaded | None:
        async with tenant_transaction(self.db, self.org_id) as session:
            source = (
                await session.execute(select(KbSource).where(KbSource.id == self.source_id))
            ).scalar_one_or_none()
            if source is None:
                return None
            if source.generation != self.generation or source.deleted_at is not None:
                raise _Stale
            data = None
            if source.kind != "url":
                data = (
                    await session.execute(
                        select(KbSourceFile.data).where(KbSourceFile.source_id == source.id)
                    )
                ).scalar_one_or_none()
                if data is None:
                    raise IngestFailure("interrupted", "upload", "The upload wasn't stored.")
            return _Loaded(kind=source.kind, url=source.url, scope=source.scope, data=data)

    async def progress(self, stage: Stage, pct: int, **values: Any) -> None:
        async with tenant_transaction(self.db, self.org_id) as session:
            result = await session.execute(
                update(KbSource)
                .where(self._current())
                .values(stage=stage, stage_pct=max(0, min(100, pct)), **values)
                .returning(KbSource.id)
            )
            if result.scalar_one_or_none() is None:
                raise _Stale

    async def _parse_file(self, kind: FileKind, data: bytes) -> ParsedDocument:
        await self.progress("scan", 0)
        try:
            async with asyncio.timeout(self.settings.kb_parse_timeout_s):
                parsed = await asyncio.to_thread(parse_document, kind, data, self.limits)
        except TimeoutError as exc:
            raise IngestFailure("unreadable", "parse", "Reading the file took too long.") from exc
        await self.progress("parse", 100, pages_total=parsed.pages_total)
        return parsed

    async def _read_url(self, url: str, scope: str | None) -> ParsedDocument:
        await self.progress("upload", 0)
        fetcher = self.fetcher_factory(FetchConfig.from_settings(self.settings))

        async def on_page(done: int, cap: int) -> None:
            await self.progress("upload", done * 100 // cap)

        try:
            parsed = await read_web_source(
                fetcher,
                url,
                scope="section" if scope == "section" else "page",
                limits=self.limits,
                on_page=on_page,
            )
        finally:
            await fetcher.aclose()
        await self.progress("parse", 100, pages_total=parsed.pages_total)
        return parsed

    async def _embed(self, chunks: list[Chunk]) -> list[list[float]]:
        await self.progress("embed", 0)
        vectors: list[list[float]] = []
        batch = self.settings.kb_embedding_batch_size
        for start in range(0, len(chunks), batch):
            vectors.extend(
                await self.embedder.embed([c.text for c in chunks[start : start + batch]])
            )
            await self.progress("embed", min(99, len(vectors) * 100 // len(chunks)))
        return vectors

    async def _store(
        self, source: ParsedDocument, chunks: list[Chunk], vectors: list[list[float]]
    ) -> Outcome:
        status: Outcome = "partial" if source.partial else "ready"
        async with tenant_transaction(self.db, self.org_id) as session:
            locked = (
                await session.execute(
                    select(KbSource.product_id).where(self._current()).with_for_update()
                )
            ).scalar_one_or_none()
            if locked is None:
                raise _Stale
            await session.execute(delete(KbChunk).where(KbChunk.source_id == self.source_id))
            await session.execute(
                insert(KbChunk),
                [
                    {
                        "org_id": self.org_id,
                        "product_id": locked,
                        "source_id": self.source_id,
                        "ordinal": chunk.ordinal,
                        "loc": chunk.loc,
                        "text": chunk.text,
                        "embedding": vector,
                    }
                    for chunk, vector in zip(chunks, vectors, strict=True)
                ],
            )
            await session.execute(
                update(KbSource)
                .where(self._current())
                .values(
                    status=status,
                    stage=None,
                    stage_pct=100,
                    failure=None,
                    failure_stage=None,
                    pages_total=source.pages_total,
                    pages_read=source.pages_read,
                    skipped=source.skipped,
                    note=source.note,
                    passage_count=len(chunks),
                    processed_at=datetime.now(UTC),
                )
            )
        return status

    async def fail(self, failure: IngestFailure) -> None:
        async with tenant_transaction(self.db, self.org_id) as session:
            updated = (
                await session.execute(
                    update(KbSource)
                    .where(self._current())
                    .values(
                        status="failed",
                        failure=failure.failure,
                        failure_stage=failure.stage,
                        note=failure.note,
                        stage=None,
                        passage_count=0,
                        processed_at=datetime.now(UTC),
                    )
                    .returning(KbSource.id)
                )
            ).scalar_one_or_none()
            if updated is not None:  # a failed source contributes nothing to retrieval
                await session.execute(delete(KbChunk).where(KbChunk.source_id == self.source_id))

    async def run(self) -> Outcome:
        loaded = await self._load()
        if loaded is None:
            return "missing"
        if loaded.kind == "url":
            assert loaded.url is not None  # noqa: S101 - enforced by ck_kb_sources_url_iff_web
            parsed = await self._read_url(loaded.url, loaded.scope)
        else:
            assert loaded.data is not None  # noqa: S101 - _load raises otherwise
            parsed = await self._parse_file(loaded.kind, loaded.data)  # type: ignore[arg-type]
        await self.progress("chunk", 0)
        chunks = chunk_sections(
            parsed.sections,
            size=self.settings.kb_chunk_chars,
            overlap=self.settings.kb_chunk_overlap_chars,
        )
        try:
            vectors = await self._embed(chunks)
        except EmbeddingRejected as exc:
            log.warning("kb_embedding_rejected", reason=str(exc))
            raise IngestFailure("interrupted", "embed", "The indexing service refused it.") from exc
        return await self._store(parsed, chunks, vectors)


async def ingest_source(
    ctx: dict[str, Any], org_id: str, source_id: str, generation: int
) -> Outcome:
    """arq entrypoint. Arguments are primitives; malformed ids fail fast (no retry)."""
    job = IngestJob(
        db=ctx["db"],
        settings=ctx["settings"],
        embedder=ctx["embedder"],
        org_id=uuid.UUID(org_id),
        source_id=uuid.UUID(source_id),
        generation=int(generation),
        fetcher_factory=ctx.get("fetcher_factory"),
    )
    job_try = int(ctx.get("job_try", 1))
    max_tries = job.settings.worker_max_tries
    bound = log.bind(
        job="ingest_source", source_id=source_id, generation=generation, job_try=job_try
    )
    try:
        outcome = await job.run()
    except _Stale:
        bound.info("kb_ingest_stale")
        return "stale"
    except IngestFailure as failure:
        await job.fail(failure)
        bound.info("kb_ingest_failed", failure=failure.failure, stage=failure.stage)
        return "failed"
    except RETRYABLE as exc:
        if job_try >= max_tries:
            await job.fail(
                IngestFailure("interrupted", "embed", "Corral couldn't finish reading it.")
            )
            bound.warning("kb_ingest_gave_up", error_type=type(exc).__name__)
            return "failed"
        delay = retry_delay_s(job_try)
        bound.warning("kb_ingest_retry", error_type=type(exc).__name__, retry_in_s=delay)
        raise Retry(defer=delay) from exc
    except Exception as exc:
        bound.exception("kb_ingest_crashed", error_type=type(exc).__name__)
        await job.fail(IngestFailure("interrupted", "parse", "Something went wrong reading it."))
        raise
    if outcome == "missing":
        if job_try < MISSING_SOURCE_TRIES:
            raise Retry(defer=retry_delay_s(job_try))
        bound.info("kb_ingest_source_missing")
        return "missing"
    bound.info("kb_ingest_done", outcome=outcome)
    return outcome
