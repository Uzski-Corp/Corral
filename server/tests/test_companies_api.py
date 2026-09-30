"""HTTP tests for the lead table: companies, people, bulk actions, merge, unsubscribe."""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import insert, select, update
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.models import Company, CompanyFit, Lead, Segment, SegmentPin, Suppression
from tests.leads_helpers import ClientFactory, World, act_as, client_factory, make_world
from tests.workos_fakes import WorkOSHarness

API = "/api/v1"
VERIFIED = {"email_status": "verified"}


@pytest.fixture
async def world(db_engine: AsyncEngine, workos: WorkOSHarness) -> World:
    return await make_world(db_engine, workos)


@pytest.fixture
def make_client(migrated_database: str, clean_redis: str, workos: WorkOSHarness) -> ClientFactory:
    return client_factory(migrated_database, clean_redis, workos)


@pytest.fixture
async def api(make_client: ClientFactory, world: World) -> AsyncIterator[AsyncClient]:
    async with make_client() as c:
        yield act_as(c, world.cookie_a)


async def new_company(c: AsyncClient, name: str = "Kilima", **body: Any) -> dict[str, Any]:
    res = await c.post(f"{API}/companies", json={"name": name, **body})
    assert res.status_code == 201, res.text
    return dict(res.json())


async def rows(engine: AsyncEngine, model: Any, *where: Any) -> list[Any]:
    async with AsyncSession(engine) as s:
        return list((await s.execute(select(model).where(*where))).scalars())


# --- CRUD ---------------------------------------------------------------------------------


async def test_company_crud(api: AsyncClient, db_engine: AsyncEngine) -> None:
    body = await new_company(
        api,
        "  Kilima  Foods ",
        domain="https://www.Kilima.co.ke/about",
        country="Kenya",
        size="51-200",
        person={"email": "Amina@Kilima.co.ke", "first_name": "Amina", "title": "Head of Ops"},
    )
    assert (body["name"], body["domain"], body["source"]) == (
        "Kilima  Foods",
        "kilima.co.ke",
        "manual",
    )
    assert body["reply_status"] == "not_contacted" and body["reply_status_set_by"] == "corral"
    assert body["primary"]["email"] == "amina@kilima.co.ke" and body["primary"]["is_primary"]
    assert [p["first_name"] for p in body["people"]] == ["Amina"] and body["fits"] == []
    cid = body["id"]
    [company] = await rows(db_engine, Company, Company.id == uuid.UUID(cid))
    assert company.name_key == "kilima foods"

    got = (await api.get(f"{API}/companies/{cid}")).json()
    assert got["id"] == cid and got["primary"]["title"] == "Head of Ops"

    res = await api.patch(
        f"{API}/companies/{cid}", json={"name": "Kilima Ltd", "industry": "Agritech"}
    )
    assert (res.json()["name"], res.json()["industry"]) == ("Kilima Ltd", "Agritech")
    assert (await api.patch(f"{API}/companies/{cid}", json={"name": None})).status_code == 422
    assert (await api.patch(f"{API}/companies/{cid}", json={"domain": ""})).json()["domain"] is None

    assert (await api.delete(f"{API}/companies/{cid}")).status_code == 204
    assert (await api.get(f"{API}/companies/{cid}")).status_code == 404
    assert (await api.delete(f"{API}/companies/{cid}")).status_code == 404
    assert await rows(db_engine, Lead) == []  # people go with their company


async def test_company_conflicts(make_client: ClientFactory, world: World) -> None:
    async with make_client(leads_max_companies_per_org=2) as c:
        api = act_as(c, world.cookie_a)
        first = await new_company(api, "Acme", domain="acme.io", person={"email": "a@acme.io"})
        res = await api.post(f"{API}/companies", json={"name": "Acme 2", "domain": "WWW.ACME.IO"})
        assert (res.status_code, res.json()["error"], res.json()["existing_id"]) == (
            409, "duplicate", first["id"]
        )  # fmt: skip
        res = await api.post(f"{API}/companies", json={"name": "X", "domain": "not a site"})
        assert (res.status_code, res.json()["error"]) == (422, "invalid_domain")
        res = await api.post(
            f"{API}/companies", json={"name": "B", "person": {"email": "A@acme.io"}}
        )
        assert (res.status_code, res.json()["error"]) == (409, "duplicate_person")
        assert res.json()["existing_lead_id"] == first["primary"]["id"]
        second = await new_company(api, "Beta", domain="beta.io")
        res = await api.post(f"{API}/companies", json={"name": "Gamma"})
        assert (res.status_code, res.json()["error"]) == (409, "workspace_full")
        res = await api.patch(f"{API}/companies/{second['id']}", json={"domain": "acme.io"})
        assert (res.status_code, res.json()["error"]) == (409, "duplicate")
        # Keeping your own website is not a conflict.
        res = await api.patch(f"{API}/companies/{first['id']}", json={"domain": "acme.io"})
        assert res.status_code == 200


