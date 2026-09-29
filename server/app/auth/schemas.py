import uuid

from pydantic import BaseModel, ConfigDict


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


class MeResponse(BaseModel):
    user: UserOut
    organization: OrganizationOut
    role: str


class RefreshResponse(BaseModel):
    refreshed: bool


class LogoutResponse(BaseModel):
    logout_url: str
