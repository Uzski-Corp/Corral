"""Startup migration against a real database: read the stamp, then upgrade, boot or refuse."""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.db import migrate as m


async def _sql(url: str, sql: str) -> None:
    engine = create_async_engine(url, poolclass=NullPool)
    try:
        async with engine.begin() as conn:
            await conn.execute(text(sql))
    finally:
        await engine.dispose()


async def test_recorded_revisions_reads_the_stamp(migrated_database: str) -> None:
    cfg = m._config(migrated_database)
    known = m.known_revisions(cfg)
    recorded = await m.recorded_revisions(migrated_database)
    assert recorded and set(recorded) <= known and "0007_keep_uploaded_picture" in known
    await _sql(migrated_database, "ALTER TABLE alembic_version RENAME TO alembic_version_moved")
    try:
        assert await m.recorded_revisions(migrated_database) is None
    finally:
        await _sql(migrated_database, "ALTER TABLE alembic_version_moved RENAME TO alembic_version")


def test_config_escapes_percent_signs() -> None:
    cfg = m._config("postgresql+asyncpg://u:p%40ss@h/db")
    assert cfg.get_main_option("sqlalchemy.url") == "postgresql+asyncpg://u:p%40ss@h/db"


@pytest.fixture
def stubbed(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    upgrades: list[str] = []
    monkeypatch.setattr(m, "known_revisions", lambda cfg: {"0008_activity"})
    monkeypatch.setattr("app.db.migrate.command.upgrade", lambda cfg, rev: upgrades.append(rev))
    return upgrades


def test_migrate_upgrades_a_known_stamp(
    stubbed: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    async def recorded(url: str) -> list[str]:
        return ["0008_activity"]

    monkeypatch.setattr(m, "recorded_revisions", recorded)
    assert m.migrate("postgresql+asyncpg://x/y", app_env="production") is m.Action.UPGRADE
    assert stubbed == ["head"]


def test_migrate_boots_locally_on_an_unknown_stamp(
    stubbed: list[str], monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    async def recorded(url: str) -> list[str]:
        return ["0099_elsewhere"]

    monkeypatch.setattr(m, "recorded_revisions", recorded)
    assert m.migrate("postgresql+asyncpg://x/y", app_env="local") is m.Action.BOOT
    assert stubbed == [] and "0099_elsewhere" in capsys.readouterr().err
    with pytest.raises(SystemExit):
        m.migrate("postgresql+asyncpg://x/y", app_env="staging")


def test_main_uses_settings_and_app_env(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, str | None]] = []

    class S:
        database_url = "postgresql+asyncpg://x/y"

    monkeypatch.setattr(m, "get_settings", lambda: S())
    monkeypatch.setattr(m, "migrate", lambda url, *, app_env: seen.append((url, app_env)))
    monkeypatch.setenv("APP_ENV", "test")
    m.main()
    assert seen == [("postgresql+asyncpg://x/y", "test")]