async def test_listing_and_querying(make_client: ClientFactory, world: World) -> None:
    async with make_client(leads_query_max_limit=2, leads_max_rules=2) as c:
        api = act_as(c, world.cookie_a)
        for name, country in (("Acme", "Kenya"), ("Beta", "Uganda"), ("Gamma", "kenya")):
            await new_company(api, name, country=country)
        page = (
            await api.get(f"{API}/companies", params={"sort": "company", "dir": "asc", "limit": 50})
        ).json()
        assert [r["name"] for r in page["data"]] == ["Acme", "Beta"]  # clamped to the max
        assert page["has_more"] and page["total"] == 3
        rest = (
            await api.get(
                f"{API}/companies",
                params={"sort": "company", "dir": "asc", "cursor": page["next_cursor"]},
            )
        ).json()
        assert [r["name"] for r in rest["data"]] == ["Gamma"]
        assert (rest["next_cursor"], rest["has_more"]) == (None, False)

        rule = {"field": "country", "op": "is", "value": ["KENYA"]}
        res = await api.post(
            f"{API}/companies/query", json={"rules": [rule], "sort": {"key": "company"}}
        )
        assert [r["name"] for r in res.json()["data"]] == ["Gamma", "Acme"]
        res = await api.post(f"{API}/companies/query", json={"rules": [rule] * 3})
        assert (res.status_code, res.json()["error"]) == (422, "too_many_rules")
        res = await api.post(f"{API}/companies/query", json={"sort": {"key": "fit"}})
        assert (res.status_code, res.json()["error"]) == (422, "product_required")
        res = await api.post(f"{API}/companies/query", json={"cursor": "garbage"})
        assert (res.status_code, res.json()["error"]) == (400, "invalid_cursor")
        res = await api.post(
            f"{API}/companies/query", json={"rules": [{"field": "fit", "op": "gte", "value": 80}]}
        )
        assert res.status_code == 422


async def test_fit_and_primary_are_returned(
    api: AsyncClient, world: World, db_engine: AsyncEngine
) -> None:
    a = await new_company(api, "Acme", person={"email": "a@acme.io", "first_name": "Zed"})
    b = await new_company(api, "Beta", person={"email": "b@beta.io", "first_name": "Amy"})
    async with AsyncSession(db_engine) as s, s.begin():
        s.add(
            CompanyFit(
                org_id=world.a.org_id,
                company_id=uuid.UUID(a["id"]),
                product_id=world.product_a,
                score=91,
            )
        )
    params = {"sort": "fit", "dir": "desc", "product_id": str(world.product_a)}
    data = (await api.get(f"{API}/companies", params=params)).json()["data"]
    assert [(r["name"], r["fit"]) for r in data] == [("Acme", 91), ("Beta", None)]
    person = (await api.get(f"{API}/companies", params={"sort": "person", "dir": "asc"})).json()[
        "data"
    ]
    assert [r["primary"]["first_name"] for r in person] == ["Amy", "Zed"]
    detail = (await api.get(f"{API}/companies/{a['id']}")).json()
    assert detail["fits"] == [{"product_id": str(world.product_a), "score": 91}]
    assert b["fit"] is None


# --- reply status and unsubscribe ---------------------------------------------------------


async def test_reply_status_by_hand_and_unsubscribe_is_final(
    api: AsyncClient, db_engine: AsyncEngine
) -> None:
    body = await new_company(api, "Acme", person={"email": "a@acme.io"})
    cid = body["id"]
    res = await api.patch(f"{API}/companies/{cid}", json={"reply_status": "interested"})
    assert (res.json()["reply_status"], res.json()["reply_status_set_by"]) == ("interested", "user")
    assert (
        await api.patch(f"{API}/companies/{cid}", json={"reply_status": None})
    ).status_code == 422
    res = await api.patch(f"{API}/companies/{cid}", json={"reply_status": "unsubscribed"})
    assert res.json()["reply_status"] == "unsubscribed"
    assert res.json()["primary"]["unsubscribed_at"] is not None
    assert [s.email for s in await rows(db_engine, Suppression)] == ["a@acme.io"]
    res = await api.patch(f"{API}/companies/{cid}", json={"reply_status": "interested"})
    assert (res.status_code, res.json()["error"]) == (409, "unsubscribed_final")
    # Saying it again is harmless.
    res = await api.patch(f"{API}/companies/{cid}", json={"reply_status": "unsubscribed"})
    assert res.status_code == 200


