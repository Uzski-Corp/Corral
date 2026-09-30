"""Helpers to act as a tenant exactly like a request transaction does."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.auth.provisioning import ProvisionedIdentity, WorkOSProfile, provision_identity
from app.db.tenancy import apply_tenant_context, enforce_app_role


@asynccontextmanager
async def as_tenant(
    engine: AsyncEngine, ident: ProvisionedIdentity | None
) -> AsyncIterator[AsyncSession]:
    """A transaction running as ``corral_app``; pinned to ``ident``'s org when given."""
    async with AsyncSession(engine, expire_on_commit=False) as session:
        enforce_app_role(session)
        async with session.begin():
            if ident is not None:
                await apply_tenant_context(session, org_id=ident.org_id, user_id=ident.user_id)
            yield session


async def provision(
    engine: AsyncEngine, workos_user_id: str, email: str, workos_org_id: str | None
) -> ProvisionedIdentity:
    async with AsyncSession(engine) as s, s.begin():
        return await provision_identity(
            s,
            WorkOSProfile(
                workos_user_id=workos_user_id,
                email=email,
                workos_organization_id=workos_org_id,
                organization_name=workos_org_id,
            ),
        )
