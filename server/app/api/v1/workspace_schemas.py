"""Workspace profile: what onboarding saves, and what a later visit reads back."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
Slug = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=120, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
    ),
]
TeamSize = Literal["solo", "small", "sales"]
Timezone = Literal["nbo", "lag", "jnb", "lon", "nyc"]
InviteRole = Literal["admin", "member", "viewer"]


class SitePageOut(BaseModel):
    path: str
    title: str


class ProductBrief(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None


class InviteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: Annotated[str, StringConstraints(strip_whitespace=True, max_length=320)]
    role: InviteRole = "member"


class InviteOut(InviteIn):
    # When the invite was first added. Older invites, saved before this was kept, have none.
    invited_at: datetime | None = None


class WorkspaceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name | None = None
    slug: Slug | None = None
    timezone: Timezone | None = None
    team_size: TeamSize | None = None
    skipped: list[Annotated[int, Field(ge=3, le=5)]] | None = Field(default=None, max_length=3)
    invites: list[InviteIn] | None = Field(default=None, max_length=20)
    complete: bool = False


class SiteReadIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=1, max_length=2048)


class PictureOut(BaseModel):
    profile_picture_url: str


class WorkspaceOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    timezone: str | None
    team_size: TeamSize | None
    logo_url: str | None
    website: str | None
    onboarded: bool
    skipped: list[int]
    site_pages: list[SitePageOut]
    site_highlights: list[str]
    invites: list[InviteOut]
    product: ProductBrief | None
