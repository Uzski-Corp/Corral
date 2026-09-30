"""Parsers on good, odd and hostile input. Fuzzing asserts one contract: a parser either
returns located text or raises ``IngestFailure``; it never crashes or hangs."""

import io
import zipfile
from dataclasses import replace

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.kb.errors import IngestFailure, skip_reason
from app.kb.files import OLE_MAGIC
from app.kb.parsing import (
    LOC_MAX_CHARS,
    ParsedDocument,
    ParseLimits,
    Section,
    clean_text,
    count_words,
    decode_text,
    heading_path,
    markdown_sections,
    page_ranges,
    parse_document,
    parse_html,
)
from tests.conftest import make_settings
from tests.kb_fixtures import (
    GATEWAY_PAGES,
    OBJECTIONS,
    PITCH_LOCS,
    PITCH_MD,
    PITCH_WORDS,
    docx_xml,
    encrypt_pdf,
    make_docx,
    make_pdf,
)

LIMITS = ParseLimits()
MB = 1024 * 1024


def fails(kind: str, data: bytes, limits: ParseLimits = LIMITS) -> IngestFailure:
    with pytest.raises(IngestFailure) as info:
        parse_document(kind, data, limits)  # type: ignore[arg-type]
    return info.value


def test_limits_from_settings() -> None:
    limits = ParseLimits.from_settings(
        make_settings(kb_max_pages=7, kb_min_page_chars=3, kb_reject_active_content=False)
    )
    assert (limits.max_pages, limits.min_page_chars, limits.reject_active_content) == (7, 3, False)


# --- helpers -------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("pages", "label"),
    [
        ([3], "page 3"),
        ([12, 13, 14, 15, 16, 17, 18], "pages 12\u201318"),
        ([2, 5, 6, 7, 9], "pages 2, 5\u20137, 9"),
        ([4, 4, 1], "pages 1, 4"),
    ],
)
def test_page_ranges(pages: list[int], label: str) -> None:
    assert page_ranges(pages) == label


def test_page_ranges_are_capped() -> None:
    label = page_ranges(range(1, 1000, 2))
    assert len(label) == 255
    assert label.endswith("\u2026")


def test_clean_text() -> None:
    raw = "  a\u00a0\u00a0b\t\tc \r\n\r\n\r\n\r\nd\x00e\x07  \n"
    assert clean_text(raw) == "a b c\n\nde"


def test_parsed_document_properties() -> None:
    doc = ParsedDocument((Section("p.1", "abc"), Section(None, "de")))
    assert (doc.partial, doc.char_count) == (False, 5)
    assert replace(doc, skipped="page 2").partial


# --- PDF -------------------------------------------------------------------------------


def test_pdf_pages_become_located_sections() -> None:
    doc = parse_document(
        "pdf", make_pdf(["First page text here.", "Second page has text too."]), LIMITS
    )
    assert [s.loc for s in doc.sections] == ["p.1", "p.2"]
    assert (doc.pages_total, doc.pages_read, doc.skipped, doc.note) == (2, 2, None, None)
    assert doc.skipped_reason is None
    assert not doc.partial


def test_scanned_pages_make_a_partial_read() -> None:
    doc = parse_document("pdf", make_pdf(GATEWAY_PAGES), LIMITS)
    assert doc.partial
    assert (doc.pages_total, doc.pages_read, doc.skipped) == (3, 2, "page 2")
    assert doc.skipped_reason == "scanned"
    assert doc.note == "1 page is a scanned image with no text layer."


def test_several_scanned_pages_are_named() -> None:
    doc = parse_document("pdf", make_pdf(["enough text on page one", None, None, None]), LIMITS)
    assert doc.skipped == "pages 2\u20134"
    assert doc.note == "3 pages are scanned images with no text layer."


def test_pages_with_too_little_text_count_as_scans() -> None:
    doc = parse_document("pdf", make_pdf(["Real content on this page.", "12"]), LIMITS)
    assert doc.skipped == "page 2"


