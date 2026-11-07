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
from app.models.ai import AI_TABLES, AiRun
from app.models.billing import (
    BILLING_TABLES,
    OPERATIONAL_TABLES,
    BillingCheckout,
    BillingSmsNotification,
    BillingSmsPreference,
    PaddleWebhookEvent,
    WorkspaceBilling,
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
from app.models.mail import MAIL_TABLES, MailDelivery, MailEvent

ALL_TENANT_TABLES: tuple[str, ...] = (
    *AI_TABLES,
    *MAIL_TABLES,
    *TENANT_TABLES,
    *KB_TABLES,
    *CRM_TABLES,
    *ACTIVITY_TABLES,
    *BILLING_TABLES,
)
"""Every org-scoped table with a ``tenant_isolation`` row-level security policy."""

__all__ = [
    "AI_TABLES", "AiRun",
    "MAIL_TABLES",
    "MailDelivery",
    "MailEvent",
    "ACTIVITY_TABLES",
    "ALL_TENANT_TABLES",
    "BILLING_TABLES",
    "CRM_TABLES",
    "KB_TABLES",
    "TENANT_TABLES",
    "ApiKey",
    "BillingCheckout",
    "BillingSmsNotification",
    "BillingSmsPreference",
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
    "OPERATIONAL_TABLES",
    "Organization",
    "PaddleWebhookEvent",
    "Product",
    "Segment",
    "SegmentPin",
    "Sequence",
    "Suppression",
    "TenantModel",
    "User",
    "WorkspaceBilling",
]
