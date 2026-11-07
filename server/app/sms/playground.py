"""ThriveVAS bulk SMS for the signed-in playground.

The same custom text can go to a comma-separated list. A message that uses
``[name]`` (or other ``[column]`` tokens) is sent through the file-upload
customization API, one value per recipient.
"""

import csv
import io
import re
from dataclasses import dataclass

import httpx

from app.core.config import Settings
from app.core.errors import ApiProblem

MAX_RECIPIENTS = 50
PHONE = re.compile(r"^\+?[1-9]\d{7,14}$")
PLACEHOLDER = re.compile(r"\[([A-Za-z][A-Za-z0-9_]{0,31})\]")
SENDER = re.compile(r"^[A-Za-z0-9]{3,11}$")


@dataclass(frozen=True, slots=True)
class Batch:
    phones: list[str]
    fields: list[str]
    values: list[list[str]]

    @property
    def customized(self) -> bool:
        return bool(self.fields)


def _phone(token: str) -> str:
    compact = re.sub(r"[\s-]", "", token)
    if compact.startswith("0") and len(compact) == 10 and compact[1:].isdigit():
        compact = f"254{compact[1:]}"
    return compact


def _cells(line: str) -> list[str]:
    return [part.strip() for part in line.split(",") if part.strip()]


def parse_batch(raw: str, message: str) -> Batch:
    """Turn a comma-separated list, or ``phone, value`` lines, into a send batch."""
    lines = [line.strip() for line in raw.replace(";", "\n").splitlines() if line.strip()]
    if not lines:
        raise ApiProblem(400, "invalid_sms", "Add at least one phone number.")
    if len(lines) == 1:
        parts = [_phone(part) for part in _cells(lines[0])]
        same_message = bool(parts) and all(PHONE.fullmatch(part) for part in parts)
        rows = [[part] for part in parts] if same_message else [_cells(lines[0])]
    else:
        rows = [_cells(line) for line in lines]
    if len(rows) > MAX_RECIPIENTS:
        raise ApiProblem(
            400,
            "invalid_sms",
            f"This playground sends at most {MAX_RECIPIENTS} numbers at once.",
        )

    phones: list[str] = []
    extras: list[list[str]] = []
    for row in rows:
        if not row:
            continue
        phone = _phone(row[0])
        if not PHONE.fullmatch(phone):
            raise ApiProblem(
                400,
                "invalid_sms",
                "Each recipient needs a phone number with a country code, like +254712345678.",
            )
        phones.append(phone)
        extras.append([cell.strip() for cell in row[1:]])
    if len(phones) != len(set(phones)):
        raise ApiProblem(400, "invalid_sms", "Remove duplicate numbers.")

    fields = list(dict.fromkeys(PLACEHOLDER.findall(message)))
    has_values = any(extras)
    if fields and not has_values:
        shown = ", ".join(f"[{name}]" for name in fields)
        raise ApiProblem(
            400,
            "invalid_sms",
            f"This message uses {shown}. Add a value after each number, "
            "one person per line: +254712345678, Ada",
        )
    if has_values and not fields:
        raise ApiProblem(
            400,
            "invalid_sms",
            "Add a [name] placeholder in the message to use the values after each number.",
        )
    if fields and any(len(extra) != len(fields) for extra in extras):
        names = ", ".join(fields)
        raise ApiProblem(
            400,
            "invalid_sms",
            f"Each line needs the phone plus {len(fields)} value(s), in this order: {names}.",
        )
    return Batch(phones=phones, fields=fields, values=extras)


def _provider_detail(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        text = response.text.strip()
        return text[:240] or "ThriveVAS returned an empty response."
    if isinstance(body, dict):
        message = body.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()
    if response.status_code < 400:
        return "ThriveVAS accepted the request."
    return "ThriveVAS rejected the request."


async def deliver(
    settings: Settings,
    batch: Batch,
    message: str,
    sender_id: str,
    client: httpx.AsyncClient | None = None,
) -> dict[str, object]:
    key = settings.thrivevas_api_key.get_secret_value()
    if not key:
        raise ApiProblem(503, "sms_unconfigured", "THRIVEVAS_API_KEY is not set.")
    if not SENDER.fullmatch(sender_id):
        raise ApiProblem(400, "invalid_sender", "Sender ID is 3 to 11 letters or digits.")
    base = settings.thrivevas_base_url.rstrip("/")
    headers = {"x-api-key": key}
    own_client = client is None
    client = client or httpx.AsyncClient(timeout=20)
    try:
        try:
            if batch.customized:
                buffer = io.StringIO()
                writer = csv.writer(buffer)
                writer.writerow(["msisdn", *batch.fields])
                for phone, extra in zip(batch.phones, batch.values, strict=True):
                    writer.writerow([phone, *extra])
                response = await client.post(
                    f"{base}/v1/message/send/upload-file",
                    data={
                        "message": message,
                        "sender_id": sender_id,
                        "campaign_name": "corral-playground",
                    },
                    files={"file": ("recipients.csv", buffer.getvalue(), "text/csv")},
                    headers=headers,
                )
            else:
                response = await client.post(
                    f"{base}/v1/message/send",
                    json={
                        "message": message,
                        "msisdn": ",".join(batch.phones),
                        "sender_id": sender_id,
                    },
                    headers={**headers, "Content-Type": "application/json"},
                )
        except httpx.HTTPError as exc:
            raise ApiProblem(502, "sms_unavailable", "ThriveVAS did not answer.") from exc
    finally:
        if own_client:
            await client.aclose()
    detail = _provider_detail(response)
    if response.status_code >= 400:
        raise ApiProblem(502, "sms_rejected", detail)
    return {"recipients": len(batch.phones), "customized": batch.customized, "detail": detail}
