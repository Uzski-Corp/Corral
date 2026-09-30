"""Text embeddings behind one small interface.

* ``HashingEmbedder``: local and deterministic (feature hashing of words and word pairs).
  No network, no cost, no data leaves the box; good lexical recall, no semantics. The
  default for dev, CI and until a model provider is chosen.
* ``OpenAIEmbedder``: any OpenAI-compatible ``/embeddings`` endpoint (OpenAI, Azure,
  a LiteLLM proxy, vLLM...). Transient failures raise ``EmbeddingUnavailable`` (the job
  retries), anything else ``EmbeddingRejected`` (the source fails).
"""

import hashlib
import math
import re
from collections import Counter
from collections.abc import Sequence
from itertools import pairwise
from typing import Protocol

import httpx

from app.core.config import Settings
from app.models.knowledge import EMBEDDING_DIMENSIONS


class EmbeddingUnavailable(Exception):
    """The provider is down, slow or rate limiting: retry later."""


class EmbeddingRejected(Exception):
    """The provider refused the request (bad key, bad input): retrying won't help."""


class Embedder(Protocol):
    name: str
    dimensions: int

    async def embed(self, texts: Sequence[str]) -> list[list[float]]: ...

    async def aclose(self) -> None: ...


_WORD = re.compile(r"\w+", re.UNICODE)
_STOPWORDS = frozenset(
    (
        "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has", "have",
        "i", "in", "is", "it", "its", "of", "on", "or", "our", "so", "that", "the", "their",
        "them", "they", "this", "to", "was", "we", "were", "what", "when", "which", "who",
        "will", "with", "you", "your",
    )
)  # fmt: skip


def _stem(word: str) -> str:
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def tokens(text: str) -> list[str]:
    return [_stem(w) for w in _WORD.findall(text.lower()) if w not in _STOPWORDS]


class HashingEmbedder:
    name = "hashing"

    def __init__(self, dimensions: int = EMBEDDING_DIMENSIONS) -> None:
        self.dimensions = dimensions

    def _vector(self, text: str) -> list[float]:
        words = tokens(text)
        features: Counter[str] = Counter(words)
        features.update(f"{a} {b}" for a, b in pairwise(words))
        if not features:
            features["\x00empty"] = 1
        vec = [0.0] * self.dimensions
        for feature, count in features.items():
            digest = int.from_bytes(hashlib.blake2b(feature.encode(), digest_size=8).digest())
            weight = (1.0 + math.log(count)) * (0.5 if " " in feature else 1.0)
            vec[digest % self.dimensions] += weight if digest >> 63 else -weight
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        return [self._vector(t) for t in texts]

    async def aclose(self) -> None:
        return None


class OpenAIEmbedder:
    name = "openai"

    def __init__(
        self,
        *,
        api_base: str,
        api_key: str,
        model: str,
        timeout_s: float,
        batch_size: int,
        dimensions: int = EMBEDDING_DIMENSIONS,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.model = model
        self.dimensions = dimensions
        self.batch_size = batch_size
        self._client = httpx.AsyncClient(
            base_url=api_base.rstrip("/") + "/",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout_s,
            transport=transport,
        )

    async def _batch(self, batch: Sequence[str]) -> list[list[float]]:
        payload = {
            "model": self.model,
            "input": list(batch),
            "dimensions": self.dimensions,
            "encoding_format": "float",
        }
        try:
            res = await self._client.post("embeddings", json=payload)
        except httpx.HTTPError as exc:
            raise EmbeddingUnavailable(type(exc).__name__) from exc
        if res.status_code == 429 or res.status_code >= 500:
            raise EmbeddingUnavailable(f"status {res.status_code}")
        if res.status_code != 200:
            raise EmbeddingRejected(f"status {res.status_code}")
        try:
            rows = sorted(res.json()["data"], key=lambda row: row["index"])
            vectors = [[float(x) for x in row["embedding"]] for row in rows]
        except (ValueError, KeyError, TypeError) as exc:
            raise EmbeddingRejected("malformed response") from exc
        if len(vectors) != len(batch) or any(len(v) != self.dimensions for v in vectors):
            raise EmbeddingRejected("wrong number or size of embeddings")
        return vectors

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for start in range(0, len(texts), self.batch_size):
            out.extend(await self._batch(texts[start : start + self.batch_size]))
        return out

    async def aclose(self) -> None:
        await self._client.aclose()


def build_embedder(settings: Settings) -> Embedder:
    if settings.kb_embedding_provider == "openai":
        return OpenAIEmbedder(
            api_base=settings.kb_embedding_api_base,
            api_key=settings.kb_embedding_api_key.get_secret_value(),
            model=settings.kb_embedding_model,
            timeout_s=settings.kb_embedding_timeout_s,
            batch_size=settings.kb_embedding_batch_size,
        )
    return HashingEmbedder()
