"""Seed one workspace: ``uv run python -m app.seed --org <slug-or-uuid>``.

Refuses to guess an org. Signup does not run this.
"""

import argparse
import asyncio
import sys
import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.db.tenancy import apply_tenant_context, enforce_app_role
from app.models.identity import Membership, Organization
from app.seed.demo import seed_org


async def _resolve(key: str) -> tuple[uuid.UUID, uuid.UUID | None] | None:
    engine = create_async_engine(get_settings().database_url, poolclass=NullPool)
    try:
        async with AsyncSession(engine) as session, session.begin():
            try:
                as_uuid = uuid.UUID(key)
            except ValueError:
                as_uuid = None
            stmt = select(Organization)
            if as_uuid is not None:
                stmt = stmt.where(or_(Organization.slug == key, Organization.id == as_uuid))
            else:
                stmt = stmt.where(Organization.slug == key)
            org = (await session.execute(stmt)).scalar_one_or_none()
            if org is None:
                return None
            membership = (
                await session.execute(
                    select(Membership.user_id).where(Membership.org_id == org.id).limit(1)
                )
            ).scalar_one_or_none()
            return org.id, membership
    finally:
        await engine.dispose()


async def _run(key: str) -> str | None:
    found = await _resolve(key)
    if found is None:
        print(
            f"No organization matches {key!r}. Pass a slug or id. Signup is not seeded.",
            file=sys.stderr,
        )
        raise SystemExit(2)
    org_id, user_id = found
    engine = create_async_engine(get_settings().database_url, poolclass=NullPool)
    try:
        async with AsyncSession(engine) as session:
            enforce_app_role(session)
            async with session.begin():
                await apply_tenant_context(session, org_id=org_id, user_id=user_id)
                return await seed_org(session, org_id, user_id)
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed one Corral workspace with the ColdTrace demo."
    )
    parser.add_argument("--org", required=True, help="Organization slug or uuid. Required.")
    args = parser.parse_args()
    secret = asyncio.run(_run(args.org))
    print(f"Seeded {args.org}.")
    if secret:
        print(f"Demo API key (shown once, stored only as a hash): {secret}")
    else:
        print("The demo API key already exists; its secret was shown when it was made.")


if __name__ == "__main__":
    main()
