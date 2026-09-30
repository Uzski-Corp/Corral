"""The CSV import job: classify every row against the workspace, then apply it atomically.

The upload is parsed again here (the API only checked it), so what's written is exactly
what the dry run showed for the same file and data. Planning is pure Python over the
existing rows the file mentions (``plan_writes``); applying is a handful of set-based
statements in *one* tenant transaction: an import lands completely or not at all.

Progress (for the polling client) is written in short, separate transactions. When the
import finishes, the upload itself is dropped; only the receipt and the rows left behind
(a CSV-injection-safe errors file) are kept.
"""

import asyncio
import uuid
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal

import structlog
from arq import Retry
from sqlalchemy import ColumnElement, func, insert, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.db.session import Database, tenant_transaction
from app.leads.csv_import import (
    Classified,
    CsvLimits,
    ImportRejected,
    ParsedCsv,
    Policy,
    Record,
    classify,
    errors_csv,
    plan_of,
    read_file,
)
from app.leads.normalize import name_key
from app.models.crm import Company, LeadImport
from app.models.domain import Lead
from app.worker.jobs import TRANSIENT_ERRORS, retry_delay_s

log = structlog.get_logger(__name__)

Outcome = Literal["done", "failed", "missing", "finished"]
MISSING_TRIES = 3
LOOKUP_CHUNK = 1_000

COMPANY_MAP = {"company": "name", "domain": "domain", "country": "country", "size": "size",
               "industry": "industry", "notes": "notes"}  # fmt: skip
PERSON_MAP = {"email": "email", "first": "first_name", "last": "last_name", "title": "title",
              "phone": "phone", "linkedin": "linkedin_url"}  # fmt: skip


class ImportFailure(Exception):
    def __init__(self, failure: str, note: str) -> None:
        super().__init__(failure)
        self.failure = failure
        self.note = note


