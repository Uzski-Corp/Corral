"""SSRF-safe web reading: URL rules, DNS pinning, redirects, robots.txt, caps, crawling."""

from collections.abc import Sequence
from dataclasses import dataclass, field

import httpx
import pytest

from app.kb.errors import IngestFailure
from app.kb.parsing import ParseLimits
from app.kb.web import (
    FetchConfig,
    Fetched,
    FetchFailure,
    SafeFetcher,
    UrlRejected,
    is_public_ip,
    normalize_url,
    read_web_source,
    system_resolver,
)
from tests.conftest import make_settings

PUBLIC_IP = "93.184.216.34"
OTHER_IP = "151.101.1.1"
LIMITS = ParseLimits()


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("coldtrace.io/pricing", "https://coldtrace.io/pricing"),
        ("  https://ColdTrace.IO  ", "https://coldtrace.io/"),
        ("http://coldtrace.io:80/a?b=1#frag", "http://coldtrace.io:80/a?b=1"),
        ("https://b\u00fccher.example/x", "https://xn--bcher-kva.example/x"),
        (f"http://{PUBLIC_IP}/", f"http://{PUBLIC_IP}/"),
        ("http://[2606:4700:4700::1111]/", "http://[2606:4700:4700::1111]/"),
        ("https://coldtrace.io./", "https://coldtrace.io/"),
    ],
)
def test_normalize_url(raw: str, expected: str) -> None:
    assert normalize_url(raw) == expected


@pytest.mark.parametrize(
    ("raw", "error"),
    [
        ("", "url_invalid"),
        ("   ", "url_invalid"),
        ("ftp://coldtrace.io/", "url_invalid"),
        ("javascript:alert(1)", "url_invalid"),
        ("file:///etc/passwd", "url_invalid"),
        ("https://user:pw@coldtrace.io/", "url_invalid"),
        ("https://coldtrace.io/a b", "url_invalid"),
        ("https://coldtrace.io:99999/", "url_invalid"),
        ("https://" + "a" * 2050 + ".io", "url_invalid"),
        ("https://exa\udcffmple.com/", "url_invalid"),
        ("https:///path", "url_invalid"),
        ("http://localhost/", "url_not_public"),
        ("http://intranet/", "url_not_public"),
        ("http://printer.local/", "url_not_public"),
        ("http://svc.internal/", "url_not_public"),
        ("http://127.0.0.1/", "url_not_public"),
        ("http://10.1.2.3/", "url_not_public"),
        ("http://192.168.0.1/", "url_not_public"),
        ("http://169.254.169.254/latest/meta-data/", "url_not_public"),  # cloud metadata
        ("http://[::1]/", "url_not_public"),
        ("http://[::ffff:127.0.0.1]/", "url_not_public"),
        ("http://[fd00::1]/", "url_not_public"),
        ("http://0.0.0.0/", "url_not_public"),
        ("http://100.64.0.1/", "url_not_public"),  # carrier-grade NAT
        ("https://coldtrace.io:8443/", "url_not_public"),
    ],
)
def test_normalize_url_rejects(raw: str, error: str) -> None:
    with pytest.raises(UrlRejected) as info:
        normalize_url(raw)
    assert info.value.error == error
    assert info.value.detail


def test_allowed_ports_are_configurable() -> None:
    assert normalize_url("https://coldtrace.io:8443/", allowed_ports=[443, 8443]).endswith(":8443/")


@pytest.mark.parametrize(
    ("ip", "public"),
    [
        (PUBLIC_IP, True),
        ("2606:4700:4700::1111", True),
        ("::ffff:93.184.216.34", True),
        ("10.0.0.1", False),
        ("fe80::1%eth0", False),
        ("224.0.0.1", False),
        ("not an ip", False),
    ],
)
def test_is_public_ip(ip: str, public: bool) -> None:
    assert is_public_ip(ip) is public


def test_fetch_config_from_settings() -> None:
    config = FetchConfig.from_settings(
        make_settings(kb_url_allowed_ports=[443], kb_crawl_max_pages=3, kb_respect_robots_txt=False)
    )
    assert (config.allowed_ports, config.crawl_max_pages, config.respect_robots) == (
        (443,),
        3,
        False,
    )


