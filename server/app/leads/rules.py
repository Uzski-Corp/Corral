"""The segment rules engine: one rule model for table filters and saved segments.

A rule is ``{field, op, value}`` (plus ``product_id`` for fit), and a rule list is combined
with ``match = all | any``. Semantics mirror the client's ``lib/leads/segment.ts`` so the
live preview and the server agree, with one deliberate difference: the API *rejects*
unfinished rules (422) instead of ignoring them, so a saved segment never silently
means something else.

Rules compile to a single SQL predicate on ``companies`` (people and fits through
``EXISTS``), so filtering, counting and bulk actions are one set-based statement each.
"""

import uuid
from typing import Annotated, Final, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictFloat,
    StrictInt,
    StrictStr,
    StringConstraints,
    model_validator,
)
from sqlalchemy import ColumnElement, and_, exists, false, func, not_, or_, select, true

from app.leads.vocab import EMAIL_STATUSES, REPLY_STATUSES, SIZES, SOURCES
from app.models.crm import Company, CompanyFit
from app.models.domain import Lead

RuleField = Literal["fit", "country", "size", "industry", "reply", "email", "title", "source"]
Op = Literal["gte", "lte", "is", "not", "contains"]
Match = Literal["all", "any"]
Kind = Literal["number", "set", "text"]

FIELD_OPS: Final[dict[RuleField, tuple[Kind, tuple[Op, ...]]]] = {
    "fit": ("number", ("gte", "lte")),
    "country": ("set", ("is", "not")),
    "size": ("set", ("is", "not")),
    "industry": ("set", ("is", "not")),
    "reply": ("set", ("is", "not")),
    "email": ("set", ("is", "not")),
    "title": ("text", ("contains",)),
    "source": ("set", ("is", "not")),
}
# Set fields whose values come from a fixed vocabulary (the others are free text).
VOCAB: Final[dict[str, tuple[str, ...]]] = {
    "size": SIZES,
    "reply": REPLY_STATUSES,
    "email": EMAIL_STATUSES,
    "source": SOURCES,
}
MAX_VALUES = 100
MAX_TEXT = 200

SetValue = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class Rule(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    field: RuleField
    op: Op
    value: StrictInt | StrictFloat | list[SetValue] | StrictStr
    # Fit is per product ("Fit for ColdTrace Sensors").
    product_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _complete(self) -> Self:
        issue = rule_issue(self)
        if issue:
            raise ValueError(issue)
        return self


def rule_issue(rule: Rule) -> str | None:
    """Why a rule can't run, or ``None``. Messages match the builder's inline errors."""
    kind, ops = FIELD_OPS[rule.field]
    if rule.op not in ops:
        return f"{rule.op!r} doesn't apply to {rule.field}"
    value = rule.value
    if kind == "number":
        if not isinstance(value, float | int):
            return "Enter a number"
        if not 0 <= value <= 100:
            return "Fit is scored 0-100"
        if rule.product_id is None:
            return "Pick the product this fit is for"
        return None
    if rule.product_id is not None:
        return "product_id only applies to fit"
    if kind == "text":
        if not isinstance(value, str) or not value.strip():
            return "Enter some text"
        if len(value) > MAX_TEXT:
            return f"Keep it under {MAX_TEXT} characters"
        return None
    if not isinstance(value, list) or not value:
        return "Pick at least one"
    if len(value) > MAX_VALUES:
        return f"Pick at most {MAX_VALUES}"
    allowed = VOCAB.get(rule.field)
    if allowed is not None:
        unknown = [v for v in value if v not in allowed]
        if unknown:
            return f"Unknown {rule.field} value: {unknown[0]!r}"
    return None


class RuleSet(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rules: list[Rule] = Field(default_factory=list, max_length=100)
    match: Match = "all"


# --- compiling to SQL ---------------------------------------------------------------------


def _primary(*conditions: ColumnElement[bool]) -> ColumnElement[bool]:
    """The company's primary person satisfies ``conditions``."""
    return exists(
        select(1).where(
            Lead.company_id == Company.id,
            Lead.org_id == Company.org_id,
            Lead.is_primary.is_(True),
            *conditions,
        )
    )


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _set_clause(rule: Rule) -> ColumnElement[bool]:
    values = list(rule.value) if isinstance(rule.value, list) else []
    if rule.field == "email":
        hit = _primary(Lead.email_status.in_(values))
        return hit if rule.op == "is" else not_(hit)
    column = {
        "country": Company.country,
        "industry": Company.industry,
        "size": Company.size,
        "reply": Company.reply_status,
        "source": Company.source,
    }[rule.field]
    if rule.field in ("country", "industry"):  # free text: case-insensitive
        lowered = [v.lower() for v in values]
        hit = func.lower(column).in_(lowered)
    else:
        hit = column.in_(values)
    if rule.op == "is":
        return hit
    return or_(column.is_(None), not_(hit))


def rule_clause(rule: Rule) -> ColumnElement[bool]:
    kind, _ = FIELD_OPS[rule.field]
    if kind == "number":
        threshold = float(rule.value)  # type: ignore[arg-type]
        score = CompanyFit.score >= threshold if rule.op == "gte" else CompanyFit.score <= threshold
        # An unscored company matches neither "at least" nor "at most".
        return exists(
            select(1).where(
                CompanyFit.company_id == Company.id,
                CompanyFit.org_id == Company.org_id,
                CompanyFit.product_id == rule.product_id,
                score,
            )
        )
    if kind == "text":
        needle = f"%{_escape_like(str(rule.value).strip())}%"
        return _primary(Lead.title.ilike(needle, escape="\\"))
    return _set_clause(rule)


def rules_clause(rules: list[Rule], match: Match, *, empty: bool) -> ColumnElement[bool]:
    """All (or any) rules. ``empty`` is what no rules mean: everything for a table filter,
    nothing for a segment (a segment without rules is just its pins)."""
    if not rules:
        return true() if empty else false()
    clauses = [rule_clause(r) for r in rules]
    return and_(*clauses) if match == "all" else or_(*clauses)
