"""Put a public object in Cloudflare R2 (S3-compatible).

WorkOS organizations have no logo field, and AuthKit branding is one mark for the whole
environment, so a workspace logo cannot live there. R2 is the store. The browser loads
``R2_PUBLIC_BASE_URL`` (a custom domain or an r2.dev URL); the API only writes.
"""

import hashlib
import hmac
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol
from urllib.parse import quote

import httpx

from app.core.config import Settings


class ObjectStore(Protocol):
    async def put_public(self, *, key: str, body: bytes, content_type: str) -> str: ...


def _hmac(key: bytes, message: str) -> bytes:
    return hmac.new(key, message.encode(), hashlib.sha256).digest()


def signing_key(secret: str, date: str, *, region: str = "auto") -> bytes:
    key = _hmac(f"AWS4{secret}".encode(), date)
    key = _hmac(key, region)
    key = _hmac(key, "s3")
    return _hmac(key, "aws4_request")


def authorization_header(
    *,
    method: str,
    host: str,
    canonical_uri: str,
    body: bytes,
    content_type: str,
    access_key: str,
    secret: str,
    amz_date: str,
    region: str = "auto",
) -> tuple[str, str]:
    """AWS SigV4 ``Authorization`` value and the payload hash it signs."""
    payload_hash = hashlib.sha256(body).hexdigest()
    canonical_headers = (
        f"content-type:{content_type}\n"
        f"host:{host}\n"
        f"x-amz-content-sha256:{payload_hash}\n"
        f"x-amz-date:{amz_date}\n"
    )
    signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date"
    canonical_request = "\n".join(
        (method, canonical_uri, "", canonical_headers, signed_headers, payload_hash)
    )
    date = amz_date[:8]
    scope = f"{date}/{region}/s3/aws4_request"
    string_to_sign = "\n".join(
        (
            "AWS4-HMAC-SHA256",
            amz_date,
            scope,
            hashlib.sha256(canonical_request.encode()).hexdigest(),
        )
    )
    signature = hmac.new(
        signing_key(secret, date, region=region), string_to_sign.encode(), hashlib.sha256
    ).hexdigest()
    header = (
        f"AWS4-HMAC-SHA256 Credential={access_key}/{scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    return header, payload_hash


@dataclass(frozen=True, slots=True)
class R2Store:
    account_id: str
    access_key: str
    secret: str
    bucket: str
    public_base_url: str
    timeout_s: float = 20.0

    async def put_public(self, *, key: str, body: bytes, content_type: str) -> str:
        host = f"{self.account_id}.r2.cloudflarestorage.com"
        safe_key = quote(key, safe="/")
        canonical_uri = f"/{quote(self.bucket, safe='')}/{safe_key}"
        amz_date = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        header, payload_hash = authorization_header(
            method="PUT",
            host=host,
            canonical_uri=canonical_uri,
            body=body,
            content_type=content_type,
            access_key=self.access_key,
            secret=self.secret,
            amz_date=amz_date,
        )
        url = f"https://{host}{canonical_uri}"
        async with httpx.AsyncClient(timeout=self.timeout_s, trust_env=False) as client:
            response = await client.put(
                url,
                content=body,
                headers={
                    "Content-Type": content_type,
                    "Host": host,
                    "x-amz-content-sha256": payload_hash,
                    "x-amz-date": amz_date,
                    "Authorization": header,
                },
            )
        if response.status_code >= 300:
            raise OSError(f"R2 answered {response.status_code}")
        base = self.public_base_url.rstrip("/")
        return f"{base}/{safe_key}"


def build_object_store(settings: Settings) -> ObjectStore | None:
    if not settings.r2_configured:
        return None
    return R2Store(
        account_id=settings.r2_account_id,
        access_key=settings.r2_access_key_id.get_secret_value(),
        secret=settings.r2_secret_access_key.get_secret_value(),
        bucket=settings.r2_bucket,
        public_base_url=settings.r2_public_base_url.rstrip("/"),
    )
