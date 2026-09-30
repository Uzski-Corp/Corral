"""The lead table: companies with their primary person, filtered, sorted and paged.

``POST /companies/query`` carries rules in the body (too structured for a query string)
but only reads, like search. Every other POST/PATCH/DELETE changes state and requires an
allow-listed ``Origin`` (CSRF).
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import ColumnElement, and_

from app.api.v1.lead_schemas import (
    BulkOut,
    BulkRequest,
    BulkSegment,
    BulkSetReply,
    CompanyCreate,
    CompanyDetail,
    CompanyOut,
    CompanyPage,
    CompanyUpdate,
    EnrollPlanOut,
    EnrollPlanRequest,
    FitOut,
    MergeRequest,
    PersonOut,
)
from app.auth.deps import AuthContextDep, DbDep, SettingsDep, require_trusted_origin
from app.core.errors import ApiProblem
from app.leads.query import (
    CompanyQuery,
    CompanyRow,
    Direction,
    InvalidCursor,
    NeedsProduct,
    Page,
    Sort,
    SortKey,
    filter_clause,
    run_query,
)
from app.leads.segments import SegmentService
from app.leads.service import CompanyService, LeadsProblem, check_rules
from app.models.crm import Company

router = APIRouter(prefix="/companies", tags=["companies"])
WRITE = [Depends(require_trusted_origin)]
ORIGIN_ERROR: dict[int | str, dict[str, str]] = {403: {"description": "Origin not allowed"}}


def get_service(ctx: AuthContextDep, db: DbDep, settings: SettingsDep) -> CompanyService:
    return CompanyService(db, ctx.org.id, settings)


ServiceDep = Annotated[CompanyService, Depends(get_service)]


def problem(exc: LeadsProblem) -> ApiProblem:
    return ApiProblem(exc.status_code, exc.error, exc.detail, extra=exc.extra)


def company_out(row: CompanyRow) -> CompanyOut:
    out = CompanyOut.model_validate(row.company)
    out.fit = row.fit
    out.primary = PersonOut.model_validate(row.primary) if row.primary else None
    return out


def page_out(page: Page) -> CompanyPage:
    return CompanyPage(
        data=[company_out(r) for r in page.rows],
        next_cursor=page.next_cursor,
        has_more=page.next_cursor is not None,
        total=page.total,
    )


async def query_page(
    service: CompanyService,
    query: CompanyQuery,
    extra: ColumnElement[bool] | None = None,
    *,
    scope: str = "",
) -> CompanyPage:
    """Shared by the lead table and a segment's member list (``extra`` narrows the rows)."""
    try:
        check_rules(query.rules, service.settings)
        where = filter_clause(query.rules, query.match)
        if extra is not None:
            where = and_(where, extra)
        limit = min(query.limit, service.settings.leads_query_max_limit)
        page = await run_query(
            service.session, service.org_id, query, where=where, limit=limit, scope=scope
        )
    except LeadsProblem as exc:
        raise problem(exc) from exc
    except NeedsProduct as exc:
        raise ApiProblem(422, "product_required", str(exc)) from exc
    except InvalidCursor as exc:
        raise ApiProblem(400, "invalid_cursor", "Start again from the first page.") from exc
    return page_out(page)


async def detail(service: CompanyService, company: Company) -> CompanyDetail:
    people = await service.people(company.id)
    primary = next((p for p in people if p.is_primary), None)
    base = company_out(CompanyRow(company, primary, None)).model_dump()
    return CompanyDetail(
        **base,
        people=[PersonOut.model_validate(p) for p in people],
        fits=[FitOut.model_validate(f) for f in await service.fits(company.id)],
    )


async def load(service: ServiceDep, company_id: uuid.UUID) -> Company:
    try:
        return await service.require(company_id)
    except LeadsProblem as exc:
        raise problem(exc) from exc


CompanyDep = Annotated[Company, Depends(load)]


@router.get("")
async def list_companies(
    service: ServiceDep,
    sort: SortKey = "created",
    dir: Direction = "desc",
    product_id: uuid.UUID | None = None,
    cursor: Annotated[str | None, Query(max_length=4_096)] = None,
    limit: Annotated[int, Query(ge=1)] = 50,
) -> CompanyPage:
    """Every company, sorted. Use ``POST /companies/query`` to filter by rules."""
    query = CompanyQuery(
        sort=Sort(key=sort, dir=dir), product_id=product_id, cursor=cursor, limit=limit
    )
    return await query_page(service, query)


