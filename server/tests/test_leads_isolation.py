"""Row-level security and composite foreign keys on the lead CRM tables."""

import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models import (
    CRM_TABLES,
    Company,
    CompanyFit,
    Lead,
    LeadImport,
    Segment,
    SegmentPin,
    Suppression,
)
from tests.leads_helpers import World, insert_seed, make_world, random_seed, seeded_rng
from tests.tenancy_helpers import as_tenant
from tests.workos_fakes import WorkOSHarness

TABLES = list(CRM_TABLES)


@pytest.fixture
async def world(db_engine: AsyncEngine, workos: WorkOSHarness) -> World:
    world = await make_world(db_engine, workos)
    for seed, ident, product in ((1, world.a, world.product_a), (2, world.b, world.product_b)):
        rows = random_seed(seeded_rng(seed), ident.org_id, 4)
        for r in rows:
            r.fit = 50
        await insert_seed(db_engine, rows, product)
        async with AsyncSession(db_engine) as s, s.begin():
            seg = Segment(org_id=ident.org_id, name="S")
            s.add(seg)
            await s.flush()
            s.add(
                SegmentPin(org_id=ident.org_id, segment_id=seg.id, company_id=rows[0].company["id"])
            )
            s.add(Suppression(org_id=ident.org_id, email="x@x.io", reason="manual"))
            s.add(
                LeadImport(
                    org_id=ident.org_id,
                    filename="a.csv",
                    byte_size=1,
                    content_sha256="0" * 64,
                    policy="skip",
                    mapping=["company"],
                )
            )
    return world


async def org_ids(session: AsyncSession, table: str) -> set[uuid.UUID]:
    query = text(f"SELECT DISTINCT org_id FROM {table}")  # noqa: S608 - table from a fixed list
    return set((await session.execute(query)).scalars())


def test_the_crm_tables() -> None:
    assert TABLES == ["companies", "company_fits", "segment_pins", "suppressions", "lead_imports"]


@pytest.mark.parametrize("table", TABLES)
async def test_unfiltered_reads_and_writes_stay_in_the_org(
    db_engine: AsyncEngine, world: World, table: str
) -> None:
    async with as_tenant(db_engine, world.a) as s:
        assert await org_ids(s, table) == {world.a.org_id}
    async with as_tenant(db_engine, None) as s:
        assert (await s.execute(text(f"SELECT count(*) FROM {table}"))).scalar() == 0  # noqa: S608
    async with as_tenant(db_engine, world.a) as s:
        await s.execute(text(f"DELETE FROM {table}"))  # noqa: S608
    async with AsyncSession(db_engine) as s:
        assert await org_ids(s, table) == {world.b.org_id}


@pytest.mark.parametrize("table", TABLES)
async def test_rows_cannot_be_moved_to_another_org(
    db_engine: AsyncEngine, world: World, table: str
) -> None:
    with pytest.raises(DBAPIError, match="row-level security"):
        async with as_tenant(db_engine, world.a) as s:
            await s.execute(text(f"UPDATE {table} SET org_id = :b"), {"b": world.b.org_id})  # noqa: S608


async def test_children_cannot_point_at_another_orgs_parent(
    db_engine: AsyncEngine, world: World
) -> None:
    async with AsyncSession(db_engine) as s:
        b_company = (
            (await s.execute(select(Company.id).where(Company.org_id == world.b.org_id)))
            .scalars()
            .first()
        )
        b_segment = (
            await s.execute(select(Segment.id).where(Segment.org_id == world.b.org_id))
        ).scalar_one()
        a_company = (
            (await s.execute(select(Company.id).where(Company.org_id == world.a.org_id)))
            .scalars()
            .first()
        )
    a = world.a.org_id
    bad = [
        Lead(org_id=a, email="z@z.io", company_id=b_company),
        CompanyFit(org_id=a, company_id=b_company, product_id=world.product_a, score=1),
        CompanyFit(org_id=a, company_id=a_company, product_id=world.product_b, score=1),
        SegmentPin(org_id=a, segment_id=b_segment, company_id=a_company),
    ]
    for row in bad:
        with pytest.raises(IntegrityError):
            async with AsyncSession(db_engine) as s, s.begin():  # even as the superuser
                s.add(row)


async def test_rls_is_enabled_on_every_crm_table(db_engine: AsyncEngine) -> None:
    async with AsyncSession(db_engine) as s:
        rows = await s.execute(
            text(
                "SELECT c.relname, c.relrowsecurity, pg_get_userbyid(c.relowner) "
                "FROM pg_class c WHERE c.relname = ANY(:t)"
            ),
            {"t": TABLES},
        )
        found = {r[0]: (r[1], r[2]) for r in rows}
    assert set(found) == set(TABLES)
    assert all(enabled and owner != "corral_app" for enabled, owner in found.values())


async def test_one_primary_per_company(db_engine: AsyncEngine, world: World) -> None:
    async with AsyncSession(db_engine) as s:
        company = (
            (await s.execute(select(Company.id).where(Company.org_id == world.a.org_id)))
            .scalars()
            .first()
        )
    with pytest.raises(IntegrityError):
        async with AsyncSession(db_engine) as s, s.begin():
            s.add_all(
                [
                    Lead(
                        org_id=world.a.org_id,
                        email=f"{i}@p.io",
                        company_id=company,
                        is_primary=True,
                    )
                    for i in range(2)
                ]
            )
