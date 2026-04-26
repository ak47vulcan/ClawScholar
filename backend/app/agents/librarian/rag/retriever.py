"""Hybrid retriever: pgvector cosine similarity + BM25 + Reciprocal Rank Fusion."""

from dataclasses import dataclass

from rank_bm25 import BM25Okapi
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.librarian.rag.embeddings import get_embedding
from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class RetrievedChunk:
    doc_id: str
    chunk_index: int
    content: str
    score: float
    source_filename: str | None = None
    source_url: str | None = None
    authors: list[str] | None = None
    year: int | None = None
    doi: str | None = None


async def retrieve(
    query: str,
    db: AsyncSession,
    top_k: int = 10,
    rrf_k: int = 60,
    user_id: str | None = None,
    project_id: str | None = None,
) -> list[RetrievedChunk]:
    """Hybrid search combining vector similarity and BM25, fused via RRF."""
    query_embedding = await get_embedding(query)

    # Vector search (pgvector)
    filters: list[str] = []
    if user_id:
        filters.append("d.user_id = CAST(:user_id AS uuid)")
    if project_id:
        filters.append("d.metadata ->> 'project_id' = :project_id")
    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""
    vector_results = await db.execute(
        text(f"""
            SELECT dc.id, dc.document_id, dc.chunk_index, dc.content,
                   d.filename,
                   d.source_url,
                   d.metadata AS doc_metadata,
                   1 - (dc.embedding <=> CAST(:embedding AS vector)) AS score
            FROM document_chunks dc
            JOIN documents d ON d.id = dc.document_id
            {where_clause}
            ORDER BY dc.embedding <=> CAST(:embedding AS vector)
            LIMIT :k
        """),
        {"embedding": str(query_embedding), "k": top_k * 2, "user_id": user_id, "project_id": project_id},
    )
    vector_rows = vector_results.fetchall()

    if not vector_rows:
        return []

    # BM25 over fetched candidates
    contents = [row.content for row in vector_rows]
    tokenized = [c.lower().split() for c in contents]
    bm25 = BM25Okapi(tokenized)
    bm25_scores = bm25.get_scores(query.lower().split())

    # RRF fusion
    vector_rank = {row.id: i for i, row in enumerate(vector_rows)}
    bm25_rank = {row.id: int(rank) for rank, row in zip(
        sorted(range(len(vector_rows)), key=lambda i: -bm25_scores[i]), vector_rows
    )}

    def rrf_score(row_id: str) -> float:
        v = 1 / (rrf_k + vector_rank.get(row_id, top_k * 2))
        b = 1 / (rrf_k + bm25_rank.get(row_id, top_k * 2))
        return v + b

    ranked = sorted(vector_rows, key=lambda r: -rrf_score(r.id))[:top_k]

    return [
        RetrievedChunk(
            doc_id=str(row.document_id),
            chunk_index=row.chunk_index,
            content=row.content,
            score=rrf_score(row.id),
            source_filename=row.filename,
            source_url=row.source_url,
            authors=(row.doc_metadata or {}).get("authors") if isinstance(row.doc_metadata, dict) else None,
            year=(row.doc_metadata or {}).get("year") if isinstance(row.doc_metadata, dict) else None,
            doi=(row.doc_metadata or {}).get("doi") if isinstance(row.doc_metadata, dict) else None,
        )
        for row in ranked
    ]


async def retrieve_and_rerank(
    query: str,
    db: AsyncSession,
    top_k: int = 8,
    rerank_top_k: int = 5,
    user_id: str | None = None,
    project_id: str | None = None,
) -> list[RetrievedChunk]:
    """Retrieve chunks via hybrid search then re-rank with cross-encoder."""
    chunks = await retrieve(query, db, top_k=top_k, user_id=user_id, project_id=project_id)
    if not chunks:
        return []
    try:
        from app.agents.librarian.rag.reranker import CrossEncoderReranker
        reranker = CrossEncoderReranker()
        return reranker.rerank(query, chunks, top_k=rerank_top_k)
    except Exception as exc:
        logger.warning("reranker failed; returning hybrid results", error=str(exc))
        return chunks[:rerank_top_k]
