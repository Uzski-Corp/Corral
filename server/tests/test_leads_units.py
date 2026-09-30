"""Pure unit and property tests for the lead CRM: normalisation, rules, cursors."""

import base64
import json
import uuid
from datetime import UTC, datetime

import pytest
from hypothesis import given
from hypothesis import strategies as st
from pydantic import ValidationError

from app.core.config import Settings
from app.leads.normalize import (
    csv_safe,
    full_name,
    is_domain,
    is_email,
    name_key,
    norm_domain,
    norm_email,
    norm_size,
    split_name,
)
from app.leads.query import (
    InvalidCursor,
    NeedsProduct,
    Sort,
    decode_cursor,
    encode_cursor,
    fingerprint,
    sort_keys,
)
from app.leads.rules import Rule, RuleSet
from app.leads.service import Selection
from app.leads.vocab import EMAIL_ORDER, EMAIL_STATUSES, LABELS, REPLY_ORDER, REPLY_STATUSES
from tests.conftest import make_settings

PID = uuid.uuid4()


# --- normalisation -------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "domain"),
    [
        ("https://www.Kilima.co.ke/about", "kilima.co.ke"),
        ("http://acme.com?x=1", "acme.com"),
        ("  WWW.acme.io#top ", "acme.io"),
        ("acme.com", "acme.com"),
    ],
)
def test_norm_domain(raw: str, domain: str) -> None:
    assert norm_domain(raw) == domain


@pytest.mark.parametrize(
    ("raw", "domain"),
    [("0\x85#", "0"), ("x.io /", "x.io"), ("www.www.a.io", "a.io")],
)
def test_norm_domain_strips_whitespace_exposed_by_cutting(raw: str, domain: str) -> None:
    # Regression: hypothesis found "0\x85#" -> "0\x85" (the path cut exposed trailing space).
    assert norm_domain(raw) == domain


@given(st.text(max_size=60))
def test_norm_domain_is_idempotent(value: str) -> None:
    once = norm_domain(value)
    assert norm_domain(once) == once
    assert once == once.lower()


def test_email_and_domain_checks_match_the_client() -> None:
    assert (
        is_email("amina@kilima.co.ke") and not is_email("amina@kilima") and not is_email("a b@x.io")
    )
    assert is_domain("kilima.co.ke") and is_domain("https://www.x.io/a") and not is_domain("kilima")
    assert norm_email("  Amina@Kilima.CO.KE ") == "amina@kilima.co.ke"


@given(st.text(max_size=300))
def test_name_key_is_stable(value: str) -> None:
    key = name_key(value)
    assert name_key(key) == key and len(key) <= 255 and "  " not in key


@pytest.mark.parametrize(
    ("raw", "bucket"),
    [
        ("12", "1-50"),
        ("51-200", "51-200"),
        ("201 to 1,000", "201-1000"),
        ("201\u20131,000", "201-1000"),
        ("1000+", "1000+"),
        ("50+", "51-200"),
        ("5k", "1000+"),
        ("1.5K employees", "1000+"),
        ("about 180 people", "51-200"),
        ("unknown", None),
        ("1.2.3", None),
    ],
)
def test_norm_size(raw: str, bucket: str | None) -> None:
    assert norm_size(raw) == bucket


@given(st.text(max_size=40))
def test_norm_size_never_raises(value: str) -> None:
    assert norm_size(value) in (None, "1-50", "51-200", "201-1000", "1000+")


def test_names() -> None:
    assert split_name(" Wanjiru  Mwangi Njeri ") == ("Wanjiru", "Mwangi Njeri")
    assert split_name("Amina") == ("Amina", None)
    assert full_name("A", None) == "A" and full_name(None, None) is None


@pytest.mark.parametrize("cell", ["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"])
def test_csv_safe_neutralises_formulas(cell: str) -> None:
    assert csv_safe(cell) == "'" + cell


@given(st.text(max_size=30))
def test_csv_safe_output_never_starts_a_formula(value: str) -> None:
    out = csv_safe(value)
    assert not out or out[0] not in "=+-@\t\r"
    assert out.endswith(value)


def test_vocab_orders_cover_every_status() -> None:
    assert sorted(REPLY_ORDER) == sorted(REPLY_STATUSES)
    assert sorted(EMAIL_ORDER) == sorted(EMAIL_STATUSES)
    assert all(code in LABELS for code in (*REPLY_STATUSES, *EMAIL_STATUSES))


