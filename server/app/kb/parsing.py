"""Turn untrusted PDF, DOCX, Markdown and HTML into located text sections.

Every parser is bounded: page count, extracted characters, zip entry count, uncompressed
size and compression ratio all have limits (see ``ParseLimits``). XML goes through
``defusedxml`` (no entities, no DTDs, no external references). Nothing is ever written
to disk or extracted by name, so archive paths can't traverse anywhere.

Third-party parsers can raise almost anything on hostile input; ``parse_document`` turns
any unexpected exception into a permanent ``unreadable`` failure rather than a retry.
"""

import io
import re
import unicodedata
import zipfile
from collections.abc import Iterable
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Any
from xml.etree.ElementTree import Element, ParseError

import structlog
from defusedxml import DefusedXmlException
from defusedxml.ElementTree import fromstring as safe_xml
from pypdf import PdfReader
from pypdf.generic import DictionaryObject

from app.core.config import Settings
from app.kb.errors import FileKind, IngestFailure, SkipReason, skip_reason
from app.kb.files import OLE_MAGIC

log = structlog.get_logger(__name__)

MIB = 1024 * 1024
LOC_MAX_CHARS = 120
SKIPPED_MAX_CHARS = 255
EN_DASH = "\u2013"  # the client's copy: "pages 12\u201318"


@dataclass(frozen=True, slots=True)
class ParseLimits:
    max_pages: int = 500
    max_text_chars: int = 2_000_000
    min_page_chars: int = 20
    reject_active_content: bool = True
    zip_max_entries: int = 2_000
    zip_max_uncompressed_bytes: int = 200 * MIB
    zip_max_ratio: int = 100

    @classmethod
    def from_settings(cls, settings: Settings) -> "ParseLimits":
        return cls(
            max_pages=settings.kb_max_pages,
            max_text_chars=settings.kb_max_text_chars,
            min_page_chars=settings.kb_min_page_chars,
            reject_active_content=settings.kb_reject_active_content,
            zip_max_entries=settings.kb_zip_max_entries,
            zip_max_uncompressed_bytes=settings.kb_zip_max_uncompressed_bytes,
            zip_max_ratio=settings.kb_zip_max_ratio,
        )


@dataclass(frozen=True, slots=True)
class Section:
    """A run of text and where it came from: ``p.4``, a heading, or a URL path."""

    loc: str | None
    text: str


@dataclass(frozen=True, slots=True)
class ParsedDocument:
    sections: tuple[Section, ...]
    pages_total: int | None = None
    pages_read: int | None = None
    skipped: str | None = None
    skipped_reason: SkipReason | None = None
    note: str | None = None

    @property
    def partial(self) -> bool:
        return self.skipped is not None

    @property
    def char_count(self) -> int:
        return sum(len(s.text) for s in self.sections)


# --- text helpers --------------------------------------------------------------------

_SPACES = re.compile(r"[ \t\f\v\u00a0\u2000-\u200b\u202f\u205f\u3000]+")
_BLANK_LINES = re.compile(r"\n{3,}")


def clean_text(text: str) -> str:
    """NFC, no control characters, single spaces, at most one blank line in a row."""
    text = unicodedata.normalize("NFC", text.replace("\r\n", "\n").replace("\r", "\n"))
    text = "".join(ch for ch in text if ch in "\n\t" or unicodedata.category(ch)[0] != "C")
    lines = (_SPACES.sub(" ", line).strip() for line in text.split("\n"))
    return _BLANK_LINES.sub("\n\n", "\n".join(lines)).strip()


def _loc(text: str) -> str:
    text = " ".join(text.split())
    return text if len(text) <= LOC_MAX_CHARS else text[: LOC_MAX_CHARS - 1] + "…"