def test_a_fully_scanned_pdf_has_no_text() -> None:
    assert fails("pdf", make_pdf([None, None])).failure == "no-text"


def test_page_limit_reads_the_first_pages_only() -> None:
    doc = parse_document(
        "pdf",
        make_pdf([f"this is page number {i} of the text" for i in range(1, 6)]),
        replace(LIMITS, max_pages=2),
    )
    assert (doc.pages_total, doc.pages_read, doc.skipped) == (5, 2, "pages 3\u20135")
    assert doc.skipped_reason == "size-limit"
    assert doc.note == "Only the first 2 pages were read (size limit)."


def test_scanned_pages_and_the_page_limit_together_are_mixed() -> None:
    doc = parse_document(
        "pdf",
        make_pdf(
            [
                "enough text on page one",
                None,
                "enough text on page three",
                "enough text on page four",
            ]
        ),
        replace(LIMITS, max_pages=3),
    )
    assert (doc.skipped, doc.skipped_reason) == ("pages 2, 4", "mixed")


def test_text_limit_stops_reading() -> None:
    doc = parse_document(
        "pdf", make_pdf(["a" * 40, "b" * 40, "c" * 40]), replace(LIMITS, max_text_chars=50)
    )
    assert [s.text for s in doc.sections] == ["a" * 40, "b" * 10]
    assert (doc.skipped, doc.skipped_reason) == ("page 3", "size-limit")


def test_password_protected_pdf_is_encrypted() -> None:
    failure = fails("pdf", encrypt_pdf(make_pdf(["secret text here"]), user_password="pw"))
    assert (failure.failure, failure.stage) == ("encrypted", "scan")


def test_owner_password_only_pdf_opens() -> None:
    data = encrypt_pdf(make_pdf(["printable but locked for editing"]), user_password="")
    assert parse_document("pdf", data, LIMITS).sections[0].text.startswith("printable")


@pytest.mark.parametrize(
    "extra",
    [
        "/OpenAction << /S /JavaScript /JS (app.alert(1)) >>",
        "/Names << /JavaScript << /Names [] >> >>",
        "/Names << /EmbeddedFiles << /Names [] >> >>",
    ],
)
def test_active_pdf_content_is_rejected(extra: str) -> None:
    data = make_pdf(["this document looks harmless"], catalog_extra=extra)
    failure = fails("pdf", data)
    assert (failure.failure, failure.stage) == ("rejected", "scan")
    # ... unless the operator turns the policy off (we never execute it either way).
    relaxed = parse_document("pdf", data, replace(LIMITS, reject_active_content=False))
    assert relaxed.sections


def test_a_goto_open_action_is_fine() -> None:
    data = make_pdf(
        ["a perfectly normal document"], catalog_extra="/OpenAction << /S /GoTo /D [4 0 R /Fit] >>"
    )
    assert parse_document("pdf", data, LIMITS).sections


def test_a_page_that_fails_to_extract_is_skipped(monkeypatch: pytest.MonkeyPatch) -> None:
    from pypdf import PageObject

    original = PageObject.extract_text
    calls = {"n": 0}

    def flaky(self: PageObject, *args: object, **kwargs: object) -> str:
        calls["n"] += 1
        if calls["n"] == 1:
            raise KeyError("/Font")
        return original(self)

    monkeypatch.setattr(PageObject, "extract_text", flaky)
    doc = parse_document(
        "pdf",
        make_pdf(["this page will break on extraction", "this page extracts just fine"]),
        LIMITS,
    )
    assert doc.skipped == "page 1"


@pytest.mark.parametrize(
    "data", [b"%PDF-1.4\ngarbage", b"%PDF-", make_pdf(["ok"])[:200], b"%PDF-1.4\n" + b"\xff" * 999]
)
def test_corrupt_pdfs_are_unreadable(data: bytes) -> None:
    assert fails("pdf", data).failure in ("unreadable", "no-text")


