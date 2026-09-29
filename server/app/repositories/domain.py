from app.models.domain import InboxThread, KnowledgeItem, Lead, Segment, Sequence
from app.repositories.base import TenantRepository


class LeadRepository(TenantRepository[Lead]):
    model = Lead


class SegmentRepository(TenantRepository[Segment]):
    model = Segment


class SequenceRepository(TenantRepository[Sequence]):
    model = Sequence


class InboxThreadRepository(TenantRepository[InboxThread]):
    model = InboxThread


class KnowledgeRepository(TenantRepository[KnowledgeItem]):
    model = KnowledgeItem
