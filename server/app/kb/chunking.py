"""Split located sections into overlapping passages for embedding and retrieval.

Passages never cross a section boundary (so each keeps one ``loc``), break on paragraphs,
then sentences, then whitespace, and only cut inside a word that is longer than a whole
passage. Every passage is at most ``size`` characters, overlap included.
"""

import re
from collections.abc import Iterable, Iterator
from dataclasses import dataclass

from app.kb.parsing import Section

_PARAGRAPHS = re.compile(r"\n\s*\n")
_SENTENCES = re.compile(r"(?<=[.!?…])\s+")


@dataclass(frozen=True, slots=True)
class Chunk:
    ordinal: int
    loc: str | None
    text: str


def _hard_wrap(text: str, size: int) -> Iterator[str]:
    """Pack words into pieces of at most ``size``; a longer word is cut."""
    line = ""
    for word in text.split():
        while len(word) > size:
            if line:
                yield line
                line = ""
            yield word[:size]
            word = word[size:]
        candidate = f"{line} {word}" if line else word
        if len(candidate) <= size:
            line = candidate
        else:
            yield line
            line = word
    if line:
        yield line


def _pieces(text: str, size: int) -> Iterator[tuple[str, str]]:
    """``(piece, separator)``: paragraphs that fit, else sentences, else wrapped words.

    The separator is what joins the piece to the one before it: a blank line between
    paragraphs, a space inside one.
    """
    for paragraph in _PARAGRAPHS.split(text):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        if len(paragraph) <= size:
            yield paragraph, "\n\n"
            continue
        sep = "\n\n"
        for sentence in _SENTENCES.split(paragraph):
            for piece in [sentence] if len(sentence) <= size else _hard_wrap(sentence, size):
                yield piece, sep
                sep = " "


def _tail(text: str, overlap: int) -> str:
    """The last ``overlap`` characters, starting on a word boundary."""
    if overlap <= 0 or len(text) <= overlap:
        return text if overlap > 0 else ""
    tail = text[-overlap:]
    space = tail.find(" ")
    return tail[space + 1 :] if space != -1 else ""


def chunk_sections(sections: Iterable[Section], *, size: int, overlap: int) -> list[Chunk]:
    if size < 1 or not 0 <= overlap < size:
        raise ValueError("need size >= 1 and 0 <= overlap < size")
    chunks: list[Chunk] = []

    def emit(loc: str | None, text: str) -> None:
        chunks.append(Chunk(len(chunks), loc, text))

    for section in sections:
        current = ""
        for piece, sep in _pieces(section.text, size):
            joined = f"{current}{sep}{piece}" if current else piece
            if len(joined) <= size:
                current = joined
                continue
            emit(section.loc, current)
            tail = _tail(current, overlap)
            current = f"{tail} {piece}" if tail and len(tail) + 1 + len(piece) <= size else piece
        if current:
            emit(section.loc, current)
    return chunks
