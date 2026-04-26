"""Cross-encoder re-ranking for retrieved chunks."""
from __future__ import annotations

import structlog

log = structlog.get_logger(__name__)


class CrossEncoderReranker:
    """Re-ranks a list of retrieved chunks using a cross-encoder model.

    In production this loads a ``sentence-transformers`` cross-encoder.
    Falls back to identity ranking when the model is unavailable.
    """

    def __init__(self, model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2") -> None:
        self._model_name = model_name
        self._model = None
        self._load_model()

    def _load_model(self) -> None:
        try:
            from sentence_transformers import CrossEncoder
            self._model = CrossEncoder(self._model_name)
            log.info("reranker.loaded", model=self._model_name)
        except Exception as exc:
            log.warning("reranker.unavailable", reason=str(exc))

    def rerank(self, query: str, chunks: list, top_k: int = 5) -> list:
        """Re-rank *chunks* by relevance to *query*.

        Args:
            query: The user's search query.
            chunks: List of objects with a ``text`` attribute.
            top_k: Number of top results to return.

        Returns:
            Re-ranked subset of *chunks*, highest relevance first.
        """
        if self._model is None or not chunks:
            return chunks[:top_k]

        pairs = [(query, getattr(c, "content", "") or getattr(c, "text", "")) for c in chunks]
        scores = self._model.predict(pairs)
        ranked = sorted(zip(scores, chunks), key=lambda x: x[0], reverse=True)
        log.info("reranker.reranked", input=len(chunks), output=top_k)
        return [c for _, c in ranked[:top_k]]