async def _colleague(api: AsyncClient, company_id: str, email: str) -> dict[str, Any]:
    res = await api.post(f"{API}/leads", json={"email": email, "company_id": company_id})
    assert res.status_code == 201, res.text
    return dict(res.json())


@pytest.mark.parametrize(("scope", "suppressed"), [("address", 1), ("company", 2)])
async def test_unsubscribe_scope(
    make_client: ClientFactory, world: World, db_engine: AsyncEngine, scope: str, suppressed: int
) -> None:
    async with make_client(leads_unsubscribe_scope=scope) as c:
        api = act_as(c, world.cookie_a)
        company = await new_company(api, "Acme", person={"email": "boss@acme.io"})
        colleague = await _colleague(api, company["id"], "ops@acme.io")
        res = await api.post(f"{API}/leads/{colleague['id']}/unsubscribe")
        assert res.status_code == 200 and res.json()["unsubscribed_at"]
        got = (await api.get(f"{API}/companies/{company['id']}")).json()
        assert got["reply_status"] == "unsubscribed"
        emails = sorted(s.email for s in await rows(db_engine, Suppression))
        assert emails == ["ops@acme.io"] if suppressed == 1 else ["boss@acme.io", "ops@acme.io"]

        other = await new_company(api, "Beta", person={"email": "b@beta.io"})
        await _colleague(api, other["id"], "b2@beta.io")
        await api.patch(f"{API}/companies/{other['id']}", json={"reply_status": "unsubscribed"})
        beta = [s.email for s in await rows(db_engine, Suppression) if s.email.endswith("beta.io")]
        assert len(beta) == suppressed


async def test_unsubscribe_someone_without_a_company(
    api: AsyncClient, db_engine: AsyncEngine
) -> None:
    lead = (await api.post(f"{API}/leads", json={"email": "solo@x.io"})).json()
    assert lead["company_id"] is None and lead["is_primary"] is False
    assert (await api.post(f"{API}/leads/{lead['id']}/unsubscribe")).status_code == 200
    assert [s.reason for s in await rows(db_engine, Suppression)] == ["unsubscribed"]
    assert (await api.post(f"{API}/leads/{uuid.uuid4()}/unsubscribe")).status_code == 404


# --- people on companies ------------------------------------------------------------------


async def test_people_link_to_companies(
    api: AsyncClient, world: World, make_client: ClientFactory
) -> None:
    acme = await new_company(api, "Acme", person={"email": "boss@acme.io"})
    beta = await new_company(api, "Beta", person={"email": "b@beta.io"})
    res = await api.post(
        f"{API}/leads",
        json={"email": "new@acme.io", "company_id": acme["id"], "is_primary": True, "title": "COO"},
    )
    assert res.status_code == 201
    new = res.json()
    assert (new["is_primary"], new["company_name"], new["title"]) == (True, "Acme", "COO")
    people = (await api.get(f"{API}/companies/{acme['id']}")).json()["people"]
    assert [(p["email"], p["is_primary"]) for p in people] == [
        ("new@acme.io", True),
        ("boss@acme.io", False),
    ]

    # Moving someone to another company doesn't steal its primary slot.
    res = await api.patch(f"{API}/leads/{new['id']}", json={"company_id": beta["id"]})
    assert (res.json()["company_id"], res.json()["is_primary"]) == (beta["id"], False)
    res = await api.patch(
        f"{API}/leads/{new['id']}", json={"is_primary": True, "email_status": "verified"}
    )
    assert (res.json()["is_primary"], res.json()["email_status"]) == (True, "verified")
    beta_people = (await api.get(f"{API}/companies/{beta['id']}")).json()["people"]
    assert [p["email"] for p in beta_people if p["is_primary"]] == ["new@acme.io"]
    res = await api.patch(f"{API}/leads/{new['id']}", json={"title": "CEO", "is_primary": None})
    assert (res.json()["title"], res.json()["is_primary"]) == ("CEO", True)

    named = await api.post(
        f"{API}/leads",
        json={"email": "n@acme.io", "company_id": acme["id"], "company_name": "Acme (HQ)"},
    )
    assert named.json()["company_name"] == "Acme (HQ)"
    nameless = await new_company(api, "Nameless", person={"first_name": "Only"})
    assert (nameless["primary"]["email"], nameless["primary"]["first_name"]) == (None, "Only")

    res = await api.post(f"{API}/leads", json={"email": "x@x.io", "company_id": str(uuid.uuid4())})
    assert (res.status_code, res.json()["error"]) == (422, "unknown_company")
    res = await api.post(f"{API}/leads", json={"email": "x@x.io", "is_primary": True})
    assert (res.status_code, res.json()["error"]) == (422, "no_company")
    res = await api.patch(f"{API}/leads/{uuid.uuid4()}", json={"title": "x"})
    assert res.status_code == 404

    async with make_client() as other:  # another workspace's company can't be linked
        b = act_as(other, world.cookie_b)
        res = await b.post(f"{API}/leads", json={"email": "x@x.io", "company_id": acme["id"]})
        assert (res.status_code, res.json()["error"]) == (422, "unknown_company")


