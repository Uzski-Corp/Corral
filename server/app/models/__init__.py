"""ORM models. Import every model here so ``Base.metadata`` is complete for Alembic."""

from app.models.crm import (
    CRM_TABLES,
    Company,
    CompanyFit,
    LeadImport,
    SegmentPin,
    Suppression,
)
from app.models.domain import (
    TENANT_TABLES,
    InboxThread,
    KnowledgeItem,
    Lead,
    Segment,
    Sequence,
    TenantModel,
)
from app.models.identity import Membership, Organization, User
from app.models.knowledge import KB_TABLES, KbChunk, KbSource, KbSourceFile, Product

ALL_TENANT_TABLES: tuple[str, ...] = (*TENANT_TABLES, *KB_TABLES, *CRM_TABLES)
"""Every org-scoped table with a ``tenant_isolation`` row-level security policy."""

__all__ = [
    "ALL_TENANT_TABLES",
    "CRM_TABLES",
    "KB_TABLES",
    "TENANT_TABLES",
    "Company",
    "CompanyFit",
    "InboxThread",
    "KbChunk",
    "KbSource",
    "KbSourceFile",
    "KnowledgeItem",
    "Lead",
    "LeadImport",
    "Membership",
    "Organization",
    "Product",
    "Segment",
    "SegmentPin",
    "Sequence",
    "Suppression",
    "TenantModel",
    "User",
]
