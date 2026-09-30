"""Companies (accounts), their people, bulk actions, merge and unsubscribe.

Everything is scoped by ``org_id`` explicitly (RLS is the second layer). Bulk actions are
one set-based statement each over a ``Selection`` (ids, or "everything matching these
rules"), so acting on 40,000 rows costs the same round trips as acting on four.
"""

import math
import uuid
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import (
    ColumnElement,
    Select,
    and_,
    case,
    delete,
    exists,
    func,
    literal,
    or_,
    select,
    update,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.leads.normalize import is_domain, name_key, norm_domain
from app.leads.rules import Match, Rule, rules_clause
from app.leads.vocab import REPLIED, ReplyStatus
from app.models.crm import Company, CompanyFit, SegmentPin, Suppression
from app.models.domain import Lead, Segment


class LeadsProblem(Exception):
    """A client error the routes translate 1:1 into an ``ApiProblem``."""

    def __init__(
        self, status_code: int, error: str, detail: str, extra: Mapping[str, object] | None = None
    ) -> None:
        super().__init__(error)
        self.status_code = status_code
        self.error = error
        self.detail = detail
        self.extra = dict(extra or {})


class Selection(BaseModel):
    """Which companies a bulk action applies to: explicit ids, or all matching rules."""

    model_config = ConfigDict(extra="forbid")

    ids: list[uuid.UUID] | None = Field(default=None, min_length=1)
    all: bool = False
    rules: list[Rule] = Field(default_factory=list, max_length=100)
    match: Match = "all"

    @model_validator(mode="after")
    def _one_mode(self) -> Self:
        if (self.ids is None) == (not self.all):
            raise ValueError("Send either ids, or all=true with rules")
        if self.ids is not None and self.rules:
            raise ValueError("rules only apply with all=true")
        return self


@dataclass(frozen=True, slots=True)
class Skip:
    reason: str
    n: int


@dataclass(frozen=True, slots=True)
class BulkResult:
    matched: int
    changed: int
    skipped: list[Skip] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class EnrollPlan:
    matched: int
    will_enroll: int
    skipped: list[Skip]
    sends_per_day: int
    days: int


COMPANY_FIELDS = ("name", "domain", "country", "size", "industry", "notes")
PERSON_FIELDS = ("email", "first_name", "last_name", "title", "phone", "linkedin_url")
# First matching reason wins, in this order (the enroll dry run shows one per company).
SKIP_ORDER = ("unsubscribed", "not_interested", "replied_recently", "no_verified_email")


def _skips(counts: Mapping[str, int], order: tuple[str, ...]) -> list[Skip]:
    return [Skip(reason, counts[reason]) for reason in order if counts.get(reason)]


class CompanyService:
    def __init__(self, session: AsyncSession, org_id: uuid.UUID, settings: Settings) -> None:
        self.session = session
        self.org_id = org_id
        self.settings = settings

    # --- reads ---------------------------------------------------------------------------

    def scoped(self, where: ColumnElement[bool] | None = None) -> ColumnElement[bool]:
        mine = Company.org_id == self.org_id
        return mine if where is None else and_(mine, where)

    async def get(self, company_id: uuid.UUID) -> Company | None:
        stmt = select(Company).where(self.scoped(Company.id == company_id))
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def require(self, company_id: uuid.UUID) -> Company:
        company = await self.get(company_id)
        if company is None:
            raise LeadsProblem(404, "not_found", "Company not found")
        return company

    async def people(self, company_id: uuid.UUID) -> list[Lead]:
        stmt = (
            select(Lead)
            .where(Lead.org_id == self.org_id, Lead.company_id == company_id)
            .order_by(Lead.is_primary.desc(), Lead.created_at, Lead.id)
        )
        return list((await self.session.execute(stmt)).scalars())

    async def fits(self, company_id: uuid.UUID) -> list[CompanyFit]:
        stmt = (
            select(CompanyFit)
            .where(CompanyFit.org_id == self.org_id, CompanyFit.company_id == company_id)
            .order_by(CompanyFit.product_id)
        )
        return list((await self.session.execute(stmt)).scalars())

    async def count(self, where: ColumnElement[bool] | None = None) -> int:
        stmt = select(func.count()).select_from(Company).where(self.scoped(where))
        return (await self.session.execute(stmt)).scalar_one()

    # --- create / update / delete ---------------------------------------------------------

    def _domain(self, value: str | None) -> str | None:
        if value is None:
            return None
        domain = norm_domain(value)
        if not domain:
            return None
        if not is_domain(domain):
            raise LeadsProblem(422, "invalid_domain", "That doesn't look like a website.")
        return domain

    async def _domain_owner(self, domain: str) -> uuid.UUID | None:
        stmt = select(Company.id).where(self.scoped(Company.domain == domain))
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def _check_domain_free(self, domain: str | None, *, owner: uuid.UUID | None) -> None:
        if domain is None:
            return
        existing = await self._domain_owner(domain)
        if existing is not None and existing != owner:
            raise LeadsProblem(
                409,
                "duplicate",
                "A company with this website exists.",
                {"existing_id": str(existing)},
            )

    async def _check_capacity(self, adding: int) -> None:
        cap = self.settings.leads_max_companies_per_org
        if await self.count() + adding > cap:
            raise LeadsProblem(
                409, "workspace_full", f"A workspace can hold up to {cap:,} companies."
            )

    async def _email_owner(self, email: str) -> Lead | None:
        stmt = select(Lead).where(Lead.org_id == self.org_id, Lead.email == email)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def create(self, values: dict[str, Any], person: dict[str, Any] | None) -> Company:
        values = dict(values)
        values["domain"] = self._domain(values.get("domain"))
        await self._check_domain_free(values["domain"], owner=None)
        await self._check_capacity(1)
        company = Company(
            org_id=self.org_id, name_key=name_key(values["name"]), source="manual", **values
        )
        self.session.add(company)
        await self.session.flush()
        if person:
            email = person.get("email")
            if email:
                owner = await self._email_owner(email)
                if owner is not None:
                    raise LeadsProblem(
                        409,
                        "duplicate_person",
                        "Someone with this email exists.",
                        {"existing_lead_id": str(owner.id)},
                    )
            self.session.add(
                Lead(
                    org_id=self.org_id,
                    company_id=company.id,
                    company_name=company.name,
                    is_primary=True,
                    source="manual",
                    **person,
                )
            )
        await self.session.flush()
        await self.session.refresh(company)
        return company

    async def update(self, company: Company, values: dict[str, Any]) -> Company:
        values = dict(values)
        status: ReplyStatus | None = values.pop("reply_status", None)
        if status not in (None, "unsubscribed") and company.reply_status == "unsubscribed":
            raise LeadsProblem(
                409, "unsubscribed_final", "They unsubscribed. That can't be undone."
            )
        if "domain" in values:
            values["domain"] = self._domain(values["domain"])
            await self._check_domain_free(values["domain"], owner=company.id)
        if "name" in values:
            values["name_key"] = name_key(values["name"])
        for key, value in values.items():
            setattr(company, key, value)
        await self.session.flush()
        if status is not None:
            await self.set_reply_status(Company.id == company.id, status)
        await self.session.refresh(company)
        return company

    async def delete(self, company_id: uuid.UUID) -> bool:
        stmt = delete(Company).where(self.scoped(Company.id == company_id)).returning(Company.id)
        return (await self.session.execute(stmt)).scalar_one_or_none() is not None

    # --- reply status and unsubscribe ---------------------------------------------------

    async def set_reply_status(self, where: ColumnElement[bool], status: ReplyStatus) -> BulkResult:
        """Set by hand. Unsubscribed is final: those companies are skipped, never reopened."""
        scope = self.scoped(where)
        final = Company.reply_status == "unsubscribed"
        matched = await self.count(where)
        locked = await self.count(and_(where, final))
        if status == "unsubscribed":
            changed = await self._unsubscribe(and_(scope, ~final))
        else:
            result = await self.session.execute(
                update(Company)
                .where(scope, ~final)
                .values(reply_status=status, reply_status_set_by="user")
                .returning(Company.id)
            )
            changed = len(result.all())
        skipped = [Skip("unsubscribed", locked)] if locked else []
        return BulkResult(matched=matched, changed=changed, skipped=skipped)

    async def _unsubscribe(self, company_where: ColumnElement[bool]) -> int:
        """Mark companies unsubscribed and suppress their address(es) workspace-wide.

        Scope ``address``: only each company's primary person; ``company``: everyone there.
        """
        ids = [
            row[0]
            for row in await self.session.execute(
                update(Company)
                .where(company_where)
                .values(reply_status="unsubscribed", reply_status_set_by="user")
                .returning(Company.id)
            )
        ]
        if not ids:
            return 0
        people = and_(Lead.org_id == self.org_id, Lead.company_id.in_(ids))
        if self.settings.leads_unsubscribe_scope == "address":
            people = and_(people, Lead.is_primary.is_(True))
        await self._suppress_people(people)
        return len(ids)

    async def _suppress_people(self, people: ColumnElement[bool]) -> None:
        now = datetime.now(UTC)
        await self.session.execute(
            update(Lead).where(people, Lead.unsubscribed_at.is_(None)).values(unsubscribed_at=now)
        )
        rows = select(
            literal(self.org_id).label("org_id"), Lead.email, literal("unsubscribed")
        ).where(people, Lead.email.is_not(None))
        await self.session.execute(
            pg_insert(Suppression)
            .from_select(["org_id", "email", "reason"], rows, include_defaults=False)
            .on_conflict_do_nothing(index_elements=["org_id", "email"])
        )

    async def unsubscribe_person(self, lead: Lead) -> None:
        if lead.company_id is not None:
            scope = self.settings.leads_unsubscribe_scope
            await self.session.execute(
                update(Company)
                .where(self.scoped(Company.id == lead.company_id))
                .values(reply_status="unsubscribed", reply_status_set_by="user")
            )
            if scope == "company":
                await self._suppress_people(
                    and_(Lead.org_id == self.org_id, Lead.company_id == lead.company_id)
                )
        await self._suppress_people(and_(Lead.org_id == self.org_id, Lead.id == lead.id))
        await self.session.refresh(lead)

    # --- merge ----------------------------------------------------------------------------

    async def merge(self, original: Company, duplicate: Company) -> Company:
        """Keep ``original``; fill its blanks from ``duplicate``; move everything over."""
        if original.id == duplicate.id:
            raise LeadsProblem(422, "same_company", "Pick two different companies.")
        fills = {
            key: getattr(duplicate, key)
            for key in COMPANY_FIELDS
            if getattr(original, key) is None and getattr(duplicate, key) is not None
        }
        if duplicate.reply_status == "unsubscribed":
            fills["reply_status"] = "unsubscribed"
            fills["reply_status_set_by"] = duplicate.reply_status_set_by
        stamps = [t for t in (original.last_activity_at, duplicate.last_activity_at) if t]
        if stamps:
            fills["last_activity_at"] = max(stamps)
        if "domain" in fills:  # free the unique key before the original takes it
            await self.session.execute(
                update(Company).where(Company.id == duplicate.id).values(domain=None)
            )
        has_primary = await self.session.scalar(
            select(exists().where(Lead.company_id == original.id, Lead.is_primary.is_(True)))
        )
        await self.session.execute(
            update(Lead)
            .where(Lead.org_id == self.org_id, Lead.company_id == duplicate.id)
            .values(
                company_id=original.id,
                company_name=original.name,
                is_primary=and_(Lead.is_primary, literal(not has_primary)),
            )
        )
        await self.session.execute(
            pg_insert(CompanyFit)
            .from_select(
                ["org_id", "company_id", "product_id", "score"],
                select(
                    CompanyFit.org_id, literal(original.id), CompanyFit.product_id, CompanyFit.score
                ).where(CompanyFit.company_id == duplicate.id),
                include_defaults=False,
            )
            .on_conflict_do_nothing(index_elements=["company_id", "product_id"])
        )
        await self.session.execute(
            pg_insert(SegmentPin)
            .from_select(
                ["org_id", "segment_id", "company_id"],
                select(SegmentPin.org_id, SegmentPin.segment_id, literal(original.id)).where(
                    SegmentPin.company_id == duplicate.id
                ),
                include_defaults=False,
            )
            .on_conflict_do_nothing(index_elements=["segment_id", "company_id"])
        )
        await self.session.execute(delete(Company).where(Company.id == duplicate.id))
        for key, value in fills.items():
            setattr(original, key, value)
        await self.session.flush()
        await self.session.refresh(original)
        return original

    # --- selections and bulk actions -----------------------------------------------------

    def selection_clause(self, selection: Selection) -> ColumnElement[bool]:
        if selection.ids is not None:
            if len(selection.ids) > self.settings.leads_bulk_max_ids:
                raise LeadsProblem(
                    422,
                    "too_many_ids",
                    f"Select up to {self.settings.leads_bulk_max_ids:,} companies by id, "
                    "or use all=true with rules.",
                )
            return Company.id.in_(selection.ids)
        check_rules(selection.rules, self.settings)
        return rules_clause(selection.rules, selection.match, empty=True)

    async def select_for_bulk(
        self, selection: Selection, *, confirm: bool
    ) -> tuple[ColumnElement[bool], int]:
        where = self.selection_clause(selection)
        matched = await self.count(where)
        if matched > self.settings.leads_bulk_max_rows:
            raise LeadsProblem(
                422,
                "too_many_rows",
                f"Bulk actions apply to up to {self.settings.leads_bulk_max_rows:,} companies.",
                {"matched": matched},
            )
        if matched >= self.settings.leads_bulk_confirm_at and not confirm:
            raise LeadsProblem(
                409,
                "confirm_required",
                f"This changes {matched:,} companies. Send confirm=true to go ahead.",
                {"matched": matched},
            )
        return where, matched

    async def bulk_delete(self, where: ColumnElement[bool], matched: int) -> BulkResult:
        result = await self.session.execute(
            delete(Company).where(self.scoped(where)).returning(Company.id)
        )
        return BulkResult(matched=matched, changed=len(result.all()))

    async def pin(self, segment: Segment, where: ColumnElement[bool], matched: int) -> BulkResult:
        rows = select(literal(self.org_id), literal(segment.id), Company.id).where(
            self.scoped(where)
        )
        result = await self.session.execute(
            pg_insert(SegmentPin)
            .from_select(["org_id", "segment_id", "company_id"], rows, include_defaults=False)
            .on_conflict_do_nothing(index_elements=["segment_id", "company_id"])
            .returning(SegmentPin.id)
        )
        changed = len(result.all())
        rest = matched - changed
        return BulkResult(matched, changed, [Skip("already_in_segment", rest)] if rest else [])

    async def unpin(self, segment: Segment, where: ColumnElement[bool], matched: int) -> BulkResult:
        result = await self.session.execute(
            delete(SegmentPin)
            .where(
                SegmentPin.org_id == self.org_id,
                SegmentPin.segment_id == segment.id,
                SegmentPin.company_id.in_(select(Company.id).where(self.scoped(where))),
            )
            .returning(SegmentPin.id)
        )
        changed = len(result.all())
        rest = matched - changed
        return BulkResult(matched, changed, [Skip("not_pinned", rest)] if rest else [])

    # --- enroll dry run ------------------------------------------------------------------

    def _skip_reason(self) -> Select[Any]:
        sendable = (
            ["verified", "catch_all"]
            if self.settings.leads_enroll_allow_catch_all
            else ["verified"]
        )
        since = datetime.now(UTC) - timedelta(days=self.settings.leads_replied_window_days)
        primary = and_(
            Lead.org_id == Company.org_id,
            Lead.company_id == Company.id,
            Lead.is_primary.is_(True),
        )
        # Correlate to the person (the enclosing EXISTS), not the company two levels up.
        suppressed = exists().where(
            Suppression.org_id == Lead.org_id, Suppression.email == Lead.email
        )
        unsubscribed = or_(
            Company.reply_status == "unsubscribed",
            exists().where(primary, or_(Lead.unsubscribed_at.is_not(None), suppressed)),
        )
        replied = and_(Company.reply_status.in_(sorted(REPLIED)), Company.last_activity_at >= since)
        reachable = exists().where(
            primary, Lead.email.is_not(None), Lead.email_status.in_(sendable)
        )
        reason = case(
            (unsubscribed, "unsubscribed"),
            (Company.reply_status == "not_interested", "not_interested"),
            (replied, "replied_recently"),
            (~reachable, "no_verified_email"),
            else_=literal(None),
        )
        return select(reason.label("reason"))

    async def enroll_plan(self, selection: Selection) -> EnrollPlan:
        where = self.selection_clause(selection)
        reasons = self._skip_reason().where(self.scoped(where)).subquery()
        stmt = select(reasons.c.reason, func.count()).group_by(reasons.c.reason)
        counts: dict[str | None, int] = {r: n for r, n in await self.session.execute(stmt)}
        will = counts.pop(None, 0)
        matched = will + sum(counts.values())
        rate = self.settings.leads_pool_sends_per_day
        return EnrollPlan(
            matched=matched,
            will_enroll=will,
            skipped=_skips({k: v for k, v in counts.items() if k}, SKIP_ORDER),
            sends_per_day=rate,
            days=math.ceil(will / rate),
        )


def check_rules(rules: list[Rule], settings: Settings) -> None:
    if len(rules) > settings.leads_max_rules:
        raise LeadsProblem(422, "too_many_rules", f"Use up to {settings.leads_max_rules} rules.")
