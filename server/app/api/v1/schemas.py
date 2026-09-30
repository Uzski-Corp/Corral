import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.leads.vocab import EmailStatus


class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class _LeadFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    company_name: str | None = Field(default=None, max_length=255)
    company_id: uuid.UUID | None = Field(default=None, description="The company they work at")
    title: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    linkedin_url: str | None = Field(default=None, max_length=500)
    email_status: EmailStatus | None = None
    is_primary: bool | None = Field(
        default=None, description="Make them the company's primary person (replaces the old one)"
    )


class LeadCreate(_LeadFields):
    email: EmailStr


class LeadUpdate(_LeadFields):
    pass


class LeadOut(TenantOut):
    email: str | None
    first_name: str | None
    last_name: str | None
    company_name: str | None
    company_id: uuid.UUID | None
    title: str | None
    phone: str | None
    linkedin_url: str | None
    email_status: EmailStatus
    is_primary: bool
    unsubscribed_at: datetime | None


class SegmentOut(TenantOut):
    name: str
    match: Literal["all", "any"]


class SequenceOut(TenantOut):
    name: str


class InboxThreadOut(TenantOut):
    subject: str | None


class KnowledgeItemOut(TenantOut):
    title: str
    body: str | None
