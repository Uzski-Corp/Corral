"""Shared set-up for knowledge-base tests that need the database."""

import uuid
from dataclasses import dataclass
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.auth.provisioning import ProvisionedIdentity
from app.core.config import Settings
from app.db.session import Database
from app.kb.embeddings import Embedder, HashingEmbedder
from app.kb.errors import FileKind
from app.kb.service import KnowledgeBaseService
from app.models import KbChunk, KbSource, Product
from tests.tenancy_helpers import as_tenant, provision


@dataclass
class KbWorld:
    a: ProvisionedIdentity
    b: ProvisionedIdentity
    product_a: uuid.UUID
    product_a2: uuid.UUID
    product_b: uuid.UUID


async def kb_world(engine: AsyncEngine) -> KbWorld:
    a = await provision(engine, "user_a", "a@a.io", "org_a")
    b = await provision(engine, "user_b", "b@b.io", "org_b")
    async with AsyncSession(engine) as s, s.begin():
        pa = Product(org_id=a.org_id, name="ColdTrace Sensors")
        pa2 = Product(org_id=a.org_id, name="ColdTrace Gateway")
        pb = Product(org_id=b.org_id, name="Other org product")
        s.add_all([pa, pa2, pb])
        await s.flush()
        return KbWorld(a=a, b=b, product_a=pa.id, product_a2=pa2.id, product_b=pb.id)


async def add_file(
    engine: AsyncEngine,
    ident: ProvisionedIdentity,
    product_id: uuid.UUID,
    settings: Settings,
    *,
    name: str,
    kind: FileKind,
    data: bytes,
) -> KbSource:
    async with as_tenant(engine, ident) as s:
        return await KnowledgeBaseService(s, ident.org_id, settings).add_file(
            product_id, filename=name, kind=kind, data=data, added_by=ident.user_id
        )


async def add_url(
    engine: AsyncEngine,
    ident: ProvisionedIdentity,
    product_id: uuid.UUID,
    settings: Settings,
    url: str,
    scope: Literal["page", "section"] = "page",
) -> KbSource:
    async with as_tenant(engine, ident) as s:
        return await KnowledgeBaseService(s, ident.org_id, settings).add_url(
            product_id,
            url=url,
            scope=scope,
            added_by=ident.user_id,
        )


def job_ctx(
    engine: AsyncEngine,
    settings: Settings,
    *,
    embedder: Embedder | None = None,
    job_try: int = 1,
    **extra: Any,
) -> dict[str, Any]:
    return {
        "db": Database(engine),
        "settings": settings,
        "embedder": embedder or HashingEmbedder(),
        "job_try": job_try,
        **extra,
    }


async def reload(engine: AsyncEngine, source_id: uuid.UUID) -> KbSource:
    async with AsyncSession(engine, expire_on_commit=False) as s:
        source = await s.get(KbSource, source_id)
        assert source is not None
        return source


async def chunks_of(engine: AsyncEngine, source_id: uuid.UUID) -> list[KbChunk]:
    async with AsyncSession(engine) as s:
        rows = await s.execute(
            select(KbChunk).where(KbChunk.source_id == source_id).order_by(KbChunk.ordinal)
        )
        return list(rows.scalars().all())
