"""Document parsing and text extraction service."""

import csv
import io
import os
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.document import Document

logger = get_logger(__name__)


class DocumentDeleteError(Exception):
    """Raised when a requested document cannot be deleted."""


async def delete_documents_for_user(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    document_ids: list[uuid.UUID],
) -> int:
    """Delete library documents and their stored files for one user."""
    unique_ids = list(dict.fromkeys(document_ids))
    result = await db.execute(
        select(Document).where(Document.user_id == user_id, Document.id.in_(unique_ids))
    )
    documents = result.scalars().all()

    if len(documents) != len(unique_ids):
        found_ids = {doc.id for doc in documents}
        missing_ids = [str(doc_id) for doc_id in unique_ids if doc_id not in found_ids]
        raise DocumentDeleteError(f"Document not found: {', '.join(missing_ids)}")

    storage_paths = [doc.storage_path for doc in documents]
    for doc in documents:
        await db.delete(doc)
    await db.commit()

    for path in storage_paths:
        if not path:
            continue
        try:
            if os.path.exists(path):
                os.remove(path)
        except OSError as exc:
            logger.warning("Failed to remove document file", path=path, error=str(exc))

    return len(documents)


def extract_text(file_path: str, file_type: str) -> str:
    """Extract raw text from a document file."""
    if file_type == "TXT":
        with open(file_path, encoding="utf-8", errors="replace") as f:
            return f.read()

    if file_type == "CSV":
        rows = []
        with open(file_path, encoding="utf-8", errors="replace", newline="") as f:
            reader = csv.reader(f)
            for row in reader:
                rows.append(", ".join(row))
        return "\n".join(rows)

    if file_type in ("XLSX", "XLS"):
        try:
            import pandas as pd
            df = pd.read_excel(file_path)
            return df.to_csv(index=False)
        except Exception as e:
            logger.error("Failed to parse Excel file", path=file_path, error=str(e))
            return ""

    if file_type == "PDF":
        try:
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
            if text.strip():
                return text
        except Exception as e:
            logger.error("Failed to parse PDF", path=file_path, error=str(e))
            # fall through to optional fallback

        # Fallback: pdfminer.six handles many PDFs pypdf returns empty for.
        try:
            from pdfminer.high_level import extract_text as pdfminer_extract_text  # type: ignore[import-untyped]

            text2 = pdfminer_extract_text(file_path) or ""
            return text2
        except Exception as e:
            logger.error("Failed to parse PDF (pdfminer)", path=file_path, error=str(e))
            return ""

    return ""
