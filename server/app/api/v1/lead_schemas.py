"""Request and response bodies for companies, segments and imports."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

from app.api.v1.schemas import TenantOut
from app.leads.csv_import import Policy
from app.leads.rules import Match, Rule
from app.leads.service import Selection
from app.leads.vocab import EmailStatus, ReplyStatus, SetBy, Size, Source

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]


class PersonIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr | None = None
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    title: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    linkedin_url: str | None = Field(default=None, max_length=500)


class PersonOut(TenantOut):
    email: str | None
    first_name: str | None
    last_name: str | None
    title: str | None
    phone: str | None
    linkedin_url: str | None
    email_status: EmailStatus
    is_primary: bool
    unsubscribed_at: datetime | None


class CompanyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name
    domain: str | None = Field(default=None, max_length=255, description="Website or domain")
    country: Short | None = None
    size: Size | None = None
    industry: Short | None = None
    notes: str | None = Field(default=None, max_length=5_000)
    person: PersonIn | None = Field(default=None, description="Becomes the primary person")


class CompanyUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name | None = None
    domain: str | None = Field(default=None, max_length=255)
    country: Short | None = None
    size: Size | None = None
    industry: Short | None = None
    notes: str | None = Field(default=None, max_length=5_000)
    reply_status: ReplyStatus | None = Field(
        default=None, description="Set by hand; unsubscribed is final"
    )


class CompanyOut(TenantOut):
    name: str
    domain: str | None
    country: str | None
    size: Size | None
    industry: str | None
    notes: str | None
    source: Source
    reply_status: ReplyStatus
    reply_status_set_by: SetBy
    last_activity_at: datetime | None
    import_id: uuid.UUID | None
    fit: int | None = Field(default=None, description="For the query's product_id")
    primary: PersonOut | None = None


class FitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: uuid.UUID
    score: int


class CompanyDetail(CompanyOut):
    people: list[PersonOut]
    fits: list[FitOut]


class CompanyPage(BaseModel):
    data: list[CompanyOut]
    next_cursor: str | None = Field(description="Pass back as cursor; null on the last page")
    has_more: bool
    total: int = Field(description="Rows matching the rules (all pages)")


class MergeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    duplicate_id: uuid.UUID = Field(description="Merged into this company, then deleted")


class _Bulk(BaseModel):
    model_config = ConfigDict(extra="forbid")

    selection: Selection
    confirm: bool = Field(default=False, description="Required at the confirm threshold")


class BulkSetReply(_Bulk):
    action: Literal["set_reply_status"]
    reply_status: ReplyStatus


class BulkSegment(_Bulk):
    action: Literal["add_to_segment", "remove_from_segment"]
    segment_id: uuid.UUID


class BulkDelete(_Bulk):
    action: Literal["delete"]


BulkRequest = Annotated[BulkSetReply | BulkSegment | BulkDelete, Field(discriminator="action")]


class SkipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    reason: str
    n: int


class BulkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    matched: int
    changed: int
    skipped: list[SkipOut]


class EnrollPlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    selection: Selection


class EnrollPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    matched: int
    will_enroll: int
    skipped: list[SkipOut] = Field(description="First reason per company")
    sends_per_day: int
    days: int


class SegmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name
    rules: list[Rule] = Field(default_factory=list, max_length=100)
    match: Match = "all"
    company_ids: list[uuid.UUID] = Field(default_factory=list, description="Pinned by hand")
    from_import_id: uuid.UUID | None = Field(
        default=None, description="Pin every company that import created or updated"
    )


class SegmentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name | None = None
    rules: list[Rule] | None = Field(default=None, max_length=100)
    match: Match | None = None


class SegmentDetail(TenantOut):
    name: str
    rules: list[Rule]
    match: Match
    pinned: int
    count: int


class PreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rules: list[Rule] = Field(max_length=100)
    match: Match = "all"


class PreviewOut(BaseModel):
    count: int
    peek: list[CompanyOut]


class ImportPlanOut(BaseModel):
    total: int
    create: int
    update: int
    skipped: int
    errors: int
    in_file: int
    existing: int


class RowErrorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    row: int
    field: str
    value: str
    message: str


class DryRunOut(BaseModel):
    plan: ImportPlanOut
    headers: list[str]
    errors: list[RowErrorOut] = Field(description="The first 100 row problems")


class ImportOut(TenantOut):
    filename: str
    byte_size: int
    policy: Policy
    status: Literal["queued", "running", "done", "failed"]
    progress_pct: int
    total_rows: int | None
    created_count: int
    updated_count: int
    skipped_count: int
    error_count: int
    in_file_duplicates: int
    existing_duplicates: int
    people_created: int
    failure: str | None
    note: str | None
    has_errors_file: bool
    finished_at: datetime | None
