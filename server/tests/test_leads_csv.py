"""CSV import, the pure part: decoding, parsing, mapping, validation, dedupe and fuzzing."""

import csv
import io

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.leads.csv_import import (
    CsvLimits,
    ImportRejected,
    Record,
    Target,
    check_file,
    classify,
    decode,
    detect_delimiter,
    errors_csv,
    mapping_issues,
    parse_csv,
    plan_of,
    read_file,
    record_of,
    row_errors,
)

LIMITS = CsvLimits()
MAPPING: list[Target] = ["company", "domain", "name", "email", "title"]
HEADER = "Company,Website,Name,Email,Title\n"


def rejected(code: str) -> pytest.RaisesExc[ImportRejected]:
    return pytest.raises(ImportRejected, match=f"^{code}$")


def records(text: str, mapping: list[Target] = MAPPING) -> list[Record]:
    return read_file(text.encode(), mapping, LIMITS)[1]


# --- the file -------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("name", "size", "code", "status"),
    [
        ("leads.xlsx", 10, "unsupported", 415),
        ("leads.pdf", 10, "unsupported", 415),
        ("leads", 10, "unsupported", 415),
        ("leads.csv", 0, "empty", 422),
        ("leads.csv", LIMITS.max_bytes + 1, "too_large", 413),
    ],
)
def test_check_file(name: str, size: int, code: str, status: int) -> None:
    with rejected(code) as exc:
        check_file(name, size, LIMITS)
    assert exc.value.status_code == status


def test_check_file_accepts_text_exports() -> None:
    for name in ("a.csv", "B.TSV", "c.txt"):
        check_file(name, 5, LIMITS)


@pytest.mark.parametrize(
    ("data", "text"),
    [
        ("\ufeffa,b".encode(), "a,b"),
        ("a,b".encode("utf-16"), "a,b"),
        ("Caf\u00e9,b".encode("cp1252"), "Caf\u00e9,b"),
        ("\u00e9,b".encode(), "\u00e9,b"),
    ],
)
def test_decode(data: bytes, text: str) -> None:
    assert decode(data, "cp1252") == text


def test_decode_rejects() -> None:
    with rejected("encoding"):
        decode(b"\xff\xfeA", "cp1252")  # odd-length UTF-16
    with rejected("encoding"):
        decode("Caf\u00e9".encode("cp1252"), "")
    with rejected("not_text"):
        decode(b"a,b\x00c", "cp1252")


def test_detect_delimiter() -> None:
    assert detect_delimiter("a;b;c") == ";"
    assert detect_delimiter("a\tb") == "\t"
    assert detect_delimiter("a,b;c") == ","
    assert detect_delimiter("single") == ","


def test_parse_trims_and_drops_blank_rows() -> None:
    parsed = parse_csv('Company;Email\r\n  Acme ; a@acme.io \r\n;\r\n\r\n"B, Ltd";\r\n', LIMITS)
    assert parsed.delimiter == ";"
    assert parsed.headers == ["Company", "Email"]
    assert parsed.rows == [["Acme", "a@acme.io"], ["B, Ltd", ""]]


@pytest.mark.parametrize(
    ("text", "code"),
    [
        ("\n\n", "empty"),
        ("Company\nAcme\n", "one_column"),
        ("Company,Email\n", "no_rows"),
        ('Company,Email\n"Acme,a@x.io\n', "malformed"),
    ],
)
def test_parse_rejections(text: str, code: str) -> None:
    with rejected(code):
        parse_csv(text, LIMITS)


def test_parse_limits() -> None:
    small = CsvLimits(max_rows=2, max_columns=3, max_field_chars=5)
    parse_csv("a,b\n1,2\n3,4\n", small)
    with rejected("too_many_rows"):
        parse_csv("a,b\n1,2\n3,4\n5,6\n", small)
    with rejected("too_many_columns"):
        parse_csv("a,b,c,d\n1,2,3,4\n", small)
    with rejected("field_too_large"):
        parse_csv("a,b\n123456,2\n", small)
    # The csv module's own 128 KiB cap never gets a chance to fire first.
    with rejected("field_too_large"):
        parse_csv("a,b\n" + "x" * 200_000 + ",2\n", LIMITS)


# --- mapping ------------------------------------------------------------------------------


