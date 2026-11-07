"""A product's knowledge base: add files and web pages, follow their reading, search.

Adds return ``202`` with the new source in ``processing``; the worker moves it through
``upload -> scan -> parse -> chunk -> embed`` and the client polls ``GET .../sources``.
Every state-changing route requires an allow-listed ``Origin`` (CSRF), and the upload
body is capped before it is read (``UploadLimitMiddleware``).
"""

import uuid
from typing import Annotated, Literal

import structlog
from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile

from app.api.v1.deps import PageDep
from app.api.v1.kb_schemas import (
    PassageOut,
    Person,
    SearchHit,
    SearchRequest,
    SourceOut,
    UrlSourceCreate,
)
from app.auth.deps import AuthContextDep, DbDep, RateLimiterDep, SettingsDep, require_trusted_origin
from app.auth.ratelimit import RateLimited, RateRule
from app.billing.entitlements import require_billable_work
from app.core.errors import ApiProblem
from app.kb.embeddings import Embedder
from app.kb.files import UploadRejected, check_upload, sanitize_filename
from app.kb.service import (
    DuplicateSource,
    KnowledgeBaseFull,
    KnowledgeBaseService,
    overall_progress,
)
from app.kb.web import UrlRejected, normalize_url
from app.models.identity import User
from app.models.knowledge import KbSource
from app.repositories import ProductRepository
from app.worker.queue import JobQueue

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/products/{product_id}/knowledge", tags=["knowledge base"])
WRITE = [Depends(require_trusted_origin)]
UPLOAD_PATH_SUFFIX = "/knowledge/sources/files"


def get_queue(request: Request) -> JobQueue:
    queue: JobQueue = request.app.state.queue
    return queue


def get_embedder(request: Request) -> Embedder:
    embedder: Embedder = request.app.state.embedder
    return embedder


QueueDep = Annotated[JobQueue, Depends(get_queue)]
EmbedderDep = Annotated[Embedder, Depends(get_embedder)]


async def get_service(
    product_id: uuid.UUID, ctx: AuthContextDep, db: DbDep, settings: SettingsDep
) -> KnowledgeBaseService:
    """The caller's KB service, after checking the product exists *in their org*."""
    if await ProductRepository(db, ctx.org.id).get(product_id) is None:
        raise ApiProblem(404, "not_found", "Product not found")
    return KnowledgeBaseService(db, ctx.org.id, settings)


ServiceDep = Annotated[KnowledgeBaseService, Depends(get_service)]


COMPUTED = frozenset({"progress", "added_by"})


def person(user: User) -> Person:
    name = " ".join(p.strip() for p in (user.first_name, user.last_name) if p and p.strip())
    return Person(id=user.id, name=name or user.email, avatar_url=user.profile_picture_url)


def source_out(source: KbSource, people: dict[uuid.UUID, User]) -> SourceOut:
    who = people.get(source.added_by_user_id) if source.added_by_user_id else None
    return SourceOut.model_validate(
        {**{c: getattr(source, c) for c in SourceOut.model_fields if c not in COMPUTED},
         "progress": overall_progress(source),
         "added_by": person(who) if who is not None else None}
    )  # fmt: skip


async def sources_out(service: KnowledgeBaseService, sources: list[KbSource]) -> list[SourceOut]:
    people = await service.contributors(s.added_by_user_id for s in sources)
    return [source_out(s, people) for s in sources]


async def one_out(service: KnowledgeBaseService, source: KbSource) -> SourceOut:
    (out,) = await sources_out(service, [source])
    return out


async def load_source(service: ServiceDep, product_id: uuid.UUID, source_id: uuid.UUID) -> KbSource:
    source = await service.get_source(product_id, source_id)
    if source is None:
        raise ApiProblem(404, "not_found", "Source not found")
    return source


SourceDep = Annotated[KbSource, Depends(load_source)]


def _duplicate(exc: DuplicateSource) -> ApiProblem:
    return ApiProblem(
        409,
        "duplicate",
        "Already in this knowledge base.",
        extra={"existing_source_id": str(exc.existing.id)},
    )


async def _limit_adds(limiter: RateLimiterDep, settings: SettingsDep, ctx: AuthContextDep) -> None:
    rule = RateRule("kb_add_user", settings.kb_uploads_per_user, settings.kb_upload_window_s)
    try:
        await limiter.hit([(rule, str(ctx.user.id))])
    except RateLimited as exc:
        raise ApiProblem(
            429,
            "rate_limited",
            "Too many uploads. Try again shortly.",
            retry_after_s=exc.retry_after_s,
        ) from exc


AddLimit = Depends(_limit_adds)


async def _enqueue(queue: JobQueue, source: KbSource) -> None:
    await queue.enqueue_ingest_source(source.org_id, source.id, source.generation)
    log.info("kb_source_queued", source_id=str(source.id), kind=source.kind)


@router.get("/sources")
async def list_sources(
    service: ServiceDep,
    product_id: uuid.UUID,
    page: PageDep,
    kind: Annotated[Literal["file", "url"] | None, Query()] = None,
    status: Annotated[Literal["processing", "ready", "partial", "failed"] | None, Query()] = None,
    include_removed: bool = False,
) -> list[SourceOut]:
    rows = await service.list_sources(
        product_id,
        kind=kind,
        status=status,
        include_removed=include_removed,
        limit=page.limit,
        offset=page.offset,
    )
    return await sources_out(service, list(rows))


