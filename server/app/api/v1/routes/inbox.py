"""Unibox threads, messages and drafts. Sending stores a message; it does not send mail."""

from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.activity import service
from app.auth.deps import AuthContextDep, DbDep, require_trusted_origin
from app.core.errors import ApiProblem

router = APIRouter(prefix="/inbox", tags=["inbox"])
WRITE = [Depends(require_trusted_origin)]


class ThreadPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    triage: str | None = Field(default=None, max_length=32)
    handled: bool | None = None
    unread: bool | None = None
    snoozed: str | None = Field(default=None, max_length=80)
    status: str | None = Field(default=None, max_length=40)


class SendIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: str = Field(min_length=1, max_length=20_000)


def _missing() -> ApiProblem:
    return ApiProblem(404, "not_found", "Thread not found")


@router.get("")
async def list_inbox(
    ctx: AuthContextDep, db: DbDep, tab: Literal["needs", "handled"] | None = None
) -> list[dict[str, Any]]:
    return await service.list_threads(db, ctx.org.id, tab=tab)


@router.get("/summary")
async def inbox_summary(ctx: AuthContextDep, db: DbDep) -> dict[str, int]:
    return {"needs_you": await service.needs_you(db, ctx.org.id)}


@router.patch("/{thread_id}", dependencies=WRITE)
async def patch_thread(
    ctx: AuthContextDep, db: DbDep, thread_id: str, body: ThreadPatch
) -> dict[str, Any]:
    patch = body.model_dump(exclude_unset=True)
    row = await service.patch_thread(db, ctx.org.id, thread_id, patch)
    if row is None:
        raise _missing()
    return row


@router.post("/{thread_id}/send", dependencies=WRITE)
async def send_reply(
    ctx: AuthContextDep, db: DbDep, thread_id: str, body: SendIn
) -> dict[str, Any]:
    row = await service.send_reply(db, ctx.org.id, thread_id, body.body)
    if row is None:
        raise _missing()
    return row
