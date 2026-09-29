"""Application error types and their HTTP translations.

Handlers never leak internal details: unexpected exceptions are logged with context and
surface as a generic 500.
"""

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

log = structlog.get_logger(__name__)


class Unauthenticated(Exception):
    """The request carries no valid session. Optionally clears the session cookie."""

    def __init__(self, detail: str = "Not signed in", *, clear_cookie: bool = False) -> None:
        super().__init__(detail)
        self.detail = detail
        self.clear_cookie = clear_cookie


async def _unauthenticated_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, Unauthenticated)  # noqa: S101 - handler registered for this type
    response = JSONResponse({"detail": exc.detail}, status_code=401)
    if exc.clear_cookie:
        settings = request.app.state.settings
        response.delete_cookie(
            settings.session_cookie_name, path="/", domain=settings.session_cookie_domain
        )
    return response


async def _unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
    log.exception(
        "unhandled_exception",
        path=request.url.path,
        method=request.method,
        error_type=type(exc).__name__,
    )
    return JSONResponse({"detail": "Internal server error"}, status_code=500)


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(Unauthenticated, _unauthenticated_handler)
    app.add_exception_handler(Exception, _unhandled_handler)
