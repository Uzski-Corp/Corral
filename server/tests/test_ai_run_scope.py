"""Run credentials must not authorize another organization or another run."""

import uuid

from app.ai.service import run_token
from app.core.config import Settings


def test_tool_credential_is_bound_to_both_org_and_run():
    settings = Settings(
        _env_file=None, pi_service_token="test-service-token-at-least-32-characters"
    )
    org, run = uuid.uuid4(), uuid.uuid4()
    token = run_token(settings, org, run)
    assert len(token) == 64
    assert token == run_token(settings, org, run)
    assert token != run_token(settings, uuid.uuid4(), run)
    assert token != run_token(settings, org, uuid.uuid4())
