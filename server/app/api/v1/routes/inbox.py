from fastapi import APIRouter

router = APIRouter(prefix="/inbox", tags=["inbox"])


@router.get("")
async def list_inbox() -> list[dict]:
    # TODO: implement
    return []
