"""Cross-tenant isolation at the repository layer *and* in Postgres itself.

Org A must not be able to read or write org B's rows, even with a hand-written query
that forgets the ``org_id`` filter (that's what row-level security is for).
"""

import uuid
from dataclasses import dataclass

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.auth.provisioning import ProvisionedIdentity
from app.db.tenancy import resolve_membership
from app.models import InboxThread, KnowledgeItem, Lead, Membership, Organization, Segment, User
from app.models import Sequence as SequenceModel
from app.repositories import (
    InboxThreadRepository,
    KnowledgeRepository,
    LeadRepository,
    SegmentRepository,
    SequenceRepository,
)
from app.repositories.base import MAX_PAGE_SIZE, ProtectedFieldError
from tests.tenancy_helpers import as_tenant, provision


@dataclass
class World:
    a: ProvisionedIdentity
    b: ProvisionedIdentity
    lead_a: uuid.UUID
    lead_b: uuid.UUID


@pytest.fixture
async def world(db_engine: AsyncEngine) -> World:
    a = await provision(db_engine, "user_a", "a@a.io", "org_a")
    b = await provision(db_engine, "user_b", "b@b.io", "org_b")
    async with AsyncSession(db_engine) as s, s.begin():  # superuser seeding
        la = Lead(org_id=a.org_id, email="lead@a.io")
        lb = Lead(org_id=b.org_id, email="lead@b.io")
        s.add_all([la, lb])
        for ident, tag in ((a, "A"), (b, "B")):
            s.add_all(
                [
                    Segment(org_id=ident.org_id, name=f"seg {tag}"),
                    SequenceModel(org_id=ident.org_id, name=f"seq {tag}"),
                    InboxThread(org_id=ident.org_id, subject=f"thread {tag}"),
                    KnowledgeItem(org_id=ident.org_id, title=f"kb {tag}"),
                ]
            )
        await s.flush()
        return World(a=a, b=b, lead_a=la.id, lead_b=lb.id)


# --- repository layer -----------------------------------------------------------------


async def test_repository_lists_only_own_rows(db_engine: AsyncEngine, world: World) -> None:
    async with as_tenant(db_engine, world.a) as s:
        leads = await LeadRepository(s, world.a.org_id).list()
        assert [lead.id for lead in leads] == [world.lead_a]
        assert await LeadRepository(s, world.a.org_id).count() == 1


@pytest.mark.parametrize(
    ("repo_cls", "label"),
    [
        (SegmentRepository, "seg A"),
        (SequenceRepository, "seq A"),
        (InboxThreadRepository, "thread A"),
        (KnowledgeRepository, "kb A"),
    ],
)
async def test_every_domain_repository_is_scoped(
    db_engine: AsyncEngine, world: World, repo_cls: type, label: str
) -> None:
    async with as_tenant(db_engine, world.a) as s:
        rows = await repo_cls(s, world.a.org_id).list()
    assert len(rows) == 1
    assert label in {getattr(rows[0], f, None) for f in ("name", "subject", "title")}


async def test_repository_cannot_get_update_or_delete_other_org(
    db_engine: AsyncEngine, world: World
) -> None:
    async with as_tenant(db_engine, world.a) as s:
        repo = LeadRepository(s, world.a.org_id)
        assert await repo.get(world.lead_b) is None
        assert await repo.update(world.lead_b, first_name="pwned") is None
        assert await repo.delete(world.lead_b) is False
    async with AsyncSession(db_engine) as s:
        lead_b = await s.get(Lead, world.lead_b)
        assert lead_b is not None
        assert lead_b.first_name is None


async def test_repository_bound_to_wrong_org_still_blocked_by_rls(
    db_engine: AsyncEngine, world: World
) -> None:
    """Even a bug that builds a repository for org B inside org A's request sees nothing."""
    async with as_tenant(db_engine, world.a) as s:
        repo = LeadRepository(s, world.b.org_id)
        assert await repo.list() == []
        assert await repo.get(world.lead_b) is None
        assert await repo.delete(world.lead_b) is False
        with pytest.raises(ProgrammingError, match="row-level security"):
            await repo.create(email="sneaky@b.io")


async def test_repository_stamps_org_and_rejects_protected_fields(
    db_engine: AsyncEngine, world: World
) -> None:
    async with as_tenant(db_engine, world.a) as s:
        repo = LeadRepository(s, world.a.org_id)
        lead = await repo.create(email="new@a.io", first_name="N")
        assert lead.org_id == world.a.org_id
        with pytest.raises(ProtectedFieldError):
            await repo.create(email="x@a.io", org_id=world.b.org_id)
        with pytest.raises(ProtectedFieldError):
            await repo.update(lead.id, org_id=world.b.org_id)
        updated = await repo.update(lead.id, first_name="M")
        assert updated is not None and updated.first_name == "M"
        assert await repo.delete(lead.id) is True


async def test_repository_pagination_is_bounded(db_engine: AsyncEngine, world: World) -> None:
    async with as_tenant(db_engine, world.a) as s:
        repo = LeadRepository(s, world.a.org_id)
        for i in range(3):
            await repo.create(email=f"p{i}@a.io")
        assert len(await repo.list(limit=2)) == 2
        assert len(await repo.list(limit=0)) == 1  # clamped to >= 1
        assert len(await repo.list(limit=MAX_PAGE_SIZE * 10)) == 4
        assert len(await repo.list(offset=-5)) == 4


