"""AutoSend REST adapter, using the documented camelCase API contract."""

import hashlib
import hmac
from typing import Any
from urllib.parse import quote

import httpx

from app.core.config import Settings


class MailError(Exception):
    def __init__(self, code: str, *, uncertain: bool = False):
        super().__init__(code)
        self.code, self.uncertain = code, uncertain


def verify_signature(raw: bytes, signature: str | None, secret: str) -> bool:
    if not secret or not signature or len(signature) != 64:
        return False
    expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


class AutoSend:
    def __init__(self, settings: Settings):
        self.settings = settings

    async def request(
        self, method: str, path: str, payload: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        write = method == "POST"
        try:
            async with httpx.AsyncClient(
                timeout=20, base_url="https://api.autosend.com/v1"
            ) as client:
                response = await client.request(
                    method,
                    path,
                    json=payload,
                    headers={
                        "Authorization": "Bearer "
                        + self.settings.autosend_api_key.get_secret_value(),
                    },
                )
        except httpx.HTTPError as exc:
            raise MailError("provider_unreachable", uncertain=write) from exc
        if response.status_code >= 400:
            raise MailError(
                f"provider_http_{response.status_code}",
                uncertain=write and response.status_code >= 500,
            )
        try:
            body = response.json()
            if body.get("success") is not True or not isinstance(body.get("data"), dict):
                raise ValueError("invalid provider response")
            return dict(body["data"])
        except (ValueError, AttributeError) as exc:
            raise MailError("provider_response_invalid", uncertain=write) from exc

    async def send(
        self, recipient: str, subject: str, body: str, *, in_reply_to: str | None = None
    ) -> str:
        data = await self.request(
            "POST",
            "/mails/send",
            {
                "from": {"email": self.settings.autosend_demo_from, "name": "Corral demo"},
                "to": {"email": recipient},
                "subject": subject,
                "text": body,
                "replyTo": {"email": self.settings.autosend_demo_reply_to},
                **(
                    {"headers": {"In-Reply-To": in_reply_to, "References": in_reply_to}}
                    if in_reply_to
                    else {}
                ),
            },
        )
        key = data.get("emailId")
        if not isinstance(key, str) or not key or len(key) > 128:
            raise MailError("provider_message_id_missing", uncertain=True)
        return key

    async def inbound(self, message_id: str) -> dict[str, Any]:
        return await self.request("GET", f"/inbound/messages/{quote(message_id, safe='')}")
