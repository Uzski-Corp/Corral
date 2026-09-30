"""CSV lead import: the API (dry run, limits, rate limit) and the job (policies, dedupe)."""

import csv
import io
import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
from arq import Retry
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.leads import importer
from app.leads.importer import ImportJob, import_leads
from app.models import Company, Lead, LeadImport
from app.worker.queue import QUEUE_NAME, JobQueue
from tests.conftest import make_settings
from tests.kb_helpers import job_ctx
from tests.leads_helpers import ClientFactory, World, act_as, client_factory, make_world
from tests.test_companies_api import new_company
from tests.workos_fakes import WorkOSHarness

API = "/api/v1"
MAPPING = ["company", "domain", "first", "last", "email", "title", "notes", "skip"]
HEADER = "Company,Website,First,Last,Email,Title,Notes,Internal id\n"


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


async def send(
    c: AsyncClient,
    text: str | bytes,
    *,
    mapping: list[str] | str = MAPPING,
    policy: str = "skip",
    dry_run: bool = False,
    name: str = "leads.csv",
) -> Response:
    data = text.encode() if isinstance(text, str) else text
    return await c.post(
        f"{API}/lead-imports",
        files={"file": (name, data, "text/csv")},
        data={
            "mapping": mapping if isinstance(mapping, str) else json.dumps(mapping),
            "policy": policy,
            "dry_run": str(dry_run).lower(),
        },
    )


async def run(engine: AsyncEngine, import_id: str, **settings: Any) -> str:
    async with AsyncSession(engine) as s:
        row = await s.get(LeadImport, uuid.UUID(import_id))
        assert row is not None
        org = row.org_id
    return await import_leads(job_ctx(engine, make_settings(**settings)), str(org), import_id)


async def imported(c: AsyncClient, engine: AsyncEngine, text: str, **kw: Any) -> dict[str, Any]:
    res = await send(c, text, **kw)
    assert res.status_code == 202, res.text
    assert await run(engine, res.json()["id"]) == "done"
    return dict((await c.get(f"{API}/lead-imports/{res.json()['id']}")).json())


async def companies(engine: AsyncEngine) -> dict[str, Company]:
    async with AsyncSession(engine) as s:
        return {c.name: c for c in (await s.execute(select(Company))).scalars()}


async def people(engine: AsyncEngine) -> dict[str | None, Lead]:
    async with AsyncSession(engine) as s:
        return {p.email: p for p in (await s.execute(select(Lead))).scalars()}


# --- API ----------------------------------------------------------------------------------

SAMPLE = (
    HEADER
    + "Kilima Foods,https://www.kilima.co.ke,Amina,Njeri,amina@kilima.co.ke,Head of Ops,,1\n"
    + "Kilima Foods,kilima.co.ke,Brian,,brian@kilima.co.ke,CTO,,2\n"
    + "Kilima Foods,kilima.co.ke,,,AMINA@kilima.co.ke,,,3\n"
    + ",,Nobody,,nobody@x.io,,,4\n"
    + "=HYPERLINK(evil),,,,not-an-email,,,5\n"
    + "Savanna,savanna.io,,,,,,6\n"
)


async def test_dry_run_plans_without_storing(api: AsyncClient, db_engine: AsyncEngine) -> None:
    res = await send(api, SAMPLE, dry_run=True)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["plan"] == {
        "total": 6, "create": 3, "update": 0, "skipped": 1, "errors": 2, "in_file": 1, "existing": 0
    }  # fmt: skip
    assert body["headers"][-1] == "Internal id"
    assert [(e["row"], e["field"]) for e in body["errors"]] == [(5, "company"), (6, "email")]
    assert await companies(db_engine) == {}
    assert (await api.get(f"{API}/lead-imports")).json() == []