# --- merge --------------------------------------------------------------------------------


async def test_merge_keeps_the_original_and_fills_its_blanks(
    api: AsyncClient, world: World, db_engine: AsyncEngine
) -> None:
    original = await new_company(api, "Kilima", country="Kenya", person={"email": "a@kilima.io"})
    dup = await new_company(
        api, "Kilima Foods Ltd", domain="kilima.io", country="Uganda", industry="Agritech",
        person={"email": "b@kilima.io"},
    )  # fmt: skip
    oid, did = uuid.UUID(original["id"]), uuid.UUID(dup["id"])
    seg = (
        await api.post(f"{API}/segments", json={"name": "Dup's list", "company_ids": [dup["id"]]})
    ).json()
    later = datetime(2026, 9, 29, tzinfo=UTC)
    async with AsyncSession(db_engine) as s, s.begin():
        s.add(
            CompanyFit(org_id=world.a.org_id, company_id=did, product_id=world.product_a, score=70)
        )
        await s.execute(
            update(Company)
            .where(Company.id == did)
            .values(reply_status="unsubscribed", last_activity_at=later)
        )

    res = await api.post(
        f"{API}/companies/{original['id']}/merge", json={"duplicate_id": dup["id"]}
    )
    assert res.status_code == 200, res.text
    merged = res.json()
    assert (merged["name"], merged["country"]) == ("Kilima", "Kenya")  # the original wins
    assert (merged["domain"], merged["industry"]) == ("kilima.io", "Agritech")  # blanks filled
    assert merged["reply_status"] == "unsubscribed"  # unsubscribe always survives
    assert merged["last_activity_at"].startswith("2026-09-29")
    assert [(p["email"], p["is_primary"]) for p in merged["people"]] == [
        ("a@kilima.io", True),
        ("b@kilima.io", False),
    ]
    assert merged["fits"] == [{"product_id": str(world.product_a), "score": 70}]
    assert [
        p.company_id
        for p in await rows(db_engine, SegmentPin, SegmentPin.segment_id == uuid.UUID(seg["id"]))
    ] == [oid]
    assert await rows(db_engine, Company, Company.id == did) == []

    res = await api.post(
        f"{API}/companies/{original['id']}/merge", json={"duplicate_id": original["id"]}
    )
    assert (res.status_code, res.json()["error"]) == (422, "same_company")
    res = await api.post(
        f"{API}/companies/{original['id']}/merge", json={"duplicate_id": str(uuid.uuid4())}
    )
    assert res.status_code == 404


async def test_merge_into_a_company_without_people(api: AsyncClient) -> None:
    original = await new_company(api, "Acme")
    dup = await new_company(api, "Acme Inc", person={"email": "a@acme.io"})
    merged = (
        await api.post(f"{API}/companies/{original['id']}/merge", json={"duplicate_id": dup["id"]})
    ).json()
    assert [(p["email"], p["is_primary"]) for p in merged["people"]] == [("a@acme.io", True)]
    assert merged["last_activity_at"] is None


# --- bulk ---------------------------------------------------------------------------------


