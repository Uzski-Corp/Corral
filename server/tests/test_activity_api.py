"""Every activity route against a seeded workspace: reads, writes, lookups, validation, 404s."""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import delete, event, func, select, update
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.activity import service
from app.models import ApiKey, InboxDraft, InboxMessage, InboxThread, Sequence, User
from app.seed.demo import seed_org
from tests.leads_helpers import ClientFactory, World, act_as, client_factory, make_world
from tests.tenancy_helpers import as_tenant
from tests.workos_fakes import WorkOSHarness

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def world(db_engine: AsyncEngine, workos: WorkOSHarness) -> World:
    w = await make_world(db_engine, workos)
    async with as_tenant(db_engine, w.a) as session:
        await seed_org(session, w.a.org_id, w.a.user_id)
    return w


@pytest.fixture
def make_client(migrated_database: str, clean_redis: str, workos: WorkOSHarness) -> ClientFactory:
    return client_factory(migrated_database, clean_redis, workos)


@pytest.fixture
async def api(make_client: ClientFactory, world: World) -> AsyncIterator[AsyncClient]:
    async with make_client() as client:
        yield act_as(client, world.cookie_a)


@pytest.fixture
async def api_b(make_client: ClientFactory, world: World) -> AsyncIterator[AsyncClient]:
    async with make_client() as client:
        yield act_as(client, world.cookie_b)


# --- inbox -------------------------------------------------------------------------------


async def test_inbox_tabs_and_thread_shape(api: AsyncClient) -> None:
    rows = (await api.get("/api/v1/inbox")).json()
    brian = next(r for r in rows if r["id"] == "brian")
    assert brian["draft"] == [
        "Thursday works. I'll send a 20-minute link and the Kilima one-pager."
    ]
    assert brian["draftKind"] == "ready"
    assert brian["history"][0]["who"] == "Brian Kamau"
    assert "draft_body" not in brian
    assert brian["needs_you"] is True
    needs = {r["id"] for r in (await api.get("/api/v1/inbox", params={"tab": "needs"})).json()}
    assert needs == {"brian", "wanjiru", "grace"}
    handled = (await api.get("/api/v1/inbox", params={"tab": "handled"})).json()
    assert [r["id"] for r in handled] == ["daniel"]
    assert handled[0]["triage"] == "ooo"
    assert (await api.get("/api/v1/inbox", params={"tab": "nope"})).status_code == 422


async def test_patch_thread_triage_snooze_and_handled(api: AsyncClient) -> None:
    res = await api.patch(
        "/api/v1/inbox/wanjiru", json={"triage": "objection", "unread": True, "status": "Objection"}
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["triage"], body["unread"], body["status"]) == ("objection", True, "Objection")

    snoozed = (await api.patch("/api/v1/inbox/wanjiru", json={"snoozed": "Mon 08:00"})).json()
    assert snoozed["snoozed"] == "Mon 08:00"
    assert snoozed["needs_you"] is False
    assert (await api.get("/api/v1/inbox/summary")).json() == {"needs_you": 2}

    woke = (await api.patch("/api/v1/inbox/wanjiru", json={"snoozed": None})).json()
    assert "snoozed" not in woke
    assert woke["needs_you"] is True

    done = (await api.patch("/api/v1/inbox/wanjiru", json={"handled": True})).json()
    assert done["handled"] is True
    kept = (await api.patch("/api/v1/inbox/wanjiru", json={"handled": None})).json()
    assert kept["handled"] is True  # null leaves the column alone
    cleared = (await api.patch("/api/v1/inbox/wanjiru", json={"triage": None})).json()
    assert "triage" not in cleared or cleared["triage"] is None