# --- rules validation ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("rule", "message"),
    [
        ({"field": "fit", "op": "is", "value": ["1"]}, "doesn't apply"),
        ({"field": "fit", "op": "gte", "value": "80", "product_id": str(PID)}, "Enter a number"),
        ({"field": "fit", "op": "gte", "value": True, "product_id": str(PID)}, "valid"),
        ({"field": "fit", "op": "gte", "value": 101, "product_id": str(PID)}, "0-100"),
        ({"field": "fit", "op": "gte", "value": 80}, "Pick the product"),
        ({"field": "country", "op": "is", "value": ["KE"], "product_id": str(PID)}, "only applies"),
        ({"field": "title", "op": "contains", "value": "  "}, "Enter some text"),
        ({"field": "title", "op": "contains", "value": ["x"]}, "Enter some text"),
        ({"field": "title", "op": "contains", "value": "x" * 201}, "under 200"),
        ({"field": "country", "op": "is", "value": []}, "at least one"),
        ({"field": "country", "op": "is", "value": "KE"}, "at least one"),
        ({"field": "country", "op": "is", "value": ["x"] * 101}, "at most 100"),
        ({"field": "reply", "op": "is", "value": ["Interested"]}, "Unknown reply"),
        ({"field": "size", "op": "not", "value": ["huge"]}, "Unknown size"),
    ],
)
def test_unfinished_rules_are_rejected(rule: dict[str, object], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        Rule.model_validate(rule)


def test_valid_rules() -> None:
    rs = RuleSet.model_validate(
        {
            "match": "any",
            "rules": [
                {"field": "fit", "op": "gte", "value": 80, "product_id": str(PID)},
                {"field": "reply", "op": "not", "value": ["unsubscribed"]},
                {"field": "title", "op": "contains", "value": "ops"},
                {"field": "country", "op": "is", "value": ["Kenya"]},
            ],
        }
    )
    assert rs.match == "any" and len(rs.rules) == 4


def test_selection_is_ids_or_all() -> None:
    assert Selection.model_validate({"ids": [str(PID)]}).ids == [PID]
    assert Selection.model_validate({"all": True}).all
    country = {"field": "country", "op": "is", "value": ["KE"]}
    bad_selections: list[dict[str, object]] = [
        {},
        {"ids": [str(PID)], "all": True},
        {"ids": [str(PID)], "rules": [country]},
        {"ids": []},
    ]
    for bad in bad_selections:
        with pytest.raises(ValidationError):
            Selection.model_validate(bad)


def test_bulk_limits_are_validated() -> None:
    with pytest.raises(ValidationError, match="LEADS_BULK_MAX_IDS"):
        make_settings(leads_bulk_max_ids=10, leads_bulk_max_rows=5)
    assert isinstance(make_settings(leads_unsubscribe_scope="company"), Settings)


# --- cursors ------------------------------------------------------------------------------


def test_fit_sort_needs_a_product() -> None:
    with pytest.raises(NeedsProduct):
        sort_keys(Sort(key="fit"), None)


@given(
    st.sampled_from(["company", "person", "fit", "email", "reply", "last", "created"]),
    st.sampled_from(["asc", "desc"]),
    st.integers(-1, 100),
    st.text(max_size=20),
    st.datetimes(timezones=st.just(UTC)),
    st.uuids(),
)
def test_cursor_round_trips(
    key: str, direction: str, n: int, s: str, ts: datetime, u: uuid.UUID
) -> None:
    sort = Sort.model_validate({"key": key, "dir": direction})
    keys = sort_keys(sort, PID)
    sample = {"int": n, "str": s, "ts": ts, "uuid": u}
    values = [sample[k.kind] for k in keys]
    fp = fingerprint([], "all", sort, PID)
    assert decode_cursor(encode_cursor(values, keys, fp), keys, fp) == values


def _raw(payload: object) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")


@pytest.mark.parametrize(
    "cursor",
    [
        "!!!",
        base64.urlsafe_b64encode(b"\xff\xfe").decode(),
        _raw([1, 2]),
        _raw({"f": "other", "v": []}),
        _raw({"f": "FP", "v": "x"}),
        _raw({"f": "FP", "v": ["a"]}),
        _raw({"f": "FP", "v": ["2026-01-01T00:00:00", "a", str(PID)]}),
        _raw({"f": "FP", "v": [5, "a", str(PID)]}),
        _raw({"f": "FP", "v": ["2026-01-01T00:00:00+00:00", 3, str(PID)]}),
        _raw({"f": "FP", "v": ["2026-01-01T00:00:00+00:00", "a", "not-a-uuid"]}),
    ],
)
def test_bad_cursors_are_rejected(cursor: str) -> None:
    sort = Sort()
    keys = sort_keys(sort, None)
    fp = fingerprint([], "all", sort, None)
    cursor = cursor.replace("FP", fp) if "FP" not in cursor else cursor
    raw = cursor
    try:
        decoded = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))
        if isinstance(decoded, dict) and decoded.get("f") == "FP":
            raw = _raw({**decoded, "f": fp})
    except (ValueError, UnicodeDecodeError):
        pass
    with pytest.raises(InvalidCursor):
        decode_cursor(raw, keys, fp)


def test_int_cursor_values_must_be_ints() -> None:
    sort = Sort(key="reply")
    keys = sort_keys(sort, None)
    fp = fingerprint([], "all", sort, None)
    with pytest.raises(InvalidCursor):
        decode_cursor(_raw({"f": fp, "v": [True, "a", str(PID)]}), keys, fp)


def test_fingerprint_depends_on_the_query() -> None:
    rule = Rule.model_validate({"field": "country", "op": "is", "value": ["KE"]})
    a = fingerprint([rule], "all", Sort(), None)
    assert a != fingerprint([rule], "any", Sort(), None)
    assert a != fingerprint([], "all", Sort(), None)
    assert a != fingerprint([rule], "all", Sort(dir="asc"), None)
    assert a != fingerprint([rule], "all", Sort(), None, "segment:x")
