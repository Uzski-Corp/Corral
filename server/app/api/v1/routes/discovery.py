"""Discovery runs and the workspace credit balance. A created run stays queued."""

from typing import Any

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field

from app.activity import service
from app.auth.deps import AuthContextDep, DbDep, require_trusted_origin

router = APIRouter(prefix="/discovery", tags=["discovery"])
WRITE = [Depends(require_trusted_origin)]


class RunIn(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: str = Field(min_length=1, max_length=255)


@router.get("/runs")
async def list_runs(ctx: AuthContextDep, db: DbDep) -> dict[str, Any]:
    return {
        "runs": await service.list_runs(db, ctx.org.id),
        "credits": await service.credits(db, ctx.org),
    }


@router.get("/credits")
async def get_credits(ctx: AuthContextDep, db: DbDep) -> dict[str, int]:
    return await service.credits(db, ctx.org)


@router.post("/runs", status_code=status.HTTP_201_CREATED, dependencies=WRITE)
async def create_run(ctx: AuthContextDep, db: DbDep, body: RunIn) -> dict[str, Any]:
    return await service.create_run(db, ctx.org.id, body.model_dump())
