"""Filtered, sorted, cursor-paginated company queries (the lead table and segments).

Pagination is keyset ("seek"), not offset: each page continues strictly after the last
row's sort key, so pages stay fast at any depth and rows can't repeat or vanish when
others are added meanwhile. Every sort ends with ``(name_key, id)``, which makes the order
total; nullable keys are folded to sentinels so comparisons never meet NULL.

The cursor is opaque base64url JSON: the last row's key values plus a fingerprint of the
query (rules, match, sort, product). A cursor used with a different query is rejected.
"""

import base64
import binascii
import hashlib
import json
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Final, Literal

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import ColumnElement, and_, case, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.leads.rules import Match, Rule, rules_clause
from app.leads.vocab import EMAIL_ORDER, REPLY_ORDER
from app.models.crm import Company, CompanyFit
from app.models.domain import Lead

SortKey = Literal["company", "person", "fit", "email", "reply", "last", "created"]
Direction = Literal["asc", "desc"]
ValueKind = Literal["int", "str", "ts", "uuid"]
EPOCH: Final = datetime(1970, 1, 1, tzinfo=UTC)


class Sort(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    key: SortKey = "created"
    dir: Direction = "desc"


class InvalidCursor(ValueError):
    """Malformed, tampered, or from a different query."""


class NeedsProduct(ValueError):
    """Sorting by fit needs to know which product's fit."""


@dataclass(frozen=True, slots=True)
class _Key:
    expr: Any  # a column or SQL expression
    ascending: bool
    kind: ValueKind


@dataclass(frozen=True, slots=True)
class CompanyRow:
    company: Company
    primary: Lead | None
    fit: int | None


@dataclass(frozen=True, slots=True)
class Page:
    rows: list[CompanyRow]
    next_cursor: str | None
    total: int


Primary = aliased(Lead, name="primary_lead")
Fit = aliased(CompanyFit, name="fit")


def _rank(column: Any, order: Sequence[str]) -> ColumnElement[int]:
    return case({v: i for i, v in enumerate(order)}, value=column, else_=len(order))


def sort_keys(sort: Sort, product_id: uuid.UUID | None) -> list[_Key]:
    asc = sort.dir == "asc"
    keys: list[_Key]
    match sort.key:
        case "company":
            keys = [_Key(Company.name_key, asc, "str"), _Key(Company.id, asc, "uuid")]
            return keys
        case "person":
            person = func.lower(func.concat_ws(" ", Primary.first_name, Primary.last_name))
            keys = [_Key(person, asc, "str")]
        case "fit":
            if product_id is None:
                raise NeedsProduct("Sorting by fit needs product_id")
            keys = [_Key(func.coalesce(Fit.score, -1), asc, "int")]
        case "email":
            keys = [_Key(_rank(Primary.email_status, EMAIL_ORDER), asc, "int")]
        case "reply":
            keys = [_Key(_rank(Company.reply_status, REPLY_ORDER), asc, "int")]
        case "last":
            # "asc" is most recent first (2h ago before 1d ago); never-contacted is last
            # in both directions, like the client's ageRank.
            never = case((Company.last_activity_at.is_(None), 1), else_=0)
            when = func.coalesce(Company.last_activity_at, literal(EPOCH))
            keys = [_Key(never, True, "int"), _Key(when, not asc, "ts")]
        case _:  # "created"
            keys = [_Key(Company.created_at, asc, "ts")]
    return [*keys, _Key(Company.name_key, True, "str"), _Key(Company.id, True, "uuid")]


def _encode(value: Any, kind: ValueKind) -> Any:
    if kind == "ts":
        return value.isoformat()
    if kind == "uuid":
        return str(value)
    return value


def _decode(value: Any, kind: ValueKind) -> Any:
    if kind == "int":
        if not isinstance(value, int) or isinstance(value, bool):
            raise InvalidCursor("bad int")
        return value
    if not isinstance(value, str):
        raise InvalidCursor("bad value")
    if kind == "ts":
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            raise InvalidCursor("naive timestamp")
        return parsed
    if kind == "uuid":
        return uuid.UUID(value)
    return value


def fingerprint(
    rules: Sequence[Rule],
    match: Match,
    sort: Sort,
    product_id: uuid.UUID | None,
    scope: str = "",
) -> str:
    body = {
        "x": scope,
        "r": [r.model_dump(mode="json") for r in rules],
        "m": match,
        "s": sort.model_dump(),
        "p": str(product_id) if product_id else None,
    }
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


def encode_cursor(values: Sequence[Any], keys: Sequence[_Key], fp: str) -> str:
    payload = {"f": fp, "v": [_encode(v, k.kind) for v, k in zip(values, keys, strict=True)]}
    raw = json.dumps(payload, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str, keys: Sequence[_Key], fp: str) -> list[Any]:
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
        payload = json.loads(raw)
        if not isinstance(payload, dict) or payload.get("f") != fp:
            raise InvalidCursor("cursor is for a different query")
        values = payload.get("v")
        if not isinstance(values, list) or len(values) != len(keys):
            raise InvalidCursor("wrong shape")
        return [_decode(v, k.kind) for v, k in zip(values, keys, strict=True)]
    except (binascii.Error, UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        if isinstance(exc, InvalidCursor):
            raise
        raise InvalidCursor("unreadable cursor") from exc


def after(keys: Sequence[_Key], values: Sequence[Any]) -> ColumnElement[bool]:
    """Rows strictly after ``values`` in the ``keys`` order (the seek predicate)."""
    branches = []
    for i, key in enumerate(keys):
        equal = [k.expr == v for k, v in zip(keys[:i], values[:i], strict=True)]
        beyond = key.expr > values[i] if key.ascending else key.expr < values[i]
        branches.append(and_(*equal, beyond))
    return or_(*branches)


class CompanyQuery(BaseModel):
    """What the lead table (or a segment) asks for: rules, sort and a page."""

    model_config = ConfigDict(extra="forbid")

    rules: list[Rule] = Field(default_factory=list, max_length=100)
    match: Match = "all"
    sort: Sort = Sort()
    product_id: uuid.UUID | None = Field(
        default=None, description="Whose fit to return (and sort by, for key=fit)"
    )
    cursor: str | None = Field(default=None, max_length=4_096)
    limit: int = Field(default=50, ge=1)


async def run_query(
    session: AsyncSession,
    org_id: uuid.UUID,
    query: CompanyQuery,
    *,
    where: ColumnElement[bool],
    limit: int,
    scope: str = "",
) -> Page:
    """One page of companies matching ``where``, plus the total count.

    ``scope`` names what ``where`` adds beyond the rules (e.g. a segment), so a cursor from
    one list can't be replayed against another.
    """
    keys = sort_keys(query.sort, query.product_id)
    fp = fingerprint(query.rules, query.match, query.sort, query.product_id, scope)
    visible = and_(Company.org_id == org_id, where)

    fit_col: Any = Fit.score if query.product_id else literal(None)
    stmt = (
        select(Company, Primary, fit_col.label("fit_score"), *[k.expr for k in keys])
        .outerjoin(
            Primary,
            and_(
                Primary.company_id == Company.id,
                Primary.org_id == Company.org_id,
                Primary.is_primary.is_(True),
            ),
        )
        .where(visible)
    )
    if query.product_id:
        stmt = stmt.outerjoin(
            Fit, and_(Fit.company_id == Company.id, Fit.product_id == query.product_id)
        )
    if query.cursor:
        stmt = stmt.where(after(keys, decode_cursor(query.cursor, keys, fp)))
    order = [k.expr.asc() if k.ascending else k.expr.desc() for k in keys]
    result = await session.execute(stmt.order_by(*order).limit(limit + 1))
    fetched = result.all()

    rows = [CompanyRow(r[0], r[1], r[2]) for r in fetched[:limit]]
    next_cursor = None
    if len(fetched) > limit:
        last = fetched[limit - 1]
        next_cursor = encode_cursor(list(last[3:]), keys, fp)
    total = (
        await session.execute(select(func.count()).select_from(Company).where(visible))
    ).scalar_one()
    return Page(rows=rows, next_cursor=next_cursor, total=total)


def filter_clause(rules: list[Rule], match: Match) -> ColumnElement[bool]:
    return rules_clause(rules, match, empty=True)
