from fastapi import APIRouter

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.get("")
async def list_knowledge() -> list[dict]:
    # TODO: implement
    return []