@router.post("/query", responses={400: {"description": "invalid_cursor"}})
async def query_companies(service: ServiceDep, body: CompanyQuery) -> CompanyPage:
    """Filter (rules, all/any), sort, and page with an opaque cursor. Read-only."""
    return await query_page(service, body)


@router.post(
    "",
    status_code=201,
    dependencies=WRITE,
    responses={
        **ORIGIN_ERROR,
        409: {"description": "duplicate | duplicate_person | workspace_full"},
    },
)
async def create_company(service: ServiceDep, body: CompanyCreate) -> CompanyDetail:
    person = body.person.model_dump(exclude_none=True) if body.person else None
    if person and person.get("email"):
        person["email"] = person["email"].lower()
    try:
        company = await service.create(body.model_dump(exclude={"person"}), person)
    except LeadsProblem as exc:
        raise problem(exc) from exc
    return await detail(service, company)


@router.get("/{company_id}")
async def get_company(service: ServiceDep, company: CompanyDep) -> CompanyDetail:
    return await detail(service, company)


@router.patch(
    "/{company_id}",
    dependencies=WRITE,
    responses={**ORIGIN_ERROR, 409: {"description": "duplicate | unsubscribed_final"}},
)
async def update_company(
    service: ServiceDep, company: CompanyDep, body: CompanyUpdate
) -> CompanyDetail:
    values = body.model_dump(exclude_unset=True)
    for required in ("name", "reply_status"):
        if required in values and values[required] is None:
            raise ApiProblem(422, "invalid", f"{required} can't be empty")
    try:
        updated = await service.update(company, values)
    except LeadsProblem as exc:
        raise problem(exc) from exc
    return await detail(service, updated)


@router.delete("/{company_id}", status_code=204, dependencies=WRITE, responses=ORIGIN_ERROR)
async def delete_company(service: ServiceDep, company: CompanyDep) -> Response:
    """Deletes the company and its people."""
    await service.delete(company.id)
    return Response(status_code=204)


@router.post(
    "/{company_id}/merge",
    dependencies=WRITE,
    responses={**ORIGIN_ERROR, 404: {"description": "not_found"}},
)
async def merge_company(
    service: ServiceDep, company: CompanyDep, body: MergeRequest
) -> CompanyDetail:
    """Keep this company, fill its blanks from the duplicate, move its people over."""
    try:
        duplicate = await service.require(body.duplicate_id)
        merged = await service.merge(company, duplicate)
    except LeadsProblem as exc:
        raise problem(exc) from exc
    return await detail(service, merged)


@router.post(
    "/bulk",
    dependencies=WRITE,
    responses={
        **ORIGIN_ERROR,
        409: {"description": "confirm_required (with matched)"},
        422: {"description": "too_many_ids | too_many_rows | too_many_rules"},
    },
)
async def bulk_action(
    service: ServiceDep, ctx: AuthContextDep, db: DbDep, settings: SettingsDep, body: BulkRequest
) -> BulkOut:
    """One action over a selection, as a single statement. Big selections need confirm."""
    try:
        segment = None
        if isinstance(body, BulkSegment):
            segment = await SegmentService(db, ctx.org.id, settings).get(body.segment_id)
        where, matched = await service.select_for_bulk(body.selection, confirm=body.confirm)
        if isinstance(body, BulkSetReply):
            result = await service.set_reply_status(where, body.reply_status)
        elif isinstance(body, BulkSegment):
            assert segment is not None  # noqa: S101 - loaded above
            if body.action == "add_to_segment":
                result = await service.pin(segment, where, matched)
            else:
                result = await service.unpin(segment, where, matched)
        else:
            result = await service.bulk_delete(where, matched)
    except LeadsProblem as exc:
        raise problem(exc) from exc
    return BulkOut.model_validate(result)


@router.post("/enroll-plan", responses={422: {"description": "too_many_ids | too_many_rules"}})
async def enroll_plan(service: ServiceDep, body: EnrollPlanRequest) -> EnrollPlanOut:
    """Dry run for "Add to sequence": who would be enrolled, who is skipped and why."""
    try:
        plan = await service.enroll_plan(body.selection)
    except LeadsProblem as exc:
        raise problem(exc) from exc
    return EnrollPlanOut.model_validate(plan)
