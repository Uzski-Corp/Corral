"""ORM models. Import every model here so ``Base.metadata`` is complete for Alembic."""

from app.models.activity import (
    ACTIVITY_TABLES,
    ApiKey,
    DiscoveryRun,
    InboxDraft,
    InboxMessage,
    Integration,
    IntegrationLog,
    Mailbox,
    McpCall,
    McpConnection,
)
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

ALL_TENANT_TABLES: tuple[str, ...] = (*TENANT_TABLES, *KB_TABLES, *CRM_TABLES, *ACTIVITY_TABLES)
"""Every org-scoped table with a ``tenant_isolation`` row-level security policy."""

__all__ = [
    "ACTIVITY_TABLES",
    "ALL_TENANT_TABLES",
    "CRM_TABLES",
    "KB_TABLES",
    "TENANT_TABLES",
    "ApiKey",
    "Company",
    "CompanyFit",
    "DiscoveryRun",
    "InboxDraft",
    "InboxMessage",
    "InboxThread",
    "Integration",
    "IntegrationLog",
    "KbChunk",
    "KbSource",
    "KbSourceFile",
    "KnowledgeItem",
    "Lead",
    "LeadImport",
    "Mailbox",
    "McpCall",
    "McpConnection",
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
