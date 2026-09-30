"""Saved segments: live rules plus pinned companies.

``POST /segments/preview`` and ``POST /segments/{id}/companies`` only read (rules in the
body); every other write requires an allow-listed ``Origin`` (CSRF). Pins are added and
removed with ``POST /companies/bulk`` (``add_to_segment`` / ``remove_from_segment``).
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select

from app.api.v1.deps import PageDep
from app.api.v1.lead_schemas import (
    CompanyPage,
    PreviewOut,
    PreviewRequest,
    SegmentCreate,
    SegmentDetail,
    SegmentUpdate,
)
from app.api.v1.routes.companies import ServiceDep, company_out, problem, query_page
from app.api.v1.schemas import SegmentOut
from app.auth.deps import AuthContextDep, DbDep, SettingsDep, require_trusted_origin
from app.leads.query import CompanyQuery, CompanyRow
from app.leads.rules import rules_clause
from app.leads.segments import SegmentService, membership, segment_rules
from app.leads.service import LeadsProblem, check_rules
from app.models.crm import Company
from app.models.domain import Segment

router = APIRouter(prefix="/segments", tags=["segments"])
WRITE = [Depends(require_trusted_origin)]
ORIGIN_ERROR: dict[int | str, dict[str, str]] = {403: {"description": "Origin not allowed"}}
PEEK = 4


def get_segments(ctx: AuthContextDep, db: DbDep, settings: SettingsDep) -> SegmentService:
    return SegmentService(db, ctx.org.id, settings)


SegmentsDep = Annotated[SegmentService, Depends(get_segments)]


async def load(segments: SegmentsDep, segment_id: uuid.UUID) -> Segment:
    try:
        return await segments.get(segment_id)
    except LeadsProblem as exc:
        raise problem(exc) from exc


SegmentDep = Annotated[Segment, Depends(load)]


async def detail(
    segments: SegmentService, companies: ServiceDep, segment: Segment
) -> SegmentDetail:
    return SegmentDetail(
        id=segment.id,
        created_at=segment.created_at,
        updated_at=segment.updated_at,
        name=segment.name,
        rules=segment_rules(segment),
        match="any" if segment.match == "any" else "all",
        pinned=await segments.pinned_count(segment),
        count=await companies.count(membership(segment)),
    )


@router.get("")
async def list_segments(db: DbDep, ctx: AuthContextDep, page: PageDep) -> list[SegmentOut]:
    stmt = (
        select(Segment)
        .where(Segment.org_id == ctx.org.id)
        .order_by(Segment.created_at.desc(), Segment.id)
        .limit(page.limit)
        .offset(page.offset)
    )
    return [SegmentOut.model_validate(s) for s in (await db.execute(stmt)).scalars()]


@router.post("/preview", responses={422: {"description": "too_many_rules"}})
async def preview(companies: ServiceDep, body: PreviewRequest) -> PreviewOut:
    """How many companies these rules match right now, and the first few."""
    try:
        check_rules(body.rules, companies.settings)
    except LeadsProblem as exc:
        raise problem(exc) from exc
    where = rules_clause(body.rules, body.match, empty=False)
    stmt = (
        select(Company)
        .where(companies.scoped(where))
        .order_by(Company.name_key, Company.id)
        .limit(PEEK)
    )
    peek = [
        company_out(CompanyRow(c, None, None))
        for c in (await companies.session.execute(stmt)).scalars()
    ]
    return PreviewOut(count=await companies.count(where), peek=peek)


@router.post(
    "",
    status_code=201,
    dependencies=WRITE,
    responses={**ORIGIN_ERROR, 409: {"description": "duplicate"}},
)
async def create_segment(
    segments: SegmentsDep, companies: ServiceDep, body: SegmentCreate
) -> SegmentDetail:
    try:
        segment = await segments.create(
            name=body.name,
            rules=body.rules,
            match=body.match,
            company_ids=body.company_ids,
            from_import_id=body.from_import_id,
        )
    except LeadsProblem as exc:
        raise problem(exc) from exc
    return await detail(segments, companies, segment)


@router.get("/{segment_id}")
async def get_segment(
    segments: SegmentsDep, companies: ServiceDep, segment: SegmentDep
) -> SegmentDetail:
    return await detail(segments, companies, segment)


@router.patch(
    "/{segment_id}",
    dependencies=WRITE,
    responses={**ORIGIN_ERROR, 409: {"description": "duplicate"}},
)
async def update_segment(
    segments: SegmentsDep, companies: ServiceDep, segment: SegmentDep, body: SegmentUpdate
) -> SegmentDetail:
    values = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if body.rules is not None:
        values["rules"] = body.rules
    try:
        updated = await segments.update(segment, values)
    except LeadsProblem as exc:
        raise problem(exc) from exc
    return await detail(segments, companies, updated)


@router.delete("/{segment_id}", status_code=204, dependencies=WRITE, responses=ORIGIN_ERROR)
async def delete_segment(segments: SegmentsDep, segment: SegmentDep) -> Response:
    """Deletes the segment and its pins; the companies stay."""
    await segments.delete(segment)
    return Response(status_code=204)


@router.post("/{segment_id}/companies", responses={400: {"description": "invalid_cursor"}})
async def segment_companies(
    companies: ServiceDep, segment: SegmentDep, body: CompanyQuery
) -> CompanyPage:
    """The segment's members (rules or pinned), narrowed by ``rules`` and paged. Read-only."""
    return await query_page(companies, body, membership(segment), scope=f"segment:{segment.id}")
