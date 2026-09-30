import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.auth.provisioning import (
    WorkOSProfile,
    normalize_role,
    provision_identity,
    slugify,
)
from app.models.identity import Membership, Organization, User


def profile(**overrides: object) -> WorkOSProfile:
    values: dict[str, object] = {
        "workos_user_id": "user_01",
        "email": "Ada@Example.com",
        "email_verified": True,
        "first_name": "Ada",
        "last_name": "Lovelace",
    }
    values.update(overrides)
    return WorkOSProfile(**values)  # type: ignore[arg-type]


# --- pure helpers -----------------------------------------------------------------


@pytest.mark.parametrize(
    ("name", "prefix"),
    [("Acme Inc.", "acme-inc-"), ("  ", "workspace-"), ("Ünïcode Ltd", "n-code-ltd-")],
)
def test_slugify(name: str, prefix: str) -> None:
    slug = slugify(name)
    assert slug.startswith(prefix)
    assert len(slug) == len(prefix) + 6


def test_slugify_is_unique_and_bounded() -> None:
    assert slugify("x") != slugify("x")
    assert len(slugify("a" * 500)) <= 120


@pytest.mark.parametrize(
    ("role", "expected"),
    [
        ("owner", "owner"),
        ("admin", "admin"),
        ("member", "member"),
        ("root", "member"),
        (None, "member"),
    ],
)
def test_normalize_role(role: str | None, expected: str) -> None:
    assert normalize_role(role) == expected


def test_personal_workspace_name() -> None:
    assert profile().personal_workspace_name == "Ada's workspace"
    assert profile(first_name=None).personal_workspace_name == "Ada's workspace"
    assert profile(first_name=None, email="bob@x.io").personal_workspace_name == "bob's workspace"


# --- database ---------------------------------------------------------------------


async def _count(session: AsyncSession, model: type) -> int:
    return (await session.execute(select(func.count()).select_from(model))).scalar_one()


async def test_personal_workspace_created_and_idempotent(db_session: AsyncSession) -> None:
    first = await provision_identity(db_session, profile())
    second = await provision_identity(db_session, profile())
    await db_session.commit()
    assert first == second
    assert first.role == "owner"
    org = await db_session.get(Organization, first.org_id)
    assert org is not None
    assert org.personal_owner_user_id == first.user_id
    assert org.workos_organization_id is None
    assert org.name == "Ada's workspace"
    user = await db_session.get(User, first.user_id)
    assert user is not None
    assert user.email == "ada@example.com"
    assert (await _count(db_session, User), await _count(db_session, Organization)) == (1, 1)
    assert await _count(db_session, Membership) == 1


async def test_profile_updates_on_subsequent_sign_in(db_session: AsyncSession) -> None:
    t0 = datetime(2026, 1, 1, tzinfo=UTC)
    ident = await provision_identity(db_session, profile(), now=t0)
    await provision_identity(
        db_session, profile(first_name="Augusta", email="new@example.com"), now=t0 + timedelta(1)
    )
    await db_session.commit()
    db_session.expire_all()
    user = await db_session.get(User, ident.user_id)
    assert user is not None
    assert (user.first_name, user.email) == ("Augusta", "new@example.com")
    assert user.last_sign_in_at == t0 + timedelta(1)


async def test_workos_org_membership_and_role_sync(db_session: AsyncSession) -> None:
    p = profile(workos_organization_id="org_01", organization_name="Acme", role="admin")
    ident = await provision_identity(db_session, p)
    assert ident.role == "admin"
    renamed = profile(workos_organization_id="org_01", organization_name="Acme 2", role="member")
    again = await provision_identity(db_session, renamed)
    await db_session.commit()
    db_session.expire_all()
    assert again.org_id == ident.org_id
    assert again.membership_id == ident.membership_id
    membership = await db_session.get(Membership, ident.membership_id)
    org = await db_session.get(Organization, ident.org_id)
    assert membership is not None and org is not None
    assert membership.role == "member"
    assert org.name == "Acme 2"
    assert org.slug.startswith("acme-")  # slug is stable after creation


async def test_unknown_role_and_missing_org_name(db_session: AsyncSession) -> None:
    ident = await provision_identity(
        db_session, profile(workos_organization_id="org_x", role="superuser")
    )
    org = await db_session.get(Organization, ident.org_id)
    assert org is not None
    assert org.name == "org_x"
    assert ident.role == "member"


async def test_two_users_share_one_org(db_session: AsyncSession) -> None:
    a = await provision_identity(db_session, profile(workos_organization_id="org_01"))
    b = await provision_identity(
        db_session,
        profile(workos_user_id="user_02", email="b@example.com", workos_organization_id="org_01"),
    )
    assert a.org_id == b.org_id
    assert a.user_id != b.user_id
    assert await _count(db_session, Membership) == 2


async def test_user_can_have_personal_and_team_workspaces(db_session: AsyncSession) -> None:
    personal = await provision_identity(db_session, profile())
    team = await provision_identity(db_session, profile(workos_organization_id="org_01"))
    assert personal.user_id == team.user_id
    assert personal.org_id != team.org_id


async def test_concurrent_first_sign_ins_converge(db_engine: AsyncEngine) -> None:
    p = profile(workos_organization_id="org_01", organization_name="Acme", role="member")

    async def sign_in() -> uuid.UUID:
        async with AsyncSession(db_engine) as s, s.begin():
            return (await provision_identity(s, p)).org_id

    org_ids = await asyncio.gather(*(sign_in() for _ in range(8)))
    assert len(set(org_ids)) == 1
    async with AsyncSession(db_engine) as s:
        assert await _count(s, User) == 1
        assert await _count(s, Organization) == 1
        assert await _count(s, Membership) == 1


async def test_concurrent_personal_workspace_creation(db_engine: AsyncEngine) -> None:
    async def sign_in() -> uuid.UUID:
        async with AsyncSession(db_engine) as s, s.begin():
            return (await provision_identity(s, profile())).org_id

    org_ids = await asyncio.gather(*(sign_in() for _ in range(8)))
    assert len(set(org_ids)) == 1