def test_mapping_issues() -> None:
    headers = ["Company", "Name", "First", "Email", "Work email"]
    issues = mapping_issues(["skip", "name", "first", "email", "email"], headers)
    assert [i.kind for i in issues] == ["missing-company", "twice", "name-split"]
    assert issues[1].columns == (3, 4)
    assert "\u201cEmail\u201d and \u201cWork email\u201d" in issues[1].message
    assert [i.kind for i in mapping_issues(["company"], headers)] == ["length"]
    assert mapping_issues(["domain", "skip", "skip", "email", "skip"], headers) == []


def test_read_file_rejects_a_bad_mapping() -> None:
    with rejected("mapping"):
        read_file(b"a,b\n1,2\n", ["email", "title"], LIMITS)


# --- rows ---------------------------------------------------------------------------------


def test_record_normalises() -> None:
    [r] = records(HEADER + "Acme,https://WWW.Acme.io/x,Amina Njeri Otieno,AMINA@acme.io,CEO\n")
    assert r.row == 2
    assert r.values == {
        "company": "Acme",
        "domain": "acme.io",
        "name": "Amina Njeri Otieno",
        "first": "Amina",
        "last": "Njeri Otieno",
        "email": "amina@acme.io",
        "title": "CEO",
    }


def test_record_edge_values() -> None:
    mapping: list[Target] = ["company", "domain", "size", "name", "first"]
    r = record_of(3, ["Acme", "https://", "lots", "Amina", "Wanjiru"], mapping)
    assert r.values == {"company": "Acme", "name": "Amina", "first": "Wanjiru"}
    short = record_of(4, ["Acme"], mapping)  # rows shorter than the header
    assert short.values == {"company": "Acme"}
    one = record_of(
        5, ["Acme", "", "51-200", "Amina", ""], ["company", "domain", "size", "name", "skip"]
    )
    assert one.values == {"company": "Acme", "size": "51-200", "name": "Amina", "first": "Amina"}


def test_row_errors() -> None:
    bad = record_of(2, ["", "", "", "not-an-email", ""], MAPPING)
    assert [(e.field, e.message) for e in row_errors(bad)] == [
        ("company", "No company name or website"),
        ("email", "Not an email address"),
    ]
    site = record_of(3, ["Acme", "kilima", "", "", ""], MAPPING)
    assert [e.message for e in row_errors(site)] == ["Not a website"]
    long = record_of(4, ["A" * 300, "", "", "", ""], MAPPING)
    assert [e.message for e in row_errors(long)] == ["Longer than 255 characters"]


def test_classify_and_plan() -> None:
    rows = records(
        HEADER
        + "Acme,acme.io,,a@acme.io,\n"  # new
        + "Acme,acme.io,,A@ACME.IO,\n"  # in-file repeat by email
        + "Acme,acme.io,,,\n"  # in-file repeat by website (no email)
        + "Beta,beta.io,,b@beta.io,\n"  # existing by email
        + "Gamma,gamma.io,,,\n"  # existing by website
        + "Gamma,gamma.io,,g@gamma.io,\n"  # new person at an existing company
        + ",,,,\n"  # blank: dropped
        + ",,Amina,,\n"  # error: no company
        + "Delta,,,bad,\n"  # error
        + "Zeta,,,bad,\n"  # error rows don't claim...
        + "Eta,eta.io,,,\n"
    )
    c = classify(rows, existing_emails={"b@beta.io"}, existing_domains={"gamma.io"})
    assert c.outcomes == [
        "new",
        "in_file",
        "in_file",
        "existing_email",
        "existing_domain",
        "new",
        "error",
        "error",
        "error",
        "new",
    ]
    assert plan_of(c, "skip") == plan_of(c, "skip")
    skip = plan_of(c, "skip")
    assert (skip.total, skip.create, skip.update, skip.skipped, skip.errors) == (10, 3, 0, 4, 3)
    assert (skip.in_file, skip.existing) == (2, 2)
    fill = plan_of(c, "fill")
    assert (fill.update, fill.skipped) == (2, 2)


def test_broken_rows_do_not_claim_an_address() -> None:
    rows = records(HEADER + ",,,a@acme.io,\nAcme,,,a@acme.io,\n")
    assert classify(rows, existing_emails=set(), existing_domains=set()).outcomes == [
        "error",
        "new",
    ]


