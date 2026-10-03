"""Integration status (Cal, Phoenix, AutoSend). Connect stores a status, not a credential."""

from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.activity import service
from app.auth.deps import AuthContextDep, DbDep, require_trusted_origin
from app.core.errors import ApiProblem

router = APIRouter(prefix="/integrations", tags=["integrations"])
WRITE = [Depends(require_trusted_origin)]


class IntegrationPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The states the settings screen shows. "connecting" is the screen's own, never stored.
    status: Literal["off", "connected", "reauth", "error"]
    config: dict[str, Any] | None = Field(default=None, max_length=50)


@router.get("")
async def list_integrations(ctx: AuthContextDep, db: DbDep) -> list[dict[str, Any]]:
    return await service.list_integrations(db, ctx.org.id)


@router.patch("/{provider}", dependencies=WRITE)
async def update_integration(
    ctx: AuthContextDep, db: DbDep, provider: str, body: IntegrationPatch
) -> dict[str, Any]:
    row = await service.upsert_integration(
        db, ctx.org.id, provider, status=body.status, config=body.config
    )
    if row is None:
        raise ApiProblem(404, "not_found", "Unknown integration.")
    return row


@router.get("/{provider}/logs")
async def logs(ctx: AuthContextDep, db: DbDep, provider: str) -> list[dict[str, Any]]:
    if provider not in service.PROVIDERS:
        raise ApiProblem(404, "not_found", "Unknown integration.")
    return await service.integration_logs(db, ctx.org.id, provider)
