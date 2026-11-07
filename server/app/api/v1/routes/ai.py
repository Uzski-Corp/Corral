"""Reply runs and authenticated, run-scoped read tools for the private Pi service."""

import hmac
import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.ai.service import output, run_token, start
from app.auth.deps import AuthContextDep, DbDep, SettingsDep, require_trusted_origin
from app.core.errors import ApiProblem
from app.db.session import get_database, tenant_transaction
from app.kb.service import KnowledgeBaseService
from app.models.ai import AiRun
from app.models.knowledge import Product

router = APIRouter(prefix="/ai", tags=["reply suggestions"])
tool_router = APIRouter(prefix="/ai/tools", tags=["private AI tools"])
WRITE = [Depends(require_trusted_origin)]


class StartIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: uuid.UUID
    thread_id: str
    product_id: uuid.UUID


@router.get("/options")
async def options(ctx: AuthContextDep, db: DbDep, settings: SettingsDep) -> dict[str, Any]:
    products = (
        await db.execute(
            select(Product).where(Product.org_id == ctx.org.id).order_by(Product.name).limit(100)
        )
    ).scalars()
    return {
        "available": bool(
            settings.pi_service_token.get_secret_value()
            and str(ctx.org.id) == settings.autosend_demo_org_id
        ),
        "products": [{"id": str(p.id), "name": p.name} for p in products],
    }


@router.post("/runs", status_code=202, dependencies=WRITE)
async def create(
    ctx: AuthContextDep, db: DbDep, settings: SettingsDep, body: StartIn
) -> dict[str, Any]:
    row = await start(db, settings, ctx.org.id, body.thread_id, body.product_id, body.request_id)
    return await output(db, ctx.org.id, row)


@router.get("/runs/{run_id}")
async def get(ctx: AuthContextDep, db: DbDep, run_id: uuid.UUID) -> dict[str, Any]:
    row = (
        await db.execute(select(AiRun).where(AiRun.id == run_id, AiRun.org_id == ctx.org.id))
    ).scalar_one_or_none()
    if not row:
        raise ApiProblem(404, "not_found", "Draft run not found.")
    return await output(db, ctx.org.id, row)


@router.post("/runs/{run_id}/cancel", dependencies=WRITE)
async def cancel(ctx: AuthContextDep, db: DbDep, run_id: uuid.UUID) -> dict[str, Any]:
    row = (
        await db.execute(
            select(AiRun).where(AiRun.id == run_id, AiRun.org_id == ctx.org.id).with_for_update()
        )
    ).scalar_one_or_none()
    if not row:
        raise ApiProblem(404, "not_found", "Draft run not found.")
    if row.status in ("queued", "running"):
        row.status = "canceling"
    return await output(db, ctx.org.id, row)


@tool_router.get("/{org_id}/{run_id}/{tool}")
async def tool(
    request: Request,
    org_id: uuid.UUID,
    run_id: uuid.UUID,
    tool: Literal["thread", "knowledge"],
    query: str = Query(default="", max_length=500),
) -> dict[str, Any]:
    settings = request.app.state.settings
    expected = f"Bearer {run_token(settings, org_id, run_id)}"
    if not settings.pi_service_token.get_secret_value() or not hmac.compare_digest(
        request.headers.get("authorization", "").encode(), expected.encode()
    ):
        raise ApiProblem(401, "unauthorized", "Run credential rejected.")
    async with tenant_transaction(get_database(request), org_id) as db:
        row = await db.get(AiRun, run_id, with_for_update=True)
        if not row or row.status not in ("queued", "running") or row.deadline <= datetime.now(UTC):
            raise ApiProblem(409, "run_inactive", "This run cannot call tools.")
        if tool == "thread":
            return row.snapshot
        if not query.strip():
            raise ApiProblem(422, "query_required", "Provide a search query.")
        (vector,) = await request.app.state.embedder.embed([query])
        hits = await KnowledgeBaseService(db, org_id, settings).search(
            row.product_id, vector, limit=5
        )
        passages = [
            {"id": str(chunk.id), "source_name": name, "text": chunk.text[:4000]}
            for chunk, name, _, _ in hits
        ]
        row.evidence = {**row.evidence, **{p["id"]: p for p in passages}}
        return {"passages": passages}
