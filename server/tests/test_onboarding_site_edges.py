"""Site read edge cases: what is skipped, what fails, and the caps on pages and highlights."""

import pytest

from app.kb.web import FetchFailure
from app.onboarding.site import _headings, _meta_description, _path_label, read_public_site
from tests.test_kb_web import PUBLIC_IP, Web


def _web(home: str, **pages: str) -> Web:
    w = Web(dns={"northwind.io": [PUBLIC_IP]})
    w.add(
        "northwind.io",
        "/robots.txt",
        body="User-agent: *\nDisallow: /private\n",
        content_type="text/plain",
    )
    w.add("northwind.io", "/", body=home)
    for path, body in pages.items():
        w.add("northwind.io", f"/{path}", body=body)
    return w


def test_helpers() -> None:
    assert _meta_description('<meta name="description" content="x">') is None
    long = "word " * 80
    got = _meta_description(f'<meta content="{long}" name="description">')
    assert got is not None and len(got) == 240 and got.endswith("\u2026")
    text = (
        "# A\n# Same\n# Same\n# "
        + "x" * 130
        + "\nplain\n"
        + "".join(f"# H{i}\n" for i in range(12))
    )
    assert _headings(text) == ["Same", "H0", "H1", "H2", "H3", "H4", "H5", "H6"]
    assert _path_label("https://n.io/" + "a" * 200).endswith("\u2026")
    assert _path_label("https://n.io") == "/"


async def test_skips_files_other_sites_and_failed_pages_and_caps_the_queue() -> None:
    links = "".join(f'<a href="/p{i}">P{i}</a>' for i in range(8))
    home = (
        "<html><head><title>Home</title></head><body><h1>Hello there</h1>"
        '<a href="/brochure.pdf">PDF</a><a href="/private">Private</a>'
        '<a href="/gone">Gone</a><a href="/">Self</a>' + links + "</body></html>"
    )
    pages = {
        f"p{i}": f"<html><body><h1>Page {i}</h1><h1>Extra {i}</h1></body></html>" for i in range(8)
    }
    web = _web(home, **pages)
    fetcher = web.fetcher(respect_robots=True, crawl_max_pages=4, timeout_s=5)
    read = await read_public_site(fetcher, "northwind.io", max_pages=4)
    await fetcher.aclose()
    paths = [p.path for p in read.pages]
    assert paths[0] == "/" and "/brochure.pdf" not in paths and "/private" not in paths
    assert "/gone" not in paths  # a 404 linked page is dropped, not an error
    assert len(read.pages) <= 4
    assert read.highlights[0] == "Hello there"  # no meta description


async def test_highlights_stop_at_eight() -> None:
    home = (
        "<html><body>"
        + "".join(f"<h1>Heading {i}</h1>" for i in range(8))
        + '<a href="/a">A</a></body></html>'
    )
    web = _web(home, a="<html><body><h1>More</h1></body></html>")
    fetcher = web.fetcher(respect_robots=False)
    read = await read_public_site(fetcher, "northwind.io")
    await fetcher.aclose()
    assert len(read.highlights) == 8 and "More" not in read.highlights
    assert read.pages[0].title == "Heading 0"  # no <title>: the first heading


async def test_a_meta_blurb_and_many_headings_still_cap() -> None:
    home = (
        '<html><head><meta name="description" content="Sensors for cold rooms."></head><body>'
        + "".join(f"<h1>Heading {i}</h1>" for i in range(7))
        + '<a href="/a">A</a></body></html>'
    )
    web = _web(home, a="<html><body><h1>One</h1><h1>Two</h1></body></html>")
    fetcher = web.fetcher(respect_robots=False)
    read = await read_public_site(fetcher, "northwind.io")
    await fetcher.aclose()
    assert read.highlights[0] == "Sensors for cold rooms." and len(read.highlights) == 8


async def test_a_plain_text_home_is_read() -> None:
    web = Web(dns={"northwind.io": [PUBLIC_IP]})
    web.add("northwind.io", "/", body="# Plain words\nhello", content_type="text/plain")
    fetcher = web.fetcher(respect_robots=False)
    read = await read_public_site(fetcher, "northwind.io")
    await fetcher.aclose()
    assert [(p.path, p.title) for p in read.pages] == [("/", "Plain words")]


@pytest.mark.parametrize(
    ("status", "ctype", "robots", "failure"),
    [
        (500, "text/html", "Allow: /", "unreachable"),
        (200, "image/png", "Allow: /", "unreachable"),
        (200, "text/html", "Disallow: /", "blocked"),
    ],
)
async def test_homepage_failures(status: int, ctype: str, robots: str, failure: str) -> None:
    web = Web(dns={"northwind.io": [PUBLIC_IP]})
    web.add(
        "northwind.io", "/robots.txt", body=f"User-agent: *\n{robots}\n", content_type="text/plain"
    )
    web.add("northwind.io", "/", status=status, body="x", content_type=ctype)
    fetcher = web.fetcher(respect_robots=True)
    with pytest.raises(FetchFailure) as info:
        await read_public_site(fetcher, "northwind.io")
    await fetcher.aclose()
    assert info.value.failure == failure


async def test_a_heading_repeated_on_another_page_is_kept_once() -> None:
    home = '<html><body><h1>Cold rooms</h1><a href="/a">A</a></body></html>'
    web = _web(home, a="<html><body><h1>Cold rooms</h1><h1>Pricing</h1></body></html>")
    fetcher = web.fetcher(respect_robots=False)
    read = await read_public_site(fetcher, "northwind.io")
    await fetcher.aclose()
    assert read.highlights == ("Cold rooms", "Pricing")