def chunks[T](items: Sequence[T], size: int) -> Iterator[Sequence[T]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


# --- planning (pure) ------------------------------------------------------------------------


@dataclass(slots=True)
class KnownCompany:
    id: uuid.UUID
    values: dict[str, Any]
    has_primary: bool
    new: bool = False


@dataclass(slots=True)
class KnownPerson:
    id: uuid.UUID
    company_id: uuid.UUID | None
    values: dict[str, Any]


@dataclass(slots=True)
class Existing:
    """The rows already in the workspace that this file mentions."""

    people_by_email: dict[str, KnownPerson] = field(default_factory=dict)
    companies: dict[uuid.UUID, KnownCompany] = field(default_factory=dict)
    by_domain: dict[str, uuid.UUID] = field(default_factory=dict)
    by_name: dict[str, uuid.UUID] = field(default_factory=dict)  # for rows without a website


@dataclass(slots=True)
class Writes:
    new_companies: list[dict[str, Any]] = field(default_factory=list)
    new_people: list[dict[str, Any]] = field(default_factory=list)
    company_changes: dict[uuid.UUID, dict[str, Any]] = field(default_factory=dict)
    person_changes: dict[uuid.UUID, dict[str, Any]] = field(default_factory=dict)
    touched: set[uuid.UUID] = field(default_factory=set)


def company_values(record: Record) -> dict[str, str]:
    values = {COMPANY_MAP[k]: v for k, v in record.values.items() if k in COMPANY_MAP}
    values.setdefault("name", values.get("domain", ""))
    return values


def person_values(record: Record) -> dict[str, str]:
    return {PERSON_MAP[k]: v for k, v in record.values.items() if k in PERSON_MAP}


def changes(current: dict[str, Any], incoming: dict[str, Any], policy: Policy) -> dict[str, Any]:
    """``fill`` sets blanks; ``overwrite`` also replaces values but *appends* notes."""
    out: dict[str, Any] = {}
    for key, value in incoming.items():
        have = current.get(key)
        if have is None or have == "":
            out[key] = value
        elif policy == "overwrite" and have != value:
            if key == "notes":
                if value not in have:
                    out[key] = f"{have}\n\n{value}"
            else:
                out[key] = value
    return out


class Planner:
    def __init__(
        self, org_id: uuid.UUID, import_id: uuid.UUID, existing: Existing, match_by_name: bool
    ) -> None:
        self.org_id = org_id
        self.import_id = import_id
        self.known = existing
        self.match_by_name = match_by_name
        self.writes = Writes()
        self.people_created = 0

    def _apply_company(
        self, company: KnownCompany, incoming: dict[str, Any], policy: Policy
    ) -> None:
        incoming = dict(incoming)
        domain = incoming.pop("domain", None)
        if domain and not company.values.get("domain") and domain not in self.known.by_domain:
            incoming["domain"] = domain  # take a website only when nobody else has it
        diff = changes(company.values, incoming, policy)
        if "name" in diff:
            diff["name_key"] = name_key(diff["name"])
        if not diff:
            self.writes.touched.add(company.id)
            return
        company.values.update(diff)
        if "domain" in diff:
            self.known.by_domain[diff["domain"]] = company.id
        if company.new:
            return
        self.writes.company_changes.setdefault(company.id, {}).update(diff)
        self.writes.touched.add(company.id)

    def _resolve(self, record: Record) -> KnownCompany:
        """The company a new row belongs to: same website, else same name, else a new one."""
        values = company_values(record)
        found: uuid.UUID | None = None
        if record.domain:
            found = self.known.by_domain.get(record.domain)
        elif self.match_by_name:
            found = self.known.by_name.get(name_key(values["name"]))
        if found is not None:
            company = self.known.companies[found]
            self._apply_company(company, values, "fill")
            return company
        company_id = uuid.uuid4()
        key = name_key(values["name"])
        row: dict[str, Any] = {
            "id": company_id,
            "org_id": self.org_id,
            "name_key": key,
            "source": "import",
            "import_id": self.import_id,
            **values,
        }
        self.writes.new_companies.append(row)
        company = KnownCompany(id=company_id, values=row, has_primary=False, new=True)
        self.known.companies[company_id] = company
        if record.domain:
            self.known.by_domain[record.domain] = company_id
        self.known.by_name.setdefault(key, company_id)
        return company

    def _add_person(self, company: KnownCompany, record: Record) -> None:
        person = person_values(record)
        if not (person.get("email") or person.get("first_name") or person.get("last_name")):
            return
        self.writes.new_people.append(
            {
                "id": uuid.uuid4(),
                "org_id": self.org_id,
                "company_id": company.id,
                "company_name": company.values["name"],
                "is_primary": not company.has_primary,
                "source": "import",
                **person,
            }
        )
        company.has_primary = True
        self.people_created += 1

    def _update_person(self, person: KnownPerson, record: Record, policy: Policy) -> None:
        incoming = person_values(record)
        incoming.pop("email", None)
        diff = changes(person.values, incoming, policy)
        if person.company_id is None:
            company = self._resolve(record)
            diff |= {"company_id": company.id, "is_primary": not company.has_primary}
            diff["company_name"] = company.values["name"]
            company.has_primary = True
            person.company_id = company.id
        else:
            self._apply_company(
                self.known.companies[person.company_id], company_values(record), policy
            )
        if diff:
            person.values.update(diff)
            self.writes.person_changes.setdefault(person.id, {}).update(diff)

    def plan(self, classified: Classified, policy: Policy) -> Writes:
        for record, outcome in zip(classified.records, classified.outcomes, strict=True):
            if outcome == "new":
                self._add_person(self._resolve(record), record)
            elif outcome == "existing_email" and policy != "skip":
                assert record.email is not None  # noqa: S101 - classify only says so with one
                self._update_person(self.known.people_by_email[record.email], record, policy)
            elif outcome == "existing_domain" and policy != "skip":
                assert record.domain is not None  # noqa: S101 - as above
                company = self.known.companies[self.known.by_domain[record.domain]]
                self._apply_company(company, company_values(record), policy)
        return self.writes


# --- loading and applying ---------------------------------------------------------------


async def load_existing(
    session: AsyncSession, org_id: uuid.UUID, records: Iterable[Record], *, match_by_name: bool
) -> Existing:
    records = list(records)
    emails = sorted({r.email for r in records if r.email})
    domains = {r.domain for r in records if r.domain}
    names = sorted(
        {name_key(r.values["company"]) for r in records if not r.domain and r.values.get("company")}
    )
    known = Existing()
    company_ids: set[uuid.UUID] = set()
    for email_part in chunks(emails, LOOKUP_CHUNK):
        leads = await session.execute(
            select(Lead).where(Lead.org_id == org_id, Lead.email.in_(email_part))
        )
        for lead in leads.scalars():
            assert lead.email is not None  # noqa: S101 - matched by email
            known.people_by_email[lead.email] = KnownPerson(
                id=lead.id,
                company_id=lead.company_id,
                values={c: getattr(lead, c) for c in PERSON_MAP.values()},
            )
            if lead.company_id:
                company_ids.add(lead.company_id)
    ids = sorted(company_ids)
    conditions: list[ColumnElement[bool]] = [
        *(Company.domain.in_(p) for p in chunks(sorted(domains), LOOKUP_CHUNK)),
        *(Company.id.in_(p) for p in chunks(ids, LOOKUP_CHUNK)),
    ]
    if match_by_name:
        conditions += [Company.name_key.in_(p) for p in chunks(names, LOOKUP_CHUNK)]
    for condition_part in chunks(conditions, 10):
        companies = await session.execute(
            select(Company)
            .where(Company.org_id == org_id, or_(*condition_part))
            .order_by(Company.created_at, Company.id)  # the oldest same-name company wins
        )
        for company in companies.scalars():
            known.companies[company.id] = KnownCompany(
                id=company.id,
                values={c: getattr(company, c) for c in (*COMPANY_MAP.values(), "name_key")},
                has_primary=False,
            )
            if company.domain:
                known.by_domain[company.domain] = company.id
            known.by_name.setdefault(company.name_key, company.id)
    for id_part in chunks(sorted(known.companies), LOOKUP_CHUNK):
        primaries = await session.execute(
            select(Lead.company_id).where(Lead.company_id.in_(id_part), Lead.is_primary.is_(True))
        )
        for primary_company in primaries.scalars():
            assert primary_company is not None  # noqa: S101 - filtered by IN
            known.companies[primary_company].has_primary = True
    return known


async def apply_writes(
    session: AsyncSession, writes: Writes, import_id: uuid.UUID, batch: int
) -> None:
    for rows in chunks(writes.new_companies, batch):
        await session.execute(insert(Company), list(rows))
    for rows in chunks(writes.new_people, batch):
        await session.execute(insert(Lead), list(rows))
    for company_id, values in writes.company_changes.items():
        await session.execute(update(Company).where(Company.id == company_id).values(**values))
    for person_id, values in writes.person_changes.items():
        await session.execute(update(Lead).where(Lead.id == person_id).values(**values))
    touched = sorted(writes.touched)
    for ids in chunks(touched, LOOKUP_CHUNK):
        await session.execute(
            update(Company).where(Company.id.in_(ids)).values(import_id=import_id)
        )


@dataclass(frozen=True, slots=True)
class _Loaded:
    data: bytes
    mapping: list[Any]
    policy: Policy


class ImportJob:
    def __init__(
        self, *, db: Database, settings: Settings, org_id: uuid.UUID, import_id: uuid.UUID
    ) -> None:
        self.db = db
        self.settings = settings
        self.org_id = org_id
        self.import_id = import_id

    def _mine(self) -> Any:
        return (LeadImport.org_id == self.org_id) & (LeadImport.id == self.import_id)

    async def _load(self) -> _Loaded | Literal["finished"] | None:
        async with tenant_transaction(self.db, self.org_id) as session:
            row = (
                await session.execute(select(LeadImport).where(self._mine()))
            ).scalar_one_or_none()
            if row is None:
                return None
            if row.status in ("done", "failed"):
                return "finished"
            if row.data is None:
                raise ImportFailure("interrupted", "The upload wasn't stored.")
            row.status = "running"
            row.progress_pct = 5
            policy: Policy = (
                "fill"
                if row.policy == "fill"
                else ("overwrite" if row.policy == "overwrite" else "skip")
            )
            return _Loaded(data=row.data, mapping=list(row.mapping), policy=policy)

    async def progress(self, pct: int) -> None:
        async with tenant_transaction(self.db, self.org_id) as session:
            await session.execute(
                update(LeadImport)
                .where(self._mine(), LeadImport.status == "running")
                .values(progress_pct=max(0, min(99, pct)))
            )

    async def fail(self, failure: ImportFailure) -> None:
        async with tenant_transaction(self.db, self.org_id) as session:
            await session.execute(
                update(LeadImport)
                .where(self._mine(), LeadImport.status.in_(("queued", "running")))
                .values(
                    status="failed",
                    failure=failure.failure,
                    note=failure.note[:500],
                    data=None,
                    finished_at=datetime.now(UTC),
                )
            )

    async def _write(self, parsed: ParsedCsv, records: list[Record], policy: Policy) -> None:
        async with tenant_transaction(self.db, self.org_id) as session:
            # One import per workspace at a time: two files can't both create "acme.com".
            await session.execute(
                select(func.pg_advisory_xact_lock(func.hashtext(f"lead_import:{self.org_id}")))
            )
            match_by_name = self.settings.leads_match_company_by_name
            known = await load_existing(session, self.org_id, records, match_by_name=match_by_name)
            classified = classify(
                records,
                existing_emails=frozenset(known.people_by_email),
                existing_domains=frozenset(known.by_domain),
            )
            planner = Planner(self.org_id, self.import_id, known, match_by_name)
            writes = planner.plan(classified, policy)
            cap = self.settings.leads_max_companies_per_org
            count = (
                await session.execute(
                    select(func.count()).select_from(Company).where(Company.org_id == self.org_id)
                )
            ).scalar_one()
            if count + len(writes.new_companies) > cap:
                raise ImportFailure(
                    "workspace_full", f"This import would go over {cap:,} companies."
                )
            await self.progress(40)
            await apply_writes(
                session, writes, self.import_id, self.settings.leads_import_batch_rows
            )
            plan = plan_of(classified, policy)
            await session.execute(
                update(LeadImport)
                .where(self._mine())
                .values(
                    status="done",
                    progress_pct=100,
                    total_rows=plan.total,
                    created_count=plan.create,
                    updated_count=plan.update,
                    skipped_count=plan.skipped,
                    error_count=plan.errors,
                    in_file_duplicates=plan.in_file,
                    existing_duplicates=plan.existing,
                    people_created=planner.people_created,
                    errors_csv=errors_csv(parsed, classified),
                    data=None,
                    finished_at=datetime.now(UTC),
                )
            )

    async def run(self) -> Outcome:
        loaded = await self._load()
        if loaded is None:
            return "missing"
        if loaded == "finished":
            return "finished"
        limits = CsvLimits.from_settings(self.settings)
        try:
            parsed, records = await asyncio.to_thread(
                read_file, loaded.data, loaded.mapping, limits
            )
        except ImportRejected as exc:
            raise ImportFailure(exc.code, exc.detail) from exc
        await self.progress(20)
        await self._write(parsed, records, loaded.policy)
        return "done"


RETRYABLE: tuple[type[BaseException], ...] = (*TRANSIENT_ERRORS, IntegrityError)


async def import_leads(ctx: dict[str, Any], org_id: str, import_id: str) -> Outcome:
    """arq entrypoint. A unique-key race with a concurrent edit is retried from scratch."""
    job = ImportJob(
        db=ctx["db"],
        settings=ctx["settings"],
        org_id=uuid.UUID(org_id),
        import_id=uuid.UUID(import_id),
    )
    job_try = int(ctx.get("job_try", 1))
    bound = log.bind(job="import_leads", import_id=import_id, job_try=job_try)
    try:
        outcome = await job.run()
    except ImportFailure as failure:
        await job.fail(failure)
        bound.info("lead_import_failed", failure=failure.failure)
        return "failed"
    except RETRYABLE as exc:
        if job_try >= job.settings.worker_max_tries:
            await job.fail(ImportFailure("interrupted", "Corral couldn't finish this import."))
            bound.warning("lead_import_gave_up", error_type=type(exc).__name__)
            return "failed"
        delay = retry_delay_s(job_try)
        bound.warning("lead_import_retry", error_type=type(exc).__name__, retry_in_s=delay)
        raise Retry(defer=delay) from exc
    except Exception as exc:
        bound.exception("lead_import_crashed", error_type=type(exc).__name__)
        await job.fail(ImportFailure("interrupted", "Something went wrong importing it."))
        raise
    if outcome == "missing" and job_try < MISSING_TRIES:
        raise Retry(defer=retry_delay_s(job_try))
    bound.info("lead_import_done", outcome=outcome)
    return outcome
