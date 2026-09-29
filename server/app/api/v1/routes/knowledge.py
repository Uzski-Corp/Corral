from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.v1.deps import PageDep, repository
from app.api.v1.schemas import KnowledgeItemOut
from app.repositories import KnowledgeRepository

router = APIRouter(prefix="/knowledge", tags=["knowledge"])

Repo = Annotated[KnowledgeRepository, Depends(repository(KnowledgeRepository))]


@router.get("")
async def list_knowledge(repo: Repo, page: PageDep) -> list[KnowledgeItemOut]:
    # TODO: filters + write endpoints; reads are already org-scoped.
    rows = await repo.list(limit=page.limit, offset=page.offset)
    return [KnowledgeItemOut.model_validate(row) for row in rows]
