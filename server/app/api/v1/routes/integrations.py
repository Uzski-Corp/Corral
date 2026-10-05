"""Integration status (Cal, Phoenix, AutoSend). Connect stores a status, not a credential."""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.activity import service
from app.auth.deps import AuthContextDep, DbDep, require_trusted_origin
from app.core.errors import ApiProblem

router = APIRouter(prefix="/integrations", tags=["integrations"])
WRITE = [Depends(require_trusted_origin)]

FieldId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class IntegrationPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The states the settings screen shows. "connecting" is the screen's own, never stored.
    status: Literal["off", "connected", "reauth", "error"]
    config: dict[str, Any] | None = Field(default=None, max_length=50)


class MapRowIn(BaseModel):
    """One Phoenix field and the Corral field that fills it. No ``from`` leaves it empty."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    erp: FieldId
    from_: FieldId | None = Field(default=None, alias="from")
    as_: Literal["text", "email", "number", "datetime", "url", "user"] | None = Field(
        default=None, alias="as"
    )


class MappingIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rows: list[MapRowIn] = Field(max_length=50)


def _unknown() -> ApiProblem:
    return ApiProblem(404, "not_found", "Unknown integration.")


@router.get("")
async def list_integrations(ctx: AuthContextDep, db: DbDep) -> list[dict[str, Any]]:
    return await service.list_integrations(db, ctx.org.id)


@router.get("/{provider}")
async def integration_detail(ctx: AuthContextDep, db: DbDep, provider: str) -> dict[str, Any]:
    detail = await service.integration_detail(db, ctx.org.id, provider)
    if detail is None:
        raise _unknown()
    return detail


@router.patch("/{provider}", dependencies=WRITE)
async def update_integration(
    ctx: AuthContextDep, db: DbDep, provider: str, body: IntegrationPatch
) -> dict[str, Any]:
    row = await service.upsert_integration(
        db, ctx.org.id, provider, status=body.status, config=body.config, user_id=ctx.user.id
    )
    if row is None:
        raise _unknown()
    return row


@router.put("/{provider}/mapping", dependencies=WRITE)
async def save_mapping(
    ctx: AuthContextDep, db: DbDep, provider: str, body: MappingIn
) -> dict[str, Any]:
    fields = [row.erp for row in body.rows]
    if len(set(fields)) != len(fields):
        raise ApiProblem(422, "duplicate_field", "Each Phoenix field can be mapped once.")
    rows = [row.model_dump(by_alias=True, exclude_none=True) for row in body.rows]
    result = await service.save_mapping(db, ctx.org.id, provider, rows)
    if result == "no_mapping":
        raise ApiProblem(404, "not_found", "Only Phoenix has a field mapping.")
    if isinstance(result, str):
        raise ApiProblem(409, "not_connected", "Connect Phoenix before saving a mapping.")
    return result


@router.get("/{provider}/logs")
async def logs(ctx: AuthContextDep, db: DbDep, provider: str) -> list[dict[str, Any]]:
    if provider not in service.PROVIDERS:
        raise _unknown()
    return await service.integration_logs(db, ctx.org.id, provider)
