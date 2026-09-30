"""Just-in-time provisioning of local users, organizations and memberships.

Called from the AuthKit callback. Every upsert is idempotent (``INSERT .. ON CONFLICT``
inside ``app_provision_identity``), so repeated sign-ins and concurrent callbacks converge
on the same rows.
"""

import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.identity import ROLE_MEMBER, ROLE_OWNER, VALID_ROLES

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
    """Upsert user, organization and membership for a successful sign-in.

    Runs through the ``app_provision_identity`` SECURITY DEFINER function: sign-in happens
    before any tenant context exists, so row-level security would (correctly) hide and
    block these rows from the request role. The function is atomic and idempotent.
    """
    if profile.workos_organization_id:
        org_name = profile.organization_name or profile.workos_organization_id
        role = normalize_role(profile.role)
    else:
        org_name = profile.personal_workspace_name
        role = ROLE_OWNER
    row = (
        await session.execute(
            text(
                "SELECT o_user_id, o_org_id, o_membership_id, o_role FROM app_provision_identity("
                ":workos_user_id, :email, :email_verified, :first_name, :last_name,"
                " :profile_picture_url, :signed_in_at, :workos_org_id, :org_name, :org_slug,"
                " :role)"
            ),
            {
                "workos_user_id": profile.workos_user_id,
                "email": profile.email.lower(),
                "email_verified": profile.email_verified,
                "first_name": profile.first_name,
                "last_name": profile.last_name,
                "profile_picture_url": profile.profile_picture_url,
                "signed_in_at": now or datetime.now(UTC),
                "workos_org_id": profile.workos_organization_id,
                "org_name": org_name,
                "org_slug": slugify(org_name),
                "role": role,
            },
        )
    ).one()
    user_id, org_id, membership_id, provisioned_role = row
    return ProvisionedIdentity(
        user_id=user_id, org_id=org_id, membership_id=membership_id, role=provisioned_role
    )
