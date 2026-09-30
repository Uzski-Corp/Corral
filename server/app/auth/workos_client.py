"""WorkOS client construction. The client is owned by the app lifespan, never global."""

from workos import AsyncWorkOSClient

from app.core.config import Settings


def build_workos_client(settings: Settings) -> AsyncWorkOSClient | None:
    """Return a configured async client, or ``None`` when WorkOS is not configured.

    Without keys the API still boots (auth endpoints answer 503) so local work on
    unrelated features doesn't require WorkOS credentials. Deployed environments refuse
    to start without them (see ``Settings``).
    """
    if not settings.workos_configured:
        return None
    return AsyncWorkOSClient(
        api_key=settings.workos_api_key.get_secret_value(),
        client_id=settings.workos_client_id,
        request_timeout=settings.workos_request_timeout_s,
    )
