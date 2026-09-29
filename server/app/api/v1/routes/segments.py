from fastapi import APIRouter

router = APIRouter(prefix="/segments", tags=["segments"])


@router.get("")
async def list_segments() -> list[dict[str, object]]:
    # TODO: implement
    return []
