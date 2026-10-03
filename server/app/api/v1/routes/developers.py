"""API keys and MCP connections. The secret is returned once. No MCP server is started."""

from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Response, status
from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.activity import service
from app.auth.deps import AuthContextDep, DbDep, require_trusted_origin
from app.core.errors import ApiProblem

router = APIRouter(prefix="/developers", tags=["developers"])
WRITE = [Depends(require_trusted_origin)]


def _aware(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        raise ValueError("expires needs a timezone")
    return value


Scope = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[a-z_]+:[a-z_]+$")]


class KeyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    env: Literal["live", "test"] = "live"
    scopes: list[Scope] = Field(default_factory=list, max_length=32)
    expires: Annotated[datetime | None, AfterValidator(_aware)] = None


class RotateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    overlap: bool = True


class ConnectionIn(BaseModel):
    model_config = ConfigDict(extra="allow")

    client: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=255)


def _who(ctx: AuthContextDep) -> str:
    user = ctx.user
    parts = [user.first_name or "", user.last_name or ""]
    name = " ".join(p for p in parts if p).strip()
    return name or user.email


@router.get("/keys")
async def list_keys(ctx: AuthContextDep, db: DbDep) -> list[dict[str, Any]]:
    return await service.list_keys(db, ctx.org.id)


@router.post("/keys", status_code=status.HTTP_201_CREATED, dependencies=WRITE)
async def create_key(ctx: AuthContextDep, db: DbDep, body: KeyIn) -> dict[str, Any]:
    return await service.create_key(
        db,
        ctx.org.id,
        name=body.name,
        env=body.env,
        scopes=body.scopes,
        created_by=_who(ctx),
        expires_at=body.expires,
    )


@router.post("/keys/{key_id}/revoke", dependencies=WRITE)
async def revoke_key(ctx: AuthContextDep, db: DbDep, key_id: str) -> dict[str, Any]:
    row = await service.revoke_key(db, ctx.org.id, key_id)
    if row is None:
        raise ApiProblem(404, "not_found", "Key not found")
    return row


@router.post("/keys/{key_id}/rotate", dependencies=WRITE)
async def rotate_key(ctx: AuthContextDep, db: DbDep, key_id: str, body: RotateIn) -> dict[str, Any]:
    """A new secret, shown once. A revoked key can't be rotated."""
    row = await service.rotate_key(db, ctx.org.id, key_id, overlap=body.overlap)
    if row is None:
        raise ApiProblem(404, "not_found", "Key not found")
    return row


@router.get("/connections")
async def list_connections(ctx: AuthContextDep, db: DbDep) -> list[dict[str, Any]]:
    return await service.list_connections(db, ctx.org.id)


@router.post("/connections", status_code=status.HTTP_201_CREATED, dependencies=WRITE)
async def create_connection(ctx: AuthContextDep, db: DbDep, body: ConnectionIn) -> dict[str, Any]:
    return await service.create_connection(db, ctx.org.id, body.model_dump())


@router.delete(
    "/connections/{connection_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=WRITE
)
async def delete_connection(ctx: AuthContextDep, db: DbDep, connection_id: str) -> Response:
    if not await service.delete_connection(db, ctx.org.id, connection_id):
        raise ApiProblem(404, "not_found", "Connection not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/connections/{connection_id}/calls")
async def calls(ctx: AuthContextDep, db: DbDep, connection_id: str) -> list[dict[str, Any]]:
    rows = await service.list_calls(db, ctx.org.id, connection_id)
    if rows is None:
        raise ApiProblem(404, "not_found", "Connection not found")
    return rows
