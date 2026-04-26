"""Embedding generation using OpenAI-compatible API (optional).

Embeddings are used for:
- RAG retrieval (vector similarity)
- Literature result re-ranking (query ↔ title/abstract similarity)

If no dedicated embeddings key is configured, we fall back to the primary
OpenAI key to keep "AI-powered search" working out of the box.
"""

from app.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)
EMBEDDING_DIM = 1536  # text-embedding-3-small


async def get_embeddings(texts: list[str]) -> list[list[float]]:
    settings = get_settings()
    api_key = (settings.embeddings_api_key or "").strip() or (settings.openai_api_key or "").strip()
    if not api_key:
        logger.info("Embeddings disabled (no API key); returning zero vectors")
        return [[0.0] * EMBEDDING_DIM for _ in texts]

    from openai import AsyncOpenAI
    import httpx

    kwargs: dict[str, object] = {
        "api_key": api_key,
        "timeout": httpx.Timeout(connect=10.0, read=60.0, write=60.0, pool=60.0),
    }
    if settings.embeddings_base_url:
        kwargs["base_url"] = settings.embeddings_base_url

    client = AsyncOpenAI(**kwargs)  # type: ignore[arg-type]
    response = await client.embeddings.create(model=settings.embeddings_model, input=texts)
    return [item.embedding for item in response.data]


async def get_embedding(text: str) -> list[float]:
    results = await get_embeddings([text])
    return results[0]
