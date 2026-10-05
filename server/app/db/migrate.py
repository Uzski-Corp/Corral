"""Apply migrations before the API listens.

A local Postgres volume is often migrated by another checkout. Alembic then
refuses to start (`Can't locate revision identified by …`) and the whole
stack stays down. Locally we leave that stamp alone and boot: the schema is
already ahead of this checkout, and rewriting ``alembic_version`` would make
the other checkout re-apply migrations that are already in the database.
Staging and production still refuse to start on a revision they don't have.
"""

from __future__ import annotations

import asyncio
import os
import sys
from enum import Enum
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings

SERVER_DIR = Path(__file__).resolve().parents[2]


class Action(Enum):
    """What startup should do with the revision already stored in the database."""

    UPGRADE = "upgrade"
    BOOT = "boot"


def decide(recorded: list[str] | None, known: set[str]) -> tuple[Action, list[str]]:
    """Fresh or a revision this checkout has: upgrade to head. Anything else: boot as-is."""
    if not recorded:
        return Action.UPGRADE, []
    unknown = [rev for rev in recorded if rev not in known]
    if unknown:
        return Action.BOOT, unknown
    return Action.UPGRADE, []


def allow_unknown(app_env: str | None) -> bool:
    """Only a local volume may be ahead of this checkout. Deployed envs must match."""
    return app_env in (None, "", "local")


def _config(url: str) -> Config:
    cfg = Config(str(SERVER_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(SERVER_DIR / "migrations"))
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return cfg


def known_revisions(cfg: Config) -> set[str]:
    return {rev.revision for rev in ScriptDirectory.from_config(cfg).walk_revisions()}


async def recorded_revisions(url: str) -> list[str] | None:
    """Revisions stamped in the database, or None when Alembic has never run there."""
    engine = create_async_engine(url, poolclass=NullPool)
    try:
        async with engine.connect() as conn:
            if await conn.scalar(text("SELECT to_regclass('public.alembic_version')")) is None:
                return None
            result = await conn.execute(text("SELECT version_num FROM alembic_version"))
            rows: list[str] = list(result.scalars().all())
            return rows
    finally:
        await engine.dispose()


def _refuse(unknown: list[str]) -> None:
    joined = ", ".join(unknown)
    print(
        f"database revision {joined} is not in this checkout. "
        "Refusing to start: staging and production must be migrated by this build.",
        file=sys.stderr,
    )
    raise SystemExit(1)


def _warn(unknown: list[str]) -> None:
    joined = ", ".join(unknown)
    print(
        f"database revision {joined} is not in this checkout "
        "(another branch migrated this volume). Leaving alembic_version unchanged and starting. "
        "A migration added here will not apply until the volume is at a revision we know.",
        file=sys.stderr,
    )


def migrate(url: str, *, app_env: str | None) -> Action:
    cfg = _config(url)
    action, unknown = decide(asyncio.run(recorded_revisions(url)), known_revisions(cfg))
    if action is Action.BOOT:
        if not allow_unknown(app_env):
            _refuse(unknown)
        _warn(unknown)
        return action
    command.upgrade(cfg, "head")
    return action


def main() -> None:
    migrate(get_settings().database_url, app_env=os.environ.get("APP_ENV"))


if __name__ == "__main__":
    main()
