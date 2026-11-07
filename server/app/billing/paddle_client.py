"""Async Paddle Billing adapter.

Transaction creates are not retried after a timeout or a 5xx: the call may have succeeded.
Reads may be tried twice.
"""

from typing import Any, Literal

import httpx
import structlog

from app.core.config import Settings

log = structlog.get_logger(__name__)

Kind = Literal["rejected", "unavailable", "ambiguous"]


class PaddleCallError(Exception):
    def __init__(self, kind: Kind, status: int | None = None) -> None:
        super().__init__(kind)
        self.kind: Kind = kind
        self.status = status


class PaddleClient:
    def __init__(self, settings: Settings, http: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._http = http
        self._owns = http is None

    async def aclose(self) -> None:
        if self._owns and self._http is not None:
            await self._http.aclose()

    def _client(self) -> httpx.AsyncClient:
        if self._http is None:
            timeout = httpx.Timeout(self._settings.paddle_api_timeout_s)
            self._http = httpx.AsyncClient(timeout=timeout, base_url=self._settings.paddle_api_base)
        return self._http

    def _headers(self) -> dict[str, str]:
        key = self._settings.paddle_api_key.get_secret_value()
        return {"Authorization": f"Bearer {key}", "Paddle-Version": "1"}

    async def _request(
        self, method: str, path: str, *, json: dict[str, Any] | None, write: bool
    ) -> dict[str, Any]:
        attempts = 1 if write else 2
        last: PaddleCallError | None = None
        for _attempt in range(attempts):
            try:
                response = await self._client().request(
                    method, path, headers=self._headers(), json=json
                )
            except httpx.TimeoutException as exc:
                kind: Kind = "ambiguous" if write else "unavailable"
                last = PaddleCallError(kind)
                log.warning("paddle_timeout", path=path, write=write, error_type=type(exc).__name__)
                if write:
                    raise last from exc
                continue
            except httpx.HTTPError as exc:
                kind = "ambiguous" if write else "unavailable"
                last = PaddleCallError(kind)
                log.warning(
                    "paddle_transport", path=path, write=write, error_type=type(exc).__name__
                )
                if write:
                    raise last from exc
                continue
            if response.status_code >= 500:
                last = PaddleCallError(
                    "ambiguous" if write else "unavailable", response.status_code
                )
                log.warning("paddle_server_error", path=path, status=response.status_code)
                if write:
                    raise last
                continue
            if response.status_code >= 400:
                log.info("paddle_rejected", path=path, status=response.status_code)
                raise PaddleCallError("rejected", response.status_code)
            try:
                body = response.json()
            except ValueError as exc:
                raise PaddleCallError("ambiguous" if write else "unavailable") from exc
            if not isinstance(body, dict):
                raise PaddleCallError("ambiguous" if write else "unavailable")
            data = body.get("data", body)
            if not isinstance(data, dict):
                raise PaddleCallError("ambiguous" if write else "unavailable")
            return data
        assert last is not None  # noqa: S101
        raise last

    async def get_price(self, price_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/prices/{price_id}", json=None, write=False)

    async def create_transaction(
        self, *, price_id: str, checkout_id: str, org_id: str
    ) -> dict[str, Any]:
        # custom_data identifies the local checkout row. It is not tenant authorization.
        return await self._request(
            "POST",
            "/transactions",
            json={
                "items": [{"price_id": price_id, "quantity": 1}],
                "collection_mode": "automatic",
                **(
                    {"checkout": {"url": self._settings.paddle_checkout_url}}
                    if self._settings.paddle_checkout_url
                    else {}
                ),
                "custom_data": {
                    "corral_checkout_id": checkout_id,
                    "corral_org_id": org_id,
                },
            },
            write=True,
        )

    async def get_transaction(self, transaction_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/transactions/{transaction_id}", json=None, write=False)

    async def get_subscription(self, subscription_id: str) -> dict[str, Any]:
        return await self._request(
            "GET", f"/subscriptions/{subscription_id}", json=None, write=False
        )

    async def create_portal_session(
        self, customer_id: str, subscription_id: str | None
    ) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if subscription_id:
            body["subscription_ids"] = [subscription_id]
        return await self._request(
            "POST",
            f"/customers/{customer_id}/portal-sessions",
            json=body,
            write=True,
        )