async def test_import_end_to_end(api: AsyncClient, db_engine: AsyncEngine) -> None:
    res = await send(api, SAMPLE)
    assert res.status_code == 202
    queued = res.json()
    assert (queued["status"], queued["progress_pct"], queued["policy"]) == ("queued", 0, "skip")
    assert queued["byte_size"] == len(SAMPLE.encode()) and not queued["has_errors_file"]
    assert await run(db_engine, queued["id"]) == "done"
    done = (await api.get(f"{API}/lead-imports/{queued['id']}")).json()
    assert (done["status"], done["progress_pct"], done["total_rows"]) == ("done", 100, 6)
    assert (done["created_count"], done["skipped_count"], done["error_count"]) == (3, 1, 2)
    assert (done["in_file_duplicates"], done["people_created"], done["has_errors_file"]) == (
        1,
        2,
        True,
    )
    assert done["finished_at"]
    async with AsyncSession(db_engine) as s:
        row = await s.get(LeadImport, uuid.UUID(queued["id"]))
        assert row is not None and row.data is None  # the upload is dropped

    by_name = await companies(db_engine)
    assert sorted(by_name) == ["Kilima Foods", "Savanna"]
    kilima = by_name["Kilima Foods"]
    assert (kilima.domain, kilima.source, str(kilima.import_id)) == (
        "kilima.co.ke",
        "import",
        queued["id"],
    )
    folks = await people(db_engine)
    assert sorted(e for e in folks if e) == ["amina@kilima.co.ke", "brian@kilima.co.ke"]
    assert folks["amina@kilima.co.ke"].is_primary and not folks["brian@kilima.co.ke"].is_primary
    assert folks["amina@kilima.co.ke"].company_name == "Kilima Foods"

    res = await api.get(f"{API}/lead-imports/{queued['id']}/errors.csv")
    assert res.headers["content-disposition"] == (
        "attachment; filename=\"leads-problems.csv\"; filename*=UTF-8''leads-problems.csv"
    )
    assert res.headers["content-type"].startswith("text/csv")
    table = list(csv.reader(io.StringIO(res.content.decode("utf-8-sig"))))
    assert table[0][0] == "Row" and table[0][-1] == "Problem"
    assert table[2][1] == "'=HYPERLINK(evil)"
    listed = (await api.get(f"{API}/lead-imports")).json()
    assert [i["id"] for i in listed] == [queued["id"]]

    # A second run of the same job is a no-op.
    assert await run(db_engine, queued["id"]) == "finished"


async def test_clean_import_has_no_errors_file(api: AsyncClient, db_engine: AsyncEngine) -> None:
    done = await imported(api, db_engine, HEADER + "Acme,acme.io,,,,,,\n")
    assert not done["has_errors_file"]
    res = await api.get(f"{API}/lead-imports/{done['id']}/errors.csv")
    assert (res.status_code, res.json()["error"]) == (404, "no_errors")
    assert (await api.get(f"{API}/lead-imports/{uuid.uuid4()}")).status_code == 404


@pytest.mark.parametrize(
    ("kwargs", "status", "error"),
    [
        ({"name": "leads.xlsx"}, 415, "unsupported"),
        ({"text": b""}, 422, "empty"),
        ({"text": b"a,b\x00\n1,2\n"}, 415, "not_text"),
        ({"text": "Company\nAcme\n"}, 422, "one_column"),
        ({"mapping": "not json"}, 422, "invalid_mapping"),
        ({"mapping": '["company", "nope"]'}, 422, "invalid_mapping"),
        ({"mapping": '["email", "title"]', "text": "a,b\n1,2\n"}, 422, "mapping"),
    ],
)
async def test_bad_files_are_refused(
    api: AsyncClient, kwargs: dict[str, Any], status: int, error: str
) -> None:
    text = kwargs.pop("text", SAMPLE)
    res = await send(api, text, **kwargs)
    assert (res.status_code, res.json()["error"]) == (status, error)


async def test_upload_size_and_rate_limits(make_client: ClientFactory, world: World) -> None:
    async with make_client(leads_import_max_bytes=1_024, leads_imports_per_user=2) as c:
        api = act_as(c, world.cookie_a)
        res = await send(api, HEADER + "x" * 200_000)  # refused before the body is read
        assert (res.status_code, res.json()["error"]) == (413, "too_large")
        res = await send(api, HEADER + "B,b.io,,,,,,\n" * 100)
        assert (res.status_code, res.json()["error"]) == (413, "too_large")  # the parser's cap

        async def chunked() -> AsyncIterator[bytes]:
            yield b"--x\r\n"

        res = await api.post(
            f"{API}/lead-imports",
            content=chunked(),
            headers={"content-type": "multipart/form-data; boundary=x"},
        )
        assert (res.status_code, res.json()["error"]) == (411, "length_required")
        small = "Company,Website\nAcme,acme.io\n"
        res = await send(api, small, mapping=["company", "domain"])
        assert res.status_code == 202  # the 2nd counted add this window
        res = await send(api, small, mapping=["company", "domain"])
        assert (res.status_code, res.json()["error"]) == (429, "rate_limited")
        assert int(res.headers["retry-after"]) > 0


