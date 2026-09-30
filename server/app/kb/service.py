"""Knowledge-base operations for the API (runs inside the caller's tenant transaction).

Adds to one product are serialised with a transaction-scoped advisory lock, so the
duplicate check and the per-product limits can't be raced by parallel uploads (the
client uploads two at a time). The lock key is the dedupe scope: the product, or the
whole org when ``KB_DEDUPE_SCOPE=org``.
"""

import hashlib
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import Select, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.kb.errors import FileKind
from app.models.knowledge import STAGES, KbChunk, KbSource, KbSourceFile

LIVE_STATUSES = ("ready", "partial")


class DuplicateSource(Exception):
    def __init__(self, existing: KbSource) -> None:
        super().__init__(str(existing.id))
        self.existing = existing


class KnowledgeBaseFull(Exception):
    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def overall_progress(source: KbSource) -> int | None:
    """0-100 across the five stages, each weighted the same (as the client's tray does)."""
    if source.status in LIVE_STATUSES:
        return 100
    if source.status != "processing" or source.stage is None:
        return None
    index = STAGES.index(source.stage)
    return round((index + min(100, max(0, source.stage_pct)) / 100) / len(STAGES) * 100)


class KnowledgeBaseService:
    def __init__(self, session: AsyncSession, org_id: uuid.UUID, settings: Settings) -> None:
        self.session = session
        self.org_id = org_id
        self.settings = settings

    # --- reads ---------------------------------------------------------------------

    def _sources(self) -> Select[KbSource]:
        return select(KbSource).where(KbSource.org_id == self.org_id)

    async def get_source(self, product_id: uuid.UUID, source_id: uuid.UUID) -> KbSource | None:
        stmt = self._sources().where(KbSource.id == source_id, KbSource.product_id == product_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_sources(
        self,
        product_id: uuid.UUID,
        *,
        kind: Literal["file", "url"] | None = None,
        status: str | None = None,
        include_removed: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[KbSource]:
        """Needs-you (failed, partial) first, then processing, then ready; newest first."""
        stmt = self._sources().where(KbSource.product_id == product_id)
        if not include_removed:
            stmt = stmt.where(KbSource.deleted_at.is_(None))
        if kind == "url":
            stmt = stmt.where(KbSource.kind == "url")
        elif kind == "file":
            stmt = stmt.where(KbSource.kind != "url")
        if status is not None:
            stmt = stmt.where(KbSource.status == status)
        rank = func.array_position(
            text("ARRAY['failed','partial','processing','ready']::varchar[]"), KbSource.status
        )
        stmt = (
            stmt.order_by(rank, KbSource.updated_at.desc(), KbSource.id).limit(limit).offset(offset)
        )
        return (await self.session.execute(stmt)).scalars().all()

    async def passages(self, source: KbSource, *, limit: int, offset: int) -> Sequence[KbChunk]:
        stmt = (
            select(KbChunk)
            .where(KbChunk.org_id == self.org_id, KbChunk.source_id == source.id)
            .order_by(KbChunk.ordinal)
            .limit(limit)
            .offset(offset)
        )
        return (await self.session.execute(stmt)).scalars().all()

    async def search(
        self, product_id: uuid.UUID, vector: list[float], *, limit: int
    ) -> Sequence[tuple[KbChunk, str, str, float]]:
        """Nearest passages by cosine distance among live sources of one product."""
        distance = KbChunk.embedding.cosine_distance(vector)
        stmt = (
            select(KbChunk, KbSource.name, KbSource.kind, (1 - distance).label("score"))
            .join(
                KbSource,
                (KbSource.id == KbChunk.source_id) & (KbSource.org_id == KbChunk.org_id),
            )
            .where(
                KbChunk.org_id == self.org_id,
                KbChunk.product_id == product_id,
                KbSource.deleted_at.is_(None),
                KbSource.status.in_(LIVE_STATUSES),
            )
            .order_by(distance, KbChunk.id)
            .limit(limit)
        )
        rows = await self.session.execute(stmt)
        return [(chunk, name, kind, float(score)) for chunk, name, kind, score in rows]

    # --- adds ----------------------------------------------------------------------

    async def _lock(self, product_id: uuid.UUID) -> None:
        key = self.org_id if self.settings.kb_dedupe_scope == "org" else product_id
        await self.session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": f"kb:{key}"}
        )

    async def _find_duplicate(
        self, product_id: uuid.UUID, *, sha: str | None = None, url: str | None = None
    ) -> KbSource | None:
        if self.settings.kb_dedupe_scope == "off":
            return None
        stmt = self._sources().where(KbSource.deleted_at.is_(None))
        if self.settings.kb_dedupe_scope == "product":
            stmt = stmt.where(KbSource.product_id == product_id)
        stmt = stmt.where(KbSource.content_sha256 == sha if sha else KbSource.url == url)
        return (await self.session.execute(stmt.limit(1))).scalar_one_or_none()

    async def _check_capacity(
        self, product_id: uuid.UUID, adding_bytes: int, replacing: KbSource | None
    ) -> None:
        stmt = select(func.count(), func.coalesce(func.sum(KbSource.byte_size), 0)).where(
            KbSource.org_id == self.org_id,
            KbSource.product_id == product_id,
            KbSource.deleted_at.is_(None),
        )
        row = (await self.session.execute(stmt)).one()
        count, total = int(row[0] or 0), int(row[1] or 0)
        if replacing is not None and replacing.deleted_at is None:
            count -= 1
            total -= replacing.byte_size or 0
        if count + 1 > self.settings.kb_max_sources_per_product:
            raise KnowledgeBaseFull(
                f"A knowledge base holds up to {self.settings.kb_max_sources_per_product} sources."
            )
        if total + adding_bytes > self.settings.kb_max_bytes_per_product:
            raise KnowledgeBaseFull("This knowledge base is at its storage limit.")

    async def add_file(
        self,
        product_id: uuid.UUID,
        *,
        filename: str,
        kind: FileKind,
        data: bytes,
        added_by: uuid.UUID | None,
        replace: KbSource | None = None,
    ) -> KbSource:
        await self._lock(product_id)
        digest = sha256(data)
        duplicate = await self._find_duplicate(product_id, sha=digest)
        if duplicate is not None and duplicate.id != (replace.id if replace else None):
            raise DuplicateSource(duplicate)
        await self._check_capacity(product_id, len(data), replace)
        if replace is not None:
            await self.remove(replace)
        source = KbSource(
            org_id=self.org_id,
            product_id=product_id,
            kind=kind,
            name=filename,
            content_sha256=digest,
            byte_size=len(data),
            status="processing",
            stage="scan",
            stage_pct=0,
            added_by_user_id=added_by,
        )
        self.session.add(source)
        await self.session.flush()
        self.session.add(
            KbSourceFile(org_id=self.org_id, source_id=source.id, filename=filename, data=data)
        )
        await self.session.flush()
        await self.session.refresh(source)
        return source

    async def add_url(
        self,
        product_id: uuid.UUID,
        *,
        url: str,
        scope: Literal["page", "section"],
        added_by: uuid.UUID | None,
    ) -> KbSource:
        await self._lock(product_id)
        duplicate = await self._find_duplicate(product_id, url=url)
        if duplicate is not None:
            raise DuplicateSource(duplicate)
        await self._check_capacity(product_id, 0, None)
        name = url.split("://", 1)[1].removeprefix("www.").rstrip("/")
        source = KbSource(
            org_id=self.org_id,
            product_id=product_id,
            kind="url",
            name=name[:512],
            url=url,
            scope=scope,
            status="processing",
            stage="upload",
            stage_pct=0,
            added_by_user_id=added_by,
        )
        self.session.add(source)
        await self.session.flush()
        await self.session.refresh(source)
        return source

    # --- lifecycle -----------------------------------------------------------------

    async def remove(self, source: KbSource) -> KbSource:
        """Soft delete: its passages leave retrieval now; ``restore`` brings them back."""
        if source.deleted_at is None:
            source.deleted_at = datetime.now(UTC)
            await self.session.flush()
            await self.session.refresh(source)
        return source

    async def restore(self, source: KbSource) -> KbSource:
        if source.deleted_at is None:
            return source
        await self._lock(source.product_id)
        duplicate = await self._find_duplicate(
            source.product_id, sha=source.content_sha256, url=source.url
        )
        if duplicate is not None:
            raise DuplicateSource(duplicate)
        await self._check_capacity(source.product_id, source.byte_size or 0, None)
        source.deleted_at = None
        await self.session.flush()
        await self.session.refresh(source)
        return source

    async def start_reread(self, source: KbSource) -> KbSource:
        """New generation: any job still running for the old one will discard its work."""
        await self.session.execute(
            update(KbSource)
            .where(KbSource.org_id == self.org_id, KbSource.id == source.id)
            .values(
                generation=KbSource.generation + 1,
                attempts=0,
                status="processing",
                stage="upload" if source.kind == "url" else "scan",
                stage_pct=0,
                failure=None,
                failure_stage=None,
                note=None,
            )
        )
        await self.session.refresh(source)
        return source
