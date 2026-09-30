"""Repository dependencies: every repository is bound to the caller's organization."""

from collections.abc import Callable
from typing import Annotated, Any

from fastapi import Depends, Query

from app.auth.deps import AuthContextDep, DbDep
from app.repositories.base import MAX_PAGE_SIZE, TenantRepository


def repository[R: TenantRepository[Any]](cls: type[R]) -> Callable[[AuthContextDep, DbDep], R]:
    def dependency(ctx: AuthContextDep, db: DbDep) -> R:
        return cls(db, ctx.org.id)

    return dependency


class Page:
    def __init__(
        self,
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 50,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> None:
        self.limit = limit
        self.offset = offset


PageDep = Annotated[Page, Depends()]
