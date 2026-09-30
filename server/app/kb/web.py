"""Read public web pages without becoming an SSRF proxy.

Every hop (the first request, each redirect, robots.txt, each crawled page) is checked:

1. ``normalize_url``: http(s) only, no credentials, allowed ports only, no internal
   hostnames, no non-public IP literals.
2. DNS is resolved *once* by us and **every** address must be public (global unicast).
3. The request is sent to that exact IP, with the original ``Host`` header and TLS SNI,
   so a DNS answer that changes between check and connect (rebinding) can't redirect it.
4. Redirects are followed by hand (re-running 1-3), bodies are capped, keep-alive and
   environment proxies are off.
"""

import asyncio
import ipaddress
import socket
import urllib.robotparser
from collections import deque
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass, field
from typing import Literal
from urllib.parse import urldefrag, urljoin, urlsplit, urlunsplit

import httpx
import structlog

from app.core.config import Settings
from app.kb.errors import IngestFailure
from app.kb.parsing import (
    ParsedDocument,
    ParseLimits,
    Section,
    markdown_sections,
    parse_html,
)

log = structlog.get_logger(__name__)

Resolver = Callable[[str, int], Awaitable[Sequence[str]]]
UrlError = Literal["url_invalid", "url_not_public"]
REDIRECTS = frozenset({301, 302, 303, 307, 308})
HTML_TYPES = frozenset({"text/html", "application/xhtml+xml"})
TEXT_TYPES = frozenset({"text/plain", "text/markdown", "text/x-markdown"})
_INTERNAL_SUFFIXES = (".localhost", ".local", ".internal", ".lan", ".home.arpa", ".corp")
_SKIP_EXTENSIONS = (
    ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".zip", ".mp4", ".mp3",
    ".css", ".js", ".json", ".xml", ".ico", ".woff", ".woff2", ".docx", ".xlsx", ".pptx",
)  # fmt: skip
ROBOTS_MAX_BYTES = 512 * 1024


class UrlRejected(ValueError):
    def __init__(self, error: UrlError, detail: str) -> None:
        super().__init__(detail)
        self.error: UrlError = error
        self.detail = detail


class FetchFailure(Exception):
    def __init__(self, failure: Literal["unreachable", "blocked"], note: str) -> None:
        super().__init__(note)
        self.failure: Literal["unreachable", "blocked"] = failure
        self.note = note


