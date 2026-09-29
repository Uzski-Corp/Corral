"""Alembic migrations: up/down/up round trips and model <-> schema parity."""

import asyncio
from typing import Any

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Connection, text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.db.base import Base
from app.models import TENANT_TABLES
from tests.conftest import alembic_config

RLS_TABLES = {"organizations", "users", "memberships", *TENANT_TABLES}
FUNCTIONS = {"app_provision_identity", "app_resolve_membership"}


def query(url: str, sql: str) -> list[Any]:
    async def run() -> list[Any]:
        engine = create_async_engine(url, poolclass=NullPool)
        async with engine.connect() as conn:
            rows = (await conn.execute(text(sql))).all()
        await engine.dispose()
        return [r[0] if len(r) == 1 else tuple(r) for r in rows]

    return asyncio.run(run())


def tables(url: str) -> set[str]:
    return set(query(url, "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))


def rls_tables(url: str) -> set[str]:
    return set(
        query(
            url,
            "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'public' AND c.relrowsecurity",
        )
    )


def functions(url: str) -> set[str]:
    return set(
        query(
            url,
            "SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace "
            "WHERE n.nspname = 'public' AND p.proname LIKE 'app\\_%'",
        )
    )


def test_upgrade_downgrade_upgrade_round_trip(scratch_database_url: str) -> None:
    cfg = alembic_config(scratch_database_url)
    command.upgrade(cfg, "head")
    assert tables(scratch_database_url) == RLS_TABLES | {"alembic_version"}
    assert rls_tables(scratch_database_url) == RLS_TABLES
    assert functions(scratch_database_url) == FUNCTIONS

    command.downgrade(cfg, "base")
    assert tables(scratch_database_url) == {"alembic_version"}
    assert functions(scratch_database_url) == set()

    command.upgrade(cfg, "head")  # role creation and grants are idempotent
    assert rls_tables(scratch_database_url) == RLS_TABLES


def test_each_revision_steps_down_and_up(scratch_database_url: str) -> None:
    cfg = alembic_config(scratch_database_url)
    command.upgrade(cfg, "head")
    for _ in range(3):
        command.downgrade(cfg, "-1")
    assert tables(scratch_database_url) == {"alembic_version"}
    for expected in ({"users"}, {"leads"}, set()):
        command.upgrade(cfg, "+1")
        assert expected <= tables(scratch_database_url)
    assert rls_tables(scratch_database_url) == RLS_TABLES


def test_models_match_migrations(scratch_database_url: str) -> None:
    command.upgrade(alembic_config(scratch_database_url), "head")

    def diff(conn: Connection) -> list[Any]:
        ctx = MigrationContext.configure(conn, opts={"compare_type": True})
        return list(compare_metadata(ctx, Base.metadata))

    async def run() -> list[Any]:
        engine = create_async_engine(scratch_database_url, poolclass=NullPool)
        async with engine.connect() as conn:
            result = await conn.run_sync(diff)
        await engine.dispose()
        return result

    assert asyncio.run(run()) == []


def test_policies_are_keyed_by_current_org(scratch_database_url: str) -> None:
    command.upgrade(alembic_config(scratch_database_url), "head")
    policies = query(
        scratch_database_url,
        "SELECT tablename, qual FROM pg_policies WHERE policyname = 'tenant_isolation'",
    )
    by_table = dict(policies)
    assert set(by_table) == RLS_TABLES - {"users"}
    assert all("app.current_org" in qual for qual in by_table.values())


def test_definer_functions_not_executable_by_public(scratch_database_url: str) -> None:
    command.upgrade(alembic_config(scratch_database_url), "head")
    acls = query(
        scratch_database_url,
        "SELECT p.proname, p.proacl::text FROM pg_proc p WHERE p.proname LIKE 'app\\_%'",
    )
    for name, acl in acls:
        assert "corral_app=X" in acl, name
        # A PUBLIC grant renders as "=X/owner" (empty grantee).
        assert not any(entry.startswith("=") for entry in acl.strip("{}").split(",")), name


def test_offline_sql_generation(capsys: pytest.CaptureFixture[str]) -> None:
    cfg = alembic_config("postgresql+asyncpg://offline@localhost/offline")
    command.upgrade(cfg, "head", sql=True)
    sql = capsys.readouterr().out
    assert "CREATE TABLE users" in sql
    assert "ENABLE ROW LEVEL SECURITY" in sql
