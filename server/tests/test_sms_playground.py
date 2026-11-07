"""The playground parses numbers locally and only then calls ThriveVAS."""

import json

import httpx
import pytest

from app.core.errors import ApiProblem
from app.sms.playground import deliver, parse_batch
from tests.conftest import make_settings


def test_comma_separated_numbers_share_one_message() -> None:
    batch = parse_batch("+254712345678, 0712345679", "Hello from Corral")
    assert batch.phones == ["+254712345678", "254712345679"]
    assert batch.customized is False


def test_placeholder_lines_are_customized() -> None:
    raw = "+254712345678, Ada\n+254712345679, Bo"
    batch = parse_batch(raw, "Hello [name], this is Corral.")
    assert batch.customized is True
    assert batch.fields == ["name"]
    assert batch.values == [["Ada"], ["Bo"]]


def test_a_placeholder_without_values_is_refused() -> None:
    with pytest.raises(ApiProblem) as caught:
        parse_batch("+254712345678, +254712345679", "Hello [name]")
    assert "value" in caught.value.detail


def test_more_than_fifty_numbers_are_refused() -> None:
    numbers = ",".join(f"+2547{index:08d}" for index in range(51))
    with pytest.raises(ApiProblem) as caught:
        parse_batch(numbers, "Hello")
    assert "50" in caught.value.detail


async def test_deliver_posts_the_comma_separated_list_and_hides_the_key() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["key"] = request.headers.get("x-api-key")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"message": "SMS successfully queued. Total recipients 2"})

    settings = make_settings(thrivevas_api_key="test-key")
    batch = parse_batch("+254712345678,+254712345679", "Hello")
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await deliver(settings, batch, "Hello", "ThriveVas", client)
    assert result == {
        "recipients": 2,
        "customized": False,
        "detail": "SMS successfully queued. Total recipients 2",
    }
    assert seen["url"] == "https://sms.thrivevas.com/v1/message/send"
    assert seen["key"] == "test-key"
    assert seen["body"] == {
        "message": "Hello",
        "msisdn": "+254712345678,+254712345679",
        "sender_id": "ThriveVas",
    }