def test_errors_csv_is_injection_safe() -> None:
    text = HEADER + "=HYPERLINK(1),,,bad,\nOk,ok.io,,,\n"
    parsed, rows = read_file(text.encode(), MAPPING, LIMITS)
    c = classify(rows, existing_emails=set(), existing_domains=set())
    out = errors_csv(parsed, c)
    assert out is not None and out.startswith("\ufeff".encode())
    table = list(csv.reader(io.StringIO(out.decode("utf-8-sig"))))
    assert table[0] == ["Row", "Company", "Website", "Name", "Email", "Title", "Problem"]
    assert table[1] == ["2", "'=HYPERLINK(1)", "", "", "bad", "", "Not an email address"]
    assert len(table) == 2
    clean = classify(rows[1:], existing_emails=set(), existing_domains=set())
    assert errors_csv(parsed, clean) is None


# --- properties and fuzzing ---------------------------------------------------------------


@settings(max_examples=300, suppress_health_check=[HealthCheck.too_slow])
@given(st.binary(max_size=2_000))
def test_random_bytes_only_ever_raise_import_rejected(data: bytes) -> None:
    try:
        parsed, rows = read_file(data, ["company", "email"], CsvLimits(max_rows=50))
    except ImportRejected as exc:
        assert exc.code in {
            "empty", "encoding", "not_text", "one_column", "no_rows", "too_many_rows",
            "too_many_columns", "field_too_large", "malformed", "mapping",
        }  # fmt: skip
        return
    c = classify(rows, existing_emails=set(), existing_domains=set())
    plan = plan_of(c, "skip")
    assert plan.total == len(parsed.rows)


cell = st.text(
    alphabet=st.characters(blacklist_categories=["Cs"], blacklist_characters="\x00"), max_size=12
)


@settings(max_examples=150)
@given(
    st.lists(st.lists(cell, min_size=3, max_size=3), min_size=1, max_size=15),
    st.sampled_from([",", ";", "\t"]),
)
def test_csv_writer_round_trips(rows: list[list[str]], delimiter: str) -> None:
    out = io.StringIO()
    writer = csv.writer(out, delimiter=delimiter)
    headers = [f"h{delimiter}1", "h2", "h3"] if delimiter == "," else ["Company", "Email", "Title"]
    writer.writerow(headers)
    writer.writerows(rows)
    try:
        parsed = parse_csv(out.getvalue(), LIMITS)
    except ImportRejected as exc:
        assert exc.code == "no_rows"
        assert all(not "".join(c.strip() for c in r) for r in rows)
        return
    expected = [[c.strip() for c in r] for r in rows if any(c.strip() for c in r)]
    assert parsed.rows == expected


emails = st.sampled_from(["a@x.io", "b@x.io", "c@y.io", "", "bad"])
domains = st.sampled_from(["x.io", "y.io", "z.io", "", "nope"])


@settings(max_examples=300)
@given(
    st.lists(st.tuples(st.sampled_from(["Acme", ""]), domains, emails), max_size=25),
    st.frozensets(st.sampled_from(["a@x.io", "c@y.io"])),
    st.frozensets(st.sampled_from(["x.io", "z.io"])),
    st.sampled_from(["skip", "fill", "overwrite"]),
)
def test_dedupe_properties(
    rows: list[tuple[str, str, str]],
    known_emails: frozenset[str],
    known_domains: frozenset[str],
    policy: str,
) -> None:
    mapping: list[Target] = ["company", "domain", "email"]
    recs = [record_of(i + 2, list(r), mapping) for i, r in enumerate(rows)]
    c = classify(recs, existing_emails=known_emails, existing_domains=known_domains)
    plan = plan_of(c, policy)  # type: ignore[arg-type]
    # Every row is counted exactly once.
    assert plan.create + plan.update + plan.skipped + plan.errors == plan.total == len(rows)
    new_emails = [
        r.email for r, o in zip(c.records, c.outcomes, strict=True) if o == "new" and r.email
    ]
    # A new row's email is never already known, and never repeated among new rows.
    assert not set(new_emails) & known_emails
    assert len(new_emails) == len(set(new_emails))
    for r, o in zip(c.records, c.outcomes, strict=True):
        if o == "existing_email":
            assert r.email in known_emails
        if o == "existing_domain":
            assert not r.email and r.domain in known_domains


def test_injection_payloads_survive_import_verbatim() -> None:
    payloads = [
        "=1+1",
        "+cmd|' /C calc'!A0",
        "-2",
        "@SUM(1)",
        "<script>x</script>",
        "Robert'); DROP TABLE",
    ]
    text = "Company,Notes\n" + "".join(f'"{p}",n\n' for p in payloads)
    got = [r.values["company"] for r in read_file(text.encode(), ["company", "notes"], LIMITS)[1]]
    assert got == payloads  # stored as typed; neutralised only on export
