"""Sequences and the mailbox pool. Creating or pausing a sequence does not send mail."""

from typing import Any, Literal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field

from app.activity import service
from app.activity.service import public_id
from app.auth.deps import AuthContextDep, DbDep, require_trusted_origin
from app.core.errors import ApiProblem

router = APIRouter(prefix="/sequences", tags=["sequences"])
mailbox_router = APIRouter(prefix="/mailboxes", tags=["mailboxes"])
WRITE = [Depends(require_trusted_origin)]


Status = Literal["draft", "launching", "running", "paused"]


class SequenceIn(BaseModel):
    model_config = ConfigDict(extra="allow")

    # The screen makes the id ("seq_…") before the first save; it is kept as the public id.
    id: str | None = Field(default=None, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=255)
    status: Status = "draft"


class SequencePatch(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: str | None = Field(default=None, min_length=1, max_length=255)
    status: Status | None = None


def _missing() -> ApiProblem:
    return ApiProblem(404, "not_found", "Sequence not found")


@router.get("")
async def list_sequences(ctx: AuthContextDep, db: DbDep) -> list[dict[str, Any]]:
    return await service.list_sequences(db, ctx.org.id)


@router.post("", status_code=status.HTTP_201_CREATED, dependencies=WRITE)
async def create_sequence(ctx: AuthContextDep, db: DbDep, body: SequenceIn) -> dict[str, Any]:
    try:
        return await service.save_sequence(db, ctx.org.id, body.model_dump(), slug=body.id)
    except service.SlugTaken as exc:
        raise ApiProblem(409, "conflict", "A sequence with this id already exists.") from exc


@router.patch("/{sequence_id}", dependencies=WRITE)
async def update_sequence(
    ctx: AuthContextDep, db: DbDep, sequence_id: str, body: SequencePatch
) -> dict[str, Any]:
    current = await service.get_sequence(db, ctx.org.id, sequence_id)
    if current is None:
        raise _missing()
    patch = body.model_dump(exclude_unset=True)
    if patch.get("name") is None:
        patch.pop("name", None)
    if patch.get("status") is None:
        patch.pop("status", None)
    return await service.save_sequence(db, ctx.org.id, patch, key=public_id(current))


@mailbox_router.get("")
async def list_mailboxes(ctx: AuthContextDep, db: DbDep) -> dict[str, Any]:
    return await service.list_mailboxes(db, ctx.org.id)
