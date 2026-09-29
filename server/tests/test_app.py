import json
import logging
from unittest.mock import AsyncMock, MagicMock

import pytest
import structlog
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.auth.deps import DbDep
from app.auth.provisioning import WorkOSProfile, provision_identity
from app.auth.session import SessionManager
from app.core.config import Settings
from app.core.logging import configure_logging
from app.db.session import Database
from app.db.tenancy import apply_tenant_context
from app.main import create_app
from app.models.domain import Lead
from tests.conftest import make_settings


async def test_health(client: AsyncClient) -> None:
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


async def test_unhandled_exception_returns_generic_500(settings: Settings) -> None:
    app = create_app(settings)

    async def boom() -> None:
        raise RuntimeError("secret internals")

    app.add_api_route("/boom", boom)
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=transport, base_url="http://api.test") as c:
            res = await c.get("/boom")
    assert res.status_code == 500
    assert res.json() == {"detail": "Internal server error"}
    assert "secret" not in res.text


async def test_lifespan_without_workos_disables_auth() -> None:
    app = create_app(make_settings(workos_client_id=""))
    async with app.router.lifespan_context(app):
        assert app.state.session_manager is None
        assert isinstance(app.state.db, Database)


async def test_lifespan_closes_resources(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_client = MagicMock()
    fake_client.close = AsyncMock()
    monkeypatch.setattr("app.main.build_workos_client", lambda s: fake_client)
    dispose = AsyncMock()
    monkeypatch.setattr(Database, "dispose", dispose)
    app = create_app(make_settings())
    async with app.router.lifespan_context(app):
        assert isinstance(app.state.session_manager, SessionManager)
    fake_client.close.assert_awaited_once()
    dispose.assert_awaited_once()


def test_build_workos_client() -> None:
    from app.auth.workos_client import build_workos_client

    assert build_workos_client(make_settings(workos_api_key="")) is None
    client = build_workos_client(make_settings())
    assert client is not None
    assert client.client_id == "client_test"


@pytest.mark.parametrize(("env", "is_json"), [("production", True), ("local", False)])
def test_configure_logging(capsys: pytest.CaptureFixture[str], env: str, is_json: bool) -> None:
    configure_logging(env, "INFO")
    structlog.get_logger("t").info("hello", k=1)
    structlog.get_logger("t").debug("hidden")
    out = capsys.readouterr().out.strip()
    assert "hidden" not in out
    if is_json:
        event = json.loads(out)
        assert (event["event"], event["k"], event["level"]) == ("hello", 1, "info")
    else:
        assert "hello" in out
    configure_logging("test", "bogus")  # unknown level falls back to INFO
    assert logging.getLogger().level == logging.INFO


# --- database session lifecycle ---------------------------------------------------------


async def test_database_ping(db_engine: AsyncEngine) -> None:
    await Database(db_engine).ping()


async def test_database_ping_fails_for_unreachable_server() -> None:
    db = Database.from_settings(make_settings(db_connect_timeout_s=1))
    with pytest.raises(OSError):
        await db.ping()
    await db.dispose()


async def test_request_transaction_commits_or_rolls_back(
    migrated_database: str, db_engine: AsyncEngine
) -> None:
    async with AsyncSession(db_engine) as s, s.begin():
        ident = await provision_identity(s, WorkOSProfile(workos_user_id="u1", email="a@b.co"))
    app = create_app(make_settings(database_url=migrated_database))

    async def create(db: DbDep, email: str, fail: bool = False) -> dict[str, bool]:
        await apply_tenant_context(db, org_id=ident.org_id, user_id=ident.user_id)
        db.add(Lead(org_id=ident.org_id, email=email))
        await db.flush()
        if fail:
            raise HTTPException(400, "nope")
        return {"ok": True}

    app.add_api_route("/create", create, methods=["POST"])
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            assert (await c.post("/create", params={"email": "kept@x.io"})).status_code == 200
            res = await c.post("/create", params={"email": "gone@x.io", "fail": True})
            assert res.status_code == 400
    async with AsyncSession(db_engine) as s:
        emails = (await s.execute(select(Lead.email))).scalars().all()
        assert emails == ["kept@x.io"]
        assert (await s.execute(select(func.count()).select_from(Lead))).scalar_one() == 1


async def test_request_transaction_runs_as_app_role(
    migrated_database: str, db_engine: AsyncEngine
) -> None:
    app = create_app(make_settings(database_url=migrated_database))

    async def whoami(db: DbDep) -> dict[str, object]:
        row = (
            await db.execute(
                text(
                    "SELECT current_user, r.rolbypassrls, r.rolsuper "
                    "FROM pg_roles r WHERE r.rolname = current_user"
                )
            )
        ).one()
        return {"role": row[0], "bypass": row[1], "super": row[2]}

    app.add_api_route("/whoami", whoami)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            body = (await c.get("/whoami")).json()
    assert body == {"role": "corral_app", "bypass": False, "super": False}
