from functools import lru_cache

from workos import WorkOSClient

from app.core.config import get_settings


@lru_cache
def get_workos() -> WorkOSClient:
    """Created lazily so the app boots without WorkOS keys."""
    s = get_settings()
    if not s.workos_api_key or not s.workos_client_id:
        raise RuntimeError("WORKOS_API_KEY and WORKOS_CLIENT_ID must be set")
    return WorkOSClient(api_key=s.workos_api_key, client_id=s.workos_client_id)
