"""Document indexing: chunking → embedding → pgvector storage."""

import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.librarian.rag.embeddings import get_embeddings
from app.core.logging import get_logger

logger = get_logger(__name__)
CHUNK_SIZE = 512  # tokens (approx characters / 4)
CHUNK_OVERLAP = 64


def chunk_text(text_content: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Simple character-based chunking with overlap."""
    text_content = text_content.replace("\x00", "")
    chunks: list[str] = []
    start = 0
    while start < len(text_content):
        end = start + chunk_size * 4  # approx 4 chars per token
        chunk = text_content[start:end].replace("\x00", "").strip()
        if chunk:
            chunks.append(chunk)
        start += (chunk_size - overlap) * 4
    return chunks


async def index_document(doc_id: str, text_content: str, db: AsyncSession) -> int:
    """Index a document into pgvector. Returns number of chunks indexed."""
    chunks = chunk_text(text_content)
    if not chunks:
        return 0

    embeddings = await get_embeddings(chunks)

    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        await db.execute(
            text("""
                INSERT INTO document_chunks (id, document_id, chunk_index, content, embedding)
                VALUES (:id, :doc_id, :idx, :content, :embedding)
                ON CONFLICT DO NOTHING
            """),
            {
                "id": str(uuid.uuid4()),
                "doc_id": doc_id,
                "idx": i,
                "content": chunk,
                "embedding": str(embedding),  # pgvector format
            },
        )

    logger.info("Document indexed", doc_id=doc_id, chunks=len(chunks))
    return len(chunks)