# --- raw SQL: row-level security is the backstop ------------------------------------


async def test_unfiltered_select_sees_only_current_org(
    db_engine: AsyncEngine, world: World
) -> None:
    async with as_tenant(db_engine, world.a) as s:
        emails: list[str] = list((await s.execute(text("SELECT email FROM leads"))).scalars())
        orgs = (await s.execute(select(Organization.id))).scalars().all()
        users = (await s.execute(select(User.id))).scalars().all()
        memberships = (await s.execute(select(Membership.org_id))).scalars().all()
    assert emails == ["lead@a.io"]
    assert orgs == [world.a.org_id]
    assert users == [world.a.user_id]
    assert memberships == [world.a.org_id]


async def test_unfiltered_update_and_delete_touch_only_current_org(
    db_engine: AsyncEngine, world: World
) -> None:
    async with as_tenant(db_engine, world.a) as s:
        updated = await s.execute(text("UPDATE leads SET first_name = 'x'"))
        deleted = await s.execute(text("DELETE FROM leads WHERE id = :id"), {"id": world.lead_b})
        assert updated.rowcount == 1  # type: ignore[attr-defined]
        assert deleted.rowcount == 0  # type: ignore[attr-defined]
    async with AsyncSession(db_engine) as s:
        lead_b = await s.get(Lead, world.lead_b)
        assert lead_b is not None and lead_b.first_name is None


@pytest.mark.parametrize("table", ["leads", "segments", "sequences", "knowledge_items"])
async def test_insert_into_other_org_is_rejected(
    db_engine: AsyncEngine, world: World, table: str
) -> None:
    column = {"leads": "email", "knowledge_items": "title"}.get(table, "name")
    with pytest.raises(ProgrammingError, match="row-level security"):
        async with as_tenant(db_engine, world.a) as s:
            await s.execute(
                text(f"INSERT INTO {table} (org_id, {column}) VALUES (:org, 'x')"),  # noqa: S608
                {"org": world.b.org_id},
            )


async def test_moving_a_row_to_another_org_is_rejected(
    db_engine: AsyncEngine, world: World
) -> None:
    with pytest.raises(ProgrammingError, match="row-level security"):
        async with as_tenant(db_engine, world.a) as s:
            await s.execute(
                text("UPDATE leads SET org_id = :b WHERE id = :id"),
                {"b": world.b.org_id, "id": world.lead_a},
            )


async def test_cannot_add_self_to_other_org(db_engine: AsyncEngine, world: World) -> None:
    with pytest.raises(ProgrammingError, match="row-level security"):
        async with as_tenant(db_engine, world.a) as s:
            s.add(Membership(org_id=world.b.org_id, user_id=world.a.user_id, role="owner"))
            await s.flush()


async def test_no_tenant_context_sees_nothing(db_engine: AsyncEngine, world: World) -> None:
    async with as_tenant(db_engine, None) as s:
        for model in (Lead, Organization, User, Membership, Segment):
            count = (await s.execute(select(func.count()).select_from(model))).scalar_one()
            assert count == 0, model.__tablename__
    with pytest.raises(ProgrammingError, match="row-level security"):
        async with as_tenant(db_engine, None) as s:
            await s.execute(
                text("INSERT INTO leads (org_id, email) VALUES (:o, 'x@x.io')"),
                {"o": world.a.org_id},
            )


async def test_app_role_cannot_create_identities_directly(
    db_engine: AsyncEngine, world: World
) -> None:
    with pytest.raises(ProgrammingError):
        async with as_tenant(db_engine, world.a) as s:
            await s.execute(text("INSERT INTO users (workos_user_id, email) VALUES ('x', 'x')"))


async def test_app_role_cannot_escalate(db_engine: AsyncEngine, world: World) -> None:
    async with as_tenant(db_engine, world.a) as s:
        row = (
            await s.execute(
                text(
                    "SELECT current_user, rolsuper, rolbypassrls FROM pg_roles "
                    "WHERE rolname = current_user"
                )
            )
        ).one()
    assert tuple(row) == ("corral_app", False, False)
    with pytest.raises(DBAPIError):
        async with as_tenant(db_engine, world.a) as s:
            await s.execute(text("ALTER TABLE leads DISABLE ROW LEVEL SECURITY"))


async def test_tenant_context_is_transaction_local(db_engine: AsyncEngine, world: World) -> None:
    async with db_engine.connect() as conn:
        async with conn.begin():
            await conn.execute(text("SELECT set_config('role', 'corral_app', true)"))
            await conn.execute(
                text("SELECT set_config('app.current_org', :o, true)"), {"o": str(world.a.org_id)}
            )
        # Same pooled connection, next transaction: nothing leaks.
        org = (await conn.execute(text("SELECT current_setting('app.current_org', true)"))).scalar()
        role = (await conn.execute(text("SELECT current_user"))).scalar()
    assert org in (None, "")
    assert role != "corral_app"


async def test_resolve_membership(db_engine: AsyncEngine, world: World) -> None:
    async with as_tenant(db_engine, None) as s:
        found = await resolve_membership(s, workos_user_id="user_a", workos_organization_id="org_a")
        cross = await resolve_membership(s, workos_user_id="user_a", workos_organization_id="org_b")
        unknown = await resolve_membership(s, workos_user_id="nobody", workos_organization_id=None)
    assert found is not None
    assert (found.user_id, found.org_id) == (world.a.user_id, world.a.org_id)
    assert cross is None
    assert unknown is None
