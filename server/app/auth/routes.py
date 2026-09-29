from dataclasses import asdict, is_dataclass

from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse
from workos.session import seal_session_from_auth_response

from app.auth.deps import SESSION_COOKIE, get_current_user
from app.auth.workos_client import get_workos
from app.core.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/login")
async def login() -> RedirectResponse:
    url = get_workos().user_management.get_authorization_url(
        provider="authkit", redirect_uri=get_settings().workos_redirect_uri
    )
    return RedirectResponse(url)


@router.get("/callback")
async def callback(code: str) -> RedirectResponse:
    s = get_settings()
    auth = get_workos().user_management.authenticate_with_code(code=code)
    user = (
        auth.user.to_dict()
        if hasattr(auth.user, "to_dict")
        else (asdict(auth.user) if is_dataclass(auth.user) else dict(auth.user))
    )
    sealed = seal_session_from_auth_response(
        access_token=auth.access_token,
        refresh_token=auth.refresh_token,
        user=user,
        cookie_password=s.workos_cookie_password,
    )
    # TODO: upsert local user + workspace from auth.user / auth.organization_id
    res = RedirectResponse(s.frontend_url)
    res.set_cookie(
        SESSION_COOKIE,
        sealed,
        httponly=True,
        samesite="lax",
        secure=s.app_env != "local",
        path="/",
    )
    return res


@router.get("/logout")
async def logout(user: dict = Depends(get_current_user)) -> RedirectResponse:
    s = get_settings()
    url = get_workos().user_management.get_logout_url(
        session_id=user["session_id"], return_to=s.frontend_url
    )
    res = RedirectResponse(url)
    res.delete_cookie(SESSION_COOKIE, path="/")
    return res


@router.get("/me")
async def me(user: dict = Depends(get_current_user)) -> dict:
    return user
