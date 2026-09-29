"""Just-in-time provisioning of local users, organizations and memberships.

Called from the AuthKit callback. Every upsert is idempotent (``INSERT .. ON CONFLICT``),
so repeated sign-ins and concurrent callbacks converge on the same rows.
"""

import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.identity import (
    ROLE_MEMBER,
    ROLE_OWNER,
    VALID_ROLES,
    Membership,
    Organization,
    User,
)

_SLUG_STRIP = re.compile(r"[^a-z0-9]+")
_MAX_SLUG_BASE = 100


@dataclass(frozen=True, slots=True)
class WorkOSProfile:
    """The subset of a WorkOS authentication result Corral persists."""

    workos_user_id: str
    email: str
    email_verified: bool = False
    first_name: str | None = None
    last_name: str | None = None
    profile_picture_url: str | None = None
    workos_organization_id: str | None = None
    organization_name: str | None = None
    role: str | None = None

    @property
    def personal_workspace_name(self) -> str:
        who = self.first_name or self.email.split("@", 1)[0]
        return f"{who}'s workspace"


@dataclass(frozen=True, slots=True)
class ProvisionedIdentity:
    user_id: uuid.UUID
    org_id: uuid.UUID
    membership_id: uuid.UUID
    role: str


def slugify(name: str) -> str:
    """URL-safe slug with a random suffix so distinct orgs never collide."""
    base = _SLUG_STRIP.sub("-", name.lower()).strip("-")[:_MAX_SLUG_BASE] or "workspace"
    return f"{base}-{secrets.token_hex(3)}"


def normalize_role(role: str | None) -> str:
    return role if role in VALID_ROLES else ROLE_MEMBER


async def provision_identity(
    session: AsyncSession, profile: WorkOSProfile, *, now: datetime | None = None
) -> ProvisionedIdentity:
    """Upsert user, organization and membership for a successful sign-in."""
    signed_in_at = now or datetime.now(UTC)
    user_id = await upsert_user(session, profile, signed_in_at)
    if profile.workos_organization_id:
        org_id = await upsert_workos_organization(
            session,
            workos_organization_id=profile.workos_organization_id,
            name=profile.organization_name or profile.workos_organization_id,
        )
        role = normalize_role(profile.role)
    else:
        org_id = await upsert_personal_organization(
            session, owner_user_id=user_id, name=profile.personal_workspace_name
        )
        role = ROLE_OWNER
    membership_id = await upsert_membership(session, org_id=org_id, user_id=user_id, role=role)
    return ProvisionedIdentity(
        user_id=user_id, org_id=org_id, membership_id=membership_id, role=role
    )


async def upsert_user(session: AsyncSession, profile: WorkOSProfile, now: datetime) -> uuid.UUID:
    values = {
        "workos_user_id": profile.workos_user_id,
        "email": profile.email.lower(),
        "email_verified": profile.email_verified,
        "first_name": profile.first_name,
        "last_name": profile.last_name,
        "profile_picture_url": profile.profile_picture_url,
        "last_sign_in_at": now,
    }
    ins = insert(User).values(**values)
    upsert = ins.on_conflict_do_update(
        index_elements=[User.workos_user_id],
        set_={k: ins.excluded[k] for k in values if k != "workos_user_id"} | {"updated_at": now},
    ).returning(User.id)
    return (await session.execute(upsert)).scalar_one()


async def upsert_workos_organization(
    session: AsyncSession, *, workos_organization_id: str, name: str
) -> uuid.UUID:
    ins = insert(Organization).values(
        name=name, slug=slugify(name), workos_organization_id=workos_organization_id
    )
    upsert = ins.on_conflict_do_update(
        index_elements=[Organization.workos_organization_id],
        set_={"name": ins.excluded.name, "updated_at": datetime.now(UTC)},
    ).returning(Organization.id)
    return (await session.execute(upsert)).scalar_one()


async def upsert_personal_organization(
    session: AsyncSession, *, owner_user_id: uuid.UUID, name: str
) -> uuid.UUID:
    # The personal workspace name is only set on creation; users may rename it later.
    stmt = (
        insert(Organization)
        .values(name=name, slug=slugify(name), personal_owner_user_id=owner_user_id)
        .on_conflict_do_nothing(index_elements=[Organization.personal_owner_user_id])
        .returning(Organization.id)
    )
    created = (await session.execute(stmt)).scalar_one_or_none()
    if created is not None:
        return created
    existing = await session.execute(
        select(Organization.id).where(Organization.personal_owner_user_id == owner_user_id)
    )
    return existing.scalar_one()


async def upsert_membership(
    session: AsyncSession, *, org_id: uuid.UUID, user_id: uuid.UUID, role: str
) -> uuid.UUID:
    ins = insert(Membership).values(org_id=org_id, user_id=user_id, role=role)
    upsert = ins.on_conflict_do_update(
        index_elements=[Membership.org_id, Membership.user_id],
        set_={"role": ins.excluded.role, "updated_at": datetime.now(UTC)},
    ).returning(Membership.id)
    return (await session.execute(upsert)).scalar_one()
