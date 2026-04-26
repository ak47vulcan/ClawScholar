from __future__ import annotations

import os
import uuid
from typing import Annotated

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.config import get_settings
from app.models.document import Document
from app.models.user import User
from app.schemas.document import (
    DocumentBulkDeleteRequest,
    DocumentBulkDeleteResponse,
    DocumentDownloadRequest,
    DocumentResponse,
    DocumentProjectUpdate,
    LiteratureSearchRequest,
    LiteratureSearchResult,
)
from app.services.document_service import DocumentDeleteError, delete_documents_for_user

router = APIRouter()
CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]

ALLOWED_TYPES = {"csv": "CSV", "xlsx": "XLSX", "pdf": "PDF", "txt": "TXT"}


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile,
    background_tasks: BackgroundTasks,
    db: DB,
    user: CurrentUser,
) -> DocumentResponse:
    settings = get_settings()
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_TYPES:
        raise HTTPException(status_code=422, detail=f"File type .{ext} not supported. Use: {list(ALLOWED_TYPES)}")

    user_dir = os.path.join(settings.upload_dir, str(user.id))
    os.makedirs(user_dir, exist_ok=True)

    file_id = uuid.uuid4()
    storage_path = os.path.join(user_dir, f"{file_id}.{ext}")

    content = await file.read()
    with open(storage_path, "wb") as f:
        f.write(content)

    doc = Document(
        user_id=user.id,
        filename=file.filename or f"upload.{ext}",
        file_type=ALLOWED_TYPES[ext],
        storage_path=storage_path,
        source_type="upload",
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)

    from app.tasks.embedding_tasks import index_document

    background_tasks.add_task(index_document, str(doc.id))

    return DocumentResponse.model_validate(doc)


@router.get("/", response_model=list[DocumentResponse])
async def list_documents(
    db: DB,
    user: CurrentUser,
    goal_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
) -> list[DocumentResponse]:
    q = select(Document).where(Document.user_id == user.id)
    if goal_id is not None:
        q = q.where(Document.metadata_["goal_id"].astext == str(goal_id))
    if project_id is not None:
        q = q.where(Document.metadata_["project_id"].astext == str(project_id))
    q = q.order_by(Document.created_at.desc())
    result = await db.execute(q)
    return [DocumentResponse.model_validate(d) for d in result.scalars().all()]


@router.patch("/{doc_id}/project", response_model=DocumentResponse)
async def update_document_project(
    doc_id: uuid.UUID,
    payload: DocumentProjectUpdate,
    db: DB,
    user: CurrentUser,
) -> DocumentResponse:
    """Assign or remove a document from a project (stored in metadata)."""
    result = await db.execute(select(Document).where(Document.id == doc_id, Document.user_id == user.id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    meta = dict(doc.metadata_ or {})
    if payload.project_id is None:
        meta.pop("project_id", None)
    else:
        meta["project_id"] = str(payload.project_id)
    doc.metadata_ = meta
    await db.flush()
    await db.refresh(doc)
    await db.commit()
    return DocumentResponse.model_validate(doc)


@router.get("/{doc_id}/file")
async def download_document_file(doc_id: uuid.UUID, db: DB, user: CurrentUser) -> FileResponse:
    result = await db.execute(select(Document).where(Document.id == doc_id, Document.user_id == user.id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not os.path.exists(doc.storage_path):
        raise HTTPException(status_code=404, detail="File missing on disk")
    media_type = "application/pdf" if doc.file_type == "PDF" else "application/octet-stream"
    return FileResponse(path=doc.storage_path, media_type=media_type, filename=doc.filename)


@router.post("/bulk-delete", response_model=DocumentBulkDeleteResponse)
async def bulk_delete_documents(
    payload: DocumentBulkDeleteRequest,
    db: DB,
    user: CurrentUser,
) -> DocumentBulkDeleteResponse:
    try:
        deleted_count = await delete_documents_for_user(
            db,
            user_id=user.id,
            document_ids=payload.document_ids,
        )
    except DocumentDeleteError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return DocumentBulkDeleteResponse(deleted_count=deleted_count)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(doc_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    try:
        await delete_documents_for_user(db, user_id=user.id, document_ids=[doc_id])
    except DocumentDeleteError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ── Literature search ────────────────────────────────────────────────────────

@router.post("/search", response_model=list[LiteratureSearchResult])
async def search_literature(
    payload: LiteratureSearchRequest,
    user: CurrentUser,  # noqa: ARG001 — auth only
) -> list[LiteratureSearchResult]:
    from app.services.literature_search import search_literature

    results = await search_literature(
        payload.query,
        payload.sources,
        payload.max_per_source,
        goal=payload.goal or payload.query,
    )
    return [LiteratureSearchResult(**r) for r in results]


@router.post("/download", response_model=DocumentResponse, status_code=201)
async def download_and_save_document(
    payload: DocumentDownloadRequest,
    background_tasks: BackgroundTasks,
    db: DB,
    user: CurrentUser,
) -> DocumentResponse:
    """Download a PDF from a URL and store it as a Document."""
    settings = get_settings()

    try:
        from app.services.pdf_download import download_pdf

        downloaded = await download_pdf(payload.url)
        content = downloaded.content
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to download: {exc}") from exc

    # Detect file type from content-type or URL
    ext, file_type = "pdf", "PDF"

    user_dir = os.path.join(settings.upload_dir, str(user.id))
    os.makedirs(user_dir, exist_ok=True)
    file_id = uuid.uuid4()
    storage_path = os.path.join(user_dir, f"{file_id}.{ext}")

    with open(storage_path, "wb") as f:
        f.write(content)

    # Derive a filename from title or URL
    raw_filename = payload.title or payload.url.split("/")[-1].split("?")[0] or f"paper_{file_id}.{ext}"
    if not raw_filename.endswith(f".{ext}"):
        raw_filename = raw_filename[:240].rstrip() + f".{ext}"

    meta: dict = {}
    if payload.project_id is not None:
        meta["project_id"] = str(payload.project_id)

    doc = Document(
        user_id=user.id,
        filename=raw_filename[:500],
        file_type=file_type,
        storage_path=storage_path,
        source_url=payload.url[:1000],
        source_type=payload.source_type,
        metadata_=meta,
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)

    from app.tasks.embedding_tasks import index_document

    background_tasks.add_task(index_document, str(doc.id))

    return DocumentResponse.model_validate(doc)
