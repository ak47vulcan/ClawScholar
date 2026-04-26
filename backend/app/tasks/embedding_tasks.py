"""Background task: index document into pgvector and generate a summary."""

import uuid

from sqlalchemy import select

from app.agents.librarian.rag.indexer import index_document as _index
from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.models.document import Document
from app.services.document_service import extract_text

logger = get_logger(__name__)

_SUMMARY_MAX_CHARS = 8000  # truncate text before sending to LLM


async def _generate_summary(text: str) -> str | None:
    """Call the LLM client to produce a short document summary (~150 tokens)."""
    try:
        from app.llm.client import get_llm

        client = await get_llm()
        summary = await client.run_summarizer(text[:_SUMMARY_MAX_CHARS])
        return summary
    except Exception as exc:
        logger.warning("Summary generation failed", error=str(exc))
        return None


async def index_document(doc_id: str) -> None:
    """Extract text, generate summary and index document chunks into pgvector."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Document).where(Document.id == uuid.UUID(doc_id)))
        doc = result.scalar_one_or_none()
        if not doc:
            logger.error("Document not found for indexing", doc_id=doc_id)
            return

        try:
            doc.embedding_status = "INDEXING"
            await db.flush()

            text_content = extract_text(doc.storage_path, doc.file_type).replace("\x00", "")
            if not text_content.strip():
                doc.embedding_status = "FAILED"
                await db.flush()
                await db.commit()
                logger.warning("Empty text content", doc_id=doc_id)
                return

            # Generate summary (non-blocking — don't fail indexing if this fails)
            summary = await _generate_summary(text_content)
            if summary:
                doc.summary = summary
                await db.flush()

            chunk_count = await _index(doc_id, text_content, db)
            doc.embedding_status = "INDEXED"
            doc.chunk_count = chunk_count
            await db.flush()
            await db.commit()
            logger.info("Document indexed", doc_id=doc_id, chunks=chunk_count)

        except Exception as exc:
            await db.rollback()
            try:
                failed_result = await db.execute(select(Document).where(Document.id == uuid.UUID(doc_id)))
                failed_doc = failed_result.scalar_one_or_none()
                if failed_doc:
                    failed_doc.embedding_status = "FAILED"
                    await db.flush()
                    await db.commit()
            except Exception as status_exc:
                await db.rollback()
                logger.error("Failed to persist indexing failure", doc_id=doc_id, error=str(status_exc))
            logger.error("Indexing failed", doc_id=doc_id, error=str(exc))
