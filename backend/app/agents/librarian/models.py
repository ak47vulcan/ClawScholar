"""Pydantic I/O models for the Librarian agent."""
from __future__ import annotations

from pydantic import BaseModel, Field


class RetrievedChunk(BaseModel):
    """A single chunk returned by the hybrid retriever."""

    text: str
    source: str
    score: float = Field(ge=0.0, le=1.0)
    page_number: int | None = None
    document_id: str | None = None


class LibrarianInput(BaseModel):
    """Input schema for the Librarian agent."""

    run_id: str
    analyst_output: str = Field(description="Raw text of the Analyst's output to be validated")
    query_hint: str | None = Field(default=None, description="Optional query hint for retrieval focus")


class LibrarianOutput(BaseModel):
    """Output schema returned by the Librarian agent."""

    run_id: str
    verdict: str = Field(pattern="^(APPROVED|REJECTED|PARTIAL)$")
    confidence_score: float = Field(ge=0.0, le=1.0)
    evidence_sources: list[RetrievedChunk] = Field(default_factory=list)
    citations: list[str] = Field(default_factory=list, description="Formatted citation strings")
    rejection_reason: str | None = None
    unverified_claims: list[str] = Field(default_factory=list)
