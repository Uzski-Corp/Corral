"""Retrieval quality and scoping, end to end: ingest real fixtures, then ask questions.

The fixtures mirror the ColdTrace sales material. Each question is phrased the way a
buyer would ask it (not by copying the passage), and must return the right passage first.
"""

import uuid

import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.kb.embeddings import HashingEmbedder
from app.kb.errors import FileKind
from app.kb.ingest import ingest_source
from app.kb.service import KnowledgeBaseService
from app.models import KbSource
from tests.conftest import make_settings
from tests.kb_fixtures import GATEWAY_PAGES, OBJECTIONS, PITCH_MD, make_docx, make_pdf
from tests.kb_helpers import KbWorld, add_file, job_ctx, kb_world
from tests.tenancy_helpers import as_tenant

SETTINGS = make_settings()
EMBEDDER = HashingEmbedder()


@pytest.fixture
async def world(db_engine: AsyncEngine) -> KbWorld:
    world = await kb_world(db_engine)
    docs: list[tuple[str, FileKind, bytes]] = [
        ("Pitch.md", "md", PITCH_MD.encode()),
        ("Gateway.pdf", "pdf", make_pdf(GATEWAY_PAGES)),
        ("Objections.docx", "docx", make_docx(OBJECTIONS)),
    ]
    for ident, product in ((world.a, world.product_a), (world.b, world.product_b)):
        for name, kind, data in docs:
            src = await add_file(
                db_engine, ident, product, SETTINGS, name=name, kind=kind, data=data
            )
            ctx = job_ctx(db_engine, SETTINGS)
            await ingest_source(ctx, str(src.org_id), str(src.id), src.generation)
    return world


async def ask(
    engine: AsyncEngine,
    world: KbWorld,
    question: str,
    *,
    product: uuid.UUID | None = None,
    limit: int = 3,
    as_b: bool = False,
) -> list[tuple[str, str | None, str, float]]:
    ident = world.b if as_b else world.a
    async with as_tenant(engine, ident) as s:
        hits = await KnowledgeBaseService(s, ident.org_id, SETTINGS).search(
            product or world.product_a, (await EMBEDDER.embed([question]))[0], limit=limit
        )
    return [(name, chunk.loc, chunk.text, score) for chunk, name, _kind, score in hits]


QUESTIONS = [
    ("how long does the battery in each sensor last?", "Pitch.md", "Battery"),
    ("what does it cost per sensor each month", "Pitch.md", "Pricing"),
    ("how fast does the manager get alerted by SMS", "Pitch.md", "Alerts"),
    ("we already have data loggers, why switch", "Objections.docx", "We already use data loggers"),
    (
        "do we need to take rooms offline to install it",
        "Objections.docx",
        "We can't take rooms offline to install",
    ),
    ("does the gateway stay online in a power cut", "Gateway.pdf", "p.3"),
    ("can the radio reach sensors through concrete walls", "Gateway.pdf", "p.1"),
]


@pytest.mark.parametrize(("question", "source", "loc"), QUESTIONS)
async def test_the_right_passage_comes_first(
    db_engine: AsyncEngine, world: KbWorld, question: str, source: str, loc: str
) -> None:
    hits = await ask(db_engine, world, question)
    assert (hits[0][0], hits[0][1]) == (source, loc)
    assert hits[0][3] > hits[1][3]  # a clear winner, not a tie
    assert -1.0 <= hits[-1][3] <= 1.0


async def test_hits_come_only_from_the_asked_product(
    db_engine: AsyncEngine, world: KbWorld
) -> None:
    assert await ask(db_engine, world, "battery life", product=world.product_a2) == []


async def test_another_orgs_product_returns_nothing(db_engine: AsyncEngine, world: KbWorld) -> None:
    # Org B holds identical documents, and org A even names B's product id: RLS still wins.
    assert await ask(db_engine, world, "battery life", product=world.product_b) == []
    hits_b = await ask(db_engine, world, "battery life", product=world.product_b, as_b=True)
    assert hits_b[0][1] == "Battery"


async def test_removed_and_unfinished_sources_are_not_searched(
    db_engine: AsyncEngine, world: KbWorld
) -> None:
    async with AsyncSession(db_engine) as s, s.begin():
        await s.execute(
            update(KbSource)
            .where(KbSource.org_id == world.a.org_id, KbSource.name == "Pitch.md")
            .values(deleted_at=KbSource.created_at)
        )
        await s.execute(
            update(KbSource)
            .where(KbSource.org_id == world.a.org_id, KbSource.name == "Objections.docx")
            .values(status="processing", stage="embed")
        )
    names = {hit[0] for hit in await ask(db_engine, world, "battery price loggers", limit=20)}
    assert names == {"Gateway.pdf"}


async def test_limit_caps_the_results(db_engine: AsyncEngine, world: KbWorld) -> None:
    assert len(await ask(db_engine, world, "sensor", limit=2)) == 2
