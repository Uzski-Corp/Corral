"""CSV import, the pure part: decode, parse, map columns, validate and classify rows.

Mirrors ``lib/leads/import.ts`` (the client previews with it) so the numbers the user
approved are the numbers the server imports:

* Delimiter: whichever of comma, semicolon or tab splits the header line into most columns.
* Encoding: UTF-8 with or without BOM, UTF-16 with a BOM, else the configured fallback.
* Rows: cells trimmed, blank rows dropped; spreadsheet row numbers (header is row 1).
* Duplicates: by work email first; rows without an email by website domain. A repeat
  inside the file keeps the first row. One deliberate difference from the client: only
  *valid* rows claim an email/website, so a broken row can't make a later good row look
  like its duplicate.

Nothing here touches the database; ``app.leads.importer`` applies a classified file.
"""

import csv
import io
import os
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Final, Literal, get_args

from app.core.config import Settings
from app.leads.normalize import (
    csv_safe,
    is_domain,
    is_email,
    norm_domain,
    norm_email,
    norm_size,
    split_name,
)

FieldId = Literal[
    "company",
    "domain",
    "country",
    "size",
    "industry",
    "name",
    "first",
    "last",
    "email",
    "title",
    "phone",
    "linkedin",
    "notes",
]
FIELD_IDS: Final[tuple[FieldId, ...]] = get_args(FieldId)
Target = FieldId | Literal["skip"]
Policy = Literal["skip", "fill", "overwrite"]
ACCEPTED_EXTENSIONS: Final = frozenset({".csv", ".tsv", ".txt"})

MAX_CHARS: Final[dict[str, int]] = {
    "company": 255,
    "domain": 255,
    "country": 100,
    "size": 50,
    "industry": 120,
    "name": 200,
    "first": 100,
    "last": 100,
    "email": 320,
    "title": 255,
    "phone": 50,
    "linkedin": 500,
    "notes": 5_000,
}


class ImportRejected(Exception):
    """The file as a whole can't be imported (as opposed to individual bad rows)."""

    def __init__(self, code: str, detail: str, status_code: int = 422) -> None:
        super().__init__(code)
        self.code = code
        self.detail = detail
        self.status_code = status_code


@dataclass(frozen=True, slots=True)
class CsvLimits:
    max_bytes: int = 20 * 1024 * 1024
    max_rows: int = 50_000
    max_columns: int = 100
    max_field_chars: int = 10_000
    fallback_encoding: str = "cp1252"

    @classmethod
    def from_settings(cls, settings: Settings) -> "CsvLimits":
        return cls(
            max_bytes=settings.leads_import_max_bytes,
            max_rows=settings.leads_import_max_rows,
            max_columns=settings.leads_import_max_columns,
            max_field_chars=settings.leads_import_max_field_chars,
            fallback_encoding=settings.leads_import_fallback_encoding,
        )


@dataclass(frozen=True, slots=True)
class ParsedCsv:
    headers: list[str]
    rows: list[list[str]]
    delimiter: str


# --- file ---------------------------------------------------------------------------------


def check_file(filename: str, size: int, limits: CsvLimits) -> None:
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ACCEPTED_EXTENSIONS:
        fix = (
            "In Excel, choose File > Save As > CSV UTF-8, then add that file."
            if ext in (".xlsx", ".xls")
            else "Export it as CSV (comma-separated, UTF-8), then add that file."
        )
        raise ImportRejected(
            "unsupported", f"{ext or 'Files without an extension'} can't be imported. {fix}", 415
        )
    if size == 0:
        raise ImportRejected("empty", "This file is empty.")
    if size > limits.max_bytes:
        raise ImportRejected(
            "too_large", f"Imports can be up to {limits.max_bytes // (1024 * 1024)} MB.", 413
        )


def decode(data: bytes, fallback: str) -> str:
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        try:
            text = data.decode("utf-16")
        except UnicodeDecodeError as exc:
            raise ImportRejected("encoding", "The file says UTF-16 but isn't.") from exc
    else:
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            if not fallback:
                raise ImportRejected(
                    "encoding", "Save the file as CSV UTF-8 and add it again."
                ) from exc
            text = data.decode(fallback, errors="replace")
    if "\x00" in text:
        raise ImportRejected("not_text", "This doesn't look like a text CSV file.", 415)
    return text.lstrip("\ufeff")


