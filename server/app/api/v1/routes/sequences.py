from fastapi import APIRouter

router = APIRouter(prefix="/sequences", tags=["sequences"])


@router.get("")
async def list_sequences() -> list[dict]:
    # TODO: implement
    return []
