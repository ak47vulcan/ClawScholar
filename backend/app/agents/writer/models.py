from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ClarifyQuestion(BaseModel):
    id: str
    question: str
    input_type: Literal["text", "choice", "multiselect", "scale"]
    options: list[str] | None = None
    scale_min: int | None = None
    scale_max: int | None = None
    hint: str | None = None
    required: bool = True


class ClarifyOutput(BaseModel):
    questions: list[ClarifyQuestion]


class Chapter(BaseModel):
    index: int
    title: str
    description: str
    key_points: list[str] = Field(default_factory=list)
    target_pages: float = 1.0


class OutlineOutput(BaseModel):
    document_title: str
    abstract: str
    chapters: list[Chapter]
    total_suggested_pages: int


class ChapterCoverage(BaseModel):
    chapter_index: int
    coverage_score: float
    relevant_doc_ids: list[str] = Field(default_factory=list)
    relevant_filenames: list[str] = Field(default_factory=list)
    warning: str | None = None


class CoverageOutput(BaseModel):
    chapters: list[ChapterCoverage]
    overall_score: float


class SectionDraft(BaseModel):
    chapter_index: int
    content_md: str
    word_count: int
    citations: list[str] = Field(default_factory=list)


class AssemblyOutput(BaseModel):
    full_document_md: str
    word_count: int
    page_estimate: float