async def test_patch_thread_validation_and_404(api: AsyncClient) -> None:
    assert (await api.patch("/api/v1/inbox/wanjiru", json={"triage": "x" * 33})).status_code == 422
    assert (await api.patch("/api/v1/inbox/wanjiru", json={"bogus": 1})).status_code == 422
    missing = await api.patch(f"/api/v1/inbox/{uuid.uuid4()}", json={"handled": True})
    assert missing.status_code == 404
    assert missing.json()["error"] == "not_found"
    assert (await api.post("/api/v1/inbox/nobody/send", json={"body": "hi"})).status_code == 404
    assert (await api.post("/api/v1/inbox/brian/send", json={"body": ""})).status_code == 422


async def test_send_reply_records_a_message_and_drops_the_draft(
    api: AsyncClient, db_engine: AsyncEngine, world: World
) -> None:
    res = await api.post("/api/v1/inbox/brian/send", json={"body": "Thursday it is."})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["history"][-1] == {
        "from": "you",
        "who": "You",
        "at": "Just now",
        "body": "Thursday it is.",
        "meta": "Sent",
    }
    assert "draft" not in body
    async with as_tenant(db_engine, world.a) as session:
        drafts = await session.scalar(select(func.count()).select_from(InboxDraft))
    assert drafts == 0
    # Sending again works without a draft to remove.
    again = await api.post("/api/v1/inbox/brian/send", json={"body": "And the one-pager."})
    assert len(again.json()["history"]) == 3


async def test_a_thread_without_a_slug_is_found_by_uuid(
    api: AsyncClient, db_engine: AsyncEngine, world: World
) -> None:
    async with as_tenant(db_engine, world.a) as session:
        thread = InboxThread(org_id=world.a.org_id, subject=None, document={"name": "Plain"})
        session.add(thread)
        await session.flush()
        session.add(
            InboxDraft(org_id=world.a.org_id, thread_id=thread.id, body="One.\n\nTwo.", document={})
        )
        thread_id = str(thread.id)
    rows = (await api.get("/api/v1/inbox")).json()
    plain = next(r for r in rows if r["id"] == thread_id)
    assert plain["draft"] == ["One.", "Two."]  # no paras: the body splits on blank lines
    assert "history" not in plain and "subject" not in plain
    res = await api.patch(f"/api/v1/inbox/{thread_id}", json={"handled": True})
    assert res.json()["id"] == thread_id


async def test_inbox_list_reads_messages_in_two_queries(
    db_engine: AsyncEngine, world: World
) -> None:
    async with as_tenant(db_engine, world.a) as session:
        statements: list[str] = []
        sync_engine = db_engine.sync_engine

        def count(*args: object) -> None:
            statements.append(str(args[2]))

        event.listen(sync_engine, "before_cursor_execute", count)
        try:
            rows = await service.list_threads(session, world.a.org_id)
        finally:
            event.remove(sync_engine, "before_cursor_execute", count)
    assert len(rows) == 4
    assert len(statements) == 3  # threads, messages, drafts


async def test_list_threads_on_an_empty_org_skips_the_batch_queries(
    db_engine: AsyncEngine, world: World
) -> None:
    async with as_tenant(db_engine, world.b) as session:
        assert await service.list_threads(session, world.b.org_id) == []


async def test_thread_out_keeps_a_stored_snooze_label(world: World) -> None:
    thread = InboxThread(
        id=uuid.uuid4(),
        org_id=world.a.org_id,
        slug=None,
        handled=False,
        snoozed_until=datetime(2026, 10, 5, tzinfo=UTC),
        document={"snoozed": "Mon"},
    )
    assert service.thread_out(thread, [], None)["snoozed"] == "Mon"
    thread.document = {}
    assert service.thread_out(thread, [], None)["snoozed"].startswith("2026-10-05")
    thread.document = None  # type: ignore[assignment]
    assert service.thread_out(thread, [], None)["needs_you"] is False


# --- sequences and mailboxes -------------------------------------------------------------


