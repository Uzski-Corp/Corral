from fastapi import APIRouter

router = APIRouter(prefix="/segments", tags=["segments"])


@router.get("")
async def list_segments() -> list[dict]:
    # TODO: implement
    return []
