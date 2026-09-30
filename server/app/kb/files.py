"""Upload checks that run in the request, before a byte is stored.

The file type is decided by *content* (magic bytes), and it must agree with the
extension; the client-supplied MIME type is ignored (it's unreliable from drag-and-drop
and trivially forged). The filename is display-only: it is sanitised and never used to
build a path, so path traversal via the name is impossible by construction.
"""

import posixpath
import unicodedata
from typing import Literal

from app.kb.errors import FileKind

MAX_FILENAME_CHARS = 255
EXTENSIONS: dict[str, FileKind] = {"pdf": "pdf", "docx": "docx", "md": "md", "markdown": "md"}
PDF_MAGIC = b"%PDF-"
ZIP_MAGIC = b"PK\x03\x04"
# Office files with a password are wrapped in an OLE compound file, not a zip.
OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"

Sniffed = Literal["pdf", "zip", "ole", "text"]
UploadError = Literal["empty", "too_large", "unsupported", "type_mismatch"]


class UploadRejected(Exception):
    def __init__(self, error: UploadError, status_code: int, detail: str) -> None:
        super().__init__(error)
        self.error: UploadError = error
        self.status_code = status_code
        self.detail = detail


def sanitize_filename(raw: str | None) -> str:
    """Base name only, NFC, no control/format characters, at most 255 characters."""
    name = (raw or "").replace("\\", "/")
    name = posixpath.basename(name)
    name = unicodedata.normalize("NFC", name)
    name = "".join(ch for ch in name if not unicodedata.category(ch).startswith("C"))
    name = " ".join(name.split()).lstrip(".").strip()
    if not name:
        return "untitled"
    if len(name) > MAX_FILENAME_CHARS:
        stem, dot, ext = name.rpartition(".")
        if dot and 0 < len(ext) <= 10:
            name = stem[: MAX_FILENAME_CHARS - len(ext) - 1] + "." + ext
        else:
            name = name[:MAX_FILENAME_CHARS]
    return name


def extension_kind(filename: str) -> FileKind | None:
    stem, dot, ext = filename.rpartition(".")
    if not dot or not stem:
        return None
    return EXTENSIONS.get(ext.lower())


def sniff(data: bytes) -> Sniffed | None:
    head = data[:1024]
    if head.lstrip().startswith(PDF_MAGIC):
        return "pdf"
    if head.startswith(ZIP_MAGIC):
        return "zip"
    if head.startswith(OLE_MAGIC):
        return "ole"
    if b"\x00" in data:
        return None
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        return None
    return "text"


_ACCEPTS: dict[FileKind, frozenset[Sniffed]] = {
    "pdf": frozenset({"pdf"}),
    # "ole" is a password-protected .docx: accepted here, failed as "encrypted" by the scan.
    "docx": frozenset({"zip", "ole"}),
    "md": frozenset({"text"}),
}


def check_upload(filename: str, data: bytes, *, max_bytes: int) -> FileKind:
    kind = extension_kind(filename)
    if kind is None:
        raise UploadRejected("unsupported", 415, "Use PDF, DOCX or Markdown.")
    if not data:
        raise UploadRejected("empty", 422, "This file is empty.")
    if len(data) > max_bytes:
        raise UploadRejected("too_large", 413, f"Files can be up to {max_bytes} bytes.")
    sniffed = sniff(data)
    if sniffed not in _ACCEPTS[kind]:
        raise UploadRejected(
            "type_mismatch", 415, f"This file's contents don't look like a .{kind} file."
        )
    return kind