# --- DOCX ------------------------------------------------------------------------------


def test_docx_headings_name_their_sections() -> None:
    doc = parse_document("docx", make_docx(OBJECTIONS), LIMITS)
    assert [s.loc for s in doc.sections] == [
        "Objection handling",
        "Objection handling \u203a We already use data loggers",
        "Objection handling \u203a We can't take rooms offline to install",
    ]
    assert doc.heading_count == 3
    assert "log writes itself" in doc.sections[1].text
    assert doc.pages_total is None
    assert not doc.partial


def test_docx_text_before_any_heading_has_no_loc() -> None:
    doc = parse_document(
        "docx", make_docx([(None, "Intro\ttabbed"), ("Title", "Doc title"), (None, "body")]), LIMITS
    )
    assert [(s.loc, s.text) for s in doc.sections] == [
        (None, "Intro tabbed"),
        ("Doc title", "Doc title\n\nbody"),
    ]


def test_docx_line_breaks_are_kept() -> None:
    xml = (
        f'<w:document xmlns:w="{"http://schemas.openxmlformats.org/wordprocessingml/2006/main"}">'
        "<w:body><w:p><w:r><w:t>one</w:t><w:br/><w:t>two</w:t></w:r></w:p>"
        "<w:p><w:r><w:t></w:t></w:r></w:p></w:body></w:document>"
    ).encode()
    doc = parse_document("docx", make_docx(document=xml), LIMITS)
    assert doc.sections[0].text == "one\ntwo"


def test_docx_text_limit() -> None:
    paras = [(None, "x" * 30) for _ in range(5)]
    doc = parse_document("docx", make_docx(paras), replace(LIMITS, max_text_chars=40))
    assert doc.partial
    assert doc.char_count == 40
    assert doc.skipped == "the end of the document"
    assert doc.skipped_reason == "size-limit"


def test_docx_stops_reading_once_the_budget_is_spent() -> None:
    paras = [("Heading1", "A"), (None, "a" * 100), ("Heading1", "B"), (None, "b" * 10)]
    doc = parse_document("docx", make_docx(paras), replace(LIMITS, max_text_chars=60))
    assert [s.loc for s in doc.sections] == ["A"]
    assert (doc.partial, doc.char_count) == (True, 60)


def test_docx_without_text_has_no_text() -> None:
    assert fails("docx", make_docx([(None, "   ")])).failure == "no-text"


def test_password_protected_docx_is_encrypted() -> None:
    assert fails("docx", OLE_MAGIC + b"\x00" * 100).failure == "encrypted"


@pytest.mark.parametrize(
    ("extra", "content_types"),
    [
        ({"word/vbaProject.bin": b"macro"}, None),
        ({"word/vbaData.xml": b"<x/>"}, None),
        ({"word/embeddings/oleObject1.bin": b"payload"}, None),
        ({"word/activeX/activeX1.xml": b"<x/>"}, None),
        (
            {},
            b'<Types><Default ContentType="application/vnd.ms-word.document.macroEnabled"/>'
            b"</Types>",
        ),
    ],
)
def test_macros_and_embedded_objects_are_rejected(
    extra: dict[str, bytes], content_types: bytes | None
) -> None:
    if content_types:
        data = make_docx([(None, "hello")], extra=extra, content_types=content_types)
    else:
        data = make_docx([(None, "hello")], extra=extra)
    assert fails("docx", data).failure == "rejected"
    relaxed = replace(LIMITS, reject_active_content=False)
    assert parse_document("docx", data, relaxed).sections


@pytest.mark.parametrize("name", ["../evil.xml", "/abs.xml", "word/../../x.xml", "C:evil.xml"])
def test_unsafe_archive_paths_are_rejected(name: str) -> None:
    failure = fails("docx", make_docx([(None, "hello")], extra={name: b"x"}))
    assert (failure.failure, failure.note) == ("rejected", "The file has an unsafe internal path.")