async def test_sequence_create_keeps_the_client_id(api: AsyncClient) -> None:
    created = await api.post(
        "/api/v1/sequences",
        json={"id": "new-2", "name": "Bakery drip", "status": "draft", "steps": [{"id": "s1"}]},
    )
    assert created.status_code == 201, created.text
    assert created.json() == {
        "id": "new-2",
        "name": "Bakery drip",
        "status": "draft",
        "steps": [{"id": "s1"}],
    }
    again = await api.post("/api/v1/sequences", json={"id": "new-2", "name": "Twice"})
    assert again.status_code == 409
    assert (
        await api.post("/api/v1/sequences", json={"id": "pilot", "name": "X"})
    ).status_code == 409
    bad_id = await api.post("/api/v1/sequences", json={"id": "no spaces", "name": "X"})
    assert bad_id.status_code == 422
    assert (
        await api.post("/api/v1/sequences", json={"name": "X", "status": "sent"})
    ).status_code == 422
    plain = (await api.post("/api/v1/sequences", json={"name": "No id"})).json()
    uuid.UUID(plain["id"])  # the server's id when the client sends none


async def test_sequence_patch_merges_and_validates(api: AsyncClient) -> None:
    res = await api.patch("/api/v1/sequences/pilot", json={"status": "paused", "window": "Late"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["status"], body["window"], body["name"]) == ("paused", "Late", "Cold-room pilot")
    assert body["product"] == "ColdTrace Sensors"  # the rest of the document stays
    renamed = await api.patch("/api/v1/sequences/pilot", json={"name": "Pilot", "status": None})
    assert (renamed.json()["name"], renamed.json()["status"]) == ("Pilot", "paused")
    kept = (await api.patch("/api/v1/sequences/pilot", json={"name": None})).json()
    assert kept["name"] == "Pilot"
    assert (await api.patch("/api/v1/sequences/pilot", json={"status": "sent"})).status_code == 422
    assert (await api.patch("/api/v1/sequences/pilot", json={"name": ""})).status_code == 422
    assert (await api.patch("/api/v1/sequences/nope", json={"status": "paused"})).status_code == 404
    created = (await api.post("/api/v1/sequences", json={"name": "By uuid"})).json()
    by_uuid = await api.patch(f"/api/v1/sequences/{created['id']}", json={"status": "running"})
    assert by_uuid.json()["status"] == "running"


async def test_mailbox_pool_totals(api: AsyncClient, api_b: AsyncClient) -> None:
    pool = (await api.get("/api/v1/mailboxes")).json()
    assert (pool["sent"], pool["cap"], pool["attention"]) == (72, 105, 1)
    ops = next(m for m in pool["mailboxes"] if m["address"] == "ops@coldtrace.io")
    assert (ops["id"], ops["sentToday"], ops["cap"], ops["day"]) == ("ops", 12, 35, 4)
    assert (await api_b.get("/api/v1/mailboxes")).json() == {
        "mailboxes": [],
        "sent": 0,
        "cap": 0,
        "attention": 0,
    }


async def test_mailbox_without_a_document_id_uses_the_row_id(world: World) -> None:
    from app.models import Mailbox

    box = Mailbox(
        id=uuid.uuid4(), org_id=world.a.org_id, address="x@y.io", sent_today=1, daily_cap=2
    )
    box.document = {}
    assert service.mailbox_out(box)["id"] == str(box.id)


# --- discovery ---------------------------------------------------------------------------


async def test_discovery_credits_and_a_queued_run(api: AsyncClient) -> None:
    assert (await api.get("/api/v1/discovery/credits")).json() == {
        "month": 2000,
        "used": 540,
        "left": 1460,
    }
    res = await api.post(
        "/api/v1/discovery/runs",
        json={"name": "Bakeries", "status": "running", "limit": 50, "id": "ignored"},
    )
    assert res.status_code == 201
    run = res.json()
    assert (run["status"], run["limit"], run["name"]) == ("queued", 50, "Bakeries")
    uuid.UUID(run["id"])
    runs = (await api.get("/api/v1/discovery/runs")).json()["runs"]
    assert runs[0]["name"] == "Bakeries"
    assert (await api.post("/api/v1/discovery/runs", json={"name": ""})).status_code == 422


# --- integrations ------------------------------------------------------------------------


async def test_integrations_update_logs_and_validation(
    api: AsyncClient, api_b: AsyncClient
) -> None:
    [log] = (await api.get("/api/v1/integrations/cal/logs")).json()
    assert {k: log[k] for k in ("dir", "event", "result", "detail")} == {
        "dir": "out",
        "event": "connected",
        "result": "ok",
        "detail": "Cal.com booking link is on.",
    }
    assert (await api.get("/api/v1/integrations/zoom/logs")).status_code == 404
    assert (await api_b.get("/api/v1/integrations/cal/logs")).json() == []

    off = await api.patch("/api/v1/integrations/cal", json={"status": "off"})
    assert off.json() == {"provider": "cal", "status": "off", "config": {}}
    configured = await api.patch(
        "/api/v1/integrations/cal", json={"status": "connected", "config": {"link": "cal.com/t"}}
    )
    assert configured.json()["config"] == {"link": "cal.com/t"}
    kept = await api.patch("/api/v1/integrations/cal", json={"status": "reauth"})
    assert kept.json() == {"provider": "cal", "status": "reauth", "config": {"link": "cal.com/t"}}

    assert (await api.patch("/api/v1/integrations/zoom", json={"status": "off"})).status_code == 404
    bad = await api.patch("/api/v1/integrations/cal", json={"status": "connecting"})
    assert bad.status_code == 422
    assert (await api.patch("/api/v1/integrations/cal", json={})).status_code == 422
    fresh = await api_b.patch("/api/v1/integrations/autosend", json={"status": "error"})
    assert fresh.json() == {"provider": "autosend", "status": "error", "config": {}}


# --- developers --------------------------------------------------------------------------


async def test_keys_create_with_expiry_and_validate(api: AsyncClient) -> None:
    res = await api.post(
        "/api/v1/developers/keys",
        json={
            "name": "Sheets",
            "env": "test",
            "scopes": ["leads:read"],
            "expires": "2027-01-01T00:00:00+03:00",
        },
    )
    assert res.status_code == 201, res.text
    key = res.json()
    assert key["secret"].startswith("crl_test_")
    assert key["last4"] == key["secret"][-4:]
    assert key["expires"].startswith("2026-12-31T21:00:00")
    assert key["by"] == "a@a.io"  # no name on the account: the email
    for body in (
        {"name": "X", "env": "prod"},
        {"name": "X", "scopes": ["Leads Read"]},
        {"name": "X", "expires": "2027-01-01T00:00:00"},
        {"name": ""},
    ):
        assert (await api.post("/api/v1/developers/keys", json=body)).status_code == 422, body


async def test_rotate_and_revoke(api: AsyncClient, db_engine: AsyncEngine, world: World) -> None:
    keys = (await api.get("/api/v1/developers/keys")).json()
    n8n = next(k for k in keys if k["id"] == "key_n8n")
    assert n8n["lastFrom"] == "n8n Cloud"
    assert "secret" not in n8n and "secret_hash" not in n8n

    rotated = (await api.post("/api/v1/developers/keys/key_n8n/rotate", json={})).json()
    assert rotated["secret"].startswith("crl_live_")
    assert rotated["last4"] == rotated["secret"][-4:] != n8n["last4"]
    assert "oldUntil" in rotated
    clean = await api.post("/api/v1/developers/keys/key_n8n/rotate", json={"overlap": False})
    assert "oldUntil" not in clean.json()

    first = (await api.post("/api/v1/developers/keys/key_n8n/revoke")).json()["revoked"]
    second = (await api.post("/api/v1/developers/keys/key_n8n/revoke")).json()["revoked"]
    assert first == second  # revoking twice keeps the first time
    assert (await api.post("/api/v1/developers/keys/key_n8n/rotate", json={})).status_code == 404
    assert (await api.post("/api/v1/developers/keys/nope/revoke")).status_code == 404
    assert (await api.post("/api/v1/developers/keys/nope/rotate", json={})).status_code == 404

    # A display field in the document never overrides a column.
    async with as_tenant(db_engine, world.a) as session:
        await session.execute(
            update(ApiKey)
            .where(ApiKey.slug == "key_n8n")
            .values(document={"revoked": None, "name": "spoof", "secret_hash": "x"})
        )
    again = next(
        k for k in (await api.get("/api/v1/developers/keys")).json() if k["id"] == "key_n8n"
    )
    assert again["revoked"] == first
    assert again["name"] == "n8n lead sync"
    assert "secret_hash" not in again


async def test_create_key_rejects_an_unknown_env(db_engine: AsyncEngine, world: World) -> None:
    async with as_tenant(db_engine, world.a) as session:
        with pytest.raises(ValueError, match="unknown key env"):
            await service.create_key(
                session, world.a.org_id, name="x", env="prod", scopes=[], created_by="me"
            )


async def test_key_by_uuid(api: AsyncClient) -> None:
    made = (await api.post("/api/v1/developers/keys", json={"name": "By id"})).json()
    revoked = await api.post(f"/api/v1/developers/keys/{made['id']}/revoke")
    assert revoked.status_code == 200
    assert revoked.json()["env"] == "live"


async def test_connections_calls_and_delete(api: AsyncClient) -> None:
    conns = (await api.get("/api/v1/developers/connections")).json()
    assert [c["id"] for c in conns] == ["cn_cursor"]
    assert conns[0]["device"] == "Tomas's MacBook Pro"
    calls = (await api.get("/api/v1/developers/connections/cn_cursor/calls")).json()
    assert calls[0]["tool"] == "get_thread"
    assert (await api.get("/api/v1/developers/connections/nope/calls")).status_code == 404

    made = await api.post(
        "/api/v1/developers/connections", json={"client": "claude", "name": "Claude", "auth": "key"}
    )
    assert made.status_code == 201
    made_id = made.json()["id"]
    assert made.json()["auth"] == "key"
    assert (await api.get(f"/api/v1/developers/connections/{made_id}/calls")).json() == []
    assert (await api.delete(f"/api/v1/developers/connections/{made_id}")).status_code == 204
    assert (await api.delete("/api/v1/developers/connections/cn_cursor")).status_code == 204
    assert (await api.delete("/api/v1/developers/connections/cn_cursor")).status_code == 404
    assert (await api.get("/api/v1/developers/connections")).json() == []
    bad = await api.post("/api/v1/developers/connections", json={"client": "", "name": "x"})
    assert bad.status_code == 422


async def test_create_connection_defaults(db_engine: AsyncEngine, world: World) -> None:
    async with as_tenant(db_engine, world.b) as session:
        row = await service.create_connection(session, world.b.org_id, {})
    assert (row["client"], row["name"]) == ("cursor", "Connection")


async def test_key_created_by_uses_the_account_name(
    api: AsyncClient, db_engine: AsyncEngine, world: World
) -> None:
    async with AsyncSession(db_engine) as session, session.begin():
        await session.execute(
            update(User)
            .where(User.id == world.a.user_id)
            .values(first_name="Amina", last_name=None)
        )
    key = (await api.post("/api/v1/developers/keys", json={"name": "Named"})).json()
    assert key["by"] == "Amina"
    members = (await api.get("/api/v1/workspace/members")).json()
    assert members == [
        {"id": str(world.a.user_id), "name": "Amina", "email": "a@a.io", "role": members[0]["role"]}
    ]


# --- writes need a trusted origin and stay in the org ------------------------------------


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("PATCH", "/api/v1/inbox/brian", {"handled": True}),
        ("POST", "/api/v1/inbox/brian/send", {"body": "x"}),
        ("POST", "/api/v1/sequences", {"name": "x"}),
        ("PATCH", "/api/v1/sequences/pilot", {"status": "paused"}),
        ("POST", "/api/v1/discovery/runs", {"name": "x"}),
        ("PATCH", "/api/v1/integrations/cal", {"status": "off"}),
        ("POST", "/api/v1/developers/keys", {"name": "x"}),
        ("POST", "/api/v1/developers/keys/key_n8n/revoke", None),
        ("POST", "/api/v1/developers/keys/key_n8n/rotate", {}),
        ("POST", "/api/v1/developers/connections", {"client": "c", "name": "n"}),
        ("DELETE", "/api/v1/developers/connections/cn_cursor", None),
    ],
)
async def test_writes_refuse_an_untrusted_origin(
    api: AsyncClient, method: str, path: str, body: object
) -> None:
    res = await api.request(method, path, json=body, headers={"Origin": "https://evil.example"})
    assert res.status_code == 403, res.text


