import logging

import structlog


def configure_logging(env: str) -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    renderer = (
        structlog.dev.ConsoleRenderer() if env == "local" else structlog.processors.JSONRenderer()
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            renderer,
        ]
    )