def test_zip_bomb_by_ratio_is_rejected() -> None:
    bomb = make_docx([(None, "hello")], extra={"word/media/bomb.bin": b"\x00" * (4 * MB)})
    assert fails("docx", bomb).note == "The file is compressed suspiciously well."


def test_zip_bomb_by_total_size_is_rejected() -> None:
    data = make_docx([(None, "hello")], extra={"word/media/a.bin": b"a" * 5000})
    limits = replace(LIMITS, zip_max_uncompressed_bytes=4000)
    assert fails("docx", data, limits).note == "The file expands to more than the size limit."


def test_part_reads_are_bounded_whatever_the_headers_say() -> None:
    """A part is read with a hard cap, so a lying size in the directory can't inflate more."""
    from app.kb import parsing

    data = make_docx([(None, "word " * 2000)])
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        real = zf.getinfo("word/document.xml").file_size
        assert len(parsing._read_part(zf, "word/document.xml", real)) == real
        with pytest.raises(IngestFailure, match="rejected"):
            parsing._read_part(zf, "word/document.xml", real - 1)


def test_too_many_parts_are_rejected() -> None:
    data = make_docx([(None, "x")], extra={f"word/p{i}.xml": b"<x/>" for i in range(10)})
    assert (
        fails("docx", data, replace(LIMITS, zip_max_entries=5)).note
        == "The file has too many parts."
    )


def test_encrypted_zip_entries_are_encrypted() -> None:
    data = bytearray(make_docx([(None, "x")]))
    # Set the "encrypted" general-purpose flag on every local and central header.
    for sig, offset in ((b"PK\x03\x04", 6), (b"PK\x01\x02", 8)):
        start = 0
        while (i := data.find(sig, start)) != -1:
            data[i + offset] |= 0x1
            start = i + 4
    assert fails("docx", bytes(data)).failure == "encrypted"


def test_docx_without_a_document_part_is_unreadable() -> None:
    failure = fails("docx", make_docx(include_document=False))
    assert (failure.failure, failure.note) == ("unreadable", "This isn't a Word document.")


def test_docx_without_content_types_still_parses() -> None:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as zf:
        zf.writestr("word/document.xml", docx_xml([(None, "bare")]))
    assert parse_document("docx", out.getvalue(), LIMITS).sections[0].text == "bare"


def test_not_a_zip_is_unreadable() -> None:
    assert fails("docx", b"PK\x03\x04 but not really").failure == "unreadable"


@pytest.mark.parametrize(
    ("xml", "failure"),
    [
        (
            b'<?xml version="1.0"?><!DOCTYPE d [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]>'
            b"<d>&b;</d>",
            "rejected",
        ),  # billion laughs
        (
            b'<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x SYSTEM "file:///etc/passwd">]><d>&x;</d>',
            "rejected",
        ),  # XXE
        (b"<w:document><unclosed>", "unreadable"),
    ],
)
def test_hostile_xml_is_refused(xml: bytes, failure: str) -> None:
    assert fails("docx", make_docx(document=xml)).failure == failure


# --- Markdown / text -------------------------------------------------------------------


def test_markdown_headings_name_sections_and_fences_are_respected() -> None:
    text = (
        "Intro line\n\n# Pricing #\n$39 a month\n\n```\n# not a heading\n```\n"
        "~~~\n# also not\n~~~\n## Battery\nFive years"
    )
    doc = parse_document("md", text.encode(), LIMITS)
    assert [s.loc for s in doc.sections] == [None, "Pricing", "Pricing \u203a Battery"]
    assert doc.heading_count == 2  # fenced "headings" don't count
    assert "# not a heading" in doc.sections[1].text


def test_pitch_markdown() -> None:
    doc = parse_document("md", PITCH_MD.encode(), LIMITS)
    assert [s.loc for s in doc.sections] == PITCH_LOCS
    assert (doc.heading_count, doc.word_count) == (4, PITCH_WORDS)


