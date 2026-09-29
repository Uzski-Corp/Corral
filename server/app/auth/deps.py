from fastapi import Cookie, HTTPException, status

from app.auth.workos_client import get_workos
from app.core.config import get_settings

SESSION_COOKIE = "wos_session"


async def get_current_user(wos_session: str | None = Cookie(default=None)) -> dict:
    """Resolve the signed-in user from the sealed WorkOS session cookie.

    TODO: refresh expired sessions (session.refresh()), map
    organization_id -> Corral workspace, load the local user row.
    """
    if not wos_session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    session = get_workos().user_management.load_sealed_session(
        session_data=wos_session, cookie_password=get_settings().workos_cookie_password
    )
    result = session.authenticate()
    if not getattr(result, "authenticated", False):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session invalid or expired")
    return {
        "session_id": result.session_id,
        "organization_id": result.organization_id,
        "role": result.role,
        "user": getattr(result, "user", None),
    }
