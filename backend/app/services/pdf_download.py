from __future__ import annotations

import re
from dataclasses import dataclass

import httpx

from app.core.logging import get_logger

logger = get_logger(__name__)

_PDF_MAGIC = b"%PDF-"
_CONTENT_TYPE_PDF_RE = re.compile(r"application/pdf", re.IGNORECASE)

# Convert arXiv abstract/html pages to direct PDF URLs
_ARXIV_ABS_RE = re.compile(r"arxiv\.org/abs/([^\s?#]+)")
_ARXIV_HTML_RE = re.compile(r"arxiv\.org/html/([^\s?#]+)")


@dataclass(frozen=True)
class DownloadedFile:
    content: bytes
    media_type: str
    final_url: str


def _normalize_to_pdf_url(url: str) -> str:
    """Convert arXiv abstract/html pages to direct PDF download URLs."""
    m = _ARXIV_ABS_RE.search(url)
    if m:
        return f"https://arxiv.org/pdf/{m.group(1)}.pdf"
    m = _ARXIV_HTML_RE.search(url)
    if m:
        return f"https://arxiv.org/pdf/{m.group(1)}.pdf"
    return url


async def download_pdf(url: str, *, timeout_seconds: float = 60.0, max_bytes: int = 40 * 1024 * 1024) -> DownloadedFile:
    """Download and validate a PDF.

    Validates by content-type OR magic header (some servers lie about content-type).
    Automatically normalizes arXiv abstract page URLs to direct PDF URLs.
    """
    url = (url or "").strip()
    if not url:
        raise ValueError("Empty url")

    url = _normalize_to_pdf_url(url)

    # Use a realistic browser User-Agent — many academic servers block obvious bots
    headers = {
        "Accept": "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1",
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "en-US,en;q=0.9",
    }

    timeout = httpx.Timeout(connect=10.0, read=timeout_seconds, write=10.0, pool=10.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=headers) as client:
        async with client.stream("GET", url) as resp:
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "")

            chunks: list[bytes] = []
            total = 0
            async for b in resp.aiter_bytes():
                if not b:
                    continue
                chunks.append(b)
                total += len(b)
                if total > max_bytes:
                    raise ValueError(f"File too large (> {max_bytes} bytes)")

            content = b"".join(chunks)
            if not content:
                raise ValueError("Empty response body")

            looks_like_pdf = content.startswith(_PDF_MAGIC)
            header_says_pdf = bool(_CONTENT_TYPE_PDF_RE.search(content_type))
            if not (looks_like_pdf or header_says_pdf):
                sample = content[:200].decode("utf-8", errors="replace")
                logger.warning(
                    "download.not_pdf",
                    url=url,
                    final_url=str(resp.url),
                    content_type=content_type,
                    sample=sample,
                )
                raise ValueError(
                    f"Downloaded content is not a PDF (content-type: {content_type!r}). "
                    "The URL may point to an HTML landing page or a paywalled resource."
                )

            return DownloadedFile(content=content, media_type="application/pdf", final_url=str(resp.url))
