"""Paddle webhooks. Authenticated by ``Paddle-Signature``, not by a browser session.

Origin checks do not apply: Paddle is not a browser. The raw body is verified before it is parsed.
"""

from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.billing.jobs import record_webhook
from app.billing.webhooks import SignatureError, parse_event, verify_paddle_signature
from app.core.errors import ApiProblem
from app.db.session import get_database

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/billing", tags=["billing webhooks"])


@router.post("/webhooks/paddle")
async def paddle_webhook(request: Request) -> JSONResponse:
    settings = request.app.state.settings
    raw = await request.body()
    secret = settings.paddle_webhook_secret.get_secret_value()
    if not secret:
        raise ApiProblem(503, "billing_unconfigured", "The Paddle webhook secret isn't set.")
    try:
        verify_paddle_signature(
            raw,
            request.headers.get("paddle-signature"),
            secret,
            now=datetime.now(UTC),
            tolerance_s=settings.paddle_webhook_tolerance_s,
        )
        body = parse_event(raw)
    except SignatureError as exc:
        log.info("paddle_webhook_rejected", reason=str(exc))
        raise ApiProblem(401, "invalid_signature", "The webhook signature was rejected.") from exc
    database = get_database(request)
    try:
        await record_webhook(database, body)
    except Exception as exc:
        log.warning("paddle_webhook_store_failed", error_type=type(exc).__name__)
        raise ApiProblem(500, "webhook_not_stored", "The event was not stored.") from exc
    try:
        await request.app.state.queue.enqueue_billing_event(str(body["event_id"]))
    except Exception as exc:
        log.warning("paddle_webhook_enqueue_failed", error_type=type(exc).__name__)
        raise ApiProblem(
            500, "webhook_not_queued", "The event is stored and will be retried."
        ) from exc
    return JSONResponse({"received": True})
