"""Structured logging (structlog) configuration.

JSON in deployed environments, pretty console output locally. Context variables bound via
``structlog.contextvars`` (request id, user id, org id) are merged into every event.
"""

import logging
import sys

import structlog


class _LiveStderrHandler(logging.StreamHandler):  # type: ignore[type-arg]
    """Writes to whatever ``sys.stderr`` is at emit time (robust to stream swaps)."""

    def emit(self, record: logging.LogRecord) -> None:
        self.stream = sys.stderr
        super().emit(record)


def configure_logging(env: str, level: str = "INFO") -> None:
    numeric_level = logging.getLevelNamesMapping().get(level.upper(), logging.INFO)
    root = logging.getLogger()
    if not any(isinstance(h, _LiveStderrHandler) for h in root.handlers):
        handler = _LiveStderrHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s %(name)s %(message)s"))
        root.addHandler(handler)
    root.setLevel(numeric_level)
    renderer: structlog.typing.Processor = (
        structlog.dev.ConsoleRenderer() if env == "local" else structlog.processors.JSONRenderer()
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(numeric_level),
        cache_logger_on_first_use=False,
    )
