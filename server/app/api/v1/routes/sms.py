"""Signed-in ThriveVAS playground. The API key never leaves the server."""

import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.auth.deps import SettingsDep, require_trusted_origin
from app.core.errors import ApiProblem
from app.sms.playground import MAX_RECIPIENTS, SENDER, deliver, parse_batch

router = APIRouter(prefix="/sms/playground", tags=["sms playground"])
WRITE = [Depends(require_trusted_origin)]


class SendIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    recipients: str = Field(min_length=1, max_length=4_000)
    message: str = Field(min_length=1, max_length=480)
    sender_id: str = Field(default="", max_length=11)


@router.get("")
async def status(settings: SettingsDep) -> dict[str, object]:
    return {
        "available": settings.thrivevas_configured,
        "sender_id": settings.thrivevas_sender_id,
        "limit": MAX_RECIPIENTS,
    }


@router.post("", dependencies=WRITE)
async def send(settings: SettingsDep, body: SendIn) -> dict[str, object]:
    if not settings.thrivevas_configured:
        raise ApiProblem(503, "sms_unconfigured", "THRIVEVAS_API_KEY is not set.")
    message = re.sub(r"\s+", " ", body.message).strip()
    if not message:
        raise ApiProblem(400, "invalid_sms", "Write the text to send.")
    sender = body.sender_id.strip() or settings.thrivevas_sender_id
    if not SENDER.fullmatch(sender):
        raise ApiProblem(400, "invalid_sender", "Sender ID is 3 to 11 letters or digits.")
    batch = parse_batch(body.recipients, message)
    return await deliver(settings, batch, message, sender)
