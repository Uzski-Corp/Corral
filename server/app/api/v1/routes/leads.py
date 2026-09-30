import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError

from app.api.v1.deps import PageDep, repository
from app.api.v1.schemas import LeadCreate, LeadOut, LeadUpdate
from app.auth.deps import require_trusted_origin
from app.repositories import LeadRepository

router = APIRouter(prefix="/leads", tags=["leads"])
# CSRF: the session cookie is SameSite=Lax, which still lets sibling subdomains POST.
WRITE = [Depends(require_trusted_origin)]
ORIGIN_ERROR: dict[int | str, dict[str, str]] = {403: {"description": "Origin not allowed"}}

Repo = Annotated[LeadRepository, Depends(repository(LeadRepository))]
NOT_FOUND = "Lead not found"


@router.get("")
async def list_leads(repo: Repo, page: PageDep) -> list[LeadOut]:
    leads = await repo.list(limit=page.limit, offset=page.offset)
    return [LeadOut.model_validate(lead) for lead in leads]


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=WRITE, responses=ORIGIN_ERROR)
async def create_lead(repo: Repo, body: LeadCreate) -> LeadOut:
    try:
        async with repo.session.begin_nested():
            lead = await repo.create(**body.model_dump() | {"email": body.email.lower()})
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
    lead = await repo.update(lead_id, **body.model_dump(exclude_unset=True))
    if lead is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
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