def test_markdown_bom_and_crlf() -> None:
    doc = parse_document("md", b"\xef\xbb\xbf# T\r\nbody\r\n", LIMITS)
    assert doc.sections == (Section("T", "# T\nbody"),)


@pytest.mark.parametrize("data", [b"\xff\xfeU\x00", b"ok\x00nul"])
def test_non_text_markdown_is_unreadable(data: bytes) -> None:
    assert fails("md", data).failure == "unreadable"


def test_empty_markdown_has_no_text() -> None:
    assert fails("md", b"   \n\n  ").failure == "no-text"


def test_markdown_text_limit() -> None:
    doc = markdown_sections(
        "# A\n" + "a" * 100 + "\n# B\n" + "b" * 100, replace(LIMITS, max_text_chars=60)
    )
    assert doc.partial
    assert doc.char_count == 60


def test_decode_text() -> None:
    assert decode_text("caf\u00e9".encode()) == "caf\u00e9"


def test_long_headings_are_truncated() -> None:
    doc = parse_document("md", ("# " + "h" * 300 + "\nbody").encode(), LIMITS)
    assert doc.sections[0].loc is not None
    assert len(doc.sections[0].loc) == 120


# --- HTML ------------------------------------------------------------------------------


def test_html_keeps_readable_text_and_links() -> None:
    page = parse_html(
        "<html><head><title>ColdTrace</title><style>p{}</style></head><body>"
        "<nav><a href='/nav'>Menu</a></nav><h1>Cold rooms</h1><p>Sensors &amp; alerts.</p>"
        "<script>alert(1)</script><div>Second<br>line</div><img src=x>"
        "<a href='/pricing'>Pricing</a><a>no href</a><footer>foot</footer>"
        "<template><p>hidden</p></template></body></html>"
    )
    assert page.title == "ColdTrace"
    assert page.text == "# Cold rooms\n\nSensors & alerts.\n\nSecond\nline\nPricingno href"
    assert page.links == ["/pricing"]


def test_html_unbalanced_skip_tags_do_not_swallow_the_page() -> None:
    page = parse_html("</script><p>visible</p>")
    assert page.text == "visible"
    assert page.title is None


# --- fuzzing ---------------------------------------------------------------------------

FUZZ = settings(max_examples=150, deadline=None, suppress_health_check=[HealthCheck.too_slow])
KINDS = st.sampled_from(["pdf", "docx", "md"])


def _survives(kind: str, data: bytes) -> None:
    try:
        doc = parse_document(kind, data, LIMITS)  # type: ignore[arg-type]
    except IngestFailure as failure:
        assert failure.failure in {"encrypted", "no-text", "rejected", "unreadable"}
    else:
        assert doc.sections
        assert all(s.text.strip() for s in doc.sections)


@FUZZ
@given(KINDS, st.binary(max_size=4096))
def test_random_bytes_never_crash_a_parser(kind: str, data: bytes) -> None:
    _survives(kind, data)


SEEDS = {
    "pdf": make_pdf(["Seed text for mutation.", None]),
    "docx": make_docx(OBJECTIONS),
    "md": PITCH_MD.encode(),
}


@FUZZ
@given(KINDS, st.data())
def test_mutated_documents_never_crash_a_parser(kind: str, data: st.DataObject) -> None:
    seed = bytearray(SEEDS[kind])
    for _ in range(data.draw(st.integers(min_value=1, max_value=8))):
        position = data.draw(st.integers(min_value=0, max_value=len(seed) - 1))
        seed[position] = data.draw(st.integers(min_value=0, max_value=255))
    cut = data.draw(st.integers(min_value=1, max_value=len(seed)))
    _survives(kind, bytes(seed[:cut]))


@FUZZ
@given(st.text(max_size=3000))
def test_any_markdown_text_parses_or_is_empty(text: str) -> None:
    _survives("md", text.encode())


