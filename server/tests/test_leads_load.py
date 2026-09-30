"""Load: the lead table at 100k companies, and a 50k-row import.

Bounds are generous (CI machines vary); they catch an accidental sequential scan per row or
an N+1, not small regressions. Timings are printed for the PR.
"""

import time
import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from tests.leads_helpers import ClientFactory, World, act_as, client_factory, make_world
from tests.test_lead_imports import run
from tests.workos_fakes import WorkOSHarness

API = "/api/v1"
ROWS = 100_000


@pytest.fixture
async def world(db_engine: AsyncEngine, workos: WorkOSHarness) -> World:
    return await make_world(db_engine, workos)


@pytest.fixture
def make_client(migrated_database: str, clean_redis: str, workos: WorkOSHarness) -> ClientFactory:
    return client_factory(migrated_database, clean_redis, workos)


async def seed_100k(engine: AsyncEngine, world: World) -> None:
    params = {"org": world.a.org_id, "product": world.product_a, "n": ROWS}
    async with AsyncSession(engine) as s, s.begin():
        await s.execute(
            text(
                """
                INSERT INTO companies (id, org_id, name, name_key, domain, country, size, industry,
                                       source, reply_status, last_activity_at, created_at)
                SELECT gen_random_uuid(), :org, 'Company ' || g, 'company ' || g, 'c' || g || '.io',
                       (ARRAY['Kenya','Uganda','Tanzania','Rwanda'])[1 + g % 4],
                       (ARRAY['1-50','51-200','201-1000','1000+'])[1 + g % 4],
                       (ARRAY['Logistics','Retail','Agritech'])[1 + g % 3],
                       (ARRAY['search','import','manual'])[1 + g % 3],
                       (ARRAY['not_contacted', 'contacted', 'interested',
                              'not_interested'])[1 + g % 4],
                       CASE WHEN g % 5 = 0 THEN NULL ELSE now() - (g || ' minutes')::interval END,
                       now() - (g || ' seconds')::interval
                FROM generate_series(1, :n) g
                """
            ),
            params,
        )
        # Fresh stats before the child inserts: with a stale "empty" estimate the planner
        # picks a seq scan for each foreign-key check, and 100k of those never finish.
        await s.execute(text("ANALYZE companies"))
        await s.execute(
            text(
                """
                INSERT INTO leads (id, org_id, company_id, is_primary, email, email_status,
                                   first_name, title)
                SELECT gen_random_uuid(), org_id, id, true, 'p@' || domain,
                       (ARRAY['verified', 'catch_all', 'unverified',
                              'bounced'])[1 + (hashtext(domain) & 3)],
                       'Person',
                       CASE WHEN hashtext(domain) % 3 = 0 THEN 'Head of Ops' ELSE 'CEO' END
                FROM companies WHERE org_id = :org
                """
            ),
            params,
        )
        await s.execute(
            text(
                "INSERT INTO company_fits (id, org_id, company_id, product_id, score) "
                "SELECT gen_random_uuid(), org_id, id, :product, (hashtext(domain) & 127) % 101 "
                "FROM companies WHERE org_id = :org"
            ),
            params,
        )
        for table in ("companies", "leads", "company_fits"):
            await s.execute(text(f"ANALYZE {table}"))


async def timed(c: AsyncClient, path: str, body: dict[str, Any]) -> tuple[float, dict[str, Any]]:
    start = time.perf_counter()
    res = await c.post(path, json=body)
    elapsed = time.perf_counter() - start
    assert res.status_code == 200, res.text
    return elapsed, dict(res.json())