def page_ranges(pages: Iterable[int]) -> str:
    """``[3]`` -> ``page 3``; ``[2, 5, 6, 7]`` -> ``pages 2, 5-7`` with an en dash (1-based)."""
    nums = sorted(set(pages))
    spans: list[str] = []
    i = 0
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
            j += 1
        spans.append(str(nums[i]) if i == j else f"{nums[i]}{EN_DASH}{nums[j]}")
        i = j + 1
    label = "page " if len(nums) == 1 else "pages "
    out = label + ", ".join(spans)
    return out if len(out) <= SKIPPED_MAX_CHARS else out[: SKIPPED_MAX_CHARS - 1] + "…"


class _Budget:
    """Tracks extracted characters against ``max_text_chars``."""

    def __init__(self, limit: int) -> None:
        self.left = limit
        self.exhausted = False

    def take(self, text: str) -> str:
        if len(text) <= self.left:
            self.left -= len(text)
            return text
        self.exhausted = True
        cut = text[: self.left]
        self.left = 0
        return cut


# --- PDF -------------------------------------------------------------------------------


def _resolved(value: Any) -> Any:
    return value.get_object() if value is not None else None


def _pdf_has_active_content(reader: PdfReader) -> bool:
    root = reader.root_object
    names = _resolved(root.get("/Names"))
    if isinstance(names, DictionaryObject) and (
        "/EmbeddedFiles" in names or "/JavaScript" in names
    ):
        return True
    action = _resolved(root.get("/OpenAction"))
    return isinstance(action, DictionaryObject) and action.get("/S") == "/JavaScript"


def parse_pdf(data: bytes, limits: ParseLimits) -> ParsedDocument:
    reader = PdfReader(io.BytesIO(data), strict=False)
    if reader.is_encrypted and not reader.decrypt(""):
        # Opens without a password only if it has an owner password alone.
        raise IngestFailure("encrypted", "scan")
    if limits.reject_active_content and _pdf_has_active_content(reader):
        raise IngestFailure("rejected", "scan", "The PDF has embedded files or JavaScript.")

    total = len(reader.pages)
    budget = _Budget(limits.max_text_chars)
    sections: list[Section] = []
    scanned: list[int] = []
    over_limit: list[int] = []
    for index in range(total):
        number = index + 1
        if index >= limits.max_pages or budget.exhausted:
            over_limit.append(number)
            continue
        try:
            raw = reader.pages[index].extract_text() or ""
        except Exception as exc:  # hostile page content: skip the page, keep the rest
            log.info("kb_pdf_page_unreadable", page=number, error_type=type(exc).__name__)
            raw = ""
        text = clean_text(raw)
        if len(text) < max(1, limits.min_page_chars):
            scanned.append(number)
            continue
        sections.append(Section(f"p.{number}", budget.take(text)))

    if not sections:
        raise IngestFailure("no-text", "parse")
    notes: list[str] = []
    if scanned:
        n = len(scanned)
        notes.append(
            f"{n} {'page is a' if n == 1 else 'pages are'} scanned "
            f"{'image' if n == 1 else 'images'} with no text layer."
        )
    if over_limit:
        notes.append(f"Only the first {total - len(over_limit)} pages were read (size limit).")
    skipped = scanned + over_limit
    return ParsedDocument(
        tuple(sections),
        pages_total=total,
        pages_read=len(sections),
        skipped=page_ranges(skipped) if skipped else None,
        skipped_reason=skip_reason(
            "scanned" if scanned else None, "size-limit" if over_limit else None
        ),
        note=" ".join(notes) or None,
    )


# --- DOCX ------------------------------------------------------------------------------

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
DOCUMENT_PART = "word/document.xml"
_ACTIVE_PARTS = ("vbaproject.bin", "vbadata.xml")
_ACTIVE_DIRS = ("word/embeddings/", "word/activex/")
_RATIO_MIN_BYTES = MIB  # small parts compress very well legitimately