@router.post(
    "/sources/files",
    status_code=202,
    dependencies=[*WRITE, AddLimit],
    responses={
        409: {"description": "duplicate (with existing_source_id) | kb_full"},
        411: {"description": "Content-Length required"},
        413: {"description": "too_large"},
        415: {"description": "unsupported | type_mismatch"},
        422: {"description": "empty"},
        429: {"description": "rate_limited; see Retry-After"},
    },
)
async def upload_file(
    service: ServiceDep,
    ctx: AuthContextDep,
    settings: SettingsDep,
    queue: QueueDep,
    product_id: uuid.UUID,
    file: Annotated[UploadFile, File(description="PDF, DOCX or Markdown")],
    replace_source_id: Annotated[uuid.UUID | None, Form()] = None,
) -> SourceOut:
    """Add one file. ``replace_source_id`` removes that source in the same step."""
    data = await file.read(settings.kb_max_file_bytes + 1)
    filename = sanitize_filename(file.filename)
    try:
        kind = check_upload(filename, data, max_bytes=settings.kb_max_file_bytes)
    except UploadRejected as exc:
        raise ApiProblem(exc.status_code, exc.error, exc.detail) from exc
    await require_billable_work(service.session, settings, ctx.org.id)
    replace = None
    if replace_source_id is not None:
        replace = await service.get_source(product_id, replace_source_id)
        if replace is None:
            raise ApiProblem(404, "not_found", "The source to replace wasn't found")
    try:
        source = await service.add_file(
            product_id,
            filename=filename,
            kind=kind,
            data=data,
            added_by=ctx.user.id,
            replace=replace,
        )
    except DuplicateSource as exc:
        raise _duplicate(exc) from exc
    except KnowledgeBaseFull as exc:
        raise ApiProblem(409, "kb_full", exc.detail) from exc
    await _enqueue(queue, source)
    return await one_out(service, source)


@router.post(
    "/sources/urls",
    status_code=202,
    dependencies=[*WRITE, AddLimit],
    responses={
        409: {"description": "duplicate (with existing_source_id) | kb_full"},
        422: {"description": "url_invalid | url_not_public"},
        429: {"description": "rate_limited; see Retry-After"},
    },
)
async def add_url(
    service: ServiceDep,
    ctx: AuthContextDep,
    settings: SettingsDep,
    queue: QueueDep,
    product_id: uuid.UUID,
    body: UrlSourceCreate,
) -> SourceOut:
    """Add a web page (or a section of a site). Addresses are re-checked on every fetch."""
    try:
        url = normalize_url(body.url, allowed_ports=settings.kb_url_allowed_ports)
    except UrlRejected as exc:
        raise ApiProblem(422, exc.error, exc.detail) from exc
    await require_billable_work(service.session, settings, ctx.org.id)
    try:
        source = await service.add_url(product_id, url=url, scope=body.scope, added_by=ctx.user.id)
    except DuplicateSource as exc:
        raise _duplicate(exc) from exc
    except KnowledgeBaseFull as exc:
        raise ApiProblem(409, "kb_full", exc.detail) from exc
    await _enqueue(queue, source)
    return await one_out(service, source)


@router.get("/sources/{source_id}")
async def get_source(service: ServiceDep, source: SourceDep) -> SourceOut:
    return await one_out(service, source)


@router.get("/sources/{source_id}/passages")
async def list_passages(service: ServiceDep, source: SourceDep, page: PageDep) -> list[PassageOut]:
    rows = await service.passages(source, limit=page.limit, offset=page.offset)
    return [PassageOut.model_validate(r) for r in rows]


@router.delete("/sources/{source_id}", dependencies=WRITE)
async def remove_source(service: ServiceDep, source: SourceDep) -> SourceOut:
    """Soft delete: passages leave retrieval immediately; ``restore`` undoes it."""
    return await one_out(service, await service.remove(source))


@router.post("/sources/{source_id}/restore", dependencies=WRITE)
async def restore_source(service: ServiceDep, source: SourceDep) -> SourceOut:
    try:
        return await one_out(service, await service.restore(source))
    except DuplicateSource as exc:
        raise _duplicate(exc) from exc
    except KnowledgeBaseFull as exc:
        raise ApiProblem(409, "kb_full", exc.detail) from exc


@router.post("/sources/{source_id}/reread", status_code=202, dependencies=[*WRITE, AddLimit])
async def reread_source(service: ServiceDep, source: SourceDep, queue: QueueDep) -> SourceOut:
    if source.deleted_at is not None:
        raise ApiProblem(409, "removed", "Restore the source before reading it again.")
    await require_billable_work(service.session, service.settings, service.org_id)
    source = await service.start_reread(source)
    await _enqueue(queue, source)
    return await one_out(service, source)


@router.post("/search")
async def search(
    service: ServiceDep,
    embedder: EmbedderDep,
    settings: SettingsDep,
    product_id: uuid.UUID,
    body: SearchRequest,
) -> list[SearchHit]:
    """Passages closest to ``query`` from this product's ready and partial sources."""
    (vector,) = await embedder.embed([body.query])
    rows = await service.search(
        product_id, vector, limit=min(body.limit, settings.kb_search_max_results)
    )
    return [
        SearchHit(
            passage_id=chunk.id,
            source_id=chunk.source_id,
            source_name=name,
            source_kind=kind,
            loc=chunk.loc,
            text=chunk.text,
            score=round(float(score), 6),
        )
        for chunk, name, kind, score in rows
    ]
