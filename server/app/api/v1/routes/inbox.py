from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.v1.deps import PageDep, repository
from app.api.v1.schemas import InboxThreadOut
from app.repositories import InboxThreadRepository

router = APIRouter(prefix="/inbox", tags=["inbox"])

Repo = Annotated[InboxThreadRepository, Depends(repository(InboxThreadRepository))]


@router.get("")
async def list_inbox(repo: Repo, page: PageDep) -> list[InboxThreadOut]:
    # TODO: filters + write endpoints; reads are already org-scoped.
    rows = await repo.list(limit=page.limit, offset=page.offset)
    return [InboxThreadOut.model_validate(row) for row in rows]