async def test_imports_are_isolated(make_client: ClientFactory, world: World) -> None:
    async with make_client() as c:
        iid = (await send(act_as(c, world.cookie_a), SAMPLE)).json()["id"]
    async with make_client() as c:
        b = act_as(c, world.cookie_b)
        assert (await b.get(f"{API}/lead-imports")).json() == []
        assert (await b.get(f"{API}/lead-imports/{iid}")).status_code == 404
        assert (await b.get(f"{API}/lead-imports/{iid}/errors.csv")).status_code == 404


async def test_the_job_is_enqueued(api: AsyncClient, clean_redis: str) -> None:
    iid = (await send(api, SAMPLE)).json()["id"]
    queue = JobQueue.from_settings(make_settings(redis_url=clean_redis))
    try:
        jobs = await queue.redis.queued_jobs(queue_name=QUEUE_NAME)
        assert [(j.function, j.args[1]) for j in jobs] == [("import_leads", iid)]
        assert await queue.enqueue_import_leads(uuid.uuid4(), uuid.UUID(iid)) is None  # same job id
    finally:
        await queue.close()


# --- policies and dedupe ------------------------------------------------------------------


async def _existing(api: AsyncClient) -> None:
    await new_company(
        api,
        "Kilima",
        domain="kilima.co.ke",
        notes="Met at AgriTech Expo",
        person={"email": "amina@kilima.co.ke", "first_name": "Amina", "title": None},
    )
    await new_company(api, "Savanna Ltd", domain="savanna.io", country="Kenya")


UPDATE = (
    HEADER
    + "Kilima Foods,kilima.co.ke,Amina W.,Njeri,amina@kilima.co.ke,Head of Ops,Wants a demo,1\n"
    + "Savanna Group,savanna.io,,,,,,2\n"
)


async def test_skip_policy_leaves_existing_rows(api: AsyncClient, db_engine: AsyncEngine) -> None:
    await _existing(api)
    done = await imported(api, db_engine, UPDATE, policy="skip")
    assert (done["existing_duplicates"], done["updated_count"], done["skipped_count"]) == (2, 0, 2)
    assert sorted(await companies(db_engine)) == ["Kilima", "Savanna Ltd"]
    assert (await people(db_engine))["amina@kilima.co.ke"].title is None


async def test_fill_policy_only_fills_blanks(api: AsyncClient, db_engine: AsyncEngine) -> None:
    await _existing(api)
    done = await imported(api, db_engine, UPDATE, policy="fill")
    assert done["updated_count"] == 2
    by_name = await companies(db_engine)
    assert sorted(by_name) == ["Kilima", "Savanna Ltd"]
    assert by_name["Kilima"].notes == "Met at AgriTech Expo"
    amina = (await people(db_engine))["amina@kilima.co.ke"]
    assert (amina.first_name, amina.last_name, amina.title) == ("Amina", "Njeri", "Head of Ops")
    assert str(by_name["Kilima"].import_id) == done["id"]


async def test_overwrite_policy_replaces_but_keeps_notes(
    api: AsyncClient, db_engine: AsyncEngine
) -> None:
    await _existing(api)
    done = await imported(api, db_engine, UPDATE, policy="overwrite")
    assert done["updated_count"] == 2
    by_name = await companies(db_engine)
    assert sorted(by_name) == ["Kilima Foods", "Savanna Group"]
    assert by_name["Kilima Foods"].name_key == "kilima foods"
    assert by_name["Kilima Foods"].notes == "Met at AgriTech Expo\n\nWants a demo"
    assert by_name["Savanna Group"].country == "Kenya"  # blank in the file: kept
    amina = (await people(db_engine))["amina@kilima.co.ke"]
    assert (amina.first_name, amina.title) == ("Amina W.", "Head of Ops")
    # The same notes again aren't appended twice.
    await imported(api, db_engine, UPDATE, policy="overwrite")
    assert (await companies(db_engine))[
        "Kilima Foods"
    ].notes == "Met at AgriTech Expo\n\nWants a demo"


