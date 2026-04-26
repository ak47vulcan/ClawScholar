import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator


class DocumentResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    filename: str
    file_type: str
    embedding_status: str
    chunk_count: int
    summary: str | None = None
    source_url: str | None = None
    source_type: str | None = None
    created_at: datetime
    project_id: str | None = None

    @model_validator(mode="before")
    @classmethod
    def extract_project_id(cls, data: Any) -> Any:
        # Pull project_id from metadata_ JSONB when building from ORM object
        if hasattr(data, "metadata_") and isinstance(getattr(data, "metadata_", None), dict):
            meta: dict = data.metadata_  # type: ignore[assignment]
            # Convert to dict so we can add the project_id field
            return {
                "id": data.id,
                "user_id": data.user_id,
                "filename": data.filename,
                "file_type": data.file_type,
                "embedding_status": data.embedding_status,
                "chunk_count": data.chunk_count,
                "summary": data.summary,
                "source_url": data.source_url,
                "source_type": data.source_type,
                "created_at": data.created_at,
                "project_id": meta.get("project_id"),
            }
        return data


class LiteratureSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    sources: list[str] = Field(default=["arxiv", "semantic_scholar"])
    max_per_source: int = Field(default=5, ge=1, le=20)
    goal: str | None = Field(default=None, max_length=2000)


class LiteratureSearchResult(BaseModel):
    title: str
    authors: list[str]
    abstract: str
    url: str
    pdf_url: str | None
    source: str
    year: int | None
    doi: str | None


class DocumentDownloadRequest(BaseModel):
    url: str = Field(min_length=5)
    source_type: str = Field(default="web")
    title: str | None = None
    project_id: uuid.UUID | None = None


class DocumentProjectUpdate(BaseModel):
    project_id: uuid.UUID | None = None


class DocumentBulkDeleteRequest(BaseModel):
    document_ids: list[uuid.UUID] = Field(min_length=1, max_length=100)


class DocumentBulkDeleteResponse(BaseModel):
    deleted_count: int