async def test_lead_table_at_100k(
    make_client: ClientFactory, world: World, db_engine: AsyncEngine
) -> None:
    await seed_100k(db_engine, world)
    pid = str(world.product_a)
    fit80 = {"field": "fit", "op": "gte", "value": 80, "product_id": pid}
    kenya = {"field": "country", "op": "is", "value": ["Kenya"]}
    ops = {"field": "title", "op": "contains", "value": "ops"}
    queries: dict[str, dict[str, Any]] = {
        "newest": {"limit": 50},
        "by name": {"sort": {"key": "company", "dir": "asc"}, "limit": 50},
        "fit >= 80, by fit": {
            "rules": [fit80],
            "sort": {"key": "fit", "dir": "desc"},
            "product_id": pid,
        },
        "kenya+ops, by last": {"rules": [kenya, ops], "sort": {"key": "last", "dir": "asc"}},
        "any of three, by reply": {
            "rules": [fit80, kenya, ops],
            "match": "any",
            "sort": {"key": "reply"},
        },
    }
    async with make_client(leads_bulk_max_rows=ROWS) as c:
        api = act_as(c, world.cookie_a)
        for name, body in queries.items():
            first, page = await timed(api, f"{API}/companies/query", body)
            cursor = page["next_cursor"]
            for _ in range(20):  # page deep: keyset cost stays flat
                assert isinstance(cursor, str)
                deep, page = await timed(api, f"{API}/companies/query", {**body, "cursor": cursor})
                cursor = page["next_cursor"]
            total = page["total"]
            print(f"\n[load] {name}: first page {first:.3f}s, 21st {deep:.3f}s, total {total}")
            assert first < 5 and deep < 5
        assert page["total"] > 0

        start = time.perf_counter()
        res = await api.post(
            f"{API}/companies/enroll-plan", json={"selection": {"all": True, "rules": [kenya]}}
        )
        plan_s = time.perf_counter() - start
        assert res.json()["matched"] == ROWS // 4
        start = time.perf_counter()
        res = await api.post(
            f"{API}/companies/bulk",
            json={
                "action": "set_reply_status",
                "reply_status": "contacted",
                "selection": {"all": True},
                "confirm": True,
            },
        )
        bulk_s = time.perf_counter() - start
        assert res.json()["matched"] == ROWS
        print(f"[load] enroll dry run {plan_s:.3f}s, bulk status on {ROWS:,} rows {bulk_s:.3f}s")
        assert plan_s < 10 and bulk_s < 30


async def test_import_50k_rows(
    make_client: ClientFactory, world: World, db_engine: AsyncEngine
) -> None:
    lines = ["Company,Website,First,Last,Email,Title"]
    lines += [f"Co {i},co{i}.io,Amina,Njeri,amina@co{i}.io,Head of Ops" for i in range(50_000)]
    data = ("\n".join(lines) + "\n").encode()
    mapping = '["company","domain","first","last","email","title"]'
    async with make_client() as c:
        api = act_as(c, world.cookie_a)
        start = time.perf_counter()
        res = await api.post(
            f"{API}/lead-imports",
            files={"file": ("big.csv", data, "text/csv")},
            data={"mapping": mapping, "dry_run": "true"},
        )
        dry_s = time.perf_counter() - start
        assert res.json()["plan"]["create"] == 50_000
        res = await api.post(
            f"{API}/lead-imports",
            files={"file": ("big.csv", data, "text/csv")},
            data={"mapping": mapping},
        )
        iid = res.json()["id"]
        start = time.perf_counter()
        assert await run(db_engine, iid) == "done"
        run_s = time.perf_counter() - start
        got = (await api.get(f"{API}/lead-imports/{iid}")).json()
        assert (got["created_count"], got["people_created"]) == (50_000, 50_000)
        # Re-importing the same file finds every row by email (chunked lookups, no N+1).
        res = await api.post(
            f"{API}/lead-imports",
            files={"file": ("big.csv", data, "text/csv")},
            data={"mapping": mapping, "policy": "overwrite"},
        )
        start = time.perf_counter()
        assert await run(db_engine, res.json()["id"]) == "done"
        again_s = time.perf_counter() - start
        got = (await api.get(f"{API}/lead-imports/{res.json()['id']}")).json()
        assert (got["existing_duplicates"], got["created_count"]) == (50_000, 0)
    mb = len(data) / 1e6
    print(f"\n[load] 50k rows ({mb:.1f} MB): dry run {dry_s:.2f}s, import {run_s:.2f}s, ", end="")
    print(f"re-import (overwrite) {again_s:.2f}s")
    assert dry_s < 30 and run_s < 120 and again_s < 120
    assert uuid.UUID(iid)
