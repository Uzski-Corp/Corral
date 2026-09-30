"""Upload checks: filename sanitising, extension allow-list, content sniffing, size limits."""

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.kb.files import (
    MAX_FILENAME_CHARS,
    OLE_MAGIC,
    UploadRejected,
    check_upload,
    extension_kind,
    sanitize_filename,
    sniff,
)
from tests.kb_fixtures import make_docx, make_pdf

MB = 1024 * 1024


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Pitch 2026.pdf", "Pitch 2026.pdf"),
        ("../../etc/passwd", "passwd"),
        ("..\\..\\windows\\system32\\evil.docx", "evil.docx"),
        ("/abs/path/deck.pdf", "deck.pdf"),
        ("C:\\Users\\me\\deck.pdf", "deck.pdf"),
        ("..", "untitled"),
        (".hidden.md", "hidden.md"),
        ("", "untitled"),
        (None, "untitled"),
        ("name\x00.pdf", "name.pdf"),
        ("bidi\u202egnp.pdf", "bidignp.pdf"),  # right-to-left override stripped
        ("  spaced \t out .md ", "spaced out .md"),
        ("cafe\u0301.md", "caf\u00e9.md"),  # NFC
        ("new\nline.pdf", "newline.pdf"),
    ],
)
def test_sanitize_filename(raw: str | None, expected: str) -> None:
    assert sanitize_filename(raw) == expected


def test_sanitize_filename_truncates_but_keeps_the_extension() -> None:
    name = sanitize_filename("a" * 400 + ".docx")
    assert len(name) == MAX_FILENAME_CHARS
    assert name.endswith(".docx")
    assert len(sanitize_filename("b" * 400)) == MAX_FILENAME_CHARS
    assert len(sanitize_filename("c" * 300 + "." + "x" * 20)) == MAX_FILENAME_CHARS


@given(st.text(max_size=600))
def test_sanitized_names_are_always_safe(raw: str) -> None:
    name = sanitize_filename(raw)
    assert 0 < len(name) <= MAX_FILENAME_CHARS
    assert "/" not in name
    assert "\\" not in name
    assert not name.startswith(".")
    assert all(ch.isprintable() or ch == " " for ch in name)


@pytest.mark.parametrize(
    ("name", "kind"),
    [
        ("a.pdf", "pdf"),
        ("A.PDF", "pdf"),
        ("a.docx", "docx"),
        ("a.md", "md"),
        ("a.markdown", "md"),
        ("a.doc", None),
        ("a.key", None),
        ("pdf", None),
        (".pdf", None),
        ("a.pdf.exe", None),
    ],
)
def test_extension_kind(name: str, kind: str | None) -> None:
    assert extension_kind(name) == kind


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        (b"%PDF-1.7\n...", "pdf"),
        (b"\n  %PDF-1.4", "pdf"),
        (b"PK\x03\x04rest", "zip"),
        (OLE_MAGIC + b"rest", "ole"),
        ("# Heading\n\nCaf\u00e9".encode(), "text"),
        (b"\xff\xfe\x00\x00", None),
        (b"text with a \x00 nul", None),
        (b"\x89PNG\r\n\x1a\n", None),
    ],
)
def test_sniff(data: bytes, expected: str | None) -> None:
    assert sniff(data) == expected


def test_check_upload_accepts_matching_content() -> None:
    assert check_upload("a.pdf", make_pdf(["hello"]), max_bytes=MB) == "pdf"
    assert check_upload("a.docx", make_docx([(None, "hi")]), max_bytes=MB) == "docx"
    assert check_upload("a.docx", OLE_MAGIC + b"x", max_bytes=MB) == "docx"  # fails later
    assert check_upload("notes.markdown", b"# hi", max_bytes=MB) == "md"


@pytest.mark.parametrize(
    ("name", "data", "error", "status"),
    [
        ("deck.key", b"x", "unsupported", 415),
        ("noext", b"x", "unsupported", 415),
        ("a.pdf", b"", "empty", 422),
        ("a.md", b"x" * (MB + 1), "too_large", 413),
        ("a.pdf", b"# really markdown", "type_mismatch", 415),
        ("a.md", make_pdf(["x"]), "type_mismatch", 415),
        ("a.docx", b"%PDF-1.4", "type_mismatch", 415),
        ("a.md", b"\x89PNG\r\n\x1a\n\x00", "type_mismatch", 415),
        ("evil.pdf", b"MZ\x90\x00", "type_mismatch", 415),
    ],
)
def test_check_upload_rejects(name: str, data: bytes, error: str, status: int) -> None:
    with pytest.raises(UploadRejected) as info:
        check_upload(name, data, max_bytes=MB)
    assert (info.value.error, info.value.status_code) == (error, status)
    assert info.value.detail
