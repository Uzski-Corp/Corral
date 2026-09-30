"""Saved segments: live rules plus pinned companies.

Membership = (the rules match) OR (the company is pinned). A segment without rules is a
hand-picked list. Rules are stored as validated JSON and re-validated on read, so a
vocabulary change can never make a stored rule mean something new silently.
"""

import uuid
from typing import Any

from sqlalchemy import ColumnElement, func, literal, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.leads.rules import Match, Rule, rules_clause
from app.leads.service import LeadsProblem, check_rules
from app.models.crm import Company, SegmentPin
from app.models.domain import Segment


def segment_rules(segment: Segment) -> list[Rule]:
    return [Rule.model_validate(r) for r in segment.rules]


def membership(segment: Segment) -> ColumnElement[bool]:
    pinned = select(SegmentPin.company_id).where(SegmentPin.segment_id == segment.id)
    live = rules_clause(
        segment_rules(segment), "any" if segment.match == "any" else "all", empty=False
    )
    return or_(live, Company.id.in_(pinned))


class SegmentService:
    def __init__(self, session: AsyncSession, org_id: uuid.UUID, settings: Settings) -> None:
        self.session = session
        self.org_id = org_id
        self.settings = settings

    async def get(self, segment_id: uuid.UUID) -> Segment:
        stmt = select(Segment).where(Segment.org_id == self.org_id, Segment.id == segment_id)
        segment = (await self.session.execute(stmt)).scalar_one_or_none()
        if segment is None:
            raise LeadsProblem(404, "not_found", "Segment not found")
        return segment

    async def _save(self, segment: Segment) -> Segment:
        try:
            async with self.session.begin_nested():
                self.session.add(segment)
                await self.session.flush()
        except IntegrityError as exc:
            raise LeadsProblem(409, "duplicate", "A segment with this name exists.") from exc
        await self.session.refresh(segment)
        return segment

    async def create(
        self,
        *,
        name: str,
        rules: list[Rule],
        match: Match,
        company_ids: list[uuid.UUID],
        from_import_id: uuid.UUID | None,
    ) -> Segment:
        check_rules(rules, self.settings)
        if len(company_ids) > self.settings.leads_bulk_max_ids:
            raise LeadsProblem(
                422, "too_many_ids", f"Pin up to {self.settings.leads_bulk_max_ids:,} companies."
            )
        segment = await self._save(
            Segment(
                org_id=self.org_id,
                name=name,
                rules=[r.model_dump(mode="json") for r in rules],
                match=match,
            )
        )
        picks: list[ColumnElement[bool]] = []
        if company_ids:
            picks.append(Company.id.in_(company_ids))
        if from_import_id is not None:
            picks.append(Company.import_id == from_import_id)
        if picks:
            rows = select(Company.org_id, Company.id, literal(segment.id)).where(
                Company.org_id == self.org_id, or_(*picks)
            )
            await self.session.execute(
                pg_insert(SegmentPin)
                .from_select(
                    ["org_id", "company_id", "segment_id"],
                    rows,
                    include_defaults=False,
                )
                .on_conflict_do_nothing(index_elements=["segment_id", "company_id"])
            )
        return segment

    async def update(self, segment: Segment, values: dict[str, Any]) -> Segment:
        if "rules" in values:
            rules: list[Rule] = values["rules"]
            check_rules(rules, self.settings)
            values["rules"] = [r.model_dump(mode="json") for r in rules]
        for key, value in values.items():
            setattr(segment, key, value)
        return await self._save(segment)

    async def delete(self, segment: Segment) -> None:
        await self.session.delete(segment)
        await self.session.flush()

    async def pinned_count(self, segment: Segment) -> int:
        stmt = select(func.count()).where(SegmentPin.segment_id == segment.id)
        return (await self.session.execute(stmt)).scalar_one()
