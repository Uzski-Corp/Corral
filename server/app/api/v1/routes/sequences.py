from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.v1.deps import PageDep, repository
from app.api.v1.schemas import SequenceOut
from app.repositories import SequenceRepository

router = APIRouter(prefix="/sequences", tags=["sequences"])

Repo = Annotated[SequenceRepository, Depends(repository(SequenceRepository))]


@router.get("")
async def list_sequences(repo: Repo, page: PageDep) -> list[SequenceOut]:
    # TODO: filters + write endpoints; reads are already org-scoped.
    rows = await repo.list(limit=page.limit, offset=page.offset)
    return [SequenceOut.model_validate(row) for row in rows]
