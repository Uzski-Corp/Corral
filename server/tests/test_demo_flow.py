"""Database-backed demo regressions; provider HTTP is always mocked."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine

from app.ai.jobs import poll_reply_runs
from app.ai.service import output, start
from app.auth.provisioning import ProvisionedIdentity
from app.core.config import Settings
from app.core.errors import ApiProblem
from app.db.session import Database
from app.mail.jobs import deliver
from app.mail.provider import AutoSend, MailError
from app.mail.service import enqueue_reply
from app.models.activity import InboxDraft, InboxMessage
from app.models.ai import AiRun
from app.models.domain import InboxThread
from app.models.knowledge import Product
from app.models.mail import MailDelivery
from tests.conftest import make_settings
from tests.tenancy_helpers import as_tenant, provision


@dataclass
class Demo:
    engine: AsyncEngine
    owner: ProvisionedIdentity
    other: ProvisionedIdentity
    settings: Settings
    thread_id: uuid.UUID
    product_id: uuid.UUID

    @property
    def ctx(self) -> dict[str, Any]:
        return {"settings": self.settings, "db": Database(self.engine)}


@pytest.fixture
async def demo(db_engine: AsyncEngine) -> Demo:
    owner = await provision(db_engine, "demo-owner", "owner@example.com", "demo-org")
    other = await provision(db_engine, "demo-other", "other@example.com", "other-org")
    settings = make_settings(
        autosend_demo_org_id=str(owner.org_id),
        autosend_api_key="test-provider-key",
        autosend_demo_from="demo@example.com",
        autosend_demo_reply_to="reply@example.com",
        autosend_demo_recipients=["recipient@example.com"],
        pi_service_token="test-service-token-at-least-32-characters",
    )
    async with as_tenant(db_engine, owner) as session:
        thread = InboxThread(
            org_id=owner.org_id,
            subject="Product question",
            document={"transport": "autosend_demo", "email": "recipient@example.com"},
        )
        product = Product(org_id=owner.org_id, name="Demo product", description="Verified facts")
        session.add_all([thread, product])
        await session.flush()
        session.add(InboxDraft(org_id=owner.org_id, thread_id=thread.id, body="My draft"))
    return Demo(db_engine, owner, other, settings, thread.id, product.id)


async def queue(demo: Demo, request_id: uuid.UUID, body: str = "My draft") -> uuid.UUID:
    async with as_tenant(demo.engine, demo.owner) as session:
        await enqueue_reply(
            session,
            demo.settings,
            demo.owner.org_id,
            request_id,
            body,
            thread_key=str(demo.thread_id),
        )
        return (
            await session.execute(
                select(MailDelivery.id).where(MailDelivery.request_id == request_id)
            )
        ).scalar_one()


async def test_replayed_send_creates_one_message_and_outbox_row(demo: Demo) -> None:
    request_id = uuid.uuid4()
    first = await queue(demo, request_id)
    assert await queue(demo, request_id) == first
    async with as_tenant(demo.engine, demo.owner) as session:
        assert (await session.scalar(select(func.count()).select_from(MailDelivery))) == 1
        assert (await session.scalar(select(func.count()).select_from(InboxMessage))) == 1
        # Enqueueing alone must not erase the user's draft.
        assert (await session.execute(select(InboxDraft.body))).scalar_one() == "My draft"
    with pytest.raises(ApiProblem) as changed:
        await queue(demo, request_id, "Changed content")
    assert changed.value.status_code == 409


async def test_other_tenant_cannot_see_or_reply_to_demo_thread(demo: Demo) -> None:
    delivery_id = await queue(demo, uuid.uuid4())
    async with as_tenant(demo.engine, demo.other) as session:
        assert await session.get(MailDelivery, delivery_id) is None
        with pytest.raises(ApiProblem) as rejected:
            await enqueue_reply(
                session,
                demo.settings,
                demo.other.org_id,
                uuid.uuid4(),
                "hello",
                thread_key=str(demo.thread_id),
            )
        assert rejected.value.status_code == 404


@pytest.mark.parametrize("uncertain", [False, True])
async def test_failed_submission_preserves_draft_and_never_blindly_replays(
    demo: Demo,
    monkeypatch: pytest.MonkeyPatch,
    uncertain: bool,
) -> None:
    delivery_id = await queue(demo, uuid.uuid4())
    send = AsyncMock(side_effect=MailError("provider_timeout", uncertain=uncertain))
    monkeypatch.setattr(AutoSend, "send", send)
    await deliver(demo.ctx, demo.owner.org_id, delivery_id)
    await deliver(demo.ctx, demo.owner.org_id, delivery_id)
    send.assert_awaited_once()
    async with as_tenant(demo.engine, demo.owner) as session:
        row = await session.get(MailDelivery, delivery_id)
        assert row is not None
        assert row.status == ("uncertain" if uncertain else "failed")
        assert (await session.execute(select(InboxDraft.body))).scalar_one() == "My draft"


async def test_provider_acceptance_is_not_delivery_and_keeps_newer_draft(
    demo: Demo,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    delivery_id = await queue(demo, uuid.uuid4())
    async with as_tenant(demo.engine, demo.owner) as session:
        draft = (await session.execute(select(InboxDraft))).scalar_one()
        draft.body = "A newer edit while the send was pending"
    send = AsyncMock(return_value="provider-message-123")
    monkeypatch.setattr(AutoSend, "send", send)
    await deliver(demo.ctx, demo.owner.org_id, delivery_id)
    await deliver(demo.ctx, demo.owner.org_id, delivery_id)
    send.assert_awaited_once()
    async with as_tenant(demo.engine, demo.owner) as session:
        row = await session.get(MailDelivery, delivery_id)
        assert row is not None and row.status == "accepted"
        assert row.provider_id == "provider-message-123"
        assert (await session.execute(select(InboxDraft.body))).scalar_one().startswith("A newer")


async def new_run(demo: Demo) -> uuid.UUID:
    async with as_tenant(demo.engine, demo.owner) as session:
        request_id = uuid.uuid4()
        row = await start(
            session,
            demo.settings,
            demo.owner.org_id,
            str(demo.thread_id),
            demo.product_id,
            request_id,
        )
        same = await start(
            session,
            demo.settings,
            demo.owner.org_id,
            str(demo.thread_id),
            demo.product_id,
            request_id,
        )
        assert same.id == row.id
        return row.id


async def test_ai_snapshot_is_stale_after_inbound_reply_without_overwriting_draft(
    demo: Demo,
) -> None:
    run_id = await new_run(demo)
    async with as_tenant(demo.engine, demo.owner) as session:
        session.add(
            InboxMessage(
                org_id=demo.owner.org_id,
                thread_id=demo.thread_id,
                direction="them",
                author="Recipient",
                body="New question",
                at_label="Just now",
                document={},
            )
        )
        await session.flush()
        row = await session.get(AiRun, run_id)
        assert row is not None
        assert (await output(session, demo.owner.org_id, row))["stale"] is True
        assert (await session.execute(select(InboxDraft.body))).scalar_one() == "My draft"
    async with as_tenant(demo.engine, demo.other) as session:
        assert await session.get(AiRun, run_id) is None


@pytest.mark.parametrize("source_ids, expected", [([], "succeeded"), (["invented"], "failed")])
async def test_ai_reconciliation_validates_evidence_and_never_replaces_user_draft(
    demo: Demo,
    monkeypatch: pytest.MonkeyPatch,
    source_ids: list[str],
    expected: str,
) -> None:
    run_id = await new_run(demo)
    put = AsyncMock(
        return_value=httpx.Response(
            202,
            json={
                "status": "succeeded",
                "result": {"body": "Suggested reply", "source_ids": source_ids},
            },
        )
    )
    monkeypatch.setattr(httpx.AsyncClient, "put", put)
    await poll_reply_runs(demo.ctx)
    async with as_tenant(demo.engine, demo.owner) as session:
        row = await session.get(AiRun, run_id)
        assert row is not None and row.status == expected
        assert (await session.execute(select(InboxDraft.body))).scalar_one() == "My draft"


async def test_interrupted_pi_admission_reuses_run_identity_on_next_poll(
    demo: Demo,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    run_id = await new_run(demo)
    put = AsyncMock(
        side_effect=[
            httpx.ReadTimeout("interrupted"),
            httpx.Response(
                202,
                json={"status": "running"},
            ),
        ]
    )
    monkeypatch.setattr(httpx.AsyncClient, "put", put)
    await poll_reply_runs(demo.ctx)
    await poll_reply_runs(demo.ctx)
    assert put.await_args_list[0] == put.await_args_list[1]
    assert put.await_args_list[0].kwargs["json"]["run_id"] == str(run_id)
    async with as_tenant(demo.engine, demo.owner) as session:
        row = await session.get(AiRun, run_id)
        assert row is not None and row.status == "running"


async def test_expired_run_is_canceled_without_another_model_submission(
    demo: Demo,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    run_id = await new_run(demo)
    async with as_tenant(demo.engine, demo.owner) as session:
        row = await session.get(AiRun, run_id)
        assert row is not None
        row.deadline = datetime.now(UTC) - timedelta(seconds=1)
    put, cancel = AsyncMock(), AsyncMock(return_value=httpx.Response(200))
    monkeypatch.setattr(httpx.AsyncClient, "put", put)
    monkeypatch.setattr(httpx.AsyncClient, "delete", cancel)
    await poll_reply_runs(demo.ctx)
    put.assert_not_awaited()
    cancel.assert_awaited_once()
    async with as_tenant(demo.engine, demo.owner) as session:
        row = await session.get(AiRun, run_id)
        assert row is not None and row.status == "failed"
