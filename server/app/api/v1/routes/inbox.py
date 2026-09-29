from fastapi import APIRouter

router = APIRouter(prefix="/inbox", tags=["inbox"])


@router.get("")
async def list_inbox() -> list[dict[str, object]]:
    # TODO: implement
    return []
