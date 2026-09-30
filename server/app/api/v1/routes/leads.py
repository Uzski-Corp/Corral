"""People (contacts). Usually linked to a company; one person per company is its primary."""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.api.v1.deps import PageDep, repository
from app.api.v1.schemas import LeadCreate, LeadOut, LeadUpdate
from app.auth.deps import AuthContextDep, DbDep, SettingsDep, require_trusted_origin
from app.core.errors import ApiProblem
from app.leads.service import CompanyService
from app.models.crm import Company
from app.models.domain import Lead
from app.repositories import LeadRepository

router = APIRouter(prefix="/leads", tags=["leads"])
# CSRF: the session cookie is SameSite=Lax, which still lets sibling subdomains POST.
WRITE = [Depends(require_trusted_origin)]
ORIGIN_ERROR: dict[int | str, dict[str, str]] = {403: {"description": "Origin not allowed"}}

Repo = Annotated[LeadRepository, Depends(repository(LeadRepository))]
NOT_FOUND = "Lead not found"


async def _link(repo: LeadRepository, values: dict[str, Any], lead: Lead | None) -> dict[str, Any]:
    """Check the company is in this workspace; making someone primary demotes the old one."""
    values = {
        k: v for k, v in values.items() if v is not None or k not in ("is_primary", "email_status")
    }
    moving = "company_id" in values and (lead is None or values["company_id"] != lead.company_id)
    company_id = (
        values["company_id"] if "company_id" in values else getattr(lead, "company_id", None)
    )
    if moving and company_id is not None:
        company = (
            await repo.session.execute(
                select(Company).where(Company.org_id == repo.org_id, Company.id == company_id)
            )
        ).scalar_one_or_none()
        if company is None:
            raise ApiProblem(422, "unknown_company", "That company isn't in this workspace.")
        if not values.get("company_name"):
            values["company_name"] = company.name
    if values.get("is_primary"):
        if company_id is None:
            raise ApiProblem(422, "no_company", "Only someone at a company can be its primary.")
        others = [Lead.org_id == repo.org_id, Lead.company_id == company_id, Lead.is_primary]
        if lead is not None:
            others.append(Lead.id != lead.id)
        await repo.session.execute(update(Lead).where(*others).values(is_primary=False))
    elif moving:
        values["is_primary"] = False
    return values


@router.get("")
async def list_leads(repo: Repo, page: PageDep) -> list[LeadOut]:
    leads = await repo.list(limit=page.limit, offset=page.offset)
    return [LeadOut.model_validate(lead) for lead in leads]


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=WRITE, responses=ORIGIN_ERROR)
async def create_lead(repo: Repo, body: LeadCreate) -> LeadOut:
    values = await _link(repo, body.model_dump() | {"email": body.email.lower()}, None)
    try:
        async with repo.session.begin_nested():
            lead = await repo.create(**values)
    except IntegrityError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "Lead with this email exists") from exc
    return LeadOut.model_validate(lead)


@router.get("/{lead_id}")
async def get_lead(repo: Repo, lead_id: uuid.UUID) -> LeadOut:
    lead = await repo.get(lead_id)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    return LeadOut.model_validate(lead)


@router.patch("/{lead_id}", dependencies=WRITE, responses=ORIGIN_ERROR)
async def update_lead(repo: Repo, lead_id: uuid.UUID, body: LeadUpdate) -> LeadOut:
    current = await repo.get(lead_id)
    if current is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    values = await _link(repo, body.model_dump(exclude_unset=True), current)
    lead = await repo.update(lead_id, **values)
    return LeadOut.model_validate(lead)


@router.post("/{lead_id}/unsubscribe", dependencies=WRITE, responses=ORIGIN_ERROR)
async def unsubscribe_lead(
    repo: Repo, ctx: AuthContextDep, db: DbDep, settings: SettingsDep, lead_id: uuid.UUID
) -> LeadOut:
    """Final: marks them (and their company) unsubscribed and suppresses the address."""
    lead = await repo.get(lead_id)
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    await CompanyService(db, ctx.org.id, settings).unsubscribe_person(lead)
    return LeadOut.model_validate(lead)


@router.delete(
    "/{lead_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=WRITE,
    responses=ORIGIN_ERROR,
)
async def delete_lead(repo: Repo, lead_id: uuid.UUID) -> Response:
    if not await repo.delete(lead_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