async def test_bulk_actions(
    make_client: ClientFactory, world: World, db_engine: AsyncEngine
) -> None:
    async with make_client(leads_bulk_confirm_at=3) as c:
        api = act_as(c, world.cookie_a)
        ids = [
            (await new_company(api, n, country="Kenya", person={"email": f"x@{n}.io"}))["id"]
            for n in "abcd"
        ]
        await api.patch(f"{API}/companies/{ids[0]}", json={"reply_status": "unsubscribed"})

        res = await api.post(
            f"{API}/companies/bulk",
            json={
                "action": "set_reply_status",
                "reply_status": "interested",
                "selection": {"ids": ids[:2]},
            },
        )
        assert res.json() == {
            "matched": 2,
            "changed": 1,
            "skipped": [{"reason": "unsubscribed", "n": 1}],
        }

        everything = {"all": True, "rules": [{"field": "country", "op": "is", "value": ["kenya"]}]}
        res = await api.post(
            f"{API}/companies/bulk",
            json={
                "action": "set_reply_status",
                "reply_status": "contacted",
                "selection": everything,
            },
        )
        assert (res.status_code, res.json()["error"], res.json()["matched"]) == (
            409,
            "confirm_required",
            4,
        )
        res = await api.post(
            f"{API}/companies/bulk",
            json={
                "action": "set_reply_status",
                "reply_status": "unsubscribed",
                "selection": everything,
                "confirm": True,
            },
        )
        assert res.json() == {
            "matched": 4,
            "changed": 3,
            "skipped": [{"reason": "unsubscribed", "n": 1}],
        }
        assert len(await rows(db_engine, Suppression)) == 4

        seg = (
            await api.post(f"{API}/segments", json={"name": "Hand-picked", "company_ids": [ids[0]]})
        ).json()
        pin = {"action": "add_to_segment", "segment_id": seg["id"], "selection": {"ids": ids[:2]}}
        assert (await api.post(f"{API}/companies/bulk", json=pin)).json() == {
            "matched": 2, "changed": 1, "skipped": [{"reason": "already_in_segment", "n": 1}]
        }  # fmt: skip
        unpin = {**pin, "action": "remove_from_segment", "selection": {"ids": ids[1:3]}}
        assert (await api.post(f"{API}/companies/bulk", json=unpin)).json() == {
            "matched": 2, "changed": 1, "skipped": [{"reason": "not_pinned", "n": 1}]
        }  # fmt: skip
        missing = {**pin, "segment_id": str(uuid.uuid4())}
        assert (await api.post(f"{API}/companies/bulk", json=missing)).status_code == 404

        res = await api.post(
            f"{API}/companies/bulk", json={"action": "delete", "selection": {"ids": ids[:2]}}
        )
        assert res.json() == {"matched": 2, "changed": 2, "skipped": []}
        assert len(await rows(db_engine, Company)) == 2
        res = await api.post(
            f"{API}/companies/bulk", json={"action": "delete", "selection": {"ids": ids}}
        )
        assert res.json()["changed"] == 2  # already-deleted ids simply don't match


async def test_bulk_limits(make_client: ClientFactory, world: World) -> None:
    async with make_client(leads_bulk_max_ids=1, leads_bulk_max_rows=1, leads_max_rules=1) as c:
        api = act_as(c, world.cookie_a)
        a, b = (await new_company(api, "A"))["id"], (await new_company(api, "B"))["id"]
        res = await api.post(
            f"{API}/companies/bulk", json={"action": "delete", "selection": {"ids": [a, b]}}
        )
        assert (res.status_code, res.json()["error"]) == (422, "too_many_ids")
        res = await api.post(
            f"{API}/companies/bulk", json={"action": "delete", "selection": {"all": True}}
        )
        assert (res.status_code, res.json()["error"], res.json()["matched"]) == (
            422,
            "too_many_rows",
            2,
        )
        rule = {"field": "country", "op": "is", "value": ["KE"]}
        res = await api.post(
            f"{API}/companies/bulk",
            json={"action": "delete", "selection": {"all": True, "rules": [rule, rule]}},
        )
        assert (res.status_code, res.json()["error"]) == (422, "too_many_rules")
        res = await api.post(
            f"{API}/companies/bulk",
            json={"action": "delete", "selection": {"ids": [a], "all": True}},
        )
        assert res.status_code == 422


