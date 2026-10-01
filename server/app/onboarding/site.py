"""Read a public site for onboarding: real pages and headings, nothing invented.

A short same-origin crawl through the knowledge-base fetcher (SSRF checks, robots.txt,
pinned DNS). The knowledge-base worker may keep reading afterwards; this is the answer
the setup screen shows immediately.
"""

import asyncio
import re
from collections.abc import Sequence
from dataclasses import dataclass
from urllib.parse import urldefrag, urljoin, urlsplit

from app.kb.parsing import parse_html
from app.kb.web import HTML_TYPES, TEXT_TYPES, FetchFailure, SafeFetcher, normalize_url

_SKIP_EXTENSIONS = (
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".webp",
    ".zip",
    ".mp4",
    ".mp3",
    ".css",
    ".js",
    ".json",
    ".xml",
    ".ico",
    ".woff",
    ".woff2",
    ".docx",
    ".xlsx",
    ".pptx",
)

_META = re.compile(
    r"""<meta\s+[^>]*?(?:name|property)\s*=\s*["'](?:description|og:description)["']"""
    r"""[^>]*?content\s*=\s*["']([^"']+)""",
    re.IGNORECASE,
)
_META_REV = re.compile(
    r"""<meta\s+[^>]*?content\s*=\s*["']([^"']+)["'][^>]*?(?:name|property)\s*=\s*"""
    r"""["'](?:description|og:description)["']""",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class SitePage:
    path: str
    title: str


@dataclass(frozen=True, slots=True)
class SiteRead:
    url: str
    pages: tuple[SitePage, ...]
    highlights: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class _One:
    url: str
    path: str
    title: str
    headings: tuple[str, ...]
    blurb: str | None
    links: tuple[str, ...]


def _path_label(url: str) -> str:
    path = urlsplit(url).path or "/"
    return path if len(path) <= 120 else path[:119] + "\u2026"


def _meta_description(html: str) -> str | None:
    match = _META.search(html) or _META_REV.search(html)
    if match is None:
        return None
    text = " ".join(match.group(1).split())
    if len(text) < 2:
        return None
    return text if len(text) <= 240 else text[:239] + "\u2026"


def _headings(text: str, *, limit: int = 8) -> list[str]:
    found: list[str] = []
    for line in text.splitlines():
        if not line.startswith("# "):
            continue
        heading = " ".join(line[2:].split())
        if len(heading) < 2 or len(heading) > 120 or heading in found:
            continue
        found.append(heading)
        if len(found) >= limit:
            break
    return found


def _same_site(url: str, origin: tuple[str, str]) -> bool:
    parts = urlsplit(url)
    if (parts.scheme, parts.netloc) != origin:
        return False
    return not (parts.path or "/").lower().endswith(_SKIP_EXTENSIONS)


async def _read_one(fetcher: SafeFetcher, url: str) -> _One:
    if not await fetcher.allowed_by_robots(url):
        raise FetchFailure("blocked", "The site's robots.txt asks readers to stay out.")
    fetched = await fetcher.get(url)
    if fetched.status in (401, 403, 451):
        raise FetchFailure("blocked", f"The site refused the request ({fetched.status}).")
    if fetched.status != 200:
        raise FetchFailure("unreachable", f"The page returned {fetched.status}.")
    raw = fetched.text()
    if fetched.content_type in HTML_TYPES:
        html = parse_html(raw)
        title = html.title
        headings = _headings(html.text)
        links = tuple(urldefrag(urljoin(fetched.url, href))[0] for href in html.links if href)
        blurb = _meta_description(raw)
    elif fetched.content_type in TEXT_TYPES:
        title, headings, links, blurb = None, _headings(raw), (), None
    else:
        raise FetchFailure("unreachable", "That address isn't a web page.")
    path = _path_label(fetched.url)
    label = title or (headings[0] if headings else None) or path
    return _One(fetched.url, path, label, tuple(headings), blurb, links)


async def read_public_site(fetcher: SafeFetcher, raw_url: str, *, max_pages: int = 6) -> SiteRead:
    """Homepage plus a few public pages linked from it.

    Raises ``UrlRejected`` or ``FetchFailure``.
    """
    start = normalize_url(raw_url, allowed_ports=fetcher.config.allowed_ports)
    home = await _read_one(fetcher, start)
    pages = [home]
    origin = (urlsplit(home.url).scheme, urlsplit(home.url).netloc)
    seen = {home.url}
    queue: list[str] = []
    for link in home.links:
        if link in seen or not _same_site(link, origin):
            continue
        seen.add(link)
        queue.append(link)
        if len(queue) >= max(0, max_pages - 1):
            break

    async def follow(link: str) -> _One | None:
        try:
            return await _read_one(fetcher, link)
        except FetchFailure:
            return None

    more: Sequence[_One | None] = await asyncio.gather(*(follow(link) for link in queue))
    pages.extend(page for page in more if page is not None)

    highlights: list[str] = []
    if home.blurb:
        highlights.append(home.blurb)
    for page in pages:
        for heading in page.headings:
            if heading not in highlights:
                highlights.append(heading)
            if len(highlights) >= 8:
                break
        if len(highlights) >= 8:
            break
    return SiteRead(
        url=home.url,
        pages=tuple(SitePage(page.path, page.title) for page in pages),
        highlights=tuple(highlights),
    )