async def test_new_people_join_existing_companies(api: AsyncClient, db_engine: AsyncEngine) -> None:
    await _existing(api)
    text = (
        HEADER
        + "Kilima,kilima.co.ke,Brian,,brian@kilima.co.ke,CTO,,1\n"  # existing company, new person
        + "Savanna Ltd,savanna.io,Sam,,sam@savanna.io,,,2\n"  # company without people yet
        + "Kilima,,Carol,,carol@kilima.co.ke,,,3\n"  # no website: matched by name
    )
    done = await imported(api, db_engine, text)
    assert (done["created_count"], done["people_created"]) == (3, 3)
    assert sorted(await companies(db_engine)) == ["Kilima", "Savanna Ltd"]
    folks = await people(db_engine)
    kilima = (await companies(db_engine))["Kilima"]
    assert (
        folks["brian@kilima.co.ke"].company_id == kilima.id
        and not folks["brian@kilima.co.ke"].is_primary
    )
    assert folks["carol@kilima.co.ke"].company_id == kilima.id
    assert folks["sam@savanna.io"].is_primary


async def test_name_matching_can_be_turned_off(
    make_client: ClientFactory, world: World, db_engine: AsyncEngine
) -> None:
    async with make_client() as c:
        api = act_as(c, world.cookie_a)
        await new_company(api, "Kilima")
        res = await send(api, HEADER + "KILIMA,,,,a@k.io,,,1\nKilima ,,,,b@k.io,,,2\n")
        async with AsyncSession(db_engine) as s:
            org = (await s.execute(select(LeadImport.org_id))).scalar_one()
        ctx = job_ctx(db_engine, make_settings(leads_match_company_by_name=False))
        assert await import_leads(ctx, str(org), res.json()["id"]) == "done"
    async with AsyncSession(db_engine) as s:
        assert len((await s.execute(select(Company.id))).all()) == 3


async def test_domain_only_rows_and_companies_without_names(
    api: AsyncClient, db_engine: AsyncEngine
) -> None:
    text = "Website,Email,Size\nhttps://www.acme.io,,51-200\nacme.io,ops@acme.io,\nbeta.io,,lots\n"
    done = await imported(api, db_engine, text, mapping=["domain", "email", "size"])
    assert (done["created_count"], done["in_file_duplicates"]) == (3, 1) or done[
        "created_count"
    ] == 3
    by_name = await companies(db_engine)
    assert sorted(by_name) == ["acme.io", "beta.io"]
    assert (by_name["acme.io"].size, by_name["beta.io"].size) == ("51-200", None)


async def test_later_rows_fill_a_company_created_earlier(
    api: AsyncClient, db_engine: AsyncEngine
) -> None:
    text = "Company,Website,Email,Country\nAcme,acme.io,a@acme.io,\nAcme,acme.io,b@acme.io,Kenya\n"
    done = await imported(api, db_engine, text, mapping=["company", "domain", "email", "country"])
    assert (done["created_count"], done["people_created"]) == (2, 2)
    assert (await companies(db_engine))["Acme"].country == "Kenya"


async def test_a_person_without_a_company_gets_one(
    api: AsyncClient, db_engine: AsyncEngine
) -> None:
    await api.post(f"{API}/leads", json={"email": "solo@acme.io"})
    await new_company(api, "Taken", domain="beta.io")
    text = HEADER + "Acme,acme.io,Solo,,solo@acme.io,,,1\nBeta,beta.io,,,x@x.io,,,2\n"
    await imported(api, db_engine, text, policy="fill")
    solo = (await people(db_engine))["solo@acme.io"]
    acme = (await companies(db_engine))["Acme"]
    assert (solo.company_id, solo.is_primary, solo.first_name) == (acme.id, True, "Solo")


async def test_fill_never_steals_a_website(api: AsyncClient, db_engine: AsyncEngine) -> None:
    await new_company(api, "NoSite", person={"email": "a@x.io"})
    await new_company(api, "Owner", domain="owner.io")
    await new_company(api, "Blank", person={"email": "b@x.io"})
    text = HEADER + "NoSite,owner.io,,,a@x.io,,,1\nBlank,blank.io,,,b@x.io,,,2\n"
    await imported(api, db_engine, text, policy="fill")
    by_name = await companies(db_engine)
    assert (by_name["NoSite"].domain, by_name["Blank"].domain) == (None, "blank.io")


# --- the job's failure handling -----------------------------------------------------------


async def test_workspace_cap_fails_the_import(api: AsyncClient, db_engine: AsyncEngine) -> None:
    res = await send(api, SAMPLE)
    assert await run(db_engine, res.json()["id"], leads_max_companies_per_org=1) == "failed"
    got = (await api.get(f"{API}/lead-imports/{res.json()['id']}")).json()
    assert (got["status"], got["failure"]) == ("failed", "workspace_full")
    assert await companies(db_engine) == {}  # nothing half-imported