async def test_another_org_cannot_reach_seeded_rows(api_b: AsyncClient) -> None:
    assert (await api_b.patch("/api/v1/inbox/brian", json={"handled": True})).status_code == 404
    assert (await api_b.post("/api/v1/inbox/brian/send", json={"body": "x"})).status_code == 404
    assert (
        await api_b.patch("/api/v1/sequences/pilot", json={"status": "paused"})
    ).status_code == 404
    assert (await api_b.post("/api/v1/developers/keys/key_n8n/revoke")).status_code == 404
    assert (await api_b.delete("/api/v1/developers/connections/cn_cursor")).status_code == 404
    assert (await api_b.get("/api/v1/developers/connections/cn_cursor/calls")).status_code == 404


async def test_reads_need_a_session(make_client: ClientFactory, world: World) -> None:
    async with make_client() as client:
        for path in (
            "/api/v1/inbox",
            "/api/v1/sequences",
            "/api/v1/mailboxes",
            "/api/v1/discovery/runs",
            "/api/v1/integrations",
            "/api/v1/developers/keys",
            "/api/v1/workspace/members",
        ):
            assert (await client.get(path)).status_code == 401, path


# --- the seed ----------------------------------------------------------------------------


async def test_seed_is_idempotent_and_returns_the_secret_once(
    db_engine: AsyncEngine, world: World
) -> None:
    async def counts() -> tuple[int, int, int, int]:
        async with as_tenant(db_engine, world.a) as session:
            return (
                await session.scalar(select(func.count()).select_from(InboxThread)) or 0,
                await session.scalar(select(func.count()).select_from(InboxMessage)) or 0,
                await session.scalar(select(func.count()).select_from(Sequence)) or 0,
                await session.scalar(select(func.count()).select_from(ApiKey)) or 0,
            )

    before = await counts()
    async with as_tenant(db_engine, world.a) as session:
        assert await seed_org(session, world.a.org_id, None) is None
    assert await counts() == before


async def test_seed_restores_a_removed_draft_and_drops_an_extra_one(
    db_engine: AsyncEngine, world: World
) -> None:
    async with as_tenant(db_engine, world.a) as session:
        await session.execute(delete(InboxDraft))
        daniel = await session.scalar(select(InboxThread).where(InboxThread.slug == "daniel"))
        assert daniel is not None
        session.add(InboxDraft(org_id=world.a.org_id, thread_id=daniel.id, body="stray"))
    async with as_tenant(db_engine, world.a) as session:
        await seed_org(session, world.a.org_id, world.a.user_id)
    async with as_tenant(db_engine, world.a) as session:
        rows = (await session.execute(select(InboxDraft))).scalars().all()
    assert [r.body[:8] for r in rows] == ["Thursday"]


async def test_seed_refuses_an_unknown_org(db_engine: AsyncEngine, world: World) -> None:
    async with as_tenant(db_engine, world.a) as session:
        with pytest.raises(LookupError):
            await seed_org(session, uuid.uuid4(), None)