def is_public_ip(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value.split("%", 1)[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def normalize_url(raw: str, *, allowed_ports: Sequence[int] = (80, 443)) -> str:
    """Canonical ``scheme://host[:port]/path[?query]``; raises ``UrlRejected``."""
    text = raw.strip()
    if not text or len(text) > 2048 or any(ch.isspace() or ord(ch) < 32 for ch in text):
        raise UrlRejected("url_invalid", "That doesn't look like a web address.")
    if "://" not in text:
        text = "https://" + text
    try:
        parts = urlsplit(text)
        port = parts.port
        host = (parts.hostname or "").rstrip(".")
        host_ascii = host.encode("idna").decode("ascii").lower() if host else ""
    except (ValueError, UnicodeError) as exc:
        raise UrlRejected("url_invalid", "That doesn't look like a web address.") from exc
    if parts.scheme not in ("http", "https"):
        raise UrlRejected("url_invalid", "Only http and https pages can be read.")
    if not host_ascii or parts.username is not None or parts.password is not None:
        raise UrlRejected("url_invalid", "That doesn't look like a web address.")
    if port is not None and port not in allowed_ports:
        raise UrlRejected("url_not_public", "Corral only reads pages on standard web ports.")
    literal = host_ascii.strip("[]")
    try:
        ipaddress.ip_address(literal)
    except ValueError:
        if "." not in host_ascii or host_ascii.endswith(_INTERNAL_SUFFIXES):
            raise UrlRejected("url_not_public", "Corral can only read public web pages.") from None
    else:
        if not is_public_ip(literal):
            raise UrlRejected("url_not_public", "Corral can only read public web pages.")
        host_ascii = f"[{literal}]" if ":" in literal else literal
    netloc = host_ascii if port is None else f"{host_ascii}:{port}"
    return urlunsplit((parts.scheme, netloc, parts.path or "/", parts.query, ""))


async def system_resolver(host: str, port: int) -> Sequence[str]:
    infos = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    return [str(info[4][0]) for info in infos]


@dataclass(frozen=True, slots=True)
class FetchConfig:
    timeout_s: float = 15.0
    max_bytes: int = 5 * 1024 * 1024
    max_redirects: int = 5
    allowed_ports: tuple[int, ...] = (80, 443)
    user_agent: str = "CorralBot/0.1"
    respect_robots: bool = True
    crawl_max_pages: int = 40

    @classmethod
    def from_settings(cls, settings: Settings) -> "FetchConfig":
        return cls(
            timeout_s=settings.kb_url_timeout_s,
            max_bytes=settings.kb_url_max_bytes,
            max_redirects=settings.kb_url_max_redirects,
            allowed_ports=tuple(settings.kb_url_allowed_ports),
            user_agent=settings.kb_url_user_agent,
            respect_robots=settings.kb_respect_robots_txt,
            crawl_max_pages=settings.kb_crawl_max_pages,
        )


@dataclass(frozen=True, slots=True)
class Fetched:
    url: str  # after redirects
    status: int
    content_type: str
    body: bytes
    charset: str | None
    truncated: bool
    location: str | None = None

    def text(self) -> str:
        try:
            return self.body.decode(self.charset or "utf-8", errors="replace")
        except LookupError:  # unknown charset label
            return self.body.decode("utf-8", errors="replace")


class SafeFetcher:
    def __init__(
        self,
        config: FetchConfig,
        *,
        resolver: Resolver = system_resolver,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.config = config
        self._resolve = resolver
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}
        self._client = httpx.AsyncClient(
            timeout=config.timeout_s,
            follow_redirects=False,
            trust_env=False,
            limits=httpx.Limits(max_keepalive_connections=0),
            transport=transport,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _pinned_ip(self, host: str, port: int) -> str:
        literal = host.strip("[]")
        if is_public_ip(literal):
            return literal
        try:
            addresses = list(await self._resolve(host, port))
        except (OSError, UnicodeError) as exc:
            raise FetchFailure("unreachable", "The address doesn't resolve.") from exc
        if not addresses:
            raise FetchFailure("unreachable", "The address doesn't resolve.")
        if not all(is_public_ip(a) for a in addresses):
            raise FetchFailure("blocked", "The address points at a private network.")
        return addresses[0].split("%", 1)[0]

    async def _get_once(self, url: str, max_bytes: int) -> Fetched:
        parts = urlsplit(url)
        host = parts.hostname or ""
        port = parts.port or (443 if parts.scheme == "https" else 80)
        ip = await self._pinned_ip(host, port)
        ip_host = f"[{ip}]" if ":" in ip else ip
        pinned = urlunsplit(
            (parts.scheme, ip_host if parts.port is None else f"{ip_host}:{parts.port}",
             parts.path or "/", parts.query, "")
        )  # fmt: skip
        request = self._client.build_request(
            "GET",
            pinned,
            headers={
                "Host": parts.netloc,
                "User-Agent": self.config.user_agent,
                "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
            },
            extensions={"sni_hostname": host},
        )
        try:
            response = await self._client.send(request, stream=True)
        except httpx.HTTPError as exc:
            raise FetchFailure(
                "unreachable", f"The page didn't answer ({type(exc).__name__})."
            ) from exc
        try:
            body = bytearray()
            truncated = False
            async for chunk in response.aiter_bytes():  # decoded: caps gzip bombs too
                body.extend(chunk)
                if len(body) > max_bytes:
                    del body[max_bytes:]
                    truncated = True
                    break
        except httpx.HTTPError as exc:
            raise FetchFailure("unreachable", "The page stopped answering.") from exc
        finally:
            await response.aclose()
        content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        return Fetched(
            url=url,
            status=response.status_code,
            content_type=content_type,
            body=bytes(body),
            charset=response.charset_encoding,
            truncated=truncated,
            location=response.headers.get("location"),
        )

    async def get(self, url: str, *, max_bytes: int | None = None) -> Fetched:
        """GET with hand-followed redirects; every hop is re-validated and re-pinned."""
        limit = max_bytes or self.config.max_bytes
        current = url
        for _ in range(self.config.max_redirects + 1):
            try:
                current = normalize_url(current, allowed_ports=self.config.allowed_ports)
            except UrlRejected as exc:
                raise FetchFailure(
                    "blocked", "It redirects to an address Corral won't read."
                ) from exc
            fetched = await self._get_once(current, limit)
            if fetched.status not in REDIRECTS or not fetched.location:
                return fetched
            current = urljoin(current, fetched.location)
        raise FetchFailure("unreachable", "Too many redirects.")

    async def allowed_by_robots(self, url: str) -> bool:
        if not self.config.respect_robots:
            return True
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin not in self._robots:
            self._robots[origin] = await self._load_robots(origin)
        parser = self._robots[origin]
        if parser is None:  # robots.txt unreachable: RFC 9309 says assume full disallow
            return False
        return parser.can_fetch(self.config.user_agent.split("/", 1)[0], url)

    async def _load_robots(self, origin: str) -> urllib.robotparser.RobotFileParser | None:
        parser = urllib.robotparser.RobotFileParser()
        try:
            fetched = await self.get(origin + "/robots.txt", max_bytes=ROBOTS_MAX_BYTES)
        except FetchFailure:
            return None
        if fetched.status >= 500:
            return None
        if fetched.status >= 400:
            parser.parse([])  # 4xx (incl. 401/403): no rules, everything allowed
        else:
            parser.parse(fetched.text().splitlines())
        return parser


# --- reading a source ------------------------------------------------------------------


@dataclass
class _Page:
    url: str
    sections: list[Section] = field(default_factory=list)
    links: list[str] = field(default_factory=list)
    heading_count: int = 0


def _path_label(url: str) -> str:
    parts = urlsplit(url)
    label = parts.path or "/"
    return label if len(label) <= 120 else label[:119] + "\u2026"


def _in_section(url: str, origin: tuple[str, str], prefix: str) -> bool:
    parts = urlsplit(url)
    if (parts.scheme, parts.netloc) != origin:
        return False
    path = parts.path or "/"
    if path.lower().endswith(_SKIP_EXTENSIONS):
        return False
    return prefix == "/" or path == prefix or path.startswith(prefix.rstrip("/") + "/")


async def _read_page(fetcher: SafeFetcher, url: str, limits: ParseLimits) -> _Page:
    if not await fetcher.allowed_by_robots(url):
        raise FetchFailure("blocked", "The site's robots.txt asks readers to stay out.")
    fetched = await fetcher.get(url)
    if fetched.status in (401, 403, 451):
        raise FetchFailure("blocked", f"The site refused the request ({fetched.status}).")
    if fetched.status != 200:
        raise FetchFailure("unreachable", f"The page returned {fetched.status}.")
    page = _Page(url=fetched.url)
    loc = _path_label(fetched.url)
    if fetched.content_type in HTML_TYPES:
        html = parse_html(fetched.text())
        text, page.links = html.text, [urldefrag(urljoin(fetched.url, h))[0] for h in html.links]
    elif fetched.content_type in TEXT_TYPES:
        text = fetched.text()
    else:
        raise FetchFailure("unreachable", "That address isn't a web page.")
    try:
        parsed = markdown_sections(text, limits, loc=loc)
    except IngestFailure:
        return page
    page.sections, page.heading_count = list(parsed.sections), parsed.heading_count
    return page


async def read_web_source(
    fetcher: SafeFetcher,
    url: str,
    *,
    scope: Literal["page", "section"],
    limits: ParseLimits,
    on_page: Callable[[int, int], Awaitable[None]] | None = None,
) -> ParsedDocument:
    """One page, or a bounded same-origin crawl of the path under ``url`` ("section")."""
    try:
        first = await _read_page(fetcher, url, limits)
    except FetchFailure as exc:
        raise IngestFailure(exc.failure, "upload", exc.note) from exc
    pages = [first]
    failed: list[str] = []
    if scope == "section":
        start = urlsplit(first.url)
        origin = (start.scheme, start.netloc)
        prefix = start.path or "/"
        seen = {first.url}
        queue = deque(first.links)
        cap = fetcher.config.crawl_max_pages
        while queue and len(pages) + len(failed) < cap:
            link = queue.popleft()
            if link in seen or not _in_section(link, origin, prefix):
                continue
            seen.add(link)
            try:
                page = await _read_page(fetcher, link, limits)
            except FetchFailure as exc:
                log.info("kb_crawl_page_skipped", reason=exc.failure)
                failed.append(_path_label(link))
                continue
            pages.append(page)
            queue.extend(page.links)
            if on_page is not None:
                await on_page(len(pages) + len(failed), cap)

    budget = limits.max_text_chars
    sections: list[Section] = []
    empty: list[str] = []
    for page in pages:
        if not page.sections:
            empty.append(_path_label(page.url))
        for section in page.sections:
            if budget <= 0:
                break
            text = section.text[:budget]
            budget -= len(text)
            sections.append(Section(section.loc, text))
    if not sections:
        raise IngestFailure("no-text", "parse")
    skipped_pages = failed + empty
    total = len(pages) + len(failed)
    note = None
    if skipped_pages:
        note = f"{len(skipped_pages)} of {total} pages couldn't be read."
    return ParsedDocument(
        tuple(sections),
        pages_total=total,
        pages_read=total - len(skipped_pages),
        skipped=_join_paths(skipped_pages) if skipped_pages else None,
        skipped_reason="unreadable" if skipped_pages else None,
        heading_count=sum(p.heading_count for p in pages),
        note=note,
    )


def _join_paths(paths: list[str]) -> str:
    out = ", ".join(paths)
    return out if len(out) <= 255 else out[:254] + "\u2026"
