"""Embedders: the local hashing one (properties) and the OpenAI-compatible client (wire)."""

import json
import math

import httpx
import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.kb.embeddings import (
    EmbeddingRejected,
    EmbeddingUnavailable,
    HashingEmbedder,
    OpenAIEmbedder,
    build_embedder,
    tokens,
)
from app.models.knowledge import EMBEDDING_DIMENSIONS
from tests.conftest import make_settings


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=True))


def test_tokens_lowercase_stem_and_drop_stopwords() -> None:
    assert tokens("The Sensors and batteries of OUR gateway class") == [
        "sensor",
        "battery",
        "gateway",
        "class",
    ]


@given(st.text(max_size=300))
def test_hashing_vectors_are_unit_length_and_deterministic(text: str) -> None:
    embedder = HashingEmbedder()
    a, b = embedder._vector(text), embedder._vector(text)
    assert a == b
    assert len(a) == EMBEDDING_DIMENSIONS
    assert math.isclose(math.sqrt(sum(x * x for x in a)), 1.0, rel_tol=1e-9)


async def test_hashing_similarity_tracks_shared_words() -> None:
    embedder = HashingEmbedder()
    query, near, far = await embedder.embed(
        [
            "how long does the sensor battery last",
            "Sensor battery life is five years at a 60-second interval.",
            "Pricing is $39 per sensor per month, billed annually.",
        ]
    )
    assert cosine(query, near) > cosine(query, far) > 0
    (empty,) = await embedder.embed(["the and of"])  # only stopwords
    assert math.isclose(sum(x * x for x in empty), 1.0)
    await embedder.aclose()


def _openai(handler: httpx.MockTransport, **kwargs: object) -> OpenAIEmbedder:
    options: dict[str, object] = {
        "api_base": "https://llm.test/v1/",
        "api_key": "sk-test",
        "model": "text-embedding-3-small",
        "timeout_s": 5,
        "batch_size": 2,
        "dimensions": 3,
    }
    options.update(kwargs)
    return OpenAIEmbedder(transport=handler, **options)  # type: ignore[arg-type]


async def test_openai_embedder_batches_and_orders_by_index() -> None:
    seen: list[dict[str, object]] = []

    def handle(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://llm.test/v1/embeddings"
        assert request.headers["authorization"] == "Bearer sk-test"
        body = json.loads(request.content)
        seen.append(body)
        data = [
            {"index": i, "embedding": [float(len(t)), 0.0, 1.0]}
            for i, t in enumerate(body["input"])
        ]
        return httpx.Response(200, json={"data": list(reversed(data))})

    embedder = _openai(httpx.MockTransport(handle))
    vectors = await embedder.embed(["a", "bb", "ccc"])
    assert vectors == [[1.0, 0.0, 1.0], [2.0, 0.0, 1.0], [3.0, 0.0, 1.0]]
    assert [b["input"] for b in seen] == [["a", "bb"], ["ccc"]]
    assert seen[0]["dimensions"] == 3
    assert seen[0]["model"] == "text-embedding-3-small"
    await embedder.aclose()


@pytest.mark.parametrize("status", [429, 500, 503])
async def test_openai_transient_statuses_are_unavailable(status: int) -> None:
    embedder = _openai(httpx.MockTransport(lambda r: httpx.Response(status)))
    with pytest.raises(EmbeddingUnavailable):
        await embedder.embed(["x"])


async def test_openai_network_errors_are_unavailable() -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("slow", request=request)

    with pytest.raises(EmbeddingUnavailable, match="ConnectTimeout"):
        await _openai(httpx.MockTransport(boom)).embed(["x"])


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(401, json={"error": "bad key"}),
        httpx.Response(400, json={"error": "too long"}),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"nope": []}),
        httpx.Response(200, json={"data": [{"index": 0, "embedding": [1.0, 2.0]}]}),  # wrong size
        httpx.Response(200, json={"data": []}),  # wrong count
    ],
)
async def test_openai_bad_responses_are_rejected(response: httpx.Response) -> None:
    with pytest.raises(EmbeddingRejected):
        await _openai(httpx.MockTransport(lambda r: response)).embed(["x"])


def test_build_embedder_follows_settings() -> None:
    assert isinstance(build_embedder(make_settings()), HashingEmbedder)
    remote = build_embedder(
        make_settings(kb_embedding_provider="openai", kb_embedding_api_key="sk-live")
    )
    assert isinstance(remote, OpenAIEmbedder)
    assert remote.dimensions == EMBEDDING_DIMENSIONS