def detect_delimiter(first_line: str) -> str:
    best, count = ",", 0
    for candidate in (",", ";", "\t"):
        n = len(first_line.split(candidate))
        if n > count:
            best, count = candidate, n
    return best


def parse_csv(text: str, limits: CsvLimits) -> ParsedCsv:
    first_line = text.split("\n", 1)[0].rstrip("\r")
    delimiter = detect_delimiter(first_line)
    reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter, strict=True)
    rows: list[list[str]] = []
    try:
        for raw in reader:
            if any(len(cell) > limits.max_field_chars for cell in raw):
                raise ImportRejected(
                    "field_too_large",
                    f"Row {reader.line_num} has a cell over {limits.max_field_chars:,} characters.",
                )
            cells = [cell.strip() for cell in raw]
            if not any(cells):
                continue
            rows.append(cells)
            if len(rows) > limits.max_rows + 1:  # + the header
                raise ImportRejected(
                    "too_many_rows",
                    f"Imports can have up to {limits.max_rows:,} rows. Split the file.",
                )
    except csv.Error as exc:
        if "field limit" in str(exc):  # the csv module's own cap (128 KiB) fired first
            raise ImportRejected(
                "field_too_large",
                f"Line {reader.line_num} has a cell over {limits.max_field_chars:,} characters.",
            ) from exc
        raise ImportRejected(
            "malformed", f"Couldn't read line {reader.line_num}: check its quotes."
        ) from exc
    if not rows:
        raise ImportRejected("empty", "This file is empty.")
    headers, body = rows[0], rows[1:]
    if len(headers) > limits.max_columns:
        raise ImportRejected(
            "too_many_columns", f"Imports can have up to {limits.max_columns} columns."
        )
    if len(headers) < 2:
        raise ImportRejected(
            "one_column",
            "Corral needs a header row and at least two columns, like Company and Email.",
        )
    if not body:
        raise ImportRejected("no_rows", "No rows under the header.")
    return ParsedCsv(headers=headers, rows=body, delimiter=delimiter)


# --- mapping -------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class MappingIssue:
    kind: Literal["length", "missing-company", "twice", "name-split"]
    message: str
    columns: tuple[int, ...] = ()


def mapping_issues(mapping: Sequence[Target], headers: Sequence[str]) -> list[MappingIssue]:
    """Blocking problems with the mapping itself (same three checks as the client)."""
    if len(mapping) != len(headers):
        return [
            MappingIssue(
                "length", f"The mapping has {len(mapping)} columns; the file has {len(headers)}."
            )
        ]
    issues: list[MappingIssue] = []
    if "company" not in mapping and "domain" not in mapping:
        issues.append(
            MappingIssue(
                "missing-company",
                "Map a column to Company name or Website. Corral needs one of them.",
            )
        )
    for target in FIELD_IDS:
        cols = tuple(i for i, t in enumerate(mapping) if t == target)
        if len(cols) > 1:
            names = " and ".join(f"\u201c{headers[c]}\u201d" for c in cols)
            issues.append(MappingIssue("twice", f"{names} both map to {target}.", cols))
    if "name" in mapping and ("first" in mapping or "last" in mapping):
        issues.append(
            MappingIssue("name-split", "Use Full name, or First name and Last name, not both.")
        )
    return issues


# --- rows ---------------------------------------------------------------------------------


@dataclass(slots=True)
class Record:
    """One row, mapped and normalised. Only non-empty values are present."""

    row: int  # spreadsheet row number (header = 1)
    values: dict[str, str]
    cells: list[str]

    @property
    def email(self) -> str | None:
        return self.values.get("email")

    @property
    def domain(self) -> str | None:
        return self.values.get("domain")


@dataclass(frozen=True, slots=True)
class RowError:
    row: int
    field: str
    value: str
    message: str


def record_of(row_number: int, cells: list[str], mapping: Sequence[Target]) -> Record:
    values: dict[str, str] = {}
    for i, target in enumerate(mapping):
        if target != "skip" and i < len(cells) and cells[i]:
            values[target] = cells[i]
    if "domain" in values:
        values["domain"] = norm_domain(values["domain"])
        if not values["domain"]:
            del values["domain"]
    if "email" in values:
        values["email"] = norm_email(values["email"])
    if "name" in values and "first" not in values and "last" not in values:
        first, last = split_name(values["name"])
        values["first"] = first
        if last:
            values["last"] = last
    if "size" in values:
        bucket = norm_size(values["size"])
        if bucket is None:
            del values["size"]
        else:
            values["size"] = bucket
    return Record(row=row_number, values=values, cells=cells)


