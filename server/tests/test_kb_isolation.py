"""Row-level security on the knowledge-base tables, below the application layer.

These run raw SQL as ``corral_app`` so they prove the database itself keeps orgs apart,
even if a query forgets its ``org_id`` filter.
"""

import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.kb.ingest import ingest_source
from app.models import KB_TABLES, KbChunk, KbSource
from tests.conftest import make_settings
from tests.kb_fixtures import PITCH_MD
from tests.kb_helpers import KbWorld, add_file, job_ctx, kb_world
from tests.tenancy_helpers import as_tenant

SETTINGS = make_settings()
TABLES = list(KB_TABLES)


async def org_ids(session: AsyncSession, table: str) -> set[uuid.UUID]:
    query = text(f"SELECT DISTINCT org_id FROM {table}")  # noqa: S608 - table from a fixed list
    return set((await session.execute(query)).scalars())


@pytest.fixture
async def world(db_engine: AsyncEngine) -> KbWorld:
    world = await kb_world(db_engine)
    for ident, product in ((world.a, world.product_a), (world.b, world.product_b)):
        src = await add_file(
            db_engine, ident, product, SETTINGS, name="p.md", kind="md", data=PITCH_MD.encode()
        )
        await ingest_source(job_ctx(db_engine, SETTINGS), str(src.org_id), str(src.id), 0)
    return world


def test_the_kb_tables() -> None:
    assert TABLES == ["products", "kb_sources", "kb_source_files", "kb_chunks"]


@pytest.mark.parametrize("table", TABLES)
async def test_unfiltered_reads_see_only_own_org(
    db_engine: AsyncEngine, world: KbWorld, table: str
) -> None:
    async with as_tenant(db_engine, world.a) as s:
        orgs = await org_ids(s, table)
    assert orgs == {world.a.org_id}
    async with as_tenant(db_engine, None) as s:
        assert (await s.execute(text(f"SELECT count(*) FROM {table}"))).scalar() == 0  # noqa: S608


@pytest.mark.parametrize("table", TABLES)
async def test_unfiltered_writes_touch_only_own_org(
    db_engine: AsyncEngine, world: KbWorld, table: str
) -> None:
    async with as_tenant(db_engine, world.a) as s:
        await s.execute(text(f"DELETE FROM {table}"))  # noqa: S608
    async with AsyncSession(db_engine) as s:
        orgs = await org_ids(s, table)
    assert world.b.org_id in orgs


@pytest.mark.parametrize("table", TABLES)
async def test_rows_cannot_be_moved_to_another_org(
    db_engine: AsyncEngine, world: KbWorld, table: str
) -> None:
    with pytest.raises(DBAPIError, match="row-level security"):
        async with as_tenant(db_engine, world.a) as s:
            await s.execute(text(f"UPDATE {table} SET org_id = :b"), {"b": world.b.org_id})  # noqa: S608


async def test_a_source_cannot_be_planted_in_another_org(
    db_engine: AsyncEngine, world: KbWorld
) -> None:
    with pytest.raises(DBAPIError, match="row-level security"):
        async with as_tenant(db_engine, world.a) as s:
            s.add(KbSource(org_id=world.b.org_id, product_id=world.product_b, kind="md", name="x"))
            await s.flush()


async def test_own_org_rows_cannot_point_at_another_orgs_parent(
    db_engine: AsyncEngine, world: KbWorld
) -> None:
    """Composite FKs: a row stamped with org A cannot reference org B's product or source."""
    async with AsyncSession(db_engine) as s:
        b_source = (
            await s.execute(select(KbSource.id).where(KbSource.org_id == world.b.org_id))
        ).scalar_one()
    with pytest.raises(IntegrityError):
        async with AsyncSession(db_engine) as s, s.begin():  # even as the superuser
            s.add(KbSource(org_id=world.a.org_id, product_id=world.product_b, kind="md", name="x"))
    with pytest.raises(IntegrityError):
        async with AsyncSession(db_engine) as s, s.begin():
            s.add(
                KbChunk(
                    org_id=world.a.org_id,
                    source_id=b_source,
                    product_id=world.product_a,
                    ordinal=0,
                    text="x",
                    embedding=[0.0] * 1536,
                )
            )


async def test_app_role_cannot_bypass_rls(db_engine: AsyncEngine, world: KbWorld) -> None:
    with pytest.raises(DBAPIError):
        async with as_tenant(db_engine, world.a) as s:
            await s.execute(text("ALTER TABLE kb_chunks DISABLE ROW LEVEL SECURITY"))


async def test_rls_is_enabled_and_the_app_role_does_not_own_the_tables(
    db_engine: AsyncEngine,
) -> None:
    """Same model as 0003: RLS enabled, and ``corral_app`` is neither owner nor BYPASSRLS."""
    async with AsyncSession(db_engine) as s:
        rows = await s.execute(
            text(
                "SELECT c.relname, c.relrowsecurity, pg_get_userbyid(c.relowner) "
                "FROM pg_class c WHERE c.relname = ANY(:t)"
            ),
            {"t": TABLES},
        )
        found = {r[0]: (r[1], r[2]) for r in rows}
        bypass = (
            await s.execute(text("SELECT rolbypassrls FROM pg_roles WHERE rolname = 'corral_app'"))
        ).scalar()
    assert set(found) == set(TABLES)
    assert all(enabled and owner != "corral_app" for enabled, owner in found.values())
    assert bypass is False


async def test_a_forged_org_setting_without_membership_sees_nothing(
    db_engine: AsyncEngine, world: KbWorld
) -> None:
    async with as_tenant(db_engine, None) as s:
        await s.execute(
            text("SELECT set_config('app.current_org_id', :o, true)"), {"o": str(uuid.uuid4())}
        )
        assert (await s.execute(text("SELECT count(*) FROM kb_chunks"))).scalar() == 0
