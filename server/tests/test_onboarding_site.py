"""Onboarding reads the site it is given: titles and headings, not a sample company."""

import pytest

from app.kb.web import FetchFailure
from app.onboarding.logo import sniff_image
from app.onboarding.site import read_public_site
from app.storage.r2 import authorization_header
from tests.test_kb_web import PUBLIC_IP, Web

HOME = """
<html><head>
<title>Northwind Sensors</title>
<meta name="description" content="Pages the person on duty when a cold room drifts.">
</head><body>
<h1>Page the right person</h1>
<p>Wireless sensors for cold rooms.</p>
<a href="/pricing">Pricing</a>
<a href="https://other.example/nope">Elsewhere</a>
</body></html>
"""
PRICING = "<html><head><title>Pricing</title></head><body><h1>Three plans</h1></body></html>"


@pytest.fixture
def web() -> Web:
    w = Web(dns={"northwind.io": [PUBLIC_IP]})
    w.add(
        "northwind.io", "/robots.txt", body="User-agent: *\nAllow: /\n", content_type="text/plain"
    )
    w.add("northwind.io", "/", body=HOME)
    w.add("northwind.io", "/pricing", body=PRICING)
    return w


async def test_read_public_site_returns_the_pages_it_fetched(web: Web) -> None:
    fetcher = web.fetcher(respect_robots=True, crawl_max_pages=6, timeout_s=5)
    read = await read_public_site(fetcher, "northwind.io", max_pages=6)
    await fetcher.aclose()
    assert read.url == "https://northwind.io/"
    assert [(p.path, p.title) for p in read.pages] == [
        ("/", "Northwind Sensors"),
        ("/pricing", "Pricing"),
    ]
    assert "Pages the person on duty when a cold room drifts." in read.highlights
    assert "Page the right person" in read.highlights
    assert "Three plans" in read.highlights
    assert all("coldtrace" not in h.lower() for h in read.highlights)


async def test_a_refused_homepage_is_an_error(web: Web) -> None:
    web.add("northwind.io", "/", status=403, body="no")
    fetcher = web.fetcher(respect_robots=False)
    with pytest.raises(FetchFailure) as info:
        await read_public_site(fetcher, "https://northwind.io")
    await fetcher.aclose()
    assert info.value.failure == "blocked"


def test_sniff_image_accepts_real_magic_and_refuses_svg() -> None:
    assert sniff_image(b"\x89PNG\r\n\x1a\nrest") == "image/png"
    assert sniff_image(b"\xff\xd8\xffrest") == "image/jpeg"
    assert sniff_image(b"GIF89arest") == "image/gif"
    assert sniff_image(b"RIFF0000WEBP") == "image/webp"
    assert sniff_image(b"<svg xmlns='http://www.w3.org/2000/svg'></svg>") is None
    assert sniff_image(b"") is None


def test_signature_is_stable_for_a_fixed_request() -> None:
    header, digest = authorization_header(
        method="PUT",
        host="acct.r2.cloudflarestorage.com",
        canonical_uri="/logos/logo.png",
        body=b"png",
        content_type="image/png",
        access_key="key",
        secret="secret",
        amz_date="20261001T000000Z",
    )
    assert header.startswith("AWS4-HMAC-SHA256 Credential=key/20261001/auto/s3/aws4_request")
    assert len(digest) == 64
    again, _ = authorization_header(
        method="PUT",
        host="acct.r2.cloudflarestorage.com",
        canonical_uri="/logos/logo.png",
        body=b"png",
        content_type="image/png",
        access_key="key",
        secret="secret",
        amz_date="20261001T000000Z",
    )
    assert header == again
