"""``python -m app.seed --org``: finds one org by slug or id and prints the key once."""

import asyncio
import sys
import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.models import Organization
from app.seed import __main__ as cli
from tests.conftest import _truncate_all
from tests.tenancy_helpers import provision


def _setup(url: str) -> tuple[AsyncEngine, str, str]:
    async def go() -> tuple[str, str]:
        ident = await provision(engine, "user_cli", "cli@a.io", "org_cli")
        async with AsyncSession(engine) as session:
            slug = await session.scalar(
                select(Organization.slug).where(Organization.id == ident.org_id)
            )
        assert slug is not None
        return slug, str(ident.org_id)

    engine = create_async_engine(url, poolclass=NullPool)
    slug, org_id = asyncio.run(go())
    return engine, slug, org_id


@pytest.fixture
def cli_db(migrated_database: str, monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(
        cli, "get_settings", lambda: SimpleNamespace(database_url=migrated_database)
    )
    engine, slug, org_id = _setup(migrated_database)
    yield slug, org_id
    asyncio.run(_truncate_all(engine))
    asyncio.run(engine.dispose())


def _main(monkeypatch: pytest.MonkeyPatch, *args: str) -> None:
    monkeypatch.setattr(sys, "argv", ["app.seed", *args])
    cli.main()


def test_seeds_by_slug_then_says_the_key_exists(
    cli_db: tuple[str, str], monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    slug, _ = cli_db
    _main(monkeypatch, "--org", slug)
    out = capsys.readouterr().out
    assert f"Seeded {slug}." in out
    assert "crl_live_" in out
    _main(monkeypatch, "--org", slug)
    assert "already exists" in capsys.readouterr().out


def test_seeds_by_uuid(
    cli_db: tuple[str, str], monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    _, org_id = cli_db
    _main(monkeypatch, "--org", org_id)
    assert f"Seeded {org_id}." in capsys.readouterr().out


@pytest.mark.parametrize("key", ["no-such-org", str(uuid.UUID(int=1))])
def test_refuses_an_unknown_org(
    cli_db: tuple[str, str],
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    key: str,
) -> None:
    with pytest.raises(SystemExit) as exc:
        _main(monkeypatch, "--org", key)
    assert exc.value.code == 2
    assert "No organization matches" in capsys.readouterr().err


def test_org_is_required(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(SystemExit) as exc:
        _main(monkeypatch)
    assert exc.value.code == 2
