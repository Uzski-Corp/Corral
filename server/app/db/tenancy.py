"""Per-transaction tenant context for Postgres row-level security.

Every request transaction first switches to the unprivileged ``corral_app`` role (created
by migration ``0003``), so RLS applies even when the pooled login role owns the tables or
is a superuser. Once the caller is authenticated, ``app.current_org`` and
``app.current_user_id`` are set *transaction-locally*: they vanish on commit/rollback and
can never leak to the next request that reuses the pooled connection.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import Connection, event, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session, SessionTransaction

APP_ROLE = "corral_app"


_ASSUME_ROLE = text("SELECT set_config('role', :role, true)")


def assume_app_role_on_begin(
    session: Session, transaction: SessionTransaction, connection: Connection
) -> None:
    """``after_begin`` hook: runs when the session first binds a connection.

    Being lazy means requests that never touch the database never check out a connection.
    """
    connection.execute(_ASSUME_ROLE, {"role": APP_ROLE})


def enforce_app_role(session: AsyncSession) -> None:
    event.listen(session.sync_session, "after_begin", assume_app_role_on_begin)


async def apply_tenant_context(
    session: AsyncSession, *, org_id: uuid.UUID, user_id: uuid.UUID | None = None
) -> None:
    """Pin the current transaction to ``org_id`` (``user_id`` is unset for system jobs)."""
    await session.execute(
        text(
            "SELECT set_config('app.current_org', :org, true),"
            " set_config('app.current_user_id', :user, true)"
        ),
        {"org": str(org_id), "user": str(user_id) if user_id else ""},
    )


@dataclass(frozen=True, slots=True)
class ResolvedMembership:
    user_id: uuid.UUID
    org_id: uuid.UUID
    role: str


async def resolve_membership(
    session: AsyncSession, *, workos_user_id: str, workos_organization_id: str | None
) -> ResolvedMembership | None:
    """Look up the caller's membership before any tenant context exists.

    Runs through the ``app_resolve_membership`` SECURITY DEFINER function, the only path
    that can read identity rows across tenants, and it only returns the caller's own row.
    """
    row = (
        await session.execute(
            text("SELECT o_user_id, o_org_id, o_role FROM app_resolve_membership(:u, :o)"),
            {"u": workos_user_id, "o": workos_organization_id},
        )
    ).one_or_none()
    if row is None:
        return None
    user_id, org_id, role = row
    return ResolvedMembership(user_id=user_id, org_id=org_id, role=role)
