import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class TenantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class LeadCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    company_name: str | None = Field(default=None, max_length=255)


class LeadUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    company_name: str | None = Field(default=None, max_length=255)


class LeadOut(TenantOut):
    email: str
    first_name: str | None
    last_name: str | None
    company_name: str | None


class SegmentOut(TenantOut):
    name: str


class SequenceOut(TenantOut):
    name: str


class InboxThreadOut(TenantOut):
    subject: str | None


class KnowledgeItemOut(TenantOut):
    title: str
    body: str | None
