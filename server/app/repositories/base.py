"""Org-scoped repository base.

Every query is filtered by the repository's ``org_id`` and every insert is stamped with
it, so application code can't address another tenant's rows even by id. Postgres RLS is
the second, independent layer (defense in depth).
"""

import uuid
from collections.abc import Mapping, Sequence
from typing import Any, ClassVar, cast

from sqlalchemy import Select, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.domain import TenantModel

_PROTECTED_FIELDS = frozenset({"id", "org_id", "created_at", "updated_at"})
MAX_PAGE_SIZE = 200


class ProtectedFieldError(ValueError):
    """Raised when a caller tries to set an identity or tenancy column."""


class TenantRepository[M: TenantModel]:
    model: ClassVar[type[TenantModel]]

    def __init__(self, session: AsyncSession, org_id: uuid.UUID) -> None:
        self.session = session
        self.org_id = org_id

    def _select(self) -> Select[TenantModel]:
        return select(self.model).where(self.model.org_id == self.org_id)

    @staticmethod
    def _check_fields(values: Mapping[str, Any]) -> None:
        bad = _PROTECTED_FIELDS & values.keys()
        if bad:
            raise ProtectedFieldError(f"cannot set protected fields: {sorted(bad)}")

    async def list(self, *, limit: int = 50, offset: int = 0) -> Sequence[M]:
        limit = max(1, min(limit, MAX_PAGE_SIZE))
        stmt = (
            self._select()
            .order_by(self.model.created_at.desc(), self.model.id)
            .limit(limit)
            .offset(max(0, offset))
        )
        return cast("Sequence[M]", (await self.session.execute(stmt)).scalars().all())

    async def count(self) -> int:
        stmt = select(func.count()).select_from(self.model).where(self.model.org_id == self.org_id)
        return (await self.session.execute(stmt)).scalar_one()

    async def get(self, entity_id: uuid.UUID) -> M | None:
        stmt = self._select().where(self.model.id == entity_id)
        return cast("M | None", (await self.session.execute(stmt)).scalar_one_or_none())

    async def create(self, **values: Any) -> M:
        self._check_fields(values)
        entity = cast("M", self.model(org_id=self.org_id, **values))
        self.session.add(entity)
        await self.session.flush()
        await self.session.refresh(entity)
        return entity

    async def update(self, entity_id: uuid.UUID, **values: Any) -> M | None:
        self._check_fields(values)
        entity = await self.get(entity_id)
        if entity is None:
            return None
        for key, value in values.items():
            setattr(entity, key, value)
        await self.session.flush()
        await self.session.refresh(entity)
        return entity

    async def delete(self, entity_id: uuid.UUID) -> bool:
        stmt = (
            delete(self.model)
            .where(self.model.org_id == self.org_id, self.model.id == entity_id)
            .returning(self.model.id)
        )
        return (await self.session.execute(stmt)).scalar_one_or_none() is not None
