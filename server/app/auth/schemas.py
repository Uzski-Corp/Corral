import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    first_name: str | None
    last_name: str | None
    profile_picture_url: str | None


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    # True once onboarding has been saved. The web app still sets corral_onboarded for the
    # edge gate; /me is the source of truth a new browser can catch up from.
    onboarded: bool = False
    # Public R2 URL. WorkOS organizations have no logo, so this is the only mark the shell has.
    logo_url: str | None = None


class MeResponse(BaseModel):
    user: UserOut
    organization: OrganizationOut
    role: str


class RefreshResponse(BaseModel):
    refreshed: bool


class LogoutResponse(BaseModel):
    logout_url: str


# Six digits, as WorkOS issues them. Anything else is rejected before reaching WorkOS.
_CODE_PATTERN = r"^[0-9]{6}$"


class SendCodeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr


class VerifyCodeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    code: str = Field(pattern=_CODE_PATTERN)


class CodeSentResponse(BaseModel):
    sent: Literal[True] = True


class SignedInResponse(BaseModel):
    redirect_to: str