def _check_archive(zf: zipfile.ZipFile, limits: ParseLimits) -> None:
    infos = zf.infolist()
    if len(infos) > limits.zip_max_entries:
        raise IngestFailure("rejected", "scan", "The file has too many parts.")
    if sum(i.file_size for i in infos) > limits.zip_max_uncompressed_bytes:
        raise IngestFailure("rejected", "scan", "The file expands to more than the size limit.")
    for info in infos:
        name = info.filename
        parts = name.replace("\\", "/").split("/")
        if name.startswith(("/", "\\")) or ".." in parts or ":" in parts[0]:
            raise IngestFailure("rejected", "scan", "The file has an unsafe internal path.")
        if info.flag_bits & 0x1:
            raise IngestFailure("encrypted", "scan")
        if info.file_size >= _RATIO_MIN_BYTES and info.file_size > limits.zip_max_ratio * max(
            1, info.compress_size
        ):
            raise IngestFailure("rejected", "scan", "The file is compressed suspiciously well.")
        lowered = name.lower()
        if limits.reject_active_content and (
            lowered.rsplit("/", 1)[-1] in _ACTIVE_PARTS or lowered.startswith(_ACTIVE_DIRS)
        ):
            raise IngestFailure("rejected", "scan", "The file contains macros or embedded files.")


def _read_part(zf: zipfile.ZipFile, name: str, limit: int) -> bytes:
    # Bounded read: a lying header can't make us inflate more than ``limit`` bytes.
    with zf.open(name) as fh:
        data = fh.read(limit + 1)
    if len(data) > limit:
        raise IngestFailure("rejected", "scan", "The file expands to more than the size limit.")
    return data


def _xml(data: bytes) -> Element:
    try:
        return safe_xml(data)
    except DefusedXmlException as exc:
        raise IngestFailure(
            "rejected", "scan", "The file uses XML features Corral won't open."
        ) from exc
    except ParseError as exc:
        raise IngestFailure("unreadable", "parse") from exc


def _paragraph_text(p: Element) -> str:
    out: list[str] = []
    for node in p.iter():
        if node.tag == W + "t" and node.text:
            out.append(node.text)
        elif node.tag == W + "tab":
            out.append("\t")
        elif node.tag in (W + "br", W + "cr"):
            out.append("\n")
    return "".join(out)


def _is_heading(p: Element) -> bool:
    style = p.find(f"{W}pPr/{W}pStyle")
    value = (style.get(W + "val") or "") if style is not None else ""
    return value.lower().startswith(("heading", "title"))


def parse_docx(data: bytes, limits: ParseLimits) -> ParsedDocument:
    if data.startswith(OLE_MAGIC):
        raise IngestFailure("encrypted", "scan")
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise IngestFailure("unreadable", "scan") from exc
    with zf:
        _check_archive(zf, limits)
        names = set(zf.namelist())
        if DOCUMENT_PART not in names:
            raise IngestFailure("unreadable", "scan", "This isn't a Word document.")
        content_types = (
            _read_part(zf, "[Content_Types].xml", limits.zip_max_uncompressed_bytes)
            if "[Content_Types].xml" in names
            else b""
        )
        if limits.reject_active_content and b"macroEnabled" in content_types:
            raise IngestFailure("rejected", "scan", "The file contains macros.")
        root = _xml(_read_part(zf, DOCUMENT_PART, limits.zip_max_uncompressed_bytes))

    budget = _Budget(limits.max_text_chars)
    sections: list[Section] = []
    heading: str | None = None
    body: list[str] = []

    def flush() -> None:
        text = clean_text("\n\n".join(body))
        if text:
            sections.append(Section(heading, budget.take(text)))
        body.clear()

    for p in root.iter(W + "p"):
        if budget.exhausted:
            break
        text = _paragraph_text(p).strip()
        if not text:
            continue
        if _is_heading(p):
            flush()
            heading = _loc(text)
            body.append(text)
        else:
            body.append(text)
    if not budget.exhausted:
        flush()
    if not sections:
        raise IngestFailure("no-text", "parse")
    return _with_budget_note(tuple(sections), budget)


