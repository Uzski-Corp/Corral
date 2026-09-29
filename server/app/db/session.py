"""Async database engine lifecycle and the per-request session dependency.

The engine is created in the application lifespan and stored on ``app.state.db``;
there is no import-time engine, so importing the app never opens connections.
"""

from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import Settings
from app.db.tenancy import enforce_app_role


class Database:
    """Owns the engine + session factory for one application instance."""

    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine
        self.sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    @classmethod
    def from_settings(cls, settings: Settings) -> "Database":
        engine = create_async_engine(
            settings.database_url,
            pool_pre_ping=True,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            connect_args={
                "timeout": settings.db_connect_timeout_s,
                "server_settings": {
                    "application_name": "corral-api",
                    "statement_timeout": str(settings.db_statement_timeout_ms),
                },
            },
        )
        return cls(engine)

    async def ping(self) -> None:
        """Round-trip ``SELECT 1``; raises on failure."""
        async with self.engine.connect() as conn:
            await conn.execute(text("SELECT 1"))

    async def dispose(self) -> None:
        await self.engine.dispose()


def get_database(request: Request) -> Database:
    db: Database = request.app.state.db
    return db


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    """One transaction per request: commit on success, roll back on any exception.

    The transaction runs as the unprivileged ``corral_app`` role so row-level security
    applies; the auth dependency then pins ``app.current_org`` for the caller.
    """
    database = get_database(request)
    async with database.sessionmaker() as session:
        enforce_app_role(session)
        async with session.begin():
            yield session
