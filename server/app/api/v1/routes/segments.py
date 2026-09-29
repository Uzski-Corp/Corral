from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.v1.deps import PageDep, repository
from app.api.v1.schemas import SegmentOut
from app.repositories import SegmentRepository

router = APIRouter(prefix="/segments", tags=["segments"])

Repo = Annotated[SegmentRepository, Depends(repository(SegmentRepository))]


@router.get("")
async def list_segments(repo: Repo, page: PageDep) -> list[SegmentOut]:
    # TODO: filters + write endpoints; reads are already org-scoped.
    rows = await repo.list(limit=page.limit, offset=page.offset)
    return [SegmentOut.model_validate(row) for row in rows]
