"""Application error types and their HTTP translations.

Handlers never leak internal details: unexpected exceptions are logged with context and
surface as a generic 500.
"""

from collections.abc import Mapping

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

log = structlog.get_logger(__name__)


class ApiProblem(Exception):
    """A typed client error: ``{"error": <code>, "detail": <message>}``.

    ``retry_after_s`` adds a ``Retry-After`` header (and a ``retry_after`` field);
    ``extra`` adds more machine-readable fields (e.g. the id of a duplicate).
    """

    def __init__(
        self,
        status_code: int,
        error: str,
        detail: str,
        *,
        retry_after_s: int | None = None,
        extra: Mapping[str, object] | None = None,
    ) -> None:
        super().__init__(error)
        self.status_code = status_code
        self.error = error
        self.detail = detail
        self.retry_after_s = retry_after_s
        self.extra = dict(extra or {})


async def _api_problem_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiProblem)  # noqa: S101 - handler registered for this type
    body: dict[str, object] = {**exc.extra, "error": exc.error, "detail": exc.detail}
    headers: dict[str, str] = {}
    if exc.retry_after_s is not None:
        body["retry_after"] = exc.retry_after_s
        headers["Retry-After"] = str(exc.retry_after_s)
    return JSONResponse(body, status_code=exc.status_code, headers=headers)


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
    app.add_exception_handler(ApiProblem, _api_problem_handler)
    app.add_exception_handler(Exception, _unhandled_handler)
