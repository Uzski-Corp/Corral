"""Shared fixtures.

Database tests need Postgres. Resolution order:
1. ``TEST_DATABASE_URL`` (e.g. a CI service container or a local server), else
2. a disposable testcontainers Postgres when Docker is reachable, else
3. the test is skipped with a clear reason.
"""

import asyncio
import os
import secrets
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from cryptography.fernet import Fernet
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import make_url, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.auth.session import SessionManager
from app.core.config import Settings
from app.main import create_app
from tests.workos_fakes import WorkOSHarness, build_harness

COOKIE_PASSWORD = Fernet.generate_key().decode()
FRONTEND_URL = "http://frontend.test"
UNUSED_DB_URL = "postgresql+asyncpg://unused:unused@127.0.0.1:1/unused"


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "app_env": "test",
        "database_url": UNUSED_DB_URL,
        "workos_api_key": "sk_test_dummy",
        "workos_client_id": "client_test",
        "workos_cookie_password": COOKIE_PASSWORD,
        "workos_redirect_uri": "http://api.test/api/v1/auth/callback",
        "frontend_url": FRONTEND_URL,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def docker_available() -> bool:
    try:
        import docker

        docker.from_env(timeout=3).ping()
    except Exception:
        return False
    return True


@pytest.fixture(scope="session")
def database_url() -> Iterator[str]:
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        yield url
        return
    if not docker_available():
        pytest.skip("Postgres unavailable: set TEST_DATABASE_URL or start Docker")
    from testcontainers.postgres import PostgresContainer

    with PostgresContainer("postgres:16-alpine", driver="asyncpg") as pg:
        yield pg.get_connection_url()


SERVER_DIR = Path(__file__).resolve().parent.parent


def alembic_config(url: str) -> Config:
    cfg = Config(str(SERVER_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(SERVER_DIR / "migrations"))
    cfg.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return cfg


async def _drop_schema(url: str) -> None:
    engine = create_async_engine(url, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    await engine.dispose()


def reset_database(url: str) -> None:
    """Empty the public schema and apply every migration (the real deploy path)."""
    asyncio.run(_drop_schema(url))
    command.upgrade(alembic_config(url), "head")


async def _admin_execute(url: str, sql: str) -> None:
    engine = create_async_engine(url, poolclass=NullPool, isolation_level="AUTOCOMMIT")
    async with engine.connect() as conn:
        await conn.execute(text(sql))
    await engine.dispose()


@pytest.fixture
def scratch_database_url(database_url: str) -> Iterator[str]:
    """A brand-new, empty database on the same server (for migration up/down tests)."""
    name = f"corral_scratch_{secrets.token_hex(4)}"
    base = make_url(database_url)
    asyncio.run(_admin_execute(database_url, f'CREATE DATABASE "{name}"'))
    try:
        yield base.set(database=name).render_as_string(hide_password=False)
    finally:
        asyncio.run(_admin_execute(database_url, f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))


@pytest.fixture(scope="session")
def migrated_database(database_url: str) -> str:
    reset_database(database_url)
    return database_url


async def _truncate_all(engine: AsyncEngine) -> None:
    from app.db.base import Base
    from app.models import Membership  # noqa: F401  (register models)

    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture
async def db_engine(migrated_database: str) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(migrated_database, poolclass=NullPool)
    try:
        yield engine
    finally:
        await _truncate_all(engine)
        await engine.dispose()


@pytest.fixture
async def db_session(db_engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with AsyncSession(db_engine, expire_on_commit=False) as session:
        yield session


@pytest.fixture
def workos(monkeypatch: pytest.MonkeyPatch) -> WorkOSHarness:
    return build_harness(monkeypatch, COOKIE_PASSWORD)


@pytest.fixture
def settings() -> Settings:
    return make_settings()


async def _running_app(app: FastAPI, harness: WorkOSHarness | None) -> AsyncIterator[AsyncClient]:
    async with app.router.lifespan_context(app):
        if harness is not None:
            app.state.session_manager = SessionManager(
                harness.client, cookie_password=COOKIE_PASSWORD, timeout_s=2
            )
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://api.test") as client:
            yield client


@pytest.fixture
async def client(settings: Settings, workos: WorkOSHarness) -> AsyncIterator[AsyncClient]:
    """App client without a database (for routes that fail before touching the DB)."""
    async for c in _running_app(create_app(settings), workos):
        yield c


@pytest.fixture
async def db_client(
    migrated_database: str, db_engine: AsyncEngine, workos: WorkOSHarness
) -> AsyncIterator[AsyncClient]:
    """App client wired to the test database."""
    app = create_app(make_settings(database_url=migrated_database))
    async for c in _running_app(app, workos):
        yield c
