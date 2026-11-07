"""CSV lead import: check or dry-run a file, start it, follow it, fetch the rows left behind.

``POST /lead-imports`` with ``dry_run=true`` returns the plan (create / update / skip /
errors) without storing anything; otherwise the upload is stored and ``202`` returned while
the worker applies it atomically. The body is capped before it is read
(``UploadLimitMiddleware``) and adds are rate-limited per user.
"""

import hashlib
import json
import re
import uuid
from typing import Annotated
from urllib.parse import quote

import structlog
from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import Response
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import select

from app.api.v1.deps import PageDep
from app.api.v1.lead_schemas import DryRunOut, ImportOut, ImportPlanOut, RowErrorOut
from app.auth.deps import AuthContextDep, DbDep, RateLimiterDep, SettingsDep, require_trusted_origin
from app.auth.ratelimit import RateLimited, RateRule
from app.billing.entitlements import require_billable_work
from app.core.errors import ApiProblem
from app.kb.files import sanitize_filename
from app.leads.csv_import import (
    CsvLimits,
    ImportRejected,
    Policy,
    Target,
    check_file,
    classify,
    plan_of,
    read_file,
)
from app.leads.importer import load_existing
from app.models.crm import LeadImport
from app.worker.queue import JobQueue

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/lead-imports", tags=["lead import"])
UPLOAD_PATH_SUFFIX = "/lead-imports"
MAX_SHOWN_ERRORS = 100
MAPPING = TypeAdapter(list[Target])


def get_queue(request: Request) -> JobQueue:
    queue: JobQueue = request.app.state.queue
    return queue


QueueDep = Annotated[JobQueue, Depends(get_queue)]


async def _limit(limiter: RateLimiterDep, settings: SettingsDep, ctx: AuthContextDep) -> None:
    rule = RateRule(
        "lead_import_user", settings.leads_imports_per_user, settings.leads_import_window_s
    )
    try:
        await limiter.hit([(rule, str(ctx.user.id))])
    except RateLimited as exc:
        raise ApiProblem(
            429,
            "rate_limited",
            "Too many imports. Try again shortly.",
            retry_after_s=exc.retry_after_s,
        ) from exc


def import_out(row: LeadImport) -> ImportOut:
    fields = {c: getattr(row, c) for c in ImportOut.model_fields if c != "has_errors_file"}
    return ImportOut.model_validate({**fields, "has_errors_file": row.errors_csv is not None})


def parse_mapping(raw: str) -> list[Target]:
    try:
        return MAPPING.validate_python(json.loads(raw))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise ApiProblem(
            422, "invalid_mapping", 'mapping is a JSON list like ["company", "email", "skip"].'
        ) from exc


@router.post(
    "",
    status_code=202,
    response_model=ImportOut,
    dependencies=[Depends(require_trusted_origin), Depends(_limit)],
    responses={
        200: {"model": DryRunOut, "description": "dry_run=true: the plan, nothing stored"},
        403: {"description": "Origin not allowed"},
        411: {"description": "Content-Length required"},
        413: {"description": "too_large"},
        415: {"description": "unsupported | not_text"},
        422: {"description": "empty | encoding | one_column | no_rows | too_many_rows | "
              "too_many_columns | field_too_large | malformed | mapping | invalid_mapping"},
        429: {"description": "rate_limited; see Retry-After"},
    },
)  # fmt: skip
async def create_import(
    ctx: AuthContextDep,
    db: DbDep,
    settings: SettingsDep,
    queue: QueueDep,
    file: Annotated[UploadFile, File(description="CSV (comma, semicolon or tab), UTF-8")],
    mapping: Annotated[str, Form(description='JSON list: a field or "skip" per column')],
    policy: Annotated[Policy, Form(description="What to do with rows already in Corral")] = "skip",
    dry_run: Annotated[bool, Form()] = False,
) -> ImportOut | Response:
    limits = CsvLimits.from_settings(settings)
    data = await file.read(limits.max_bytes + 1)
    filename = sanitize_filename(file.filename)
    targets = parse_mapping(mapping)
    try:
        check_file(filename, len(data), limits)
        parsed, records = read_file(data, targets, limits)
    except ImportRejected as exc:
        raise ApiProblem(exc.status_code, exc.code, exc.detail) from exc
    if dry_run:
        known = await load_existing(
            db, ctx.org.id, records, match_by_name=settings.leads_match_company_by_name
        )
        classified = classify(
            records,
            existing_emails=frozenset(known.people_by_email),
            existing_domains=frozenset(known.by_domain),
        )
        plan = plan_of(classified, policy)
        body = DryRunOut(
            plan=ImportPlanOut.model_validate(plan, from_attributes=True),
            headers=parsed.headers,
            errors=[RowErrorOut.model_validate(e) for e in classified.errors[:MAX_SHOWN_ERRORS]],
        )
        return Response(body.model_dump_json(), status_code=200, media_type="application/json")
    await require_billable_work(db, settings, ctx.org.id)
    row = LeadImport(
        org_id=ctx.org.id,
        filename=filename,
        byte_size=len(data),
        content_sha256=hashlib.sha256(data).hexdigest(),
        policy=policy,
        mapping=list(targets),
        data=data,
        created_by_user_id=ctx.user.id,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    await queue.enqueue_import_leads(row.org_id, row.id)
    log.info("lead_import_queued", import_id=str(row.id), rows=len(records), policy=policy)
    return import_out(row)


@router.get("")
async def list_imports(db: DbDep, ctx: AuthContextDep, page: PageDep) -> list[ImportOut]:
    stmt = (
        select(LeadImport)
        .where(LeadImport.org_id == ctx.org.id)
        .order_by(LeadImport.created_at.desc(), LeadImport.id)
        .limit(page.limit)
        .offset(page.offset)
    )
    return [import_out(r) for r in (await db.execute(stmt)).scalars()]


async def load(db: DbDep, ctx: AuthContextDep, import_id: uuid.UUID) -> LeadImport:
    stmt = select(LeadImport).where(LeadImport.org_id == ctx.org.id, LeadImport.id == import_id)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise ApiProblem(404, "not_found", "Import not found")
    return row


ImportDep = Annotated[LeadImport, Depends(load)]


@router.get("/{import_id}")
async def get_import(row: ImportDep) -> ImportOut:
    """Poll this for progress; ``status`` ends in done or failed."""
    return import_out(row)


@router.get(
    "/{import_id}/errors.csv",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}}, 404: {"description": "not_found | no_errors"}},
)
async def download_errors(row: ImportDep) -> Response:
    """The rows left behind, with a Problem column. Cells are spreadsheet-safe."""
    if row.errors_csv is None:
        raise ApiProblem(404, "no_errors", "This import has no rows left behind.")
    return Response(
        row.errors_csv,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": attachment(row.filename)},
    )


def attachment(filename: str) -> str:
    """``Content-Disposition`` for ``<stem>-problems.csv``: an ASCII fallback plus RFC 5987."""
    name = f"{filename.rsplit('.', 1)[0] or 'import'}-problems.csv"
    ascii_name = re.sub(r"[^A-Za-z0-9._ -]", "_", name)
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name, safe='')}"
