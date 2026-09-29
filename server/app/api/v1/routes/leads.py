from fastapi import APIRouter

router = APIRouter(prefix="/leads", tags=["leads"])


@router.get("")
async def list_leads() -> list[dict]:
    # TODO: implement
    return []