def test_fetched_text_decoding() -> None:
    def page(body: bytes, charset: str | None) -> Fetched:
        return Fetched("u", 200, "text/html", body, charset, False)

    assert page("caf\u00e9".encode("latin-1"), "latin-1").text() == "caf\u00e9"
    assert page(b"ok", "no-such-codec").text() == "ok"
    assert page(b"\xff ok", None).text() == "\ufffd ok"


async def test_system_resolver_resolves_literals() -> None:
    assert "127.0.0.1" in await system_resolver("127.0.0.1", 80)


# --- a fake internet -----------------------------------------------------------------


@dataclass
class Web:
    """Routes by (Host header, path); records what actually went over the wire."""

    pages: dict[tuple[str, str], tuple[int, dict[str, str], str]] = field(default_factory=dict)
    dns: dict[str, list[str]] = field(default_factory=dict)
    requests: list[httpx.Request] = field(default_factory=list)

    def add(
        self, host: str, path: str, *, status: int = 200, body: str = "", **headers: str
    ) -> None:
        normalized = {k.replace("_", "-"): v for k, v in headers.items()}
        normalized.setdefault("content-type", "text/html; charset=utf-8")
        self.pages[(host, path)] = (status, normalized, body)

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        key = (request.headers["host"], request.url.path)
        if key not in self.pages:
            return httpx.Response(404, text="nope")
        status, headers, body = self.pages[key]
        return httpx.Response(status, headers=headers, text=body)

    async def resolve(self, host: str, port: int) -> Sequence[str]:
        if host not in self.dns:
            raise OSError("NXDOMAIN")
        return self.dns[host]

    def fetcher(self, **config: object) -> SafeFetcher:
        return SafeFetcher(
            FetchConfig(**config),  # type: ignore[arg-type]
            resolver=self.resolve,
            transport=httpx.MockTransport(self.handle),
        )


@pytest.fixture
def web() -> Web:
    w = Web(dns={"coldtrace.io": [PUBLIC_IP], "cdn.coldtrace.io": [OTHER_IP]})
    w.add(
        "coldtrace.io",
        "/robots.txt",
        body="User-agent: *\nDisallow: /private\n",
        content_type="text/plain",
    )
    return w


async def test_requests_are_pinned_to_the_checked_ip(web: Web) -> None:
    web.add("coldtrace.io", "/pricing", body="<h1>Pricing</h1><p>$39 per sensor per month.</p>")
    fetcher = web.fetcher()
    fetched = await fetcher.get("https://coldtrace.io/pricing")
    await fetcher.aclose()
    assert fetched.status == 200
    request = web.requests[-1]
    assert request.url.host == PUBLIC_IP  # connects to the IP we validated...
    assert request.headers["host"] == "coldtrace.io"  # ...but asks for the real site
    assert request.extensions["sni_hostname"] == "coldtrace.io"  # and TLS verifies its cert
    assert request.headers["user-agent"].startswith("CorralBot")


async def test_ipv6_addresses_are_bracketed(web: Web) -> None:
    web.dns["v6.coldtrace.io"] = ["2606:4700:4700::1111"]
    web.add("v6.coldtrace.io:443", "/", body="<p>hi</p>")
    fetched = await web.fetcher().get("https://v6.coldtrace.io:443/")
    assert fetched.status == 200
    assert web.requests[-1].url.host == "2606:4700:4700::1111"


async def test_any_private_answer_blocks_the_host(web: Web) -> None:
    web.dns["rebind.test.io"] = [PUBLIC_IP, "10.0.0.5"]
    with pytest.raises(FetchFailure) as info:
        await web.fetcher().get("https://rebind.test.io/")
    assert info.value.failure == "blocked"
    assert web.requests == []  # nothing was sent anywhere


@pytest.mark.parametrize("dns", [None, []])
async def test_unresolvable_hosts_are_unreachable(web: Web, dns: list[str] | None) -> None:
    if dns is not None:
        web.dns["empty.test.io"] = dns
    with pytest.raises(FetchFailure) as info:
        await web.fetcher().get("https://empty.test.io/")
    assert info.value.failure == "unreachable"


async def test_redirects_are_followed_and_revalidated(web: Web) -> None:
    web.add("coldtrace.io", "/old", status=301, location="https://cdn.coldtrace.io/new")
    web.add("cdn.coldtrace.io", "/new", body="<p>moved</p>")
    fetched = await web.fetcher().get("https://coldtrace.io/old")
    assert (fetched.url, fetched.status) == ("https://cdn.coldtrace.io/new", 200)
    assert [r.url.host for r in web.requests] == [PUBLIC_IP, OTHER_IP]