@FUZZ
@given(st.text(max_size=3000))
def test_html_parser_never_crashes(html: str) -> None:
    page = parse_html(html)
    assert isinstance(page.text, str)


def test_skip_reason_is_mixed_only_for_distinct_reasons() -> None:
    assert skip_reason() is None
    assert skip_reason(None, None) is None
    assert skip_reason("scanned", None) == "scanned"
    assert skip_reason("size-limit", "size-limit") == "size-limit"
    assert skip_reason("scanned", "size-limit") == "mixed"


# --- structure: heading paths and counts (M11) -----------------------------------------

SEP = " \u203a "


def test_heading_path_joins_outermost_first() -> None:
    assert heading_path([]) is None
    assert heading_path(["Setup"]) == "Setup"
    assert heading_path(["Setup", "  Alerts  by  SMS "]) == f"Setup{SEP}Alerts by SMS"


def test_long_heading_paths_drop_outer_headings_first() -> None:
    path = heading_path(["A" * 70, "B" * 40, "C" * 30])
    assert path == f"\u2026{SEP}{'B' * 40}{SEP}{'C' * 30}"
    assert path is not None and len(path) <= LOC_MAX_CHARS
    deepest_alone = heading_path(["A" * 10, "C" * 200])
    assert deepest_alone is not None and len(deepest_alone) == LOC_MAX_CHARS
    assert deepest_alone.endswith("\u2026")


def test_markdown_heading_paths_follow_levels() -> None:
    text = "# A\na\n## B\nb\n### C\nc\n## D\nd\n#### E\ne\n# F\nf"
    doc = parse_document("md", text.encode(), LIMITS)
    assert [s.loc for s in doc.sections] == [
        "A",
        f"A{SEP}B",
        f"A{SEP}B{SEP}C",
        f"A{SEP}D",
        f"A{SEP}D{SEP}E",  # a skipped level still nests
        "F",
    ]
    assert doc.heading_count == 6


def test_docx_heading_paths_follow_style_levels() -> None:
    paras = [
        ("Title", "Playbook"),
        ("Heading1", "Objections"),
        ("heading 2", "Price"),
        (None, "It pays for itself."),
        ("Heading", "Install"),  # no number: level 1
        (None, "An afternoon."),
        ("Subtitle", "Not a heading style"),
    ]
    doc = parse_document("docx", make_docx(paras), LIMITS)
    assert [s.loc for s in doc.sections] == [
        "Playbook",
        f"Playbook{SEP}Objections",
        f"Playbook{SEP}Objections{SEP}Price",
        f"Playbook{SEP}Install",
    ]
    assert "Not a heading style" in doc.sections[-1].text
    assert doc.heading_count == 4


def test_web_pages_keep_their_path_but_count_headings() -> None:
    doc = markdown_sections("# One\nx\n## Two\ny", LIMITS, loc="/docs")
    assert [s.loc for s in doc.sections] == ["/docs", "/docs"]
    assert doc.heading_count == 2


def test_headings_past_the_text_limit_are_not_counted() -> None:
    text = "# A\n" + "x" * 60 + "\n# B\nmore"
    doc = parse_document("md", text.encode(), replace(LIMITS, max_text_chars=50))
    assert [s.loc for s in doc.sections] == ["A"]
    assert doc.heading_count == 1


@pytest.mark.parametrize(
    ("text", "words"),
    [
        ("", 0),
        ("# Pricing", 1),
        ("$39 a month, billed annually.", 5),
        ("don't e-mail v2.5 CR123A", 4),
        ("Sensors \u2014 five years", 3),
        ("\u6e29\u5ea6 sensor", 2),
    ],
)
def test_count_words(text: str, words: int) -> None:
    assert count_words(text) == words


def test_pdfs_have_words_but_no_headings() -> None:
    pages = ["one two three four five six", None, "seven eight nine ten eleven"]
    doc = parse_document("pdf", make_pdf(pages), LIMITS)
    assert (doc.word_count, doc.heading_count) == (11, 0)