async def test_enroll_plan(
    make_client: ClientFactory, world: World, db_engine: AsyncEngine
) -> None:
    now = datetime.now(UTC)
    long_ago = now - timedelta(days=90)
    specs: list[tuple[str, dict[str, Any], dict[str, Any] | None]] = [
        ("ok1", {}, {"email_status": "verified"}),
        ("ok2", {}, {"email_status": "verified"}),
        ("unsub", {"reply_status": "unsubscribed"}, {"email_status": "verified"}),
        ("suppressed", {}, {"email_status": "verified", "email": "gone@x.io"}),
        ("person_unsub", {}, {"email_status": "verified", "unsubscribed_at": now}),
        ("no", {"reply_status": "not_interested"}, {"email_status": "verified"}),
        ("replied", {"reply_status": "interested", "last_activity_at": now}, VERIFIED),
        ("replied_old", {"reply_status": "interested", "last_activity_at": long_ago}, VERIFIED),
        ("catch_all", {}, {"email_status": "catch_all"}),
        ("no_person", {}, None),
        ("no_email", {}, {"email_status": "verified", "email": None}),
    ]  # fmt: skip
    org = world.a.org_id
    async with AsyncSession(db_engine) as s, s.begin():
        for i, (name, company, person) in enumerate(specs):
            cid = uuid.uuid4()
            await s.execute(
                insert(Company).values(id=cid, org_id=org, name=name, name_key=name, **company)
            )
            if person is not None:
                await s.execute(
                    insert(Lead).values(
                        org_id=org, company_id=cid, is_primary=True,
                        **({"email": f"p{i}@x.io"} | person),
                    )
                )  # fmt: skip
        s.add(Suppression(org_id=org, email="gone@x.io", reason="bounced"))

    async with make_client(leads_pool_sends_per_day=2) as c:
        api = act_as(c, world.cookie_a)
        res = await api.post(f"{API}/companies/enroll-plan", json={"selection": {"all": True}})
        assert res.json() == {
            "matched": 11,
            "will_enroll": 3,
            "skipped": [
                {"reason": "unsubscribed", "n": 3},
                {"reason": "not_interested", "n": 1},
                {"reason": "replied_recently", "n": 1},
                {"reason": "no_verified_email", "n": 3},
            ],
            "sends_per_day": 2,
            "days": 2,
        }
    async with make_client(leads_enroll_allow_catch_all=True) as c:
        api = act_as(c, world.cookie_a)
        res = await api.post(f"{API}/companies/enroll-plan", json={"selection": {"all": True}})
        assert (res.json()["will_enroll"], res.json()["days"]) == (4, 1)
        res = await api.post(
            f"{API}/companies/enroll-plan", json={"selection": {"ids": [str(uuid.uuid4())]}}
        )
        assert res.json() == {
            "matched": 0,
            "will_enroll": 0,
            "skipped": [],
            "sends_per_day": 210,
            "days": 0,
        }
    async with make_client(leads_bulk_max_ids=1) as c:
        api = act_as(c, world.cookie_a)
        ids = [str(uuid.uuid4()), str(uuid.uuid4())]
        res = await api.post(f"{API}/companies/enroll-plan", json={"selection": {"ids": ids}})
        assert (res.status_code, res.json()["error"]) == (422, "too_many_ids")


# --- isolation ----------------------------------------------------------------------------


async def test_another_workspace_cannot_touch_companies(
    make_client: ClientFactory, world: World, db_engine: AsyncEngine
) -> None:
    async with make_client() as c:
        a = act_as(c, world.cookie_a)
        acme = await new_company(a, "Acme", domain="acme.io", person={"email": "a@acme.io"})
        own = await new_company(a, "Own")
    async with make_client() as c:
        b = act_as(c, world.cookie_b)
        cid = acme["id"]
        assert (await b.get(f"{API}/companies/{cid}")).status_code == 404
        assert (await b.patch(f"{API}/companies/{cid}", json={"name": "x"})).status_code == 404
        assert (await b.delete(f"{API}/companies/{cid}")).status_code == 404
        mine = await new_company(b, "Mine", domain="acme.io")  # same website, other workspace: fine
        res = await b.post(f"{API}/companies/{mine['id']}/merge", json={"duplicate_id": cid})
        assert res.status_code == 404
        res = await b.post(
            f"{API}/companies/bulk",
            json={"action": "delete", "selection": {"ids": [cid, own["id"]]}},
        )
        assert res.json()["matched"] == 0
        assert (await b.get(f"{API}/companies")).json()["total"] == 1
    assert len(await rows(db_engine, Company, Company.org_id == world.a.org_id)) == 2
    async with AsyncSession(db_engine, expire_on_commit=False) as s:
        seg = Segment(org_id=world.b.org_id, name="B's")
        s.add(seg)
        await s.commit()
    async with make_client() as c:
        a = act_as(c, world.cookie_a)
        pin = {"action": "add_to_segment", "segment_id": str(seg.id), "selection": {"ids": [cid]}}
        assert (await a.post(f"{API}/companies/bulk", json=pin)).status_code == 404
