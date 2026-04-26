"""Extract plain text from PDF bytes without writing to disk."""
from __future__ import annotations

import io

from app.core.logging import get_logger

logger = get_logger(__name__)


def extract_text_from_bytes(pdf_bytes: bytes, max_chars: int = 3000) -> str:
    """Return up to *max_chars* of text from a PDF given as raw bytes.

    Tries pypdf first, falls back to pdfminer.six for scanned / unusual PDFs.
    Returns an empty string if extraction fails entirely.
    """
    text = _try_pypdf(pdf_bytes, max_chars)
    if len(text.strip()) < 100:
        text = _try_pdfminer(pdf_bytes, max_chars)
    return text[:max_chars]


def _try_pypdf(pdf_bytes: bytes, max_chars: int) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(pdf_bytes))
        parts: list[str] = []
        total = 0
        for page in reader.pages:
            chunk = page.extract_text() or ""
            parts.append(chunk)
            total += len(chunk)
            if total >= max_chars:
                break
        return "\n".join(parts)
    except Exception as exc:
        logger.debug("pypdf extraction failed", error=str(exc))
        return ""


def _try_pdfminer(pdf_bytes: bytes, max_chars: int) -> str:
    try:
        from pdfminer.high_level import extract_text as pdfminer_extract  # type: ignore[import-untyped]

        return pdfminer_extract(io.BytesIO(pdf_bytes)) or ""
    except Exception as exc:
        logger.debug("pdfminer extraction failed", error=str(exc))
        return ""
