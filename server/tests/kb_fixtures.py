"""Builders for knowledge-base test documents: tiny, valid PDFs and DOCX files in memory.

Hand-built so tests control exactly what a hostile or odd file contains (JavaScript,
embedded files, scanned pages, macros, zip bombs) without binary fixtures in the repo.
"""

import io
import zipfile
from collections.abc import Sequence
from xml.sax.saxutils import escape

from pypdf import PdfWriter

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
CONTENT_TYPES = (
    b'<?xml version="1.0" encoding="UTF-8"?>'
    b'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    b'<Default Extension="xml" ContentType="application/xml"/>'
    b'<Override PartName="/word/document.xml" ContentType="application/'
    b'vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
)
RELS = (
    b'<?xml version="1.0" encoding="UTF-8"?>'
    b'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    b'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/'
    b'relationships/officeDocument" Target="word/document.xml"/></Relationships>'
)


def _pdf_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_pdf(pages: list[str | None], *, catalog_extra: str = "") -> bytes:
    """One PDF page per entry; ``None`` is a page with no text layer (like a scan)."""
    objects: dict[int, bytes] = {
        3: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    }
    kids = []
    for index, text in enumerate(pages):
        page_id, content_id = 4 + 2 * index, 5 + 2 * index
        kids.append(f"{page_id} 0 R")
        if text is None:
            stream = b"0 0 m 10 10 l S"  # vector drawing only, no text
        else:
            shows = " ".join(f"({_pdf_escape(line)}) Tj T*" for line in text.split("\n"))
            stream = f"BT /F1 11 Tf 14 TL 72 740 Td {shows} ET".encode("latin-1")
        objects[page_id] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_id} 0 R >>"
        ).encode()
        objects[content_id] = (
            b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"
        )
    objects[1] = f"<< /Type /Catalog /Pages 2 0 R {catalog_extra} >>".encode()
    objects[2] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(pages)} >>".encode()

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = {}
    for number in sorted(objects):
        offsets[number] = out.tell()
        out.write(f"{number} 0 obj\n".encode() + objects[number] + b"\nendobj\n")
    xref = out.tell()
    size = max(objects) + 1
    out.write(f"xref\n0 {size}\n0000000000 65535 f \n".encode())
    for number in range(1, size):
        out.write(f"{offsets[number]:010d} 00000 n \n".encode())
    out.write(f"trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return out.getvalue()


def encrypt_pdf(data: bytes, *, user_password: str, owner_password: str = "owner") -> bytes:
    writer = PdfWriter(clone_from=io.BytesIO(data))
    writer.encrypt(user_password=user_password, owner_password=owner_password, algorithm="AES-128")
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def docx_xml(paragraphs: Sequence[tuple[str | None, str]]) -> bytes:
    body = []
    for style, text in paragraphs:
        ppr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
        runs = "".join(
            f'<w:r><w:t xml:space="preserve">{escape(part)}</w:t></w:r>'
            + ("<w:r><w:tab/></w:r>" if i < text.count("\t") else "")
            for i, part in enumerate(text.split("\t"))
        )
        body.append(f"<w:p>{ppr}{runs}</w:p>")
    return (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:document xmlns:w="{W_NS}"><w:body>{"".join(body)}</w:body></w:document>'
    ).encode()


def make_docx(
    paragraphs: Sequence[tuple[str | None, str]] | None = None,
    *,
    document: bytes | None = None,
    extra: dict[str, bytes] | None = None,
    content_types: bytes = CONTENT_TYPES,
    include_document: bool = True,
) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", RELS)
        if include_document:
            zf.writestr("word/document.xml", document or docx_xml(paragraphs or []))
        for name, data in (extra or {}).items():
            zf.writestr(name, data)
    return out.getvalue()


PITCH_MD = """# ColdTrace Sensors

ColdTrace Sensors are wireless temperature and humidity sensors for cold rooms, reefer
trucks and pharmacy fridges. One gateway covers up to 40 sensors across a site.

## Alerts

When a reading crosses its limit, the on-duty manager gets an SMS and a call within two
minutes. Median alert time across our installed base is 94 seconds.

## Pricing

Pricing: $39 per sensor per month, billed annually. Gateway and installation included for
sites of six rooms or more.

## Battery

Sensor battery life is five years at a 60-second reading interval. Replacement cells are
standard CR123A.
"""

PITCH_LOCS = [
    "ColdTrace Sensors",
    "ColdTrace Sensors \u203a Alerts",
    "ColdTrace Sensors \u203a Pricing",
    "ColdTrace Sensors \u203a Battery",
]
PITCH_WORDS = 94
"""Words in ``PITCH_MD`` as read: headings included, ``#`` marks not (= whitespace tokens with a
letter or digit)."""

GATEWAY_PAGES = [
    "The gateway uses sub-GHz radio (868 MHz) to reach sensors through two concrete walls,\n"
    "then backhauls over 4G with automatic fallback to the site's Ethernet.",
    None,
    "Operating range -30 C to +60 C. Enclosure rated IP65. Internal battery keeps the\n"
    "gateway online for 12 hours during a power cut.",
]

OBJECTIONS = [
    ("Heading1", "Objection handling"),
    ("Heading2", "We already use data loggers"),
    (None, "Loggers tell you what went wrong yesterday. ColdTrace tells you while there's"
     " still time to move the stock, and the log writes itself."),
    ("Heading2", "We can't take rooms offline to install"),
    (None, "Nothing goes offline. Sensors stick on and the gateway plugs into a socket; a"
     " six-room site is usually live in an afternoon."),
]  # fmt: skip
