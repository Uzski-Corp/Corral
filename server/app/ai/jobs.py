"""Short submit/reconcile cycles. arq never waits for a full model conversation."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import select

from app.ai.service import run_token
from app.db.session import tenant_transaction
from app.models.ai import AiRun


async def poll_reply_runs(ctx: dict[str, Any]) -> None:
    settings = ctx["settings"]
    if not settings.pi_service_token.get_secret_value():
        return
    try:
        org = uuid.UUID(settings.autosend_demo_org_id)
    except ValueError:
        return
    async with tenant_transaction(ctx["db"], org) as session:
        rows = list(
            (
                await session.execute(
                    select(AiRun)
                    .where(
                        AiRun.org_id == org, AiRun.status.in_(("queued", "running", "canceling"))
                    )
                    .order_by(AiRun.created_at)
                    .limit(10)
                )
            ).scalars()
        )
    async with httpx.AsyncClient(
        base_url=settings.pi_service_url,
        timeout=8,
        headers={"Authorization": f"Bearer {settings.pi_service_token.get_secret_value()}"},
    ) as client:
        for row in rows:
            path = f"/runs/{org}/{row.id}"
            canceling = row.status == "canceling" or datetime.now(UTC) >= row.deadline
            state: dict[str, Any]
            try:
                if canceling:
                    response = await client.delete(path)
                    if response.status_code not in (200, 404):
                        raise httpx.HTTPError("Cancellation unavailable")
                    state = {
                        "status": "canceled" if row.status == "canceling" else "failed",
                        "error": "Draft deadline reached.",
                    }
                else:
                    # Same bound request resumes interrupted service admission or worker completion.
                    response = await client.put(
                        path,
                        json={
                            "org_id": str(org),
                            "run_id": str(row.id),
                            "token": run_token(settings, org, row.id),
                            "deadline": row.deadline.isoformat(),
                        },
                    )
                    if response.status_code >= 400:
                        continue
                    state = response.json()
                    if not isinstance(state, dict):
                        raise ValueError("Invalid run state")
            except (httpx.HTTPError, ValueError):
                if datetime.now(UTC) < row.deadline + timedelta(seconds=30):
                    continue
                state = {
                    "status": "failed",
                    "error": "The drafting service is unavailable. Your reply was preserved.",
                }
            async with tenant_transaction(ctx["db"], org) as session:
                current = await session.get(AiRun, row.id, with_for_update=True)
                if not current or current.status not in ("queued", "running", "canceling"):
                    continue
                if current.status == "canceling" and not canceling:
                    continue
                status = state.get("status")
                if status == "succeeded":
                    result = state.get("result", {})
                    if not isinstance(result, dict):
                        result = {}
                    ids = result.get("source_ids", [])
                    if (
                        not isinstance(result.get("body"), str)
                        or not result["body"].strip()
                        or len(result["body"]) > 20000
                        or not isinstance(ids, list)
                        or not all(isinstance(key, str) and key in current.evidence for key in ids)
                    ):
                        current.status, current.error = (
                            "failed",
                            "The suggestion contained unverified evidence. Try again.",
                        )
                    else:
                        current.status, current.result = "succeeded", result
                elif status in ("failed", "canceled"):
                    current.status, current.error = status, str(state.get("error") or "")[:255]
                else:
                    current.status = "running"
