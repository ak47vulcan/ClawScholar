"""AI-assisted source coverage checks for Writer outlines."""

from __future__ import annotations

import asyncio
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.llm.client import get_llm

logger = get_logger(__name__)


async def check_outline_coverage(
    *,
    chapters: list[dict[str, Any]],
    outline: dict[str, Any],
    doc_type: str,
    user_id: str,
    project_id: str | None = None,
    db: AsyncSession | None = None,
) -> dict[str, Any]:
    """Retrieve chapter evidence from indexed PDFs, then let the LLM assess gaps."""
    retrieved_by_chapter: list[dict[str, Any]] = []

    for chapter in chapters:
        query = _chapter_query(chapter)
        chunks = []
        try:
            async with AsyncSessionLocal() as rag_db:
                from app.agents.librarian.rag.retriever import retrieve_and_rerank

                chunks = await retrieve_and_rerank(
                    query,
                    rag_db,
                    top_k=10,
                    rerank_top_k=6,
                    user_id=user_id,
                    project_id=project_id,
                )
        except Exception as exc:
            logger.warning("Writer coverage retrieval failed", chapter=chapter.get("index"), error=str(exc))

        retrieved_by_chapter.append(
            {
                "chapter_index": int(chapter.get("index", 0)),
                "title": chapter.get("title", ""),
                "query": query,
                "chunks": [
                    {
                        "doc_id": c.doc_id,
                        "filename": c.source_filename,
                        "score": round(float(c.score), 4),
                        "excerpt": c.content[:700],
                    }
                    for c in chunks
                ],
            }
        )

    context = _format_retrieved_context(retrieved_by_chapter)
    try:
        llm = await get_llm()
        ai = await llm.run_writer_coverage_check(
            outline=outline,
            retrieved_context=context,
            doc_type=doc_type,
        )
    except Exception as exc:
        logger.warning("Writer AI coverage check failed; using retrieval fallback", error=str(exc))
        ai = _fallback_coverage(chapters, retrieved_by_chapter)

    return _merge_coverage(ai, retrieved_by_chapter)


async def wait_for_documents_indexed(document_ids: list[str], *, timeout_seconds: float = 45.0) -> None:
    """Wait briefly for downloaded PDFs to become visible to RAG."""
    if not document_ids:
        return

    import uuid
    from app.models.document import Document
    from sqlalchemy import select

    deadline = asyncio.get_running_loop().time() + timeout_seconds
    wanted = [uuid.UUID(d) for d in document_ids]

    while True:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Document.embedding_status).where(Document.id.in_(wanted)))
            statuses = [row[0] for row in result.all()]
        if statuses and all(s == "INDEXED" for s in statuses):
            return
        if asyncio.get_running_loop().time() >= deadline:
            logger.info("Timed out waiting for writer source indexing", indexed=statuses.count("INDEXED"), total=len(wanted))
            return
        await asyncio.sleep(1.5)


def _chapter_query(chapter: dict[str, Any]) -> str:
    key_points = chapter.get("key_points") or []
    key_text = " ".join(str(k) for k in key_points[:6])
    return f"{chapter.get('title', '')} {chapter.get('description', '')} {key_text}".strip()


def _format_retrieved_context(items: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for item in items:
        parts.append(f"Chapter {item['chapter_index']}: {item['title']}\nQuery: {item['query']}")
        chunks = item.get("chunks") or []
        if not chunks:
            parts.append("No retrieved excerpts.")
            continue
        for i, chunk in enumerate(chunks, start=1):
            parts.append(
                f"[{i}] {chunk.get('filename') or 'Unknown source'} "
                f"(score {chunk.get('score')}): {chunk.get('excerpt')}"
            )
    return "\n\n".join(parts)


def _fallback_coverage(chapters: list[dict[str, Any]], retrieved_by_chapter: list[dict[str, Any]]) -> dict[str, Any]:
    out = []
    for chapter, retrieved in zip(chapters, retrieved_by_chapter, strict=False):
        chunk_count = len(retrieved.get("chunks") or [])
        score = min(chunk_count / 5.0, 1.0)
        out.append(
            {
                "chapter_index": int(chapter.get("index", 0)),
                "coverage_score": score,
                "rationale": "Estimated from retrieved source count because the AI coverage check was unavailable.",
                "missing_topics": [] if score >= 0.6 else [str(chapter.get("title", "chapter topic"))],
                "suggested_queries": [_chapter_query(chapter)] if score < 0.6 else [],
            }
        )
    overall = sum(c["coverage_score"] for c in out) / len(out) if out else 0.0
    return {
        "overall_score": overall,
        "status": "SUFFICIENT" if overall >= 0.75 else "PARTIAL" if overall >= 0.45 else "INSUFFICIENT",
        "summary": "Coverage estimated from local retrieval.",
        "chapters": out,
    }


def _merge_coverage(ai: dict[str, Any], retrieved_by_chapter: list[dict[str, Any]]) -> dict[str, Any]:
    by_index = {int(c.get("chapter_index", 0)): c for c in ai.get("chapters", []) if isinstance(c, dict)}
    chapter_coverages = []

    for item in retrieved_by_chapter:
        idx = int(item["chapter_index"])
        ai_chapter = by_index.get(idx, {})
        chunks = item.get("chunks") or []
        score = _clamp(float(ai_chapter.get("coverage_score", 0.0)))
        filenames = []
        doc_ids = []
        for chunk in chunks:
            doc_id = str(chunk.get("doc_id") or "")
            filename = str(chunk.get("filename") or "")
            if doc_id and doc_id not in doc_ids:
                doc_ids.append(doc_id)
            if filename and filename not in filenames:
                filenames.append(filename)

        missing_topics = [str(t) for t in (ai_chapter.get("missing_topics") or []) if str(t).strip()]
        warning = None
        if score < 0.45:
            warning = "Literature missing for this chapter"
        elif score < 0.7:
            warning = "Partial source coverage"

        chapter_coverages.append(
            {
                "chapter_index": idx,
                "coverage_score": round(score, 3),
                "relevant_doc_ids": doc_ids[:5],
                "relevant_filenames": filenames[:5],
                "rationale": ai_chapter.get("rationale") or "",
                "missing_topics": missing_topics,
                "suggested_queries": [
                    str(q) for q in (ai_chapter.get("suggested_queries") or []) if str(q).strip()
                ][:4],
                "warning": warning,
            }
        )

    overall = _clamp(float(ai.get("overall_score", 0.0)))
    missing_topics = [str(t) for t in (ai.get("missing_topics") or []) if str(t).strip()]
    suggested_queries = [str(q) for q in (ai.get("suggested_queries") or []) if str(q).strip()]
    if not suggested_queries:
        for ch in chapter_coverages:
            suggested_queries.extend(ch.get("suggested_queries") or [])

    status = str(ai.get("status") or "").upper()
    if status not in {"SUFFICIENT", "PARTIAL", "INSUFFICIENT"}:
        status = "SUFFICIENT" if overall >= 0.75 else "PARTIAL" if overall >= 0.45 else "INSUFFICIENT"

    return {
        "chapters": chapter_coverages,
        "overall_score": round(overall, 3),
        "status": status,
        "summary": ai.get("summary") or "",
        "missing_topics": missing_topics[:8],
        "suggested_queries": list(dict.fromkeys(suggested_queries))[:8],
        "needs_sources": status != "SUFFICIENT" or overall < 0.7,
    }


def _clamp(value: float) -> float:
    if value < 0.0:
        return 0.0
    if value > 1.0:
        return 1.0
    return value
