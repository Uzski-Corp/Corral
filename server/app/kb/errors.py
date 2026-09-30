"""Typed pipeline outcomes. Failure codes match the client's ``FAILURE`` map (lib/kb/upload.ts)."""

from typing import Literal

SourceKind = Literal["pdf", "docx", "md", "url"]
FileKind = Literal["pdf", "docx", "md"]
Stage = Literal["upload", "scan", "parse", "chunk", "embed"]
Failure = Literal[
    "interrupted",  # processing stopped (e.g. retries exhausted); nothing from it is used
    "encrypted",  # password-protected PDF/DOCX
    "no-text",  # nothing readable (e.g. a fully scanned PDF)
    "rejected",  # macros, embedded files, PDF JavaScript, zip-bomb shaped archives
    "unreadable",  # corrupt or malformed file (server-only code; see the PR)
    "unreachable",  # web page errored, timed out or isn't HTML/text
    "blocked",  # robots.txt, 401/403, or a redirect to a private address
]

SkipReason = Literal[
    "scanned",  # PDF pages that are images with no text layer (OCR them and re-add)
    "size-limit",  # pages or text past the page/text limits weren't read
    "unreadable",  # pages of a web section that failed to load or had no text
    "mixed",  # more than one of the above
]
"""Why a ``partial`` source is missing pages. Server-side only; not in the client's FAILURE map."""


def skip_reason(*reasons: "SkipReason | None") -> "SkipReason | None":
    """The single reason for the distinct reasons that apply, ``mixed`` when several do."""
    present = {r for r in reasons if r is not None}
    if len(present) > 1:
        return "mixed"
    return present.pop() if present else None


class IngestFailure(Exception):
    """A permanent, user-facing failure: the source is marked ``failed`` and never retried."""

    def __init__(self, failure: Failure, stage: Stage, note: str | None = None) -> None:
        super().__init__(f"{failure} at {stage}")
        self.failure: Failure = failure
        self.stage: Stage = stage
        self.note = note
