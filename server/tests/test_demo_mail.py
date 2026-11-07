"""Transport guardrails. Written for Sean to run; no real provider calls."""

import hashlib
import hmac
import uuid

import pytest

from app.core.config import Settings
from app.core.errors import ApiProblem
from app.mail.provider import verify_signature
from app.mail.service import require_recipient

ORG = uuid.UUID("df0416c5-bbda-44a8-b322-3932efc725a9")


def test_signature_covers_exact_body_and_rejects_missing_secret():
    body = b'{"type":"email.received","data":{}}'
    secret = "test-only-webhook-secret"
    signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    assert verify_signature(body, signature, secret)
    assert not verify_signature(body + b" ", signature, secret)
    assert not verify_signature(body, signature, "")
    assert not verify_signature(body, None, secret)


def test_allowlist_cannot_be_used_by_a_different_workspace():
    settings = Settings(
        _env_file=None,
        autosend_demo_org_id=str(ORG),
        autosend_api_key="test-key",
        autosend_demo_from="demo@example.com",
        autosend_demo_reply_to="reply@example.com",
        autosend_demo_recipients=["sean@example.com"],
    )
    assert require_recipient(settings, ORG, "SEAN@example.com") == "sean@example.com"
    with pytest.raises(ApiProblem) as other_org:
        require_recipient(settings, uuid.uuid4(), "sean@example.com")
    assert other_org.value.status_code == 503
    with pytest.raises(ApiProblem) as other_recipient:
        require_recipient(settings, ORG, "prospect@example.com")
    assert other_recipient.value.status_code == 403