@pytest.mark.parametrize(
    "target",
    [
        "http://169.254.169.254/latest/meta-data/",
        "http://localhost:8000/admin",
        "file:///etc/passwd",
    ],
)
async def test_redirects_to_private_targets_are_blocked(web: Web, target: str) -> None:
    web.add("coldtrace.io", "/go", status=302, location=target)
    with pytest.raises(FetchFailure) as info:
        await web.fetcher().get("https://coldtrace.io/go")
    assert info.value.failure == "blocked"
    assert len(web.requests) == 1


async def test_redirect_loops_give_up(web: Web) -> None:
    web.add("coldtrace.io", "/a", status=302, location="/b")
    web.add("coldtrace.io", "/b", status=302, location="/a")
    with pytest.raises(FetchFailure, match="Too many redirects"):
        await web.fetcher(max_redirects=3).get("https://coldtrace.io/a")
    assert len(web.requests) == 4


async def test_a_redirect_without_location_is_returned_as_is(web: Web) -> None:
    web.add("coldtrace.io", "/weird", status=302)
    assert (await web.fetcher().get("https://coldtrace.io/weird")).status == 302


async def test_bodies_are_capped(web: Web) -> None:
    web.add("coldtrace.io", "/big", body="x" * 5000)
    fetched = await web.fetcher(max_bytes=1000).get("https://coldtrace.io/big")
    assert (len(fetched.body), fetched.truncated) == (1000, True)


async def test_compressed_bodies_are_capped_after_decoding(web: Web) -> None:
    """A gzip bomb: 64 KiB on the wire, 64 MiB decoded. Only the cap is ever inflated."""
    import zlib

    compressor = zlib.compressobj(9, zlib.DEFLATED, 31)  # gzip container
    bomb = compressor.compress(b"\0" * (64 * 1024 * 1024)) + compressor.flush()
    served: list[int] = []

    class Wire(httpx.AsyncByteStream):
        async def __aiter__(self):  # type: ignore[no-untyped-def]
            for i in range(0, len(bomb), 4096):
                served.append(i)
                yield bomb[i : i + 4096]

    fetcher = SafeFetcher(
        FetchConfig(max_bytes=10_000),
        resolver=web.resolve,
        transport=httpx.MockTransport(
            lambda r: httpx.Response(200, headers={"content-encoding": "gzip"}, stream=Wire())
        ),
    )
    fetched = await fetcher.get("https://coldtrace.io/")
    assert (len(fetched.body), fetched.truncated) == (10_000, True)
    assert len(served) < len(bomb) // 4096  # stopped reading the wire early


async def test_network_errors_are_unreachable(web: Web) -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    fetcher = SafeFetcher(
        FetchConfig(), resolver=web.resolve, transport=httpx.MockTransport(refuse)
    )
    with pytest.raises(FetchFailure) as info:
        await fetcher.get("https://coldtrace.io/")
    assert info.value.failure == "unreachable"


async def test_a_body_that_breaks_mid_stream_is_unreachable(web: Web) -> None:
    class Broken(httpx.AsyncByteStream):
        async def __aiter__(self):  # type: ignore[no-untyped-def]
            yield b"partial"
            raise httpx.ReadError("reset")

    fetcher = SafeFetcher(
        FetchConfig(),
        resolver=web.resolve,
        transport=httpx.MockTransport(lambda r: httpx.Response(200, stream=Broken())),
    )
    with pytest.raises(FetchFailure, match="stopped answering"):
        await fetcher.get("https://coldtrace.io/")


# --- robots.txt ------------------------------------------------------------------------


async def test_robots_rules_are_obeyed_and_cached(web: Web) -> None:
    fetcher = web.fetcher()
    assert await fetcher.allowed_by_robots("https://coldtrace.io/pricing")
    assert not await fetcher.allowed_by_robots("https://coldtrace.io/private/x")
    robots = [r for r in web.requests if r.url.path == "/robots.txt"]
    assert len(robots) == 1


@pytest.mark.parametrize(("status", "allowed"), [(404, True), (403, True), (503, False)])
async def test_robots_status_rules(web: Web, status: int, allowed: bool) -> None:
    web.add("coldtrace.io", "/robots.txt", status=status)
    assert await web.fetcher().allowed_by_robots("https://coldtrace.io/x") is allowed