def _with_budget_note(sections: tuple[Section, ...], budget: _Budget) -> ParsedDocument:
    if not budget.exhausted:
        return ParsedDocument(sections)
    return ParsedDocument(
        sections,
        skipped="the end of the document",
        skipped_reason="size-limit",
        note="Only the first part was read (text limit).",
    )


# --- Markdown / plain text -----------------------------------------------------------

_ATX = re.compile(r"^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$")
_FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})")


def decode_text(data: bytes) -> str:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise IngestFailure("unreadable", "scan", "The file isn't UTF-8 text.") from exc
    if "\x00" in text:
        raise IngestFailure("unreadable", "scan", "The file isn't text.")
    return text


def markdown_sections(text: str, limits: ParseLimits, *, loc: str | None = None) -> ParsedDocument:
    """Split on ATX headings (outside code fences); each heading names its section."""
    budget = _Budget(limits.max_text_chars)
    sections: list[Section] = []
    heading = loc
    lines: list[str] = []
    fence: str | None = None

    def flush() -> None:
        chunk = clean_text("\n".join(lines))
        if chunk and not budget.exhausted:
            sections.append(Section(heading, budget.take(chunk)))
        lines.clear()

    for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        fence_match = _FENCE.match(line)
        if fence_match:
            marker = fence_match.group(1)[0] * 3
            fence = None if fence == marker else (fence or marker)
        elif fence is None and (match := _ATX.match(line)):
            flush()
            heading = _loc(match.group(2)) if loc is None else loc
        lines.append(line)
    flush()
    if not sections:
        raise IngestFailure("no-text", "parse")
    return _with_budget_note(tuple(sections), budget)


def parse_markdown(data: bytes, limits: ParseLimits) -> ParsedDocument:
    return markdown_sections(decode_text(data), limits)


# --- HTML ------------------------------------------------------------------------------

_SKIP_TAGS = frozenset(
    {"script", "style", "noscript", "template", "svg", "head", "nav", "footer", "form", "iframe"}
)
_VOID_TAGS = frozenset(
    {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "wbr"}
)
_BLOCK_TAGS = frozenset(
    {
        "p", "div", "li", "ul", "ol", "tr", "table", "section", "article", "main", "header",
        "aside", "blockquote", "pre", "dd", "dt", "figcaption", "br", "hr",
    }
)  # fmt: skip
_HEADINGS = frozenset({"h1", "h2", "h3", "h4", "h5", "h6"})


@dataclass
class HtmlPage:
    title: str | None
    text: str
    links: list[str] = field(default_factory=list)


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.links: list[str] = []
        self.title: list[str] = []
        self._skip_depth = 0
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "title":
            self._in_title = True
        if tag in _SKIP_TAGS and tag not in _VOID_TAGS:
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href.strip())
        if tag in _HEADINGS:
            self.parts.append("\n\n# ")
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        if tag in _SKIP_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if not self._skip_depth and (tag in _HEADINGS or tag in _BLOCK_TAGS):
            self.parts.append("\n\n" if tag in _HEADINGS or tag == "p" else "\n")

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title.append(data)
            return
        if not self._skip_depth:
            self.parts.append(data)


def parse_html(html: str) -> HtmlPage:
    """Readable text with headings marked ``# `` (so Markdown splitting applies), plus links."""
    parser = _TextExtractor()
    parser.feed(html)
    parser.close()
    title = clean_text("".join(parser.title)) or None
    return HtmlPage(title=title, text=clean_text("".join(parser.parts)), links=parser.links)


# --- dispatch --------------------------------------------------------------------------

_PARSERS: dict[FileKind, Any] = {"pdf": parse_pdf, "docx": parse_docx, "md": parse_markdown}


def parse_document(kind: FileKind, data: bytes, limits: ParseLimits) -> ParsedDocument:
    try:
        result: ParsedDocument = _PARSERS[kind](data, limits)
    except IngestFailure:
        raise
    except Exception as exc:
        log.info("kb_parse_failed", kind=kind, error_type=type(exc).__name__)
        raise IngestFailure("unreadable", "parse") from exc
    return result