def row_errors(record: Record) -> list[RowError]:
    out: list[RowError] = []
    v = record.values
    if not v.get("company") and not v.get("domain"):
        out.append(RowError(record.row, "company", "", "No company name or website"))
    if record.email and not is_email(record.email):
        out.append(RowError(record.row, "email", record.email, "Not an email address"))
    if record.domain and not is_domain(record.domain):
        out.append(RowError(record.row, "domain", record.domain, "Not a website"))
    for name, value in v.items():
        limit = MAX_CHARS[name]
        if len(value) > limit:
            out.append(RowError(record.row, name, value[:40], f"Longer than {limit} characters"))
    return out


Outcome = Literal["error", "in_file", "existing_email", "existing_domain", "new"]


@dataclass(slots=True)
class Classified:
    records: list[Record]
    outcomes: list[Outcome]
    errors: list[RowError] = field(default_factory=list)

    def count(self, *outcomes: Outcome) -> int:
        return sum(1 for o in self.outcomes if o in outcomes)


def classify(
    records: Iterable[Record],
    *,
    existing_emails: set[str] | frozenset[str],
    existing_domains: set[str] | frozenset[str],
) -> Classified:
    """Label every row: bad, repeated in the file, already in Corral, or new."""
    seen_email: set[str] = set()
    seen_domain: set[str] = set()
    result = Classified(records=[], outcomes=[])
    for record in records:
        result.records.append(record)
        problems = row_errors(record)
        if problems:
            result.errors.extend(problems)
            result.outcomes.append("error")
            continue
        email, domain = record.email, record.domain
        outcome: Outcome
        if email and email in existing_emails:
            outcome = "existing_email"
        elif email and email in seen_email:
            outcome = "in_file"
        elif not email and domain and domain in existing_domains:
            outcome = "existing_domain"
        elif not email and domain and domain in seen_domain:
            outcome = "in_file"
        else:
            outcome = "new"
        if email:
            seen_email.add(email)
        if domain:
            seen_domain.add(domain)
        result.outcomes.append(outcome)
    return result


@dataclass(frozen=True, slots=True)
class Plan:
    total: int
    create: int
    update: int
    skipped: int
    errors: int
    in_file: int
    existing: int


def plan_of(classified: Classified, policy: Policy) -> Plan:
    existing = classified.count("existing_email", "existing_domain")
    in_file = classified.count("in_file")
    return Plan(
        total=len(classified.outcomes),
        create=classified.count("new"),
        update=0 if policy == "skip" else existing,
        skipped=in_file + (existing if policy == "skip" else 0),
        errors=classified.count("error"),
        in_file=in_file,
        existing=existing,
    )


def errors_csv(parsed: ParsedCsv, classified: Classified) -> bytes | None:
    """The rows left behind, with their problems, safe to open in a spreadsheet."""
    problems: dict[int, list[str]] = {}
    for err in classified.errors:
        problems.setdefault(err.row, []).append(err.message)
    if not problems:
        return None
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow([csv_safe(h) for h in ["Row", *parsed.headers, "Problem"]])
    for record in classified.records:
        if record.row in problems:
            writer.writerow(
                [
                    str(record.row),
                    *(csv_safe(c) for c in record.cells),
                    csv_safe("; ".join(problems[record.row])),
                ]
            )
    return ("\ufeff" + out.getvalue()).encode("utf-8")


def read_file(
    data: bytes, mapping: Sequence[Target], limits: CsvLimits
) -> tuple[ParsedCsv, list[Record]]:
    """Decode, parse and map. Raises ``ImportRejected`` for file-level problems."""
    parsed = parse_csv(decode(data, limits.fallback_encoding), limits)
    issues = mapping_issues(mapping, parsed.headers)
    if issues:
        raise ImportRejected("mapping", " ".join(i.message for i in issues))
    records = [record_of(i + 2, row, mapping) for i, row in enumerate(parsed.rows)]
    return parsed, records
