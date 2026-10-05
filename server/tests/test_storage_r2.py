"""R2 uploads: a signed PUT, the public URL back, and a refusal raised as OSError."""

from typing import ClassVar

import httpx
import pytest
from pydantic import SecretStr

from app.storage.r2 import R2Store, build_object_store


class _Client:
    seen: ClassVar[list[httpx.Request]] = []
    status: ClassVar[int] = 200

    def __init__(self, **kwargs: object) -> None:
        assert kwargs["trust_env"] is False

    async def __aenter__(self) -> "_Client":
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def put(self, url: str, *, content: bytes, headers: dict[str, str]) -> httpx.Response:
        req = httpx.Request("PUT", url, content=content, headers=headers)
        _Client.seen.append(req)
        return httpx.Response(_Client.status, request=req)


@pytest.fixture
def store(monkeypatch: pytest.MonkeyPatch) -> R2Store:
    _Client.seen, _Client.status = [], 200
    monkeypatch.setattr("app.storage.r2.httpx.AsyncClient", _Client)
    return R2Store("acct", "AK", "SK", "logos bucket", "https://cdn.test/")


async def test_put_public_signs_and_returns_the_public_url(store: R2Store) -> None:
    url = await store.put_public(key="logos/o 1/a.png", body=b"png", content_type="image/png")
    assert url == "https://cdn.test/logos/o%201/a.png"
    req = _Client.seen[0]
    assert str(req.url) == "https://acct.r2.cloudflarestorage.com/logos%20bucket/logos/o%201/a.png"
    assert req.headers["Authorization"].startswith("AWS4-HMAC-SHA256 Credential=AK/")
    assert req.headers["x-amz-content-sha256"] and req.headers["x-amz-date"].endswith("Z")


async def test_a_refusal_is_an_os_error(store: R2Store) -> None:
    _Client.status = 403
    with pytest.raises(OSError, match="403"):
        await store.put_public(key="k", body=b"x", content_type="image/png")


def test_build_object_store_needs_every_key() -> None:
    class S:
        r2_configured = False

    assert build_object_store(S()) is None  # type: ignore[arg-type]

    class Full:
        r2_configured = True
        r2_account_id = "acct"
        r2_access_key_id = SecretStr("AK")
        r2_secret_access_key = SecretStr("SK")
        r2_bucket = "b"
        r2_public_base_url = "https://cdn.test/"

    built = build_object_store(Full())  # type: ignore[arg-type]
    assert isinstance(built, R2Store) and built.public_base_url == "https://cdn.test"
