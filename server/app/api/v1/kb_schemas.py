"""Request/response shapes for products and their knowledge base.

``SourceOut`` maps 1:1 onto the client's ``Source``/``SourceStatus`` (components/app/kb/data.ts):
``status`` is ``processing | ready | partial | failed``; ``processing`` carries ``stage``
and ``stage_pct``; ``partial`` carries ``pages_read``/``pages_total``/``skipped``/``note``;
``failed`` carries ``failure`` and ``failure_stage``.
"""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.kb.errors import Failure, SourceKind, Stage

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]


class ProductCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name
    description: str | None = Field(default=None, max_length=5_000)


class ProductUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name | None = None
    description: str | None = Field(default=None, max_length=5_000)


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime


class UrlSourceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str = Field(min_length=1, max_length=2_048)
    # "section" reads the page and the pages under its path (same site, bounded).
    scope: Literal["page", "section"] = "page"


class SourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    kind: SourceKind
    name: str
    url: str | None
    scope: Literal["page", "section"] | None
    byte_size: int | None
    status: Literal["processing", "ready", "partial", "failed"]
    stage: Stage | None
    stage_pct: int
    progress: int | None = Field(description="0-100 over all stages; null when failed")
    failure: Failure | None
    failure_stage: Stage | None
    pages_total: int | None
    pages_read: int | None
    skipped: str | None
    note: str | None
    passage_count: int
    added_by_user_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    processed_at: datetime | None
    deleted_at: datetime | None


class PassageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ordinal: int
    loc: str | None
    text: str


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2_000)]
    limit: int = Field(default=8, ge=1, le=100)


class SearchHit(BaseModel):
    passage_id: uuid.UUID
    source_id: uuid.UUID
    source_name: str
    source_kind: SourceKind
    loc: str | None
    text: str
    score: float = Field(description="Cosine similarity, -1..1 (higher is closer)")
