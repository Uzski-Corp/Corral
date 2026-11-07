"""Authenticated billing routes. The organization comes from the WorkOS session."""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.api.v1.billing_schemas import CheckoutIn, SmsIn
from app.auth.deps import AuthContextDep, DbDep, SettingsDep, require_trusted_origin
from app.billing.paddle_client import PaddleClient
from app.billing.service import save_sms_preference, snapshot, start_checkout, start_portal
from app.db.session import get_database

router = APIRouter(prefix="/billing", tags=["billing"])
WRITE = [Depends(require_trusted_origin)]


async def _paddle(settings: SettingsDep) -> AsyncIterator[PaddleClient]:
    client = PaddleClient(settings)
    try:
        yield client
    finally:
        await client.aclose()


PaddleDep = Annotated[PaddleClient, Depends(_paddle)]


@router.get("")
async def get_billing(ctx: AuthContextDep, db: DbDep, settings: SettingsDep) -> dict[str, object]:
    return await snapshot(db, settings, org_id=ctx.org.id, user_id=ctx.user.id, role=ctx.role)


@router.post("/checkout", dependencies=WRITE)
async def checkout(
    request: Request,
    ctx: AuthContextDep,
    db: DbDep,
    settings: SettingsDep,
    paddle: PaddleDep,
    body: CheckoutIn,
) -> dict[str, str]:
    return await start_checkout(
        get_database(request),
        settings,
        paddle,
        org_id=ctx.org.id,
        user_id=ctx.user.id,
        role=ctx.role,
        plan_id=body.plan_id,
        interval=body.interval,
    )


@router.post("/portal", dependencies=WRITE)
async def portal(
    ctx: AuthContextDep, db: DbDep, settings: SettingsDep, paddle: PaddleDep
) -> dict[str, str]:
    return await start_portal(db, settings, paddle, org_id=ctx.org.id, role=ctx.role)


@router.put("/sms", dependencies=WRITE)
async def sms_preferences(ctx: AuthContextDep, db: DbDep, body: SmsIn) -> dict[str, object]:
    return await save_sms_preference(
        db,
        org_id=ctx.org.id,
        user_id=ctx.user.id,
        role=ctx.role,
        body=body.model_dump(),
    )