async def test_unreachable_robots_means_stay_out(web: Web) -> None:
    web.dns["gone.test.io"] = ["10.0.0.1"]
    assert not await web.fetcher().allowed_by_robots("https://gone.test.io/")


async def test_robots_can_be_ignored_by_config(web: Web) -> None:
    fetcher = web.fetcher(respect_robots=False)
    assert await fetcher.allowed_by_robots("https://coldtrace.io/private/x")
    assert web.requests == []


# --- reading a source ------------------------------------------------------------------


async def read(web: Web, url: str, scope: str = "page", **config: object) -> object:
    fetcher = web.fetcher(**config)
    try:
        return await read_web_source(fetcher, url, scope=scope, limits=LIMITS)  # type: ignore[arg-type]
    finally:
        await fetcher.aclose()


async def test_read_one_page(web: Web) -> None:
    web.add(
        "coldtrace.io",
        "/how-it-works",
        body="<title>How</title><h1>How it works</h1><p>Sensors stick on.</p>"
        "<h2>Alerts</h2><p>SMS.</p>",
    )
    doc = await read(web, "https://coldtrace.io/how-it-works")
    assert [s.loc for s in doc.sections] == ["/how-it-works", "/how-it-works"]  # type: ignore[attr-defined]
    assert (doc.pages_total, doc.pages_read, doc.partial) == (1, 1, False)  # type: ignore[attr-defined]
    assert (doc.heading_count, doc.word_count) == (2, 8)  # type: ignore[attr-defined]


async def test_headings_are_counted_across_a_section(web: Web) -> None:
    web.add("coldtrace.io", "/docs", body="<h1>Docs</h1><p>Start.</p><a href='/docs/a'>a</a>")
    web.add("coldtrace.io", "/docs/a", body="<h2>Alerts</h2><p>SMS.</p><h2>Calls</h2><p>Yes.</p>")
    doc = await read(web, "https://coldtrace.io/docs", scope="section")
    assert [s.loc for s in doc.sections] == ["/docs", "/docs/a", "/docs/a"]  # type: ignore[attr-defined]
    assert doc.heading_count == 3  # type: ignore[attr-defined]


async def test_plain_text_pages_are_read(web: Web) -> None:
    web.add("coldtrace.io", "/notes.txt", body="Plain notes", content_type="text/plain")
    doc = await read(web, "https://coldtrace.io/notes.txt")
    assert doc.sections[0].text == "Plain notes"  # type: ignore[attr-defined]


@pytest.mark.parametrize(
    ("status", "content_type", "failure"),
    [
        (403, "text/html", "blocked"),
        (401, "text/html", "blocked"),
        (500, "text/html", "unreachable"),
        (404, "text/html", "unreachable"),
        (200, "application/pdf", "unreachable"),
    ],
)
async def test_page_failures(web: Web, status: int, content_type: str, failure: str) -> None:
    web.add("coldtrace.io", "/p", status=status, content_type=content_type, body="x")
    with pytest.raises(IngestFailure) as info:
        await read(web, "https://coldtrace.io/p")
    assert (info.value.failure, info.value.stage) == (failure, "upload")


async def test_robots_disallow_blocks_the_page(web: Web) -> None:
    web.add("coldtrace.io", "/private/deck", body="<p>secret</p>")
    with pytest.raises(IngestFailure) as info:
        await read(web, "https://coldtrace.io/private/deck")
    assert info.value.failure == "blocked"


async def test_an_empty_page_has_no_text(web: Web) -> None:
    web.add("coldtrace.io", "/empty", body="<script>only()</script>")
    with pytest.raises(IngestFailure) as info:
        await read(web, "https://coldtrace.io/empty")
    assert info.value.failure == "no-text"


def _blog(web: Web) -> None:
    web.add(
        "coldtrace.io",
        "/blog",
        body=(
            "<p>Blog index</p><a href='/blog/one'>1</a><a href='/blog/two#top'>2</a>"
            "<a href='/blog/one'>dup</a><a href='/pricing'>out of section</a>"
            "<a href='https://elsewhere.io/blog/x'>other site</a><a href='/blog/deck.pdf'>pdf</a>"
            "<a href='/blog/broken'>404</a><a href='/blog/blank'>blank</a>"
            "<a href='/blogger'>prefix trap</a><a href='/private/p'>robots</a>"
        ),
    )
    web.add("coldtrace.io", "/blog/one", body="<p>First post</p><a href='/blog/three'>3</a>")
    web.add("coldtrace.io", "/blog/two", body="<p>Second post</p>")
    web.add("coldtrace.io", "/blog/three", body="<p>Third post</p>")
    web.add("coldtrace.io", "/blog/blank", body="<nav>menu only</nav>")
    web.add("coldtrace.io", "/pricing", body="<p>not in the blog</p>")