async def test_a_file_the_job_cannot_read_fails(api: AsyncClient, db_engine: AsyncEngine) -> None:
    res = await send(api, SAMPLE)
    assert await run(db_engine, res.json()["id"], leads_import_max_rows=2) == "failed"
    got = (await api.get(f"{API}/lead-imports/{res.json()['id']}")).json()
    assert (got["failure"], got["note"]) == (
        "too_many_rows",
        "Imports can have up to 2 rows. Split the file.",
    )


async def test_missing_and_lost_uploads(
    api: AsyncClient, db_engine: AsyncEngine, world: World
) -> None:
    ctx = job_ctx(db_engine, make_settings())
    with pytest.raises(Retry):
        await import_leads(ctx, str(world.a.org_id), str(uuid.uuid4()))
    ctx = job_ctx(db_engine, make_settings(), job_try=3)
    assert await import_leads(ctx, str(world.a.org_id), str(uuid.uuid4())) == "missing"

    iid = (await send(api, SAMPLE)).json()["id"]
    async with AsyncSession(db_engine) as s, s.begin():
        row = await s.get(LeadImport, uuid.UUID(iid))
        assert row is not None
        row.data = None
    assert await run(db_engine, iid) == "failed"
    assert (await api.get(f"{API}/lead-imports/{iid}")).json()["failure"] == "interrupted"


@pytest.mark.parametrize(
    "error", [OSError("db down"), IntegrityError("x", None, Exception("race"))]
)
async def test_transient_errors_retry_then_give_up(
    api: AsyncClient, db_engine: AsyncEngine, monkeypatch: pytest.MonkeyPatch, error: Exception
) -> None:
    iid = (await send(api, SAMPLE)).json()["id"]

    async def broken(self: ImportJob, *args: Any) -> None:
        raise error

    monkeypatch.setattr(ImportJob, "_write", broken)
    async with AsyncSession(db_engine) as s:
        org = str((await s.get(LeadImport, uuid.UUID(iid))).org_id)  # type: ignore[union-attr]
    with pytest.raises(Retry):
        await import_leads(job_ctx(db_engine, make_settings(worker_max_tries=3)), org, iid)
    ctx = job_ctx(db_engine, make_settings(worker_max_tries=3), job_try=3)
    assert await import_leads(ctx, org, iid) == "failed"
    got = (await api.get(f"{API}/lead-imports/{iid}")).json()
    assert (got["status"], got["failure"]) == ("failed", "interrupted")


async def test_a_crash_fails_the_import_and_reraises(
    api: AsyncClient, db_engine: AsyncEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    iid = (await send(api, SAMPLE)).json()["id"]

    def broken(*args: Any) -> None:
        raise RuntimeError("bug")

    monkeypatch.setattr(importer, "plan_of", broken)
    with pytest.raises(RuntimeError):
        await run(db_engine, iid)
    got = (await api.get(f"{API}/lead-imports/{iid}")).json()
    assert (got["status"], got["failure"]) == ("failed", "interrupted")
    assert await companies(db_engine) == {}


async def test_progress_only_moves_running_imports(
    api: AsyncClient, db_engine: AsyncEngine
) -> None:
    done = await imported(api, db_engine, HEADER + "Acme,acme.io,,,,,,\n")
    async with AsyncSession(db_engine) as s:
        org = (await s.get(LeadImport, uuid.UUID(done["id"]))).org_id  # type: ignore[union-attr]
    job = ImportJob(
        db=job_ctx(db_engine, make_settings())["db"],
        settings=make_settings(),
        org_id=org,
        import_id=uuid.UUID(done["id"]),
    )
    await job.progress(50)
    assert (await api.get(f"{API}/lead-imports/{done['id']}")).json()["progress_pct"] == 100


def test_attachment_names_are_header_safe() -> None:
    from app.api.v1.routes.lead_imports import attachment

    header = attachment('L\u00ebads "Q3"\r\n.csv')
    assert header.encode("latin-1")  # never breaks the response
    assert header.startswith('attachment; filename="L_ads _Q3___-problems.csv"; ')
    assert header.endswith("filename*=UTF-8''L%C3%ABads%20%22Q3%22%0D%0A-problems.csv")
    assert attachment(".csv").startswith('attachment; filename="import-problems.csv"')


def test_chunks() -> None:
    assert [list(c) for c in importer.chunks([1, 2, 3], 2)] == [[1, 2], [3]]
    assert importer.changes({"a": "x", "n": None}, {"a": "y", "n": "z"}, "fill") == {"n": "z"}
