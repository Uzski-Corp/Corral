"""Background jobs.

Jobs receive only primitive, JSON-safe arguments, open their own tenant-scoped
transaction and classify failures explicitly: transient errors raise ``Retry`` with
exponential backoff (bounded by the worker's ``max_tries``), anything else fails fast.
"""

import uuid
from typing import Any, TypedDict

import structlog
from arq import Retry
from sqlalchemy.exc import InterfaceError, OperationalError

from app.db.session import Database
from app.db.tenancy import apply_tenant_context, enforce_app_role
from app.repositories import LeadRepository

log = structlog.get_logger(__name__)

TRANSIENT_ERRORS: tuple[type[BaseException], ...] = (
    OSError,
    TimeoutError,
    OperationalError,
    InterfaceError,
)
RETRY_BASE_S = 2.0
RETRY_CAP_S = 60.0


class WorkerContext(TypedDict, total=False):
    db: Database
    job_id: str
    job_try: int


def retry_delay_s(job_try: int) -> float:
    """1st retry after 2s, then 4s, 8s ... capped at 60s."""
    return float(min(RETRY_CAP_S, RETRY_BASE_S * 2 ** max(0, job_try - 1)))


async def count_org_leads(ctx: WorkerContext | dict[str, Any], org_id: str) -> int:
    """Sample job: count an org's leads under that org's RLS context."""
    org_uuid = uuid.UUID(org_id)  # malformed input is a permanent failure: no retry
    job_try = int(ctx.get("job_try", 1))
    db: Database = ctx["db"]
    try:
        async with db.sessionmaker() as session:
            enforce_app_role(session)
            async with session.begin():
                await apply_tenant_context(session, org_id=org_uuid)
                count = await LeadRepository(session, org_uuid).count()
    except TRANSIENT_ERRORS as exc:
        delay = retry_delay_s(job_try)
        log.warning(
            "job_transient_failure",
            job="count_org_leads",
            job_try=job_try,
            retry_in_s=delay,
            error_type=type(exc).__name__,
        )
        raise Retry(defer=delay) from exc
    log.info("job_done", job="count_org_leads", org_id=org_id, lead_count=count)
    return count