async def test_section_crawl_stays_in_the_section(web: Web) -> None:
    _blog(web)
    progress: list[tuple[int, int]] = []

    async def on_page(done: int, cap: int) -> None:
        progress.append((done, cap))

    fetcher = web.fetcher(crawl_max_pages=10)
    doc = await read_web_source(
        fetcher, "https://coldtrace.io/blog", scope="section", limits=LIMITS, on_page=on_page
    )
    locs = [s.loc for s in doc.sections]
    assert locs == ["/blog", "/blog/one", "/blog/two", "/blog/three"]
    fetched = {r.url.path for r in web.requests}
    assert "/pricing" not in fetched
    assert "/blogger" not in fetched
    assert "/blog/deck.pdf" not in fetched
    assert "/private/p" not in fetched
    assert (doc.pages_total, doc.pages_read) == (6, 4)
    assert (doc.skipped, doc.skipped_reason) == ("/blog/broken, /blog/blank", "unreadable")
    assert doc.note == "2 of 6 pages couldn't be read."
    assert progress[-1] == (6, 10)


async def test_section_crawl_is_capped(web: Web) -> None:
    _blog(web)
    doc = await read(web, "https://coldtrace.io/blog", "section", crawl_max_pages=2)
    assert doc.pages_total == 2  # type: ignore[attr-defined]


async def test_whole_site_section(web: Web) -> None:
    web.add("coldtrace.io", "/", body="<p>Home</p><a href='/about'>about</a>")
    web.add("coldtrace.io", "/about", body="<p>About us</p>")
    doc = await read(web, "https://coldtrace.io/", "section")
    assert [s.loc for s in doc.sections] == ["/", "/about"]  # type: ignore[attr-defined]


async def test_text_budget_spans_pages(web: Web) -> None:
    web.add("coldtrace.io", "/", body="<p>" + "a" * 80 + "</p><a href='/b'>b</a><a href='/c'>c</a>")
    web.add("coldtrace.io", "/b", body="<p>" + "b" * 80 + "</p>")
    web.add("coldtrace.io", "/c", body="<p>" + "c" * 80 + "</p>")
    fetcher = web.fetcher()
    doc = await read_web_source(
        fetcher, "https://coldtrace.io/", scope="section", limits=ParseLimits(max_text_chars=100)
    )
    assert doc.char_count == 100
    assert [s.loc for s in doc.sections] == ["/", "/b"]  # budget spent before /c


async def test_text_budget_stops_within_a_page(web: Web) -> None:
    web.add("coldtrace.io", "/", body="<h1>A</h1><p>" + "a" * 50 + "</p><h1>B</h1><p>bbb</p>")
    fetcher = web.fetcher()
    doc = await read_web_source(
        fetcher, "https://coldtrace.io/", scope="page", limits=ParseLimits(max_text_chars=20)
    )
    assert (len(doc.sections), doc.char_count) == (1, 20)


async def test_a_public_ip_literal_is_used_without_dns(web: Web) -> None:
    web.add(PUBLIC_IP, "/", body="<p>by address</p>")
    doc = await read(web, f"http://{PUBLIC_IP}/")
    assert doc.sections[0].text == "by address"  # type: ignore[attr-defined]


async def test_long_paths_and_skip_lists_are_capped(web: Web) -> None:
    long = "/blog/" + "p" * 300
    links = "".join(f"<a href='/blog/missing{i}{'x' * 30}'>m</a>" for i in range(12))
    web.add("coldtrace.io", "/blog", body=f"<p>index</p><a href='{long}'>l</a>{links}")
    web.add("coldtrace.io", long, body="<p>deep</p>")
    doc = await read(web, "https://coldtrace.io/blog", "section")
    assert doc.sections[1].loc is not None and len(doc.sections[1].loc) == 120  # type: ignore[attr-defined]
    assert len(doc.skipped) == 255  # type: ignore[attr-defined]
