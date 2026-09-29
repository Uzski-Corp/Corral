"""Structured logging (structlog) configuration.

JSON in deployed environments, pretty console output locally. Context variables bound via
``structlog.contextvars`` (request id, user id, org id) are merged into every event.
"""

import logging

import structlog


def configure_logging(env: str, level: str = "INFO") -> None:
    numeric_level = logging.getLevelNamesMapping().get(level.upper(), logging.INFO)
    logging.basicConfig(level=numeric_level, format="%(message)s")
    logging.getLogger().setLevel(numeric_level)
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
