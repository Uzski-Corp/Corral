"""ORM models. Import every model here so ``Base.metadata`` is complete for Alembic."""

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

__all__ = [
    "TENANT_TABLES",
    "InboxThread",
    "KnowledgeItem",
    "Lead",
    "Membership",
    "Organization",
    "Segment",
    "Sequence",
    "TenantModel",
    "User",
]
