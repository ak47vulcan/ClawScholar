"""
Literature search service.

Supports: arXiv, Semantic Scholar, PubMed (via Bio.Entrez).

All functions return a list of dicts:
  {
    "title": str,
    "authors": list[str],
    "abstract": str,
    "url": str,             # landing page
    "pdf_url": str | None,  # direct PDF download URL if available
    "source": str,          # "arxiv" | "semantic_scholar" | "pubmed"
    "year": int | None,
    "doi": str | None,
    "citation_count": int,  # used for ranking
  }
"""

from __future__ import annotations

import asyncio
import os
import re
import math
from typing import Any

import httpx

from app.core.logging import get_logger

logger = get_logger(__name__)

_HTTP_TIMEOUT = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0)

# Browser-like UA so academic servers don't block us
_BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


# ── arXiv ────────────────────────────────────────────────────────────────────

async def search_arxiv(query: str, max_results: int = 5) -> list[dict[str, Any]]:
    try:
        import arxiv  # type: ignore[import-untyped]

        loop = asyncio.get_event_loop()

        def _sync_search() -> list[dict[str, Any]]:
            client = arxiv.Client()
            search = arxiv.Search(query=query, max_results=max_results, sort_by=arxiv.SortCriterion.Relevance)
            results = []
            for r in client.results(search):
                # Always use the direct PDF URL for arXiv (more reliable than the abstract page)
                arxiv_id = r.entry_id.split("/abs/")[-1]
                pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
                results.append(
                    {
                        "title": r.title,
                        "authors": [str(a) for a in r.authors],
                        "abstract": r.summary[:800],
                        "url": r.entry_id,
                        "pdf_url": pdf_url,
                        "source": "arxiv",
                        "year": r.published.year if r.published else None,
                        "doi": r.doi,
                        "citation_count": 0,
                    }
                )
            return results

        return await loop.run_in_executor(None, _sync_search)
    except Exception as exc:
        logger.error("arXiv search failed", query=query, error=str(exc))
        return []


# ── Semantic Scholar ─────────────────────────────────────────────────────────

_SS_API = "https://api.semanticscholar.org/graph/v1/paper/search"
# citationCount added for ranking; externalIds to extract ArXiv ID for reliable PDF URL
_SS_FIELDS = "title,authors,abstract,year,externalIds,openAccessPdf,url,citationCount"


async def search_semantic_scholar(query: str, max_results: int = 5) -> list[dict[str, Any]]:
    headers = {"User-Agent": _BROWSER_UA}
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, headers=headers) as client:
            resp = await client.get(
                _SS_API,
                params={"query": query, "limit": max_results, "fields": _SS_FIELDS},
            )
            if resp.status_code == 429:
                # Single retry after a short pause
                await asyncio.sleep(2.0)
                resp = await client.get(
                    _SS_API,
                    params={"query": query, "limit": max_results, "fields": _SS_FIELDS},
                )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error("Semantic Scholar search failed", query=query, error=str(exc))
        return []

    results = []
    for p in data.get("data", []):
        external_ids = p.get("externalIds") or {}
        doi = external_ids.get("DOI")
        arxiv_id = external_ids.get("ArXiv")
        citation_count = int(p.get("citationCount") or 0)

        # Prefer arXiv direct PDF URL (most reliable open-access source)
        if arxiv_id:
            pdf_url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
        else:
            pdf_url = (p.get("openAccessPdf") or {}).get("url") or None

        results.append(
            {
                "title": p.get("title", ""),
                "authors": [a.get("name", "") for a in (p.get("authors") or [])],
                "abstract": (p.get("abstract") or "")[:800],
                "url": p.get("url") or f"https://www.semanticscholar.org/paper/{p.get('paperId', '')}",
                "pdf_url": pdf_url,
                "source": "semantic_scholar",
                "year": p.get("year"),
                "doi": doi,
                "citation_count": citation_count,
            }
        )
    return results


# ── PubMed ───────────────────────────────────────────────────────────────────

_PUBMED_EMAIL = os.getenv("PUBMED_EMAIL", "clawscholar@example.com")


async def search_pubmed(query: str, max_results: int = 5) -> list[dict[str, Any]]:
    try:
        from Bio import Entrez  # type: ignore[import-untyped]

        Entrez.email = _PUBMED_EMAIL

        loop = asyncio.get_event_loop()

        def _sync_search() -> list[dict[str, Any]]:
            handle = Entrez.esearch(db="pubmed", term=query, retmax=max_results)
            record = Entrez.read(handle)
            handle.close()
            ids = record.get("IdList", [])
            if not ids:
                return []

            handle = Entrez.efetch(db="pubmed", id=",".join(ids), rettype="xml", retmode="xml")
            records = Entrez.read(handle)
            handle.close()

            results = []
            for article in records.get("PubmedArticle", []):
                medline = article.get("MedlineCitation", {})
                art = medline.get("Article", {})
                title = str(art.get("ArticleTitle", ""))
                abstract_texts = art.get("Abstract", {}).get("AbstractText", [])
                abstract = " ".join(str(t) for t in abstract_texts)[:800]
                authors_list = art.get("AuthorList", [])
                authors = [
                    f"{a.get('ForeName', '')} {a.get('LastName', '')}".strip()
                    for a in authors_list
                    if isinstance(a, dict)
                ]
                pmid = str(medline.get("PMID", ""))
                year_info = art.get("Journal", {}).get("JournalIssue", {}).get("PubDate", {})
                year = int(str(year_info.get("Year", 0))) if year_info.get("Year") else None

                # Europe PMC provides a direct PDF download endpoint that works without
                # authentication, which is more reliable than the NCBI redirect chain.
                pmc_id = None
                for db_info in article.get("PubmedData", {}).get("ArticleIdList", []):
                    if hasattr(db_info, "attributes") and db_info.attributes.get("IdType") == "pmc":
                        pmc_id = str(db_info)

                if pmc_id:
                    # Europe PMC direct PDF download
                    pdf_url = f"https://europepmc.org/backend/ptpmcrender.fcgi?accid={pmc_id}&blobtype=pdf"
                else:
                    pdf_url = None

                results.append(
                    {
                        "title": title,
                        "authors": authors,
                        "abstract": abstract,
                        "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                        "pdf_url": pdf_url,
                        "source": "pubmed",
                        "year": year,
                        "doi": None,
                        "citation_count": 0,
                    }
                )
            return results

        return await loop.run_in_executor(None, _sync_search)
    except Exception as exc:
        logger.error("PubMed search failed", query=query, error=str(exc))
        return []


# ── CORE API ─────────────────────────────────────────────────────────────────

_CORE_API = "https://api.core.ac.uk/v3/search/works/"


async def search_core(query: str, max_results: int = 5) -> list[dict[str, Any]]:
    """Search CORE (core.ac.uk) — 323M+ open-access full texts, no auth required."""
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, headers={"User-Agent": _BROWSER_UA}, follow_redirects=True) as client:
            resp = await client.get(
                _CORE_API,
                params={"q": query, "limit": max_results, "stats": "false"},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error("CORE search failed", query=query, error=str(exc))
        return []

    results = []
    for item in data.get("results", []):
        doi = item.get("doi")
        pdf_url = item.get("downloadUrl") or None
        if not pdf_url and item.get("pdfUrl"):
            pdf_url = item["pdfUrl"]
        year = None
        published = item.get("publishedDate") or item.get("yearPublished")
        if isinstance(published, int):
            year = published
        elif isinstance(published, str) and published[:4].isdigit():
            year = int(published[:4])
        results.append({
            "title": item.get("title", ""),
            "authors": [a.get("name", "") for a in (item.get("authors") or [])],
            "abstract": (item.get("abstract") or "")[:800],
            "url": item.get("sourceFulltextUrls", [None])[0] or item.get("links", [{}])[0].get("url", ""),
            "pdf_url": pdf_url,
            "source": "core",
            "year": year,
            "doi": doi,
            "citation_count": 0,
        })
    return results


# ── OpenAlex ─────────────────────────────────────────────────────────────────

_OPENALEX_API = "https://api.openalex.org/works"
_POLITE_EMAIL = os.getenv("PUBMED_EMAIL", "clawscholar@example.com")


async def search_openalex(query: str, max_results: int = 5) -> list[dict[str, Any]]:
    """Search OpenAlex (openalex.org) — 250M+ works, best_oa_location for free PDFs."""
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, headers={"User-Agent": _BROWSER_UA}) as client:
            resp = await client.get(
                _OPENALEX_API,
                params={
                    "search": query,
                    "per-page": max_results,
                    "mailto": _POLITE_EMAIL,
                    "select": "title,authorships,abstract_inverted_index,publication_year,doi,best_oa_location,cited_by_count,id",
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error("OpenAlex search failed", query=query, error=str(exc))
        return []

    results = []
    for item in data.get("results", []):
        doi = (item.get("doi") or "").replace("https://doi.org/", "") or None
        oa = item.get("best_oa_location") or {}
        pdf_url = oa.get("pdf_url") or None
        # Reconstruct abstract from inverted index
        inv_idx: dict[str, list[int]] | None = item.get("abstract_inverted_index")
        abstract = ""
        if inv_idx:
            word_positions: list[tuple[int, str]] = []
            for word, positions in inv_idx.items():
                for pos in positions:
                    word_positions.append((pos, word))
            abstract = " ".join(w for _, w in sorted(word_positions))[:800]
        authors = [
            (a.get("author") or {}).get("display_name", "") for a in (item.get("authorships") or [])
        ]
        results.append({
            "title": item.get("title", ""),
            "authors": authors,
            "abstract": abstract,
            "url": item.get("id", ""),
            "pdf_url": pdf_url,
            "source": "openalex",
            "year": item.get("publication_year"),
            "doi": doi,
            "citation_count": int(item.get("cited_by_count") or 0),
        })
    return results


# ── Unpaywall ────────────────────────────────────────────────────────────────

async def resolve_pdf_via_unpaywall(doi: str) -> str | None:
    """Resolve a DOI to a free legal PDF URL via Unpaywall. Returns None if unavailable."""
    if not doi:
        return None
    try:
        url = f"https://api.unpaywall.org/v2/{doi.strip()}?email={_POLITE_EMAIL}"
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, headers={"User-Agent": _BROWSER_UA}) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return None
            data = resp.json()
            best = data.get("best_oa_location") or {}
            return best.get("url_for_pdf") or None
    except Exception:
        return None


# ── Combined search ──────────────────────────────────────────────────────────

async def search_literature(
    query: str,
    sources: list[str],
    max_per_source: int = 5,
    goal: str | None = None,
) -> list[dict[str, Any]]:
    """Run searches in parallel across all sources.

    Sources: arxiv, semantic_scholar, pubmed, core, openalex (always included).
    Results are de-duplicated, ranked, then AI-filtered for topic relevance.
    """
    tasks = []
    if "arxiv" in sources:
        tasks.append(search_arxiv(query, max_per_source))
    if "semantic_scholar" in sources:
        tasks.append(search_semantic_scholar(query, max_per_source))
    if "pubmed" in sources:
        tasks.append(search_pubmed(query, max_per_source))
    # Always include CORE and OpenAlex — best free PDF coverage
    tasks.append(search_core(query, max_per_source))
    tasks.append(search_openalex(query, max_per_source))

    results_nested = await asyncio.gather(*tasks, return_exceptions=True)
    combined: list[dict[str, Any]] = []
    for r in results_nested:
        if isinstance(r, list):
            combined.extend(r)

    # Backfill missing PDF URLs via Unpaywall for papers with DOIs
    await _backfill_pdf_urls(combined)

    deduped = _dedupe_results(combined)
    ranked = await _rank_results(query, deduped)

    # AI relevance filter: remove off-topic papers from top 20 candidates
    filtered = await _ai_relevance_filter(goal or query, ranked)
    return filtered


async def _backfill_pdf_urls(results: list[dict[str, Any]]) -> None:
    """Resolve Unpaywall PDF URLs for results missing a pdf_url (in-place)."""
    needs_resolve = [r for r in results if not r.get("pdf_url") and r.get("doi")]
    if not needs_resolve:
        return
    resolved = await asyncio.gather(
        *[resolve_pdf_via_unpaywall(r["doi"]) for r in needs_resolve],
        return_exceptions=True,
    )
    for r, pdf_url in zip(needs_resolve, resolved):
        if isinstance(pdf_url, str):
            r["pdf_url"] = pdf_url


async def _ai_relevance_filter(
    goal: str,
    results: list[dict[str, Any]],
    batch_size: int = 25,
) -> list[dict[str, Any]]:
    """Two-stage relevance filter.

    Stage 1 — title screening (all results, batched):
        Fast LLM pass that rejects clearly off-topic papers based on title alone.
        Ambiguous titles are kept to avoid false negatives.

    Stage 2 — abstract confirmation (title-stage survivors only):
        Stricter LLM pass using title + abstract. Rejects papers whose abstract
        reveals a mismatch with the research goal.
    """
    if not results:
        return results
    try:
        from app.llm.client import get_llm
        llm = await get_llm()

        # ── Stage 1: title screening ──────────────────────────────────────────
        stage1_kept: list[dict[str, Any]] = []
        for batch_start in range(0, len(results), batch_size):
            batch = results[batch_start: batch_start + batch_size]
            candidates = [
                {"id": str(batch_start + i), "title": r.get("title", "")}
                for i, r in enumerate(batch)
            ]
            keep_ids = await llm.filter_papers_by_title(goal=goal, candidates=candidates)
            id_set = set(str(kid) for kid in (keep_ids or []))
            stage1_kept.extend(batch[i] for i, c in enumerate(candidates) if c["id"] in id_set)

        logger.info(
            "Literature filter stage-1 (titles)",
            before=len(results),
            after=len(stage1_kept),
            goal_snippet=goal[:80],
        )

        if not stage1_kept:
            # All titles were rejected — fall back to original to avoid empty result set
            logger.warning("Stage-1 filter rejected everything; skipping stage-2 and returning originals")
            return results

        # ── Stage 2: abstract confirmation ───────────────────────────────────
        stage2_kept: list[dict[str, Any]] = []
        for batch_start in range(0, len(stage1_kept), batch_size):
            batch = stage1_kept[batch_start: batch_start + batch_size]
            candidates = [
                {
                    "id": str(batch_start + i),
                    "title": r.get("title", ""),
                    "abstract": r.get("abstract", ""),
                }
                for i, r in enumerate(batch)
            ]
            relevant_ids = await llm.filter_papers_by_abstract(goal=goal, candidates=candidates)
            id_set = set(str(rid) for rid in (relevant_ids or []))
            stage2_kept.extend(batch[i] for i, c in enumerate(candidates) if c["id"] in id_set)

        logger.info(
            "Literature filter stage-2 (abstracts)",
            before=len(stage1_kept),
            after=len(stage2_kept),
            goal_snippet=goal[:80],
        )

        # If abstract stage rejects everything, keep stage-1 survivors as fallback
        return stage2_kept if stage2_kept else stage1_kept

    except Exception as exc:
        logger.warning("AI relevance filter failed; returning unfiltered results", error=str(exc))
    return results


_WS_RE = re.compile(r"\s+")


def _norm_title(s: str) -> str:
    s = (s or "").strip().lower()
    s = _WS_RE.sub(" ", s)
    s = re.sub(r"[^\w\s\-:]", "", s)
    return s[:300]


def _norm_doi(s: str | None) -> str | None:
    if not s:
        return None
    d = s.strip().lower()
    d = d.removeprefix("doi:")
    d = d.strip()
    return d or None


def _dedupe_results(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Best-effort dedupe across heterogeneous sources."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    for r in results:
        title = str(r.get("title") or "")
        url = str(r.get("url") or "")
        pdf_url = str(r.get("pdf_url") or "")
        doi = _norm_doi(r.get("doi"))

        key_parts = []
        if doi:
            key_parts.append(f"doi:{doi}")
        if pdf_url:
            key_parts.append(f"pdf:{pdf_url.split('#')[0].split('?')[0]}")
        if url:
            key_parts.append(f"url:{url.split('#')[0].split('?')[0]}")
        if title:
            key_parts.append(f"title:{_norm_title(title)}")

        key = "|".join(key_parts) if key_parts else repr(sorted(r.items()))[:500]
        if key in seen:
            continue
        seen.add(key)
        out.append(r)

    return out


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b, strict=False):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0.0 or nb <= 0.0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


async def _rank_results(query: str, results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Rank results by semantic query relevance + citation count + recency."""
    if not results:
        return []

    try:
        from app.agents.librarian.rag.embeddings import get_embedding, get_embeddings

        q_emb = await get_embedding(query[:1000])
        texts: list[str] = []
        for r in results:
            title = str(r.get("title") or "")
            abstract = str(r.get("abstract") or "")
            texts.append(f"{title}\n\n{abstract}".strip()[:2000])

        r_embs = await get_embeddings(texts)

        # Compute log-normalised citation bonus (max ~0.10)
        max_citations = max((int(r.get("citation_count") or 0) for r in results), default=1)
        max_citations = max(max_citations, 1)

        scored: list[tuple[float, dict[str, Any]]] = []
        for r, emb in zip(results, r_embs, strict=False):
            sim = _cosine(q_emb, emb)

            year = r.get("year")
            year_bonus = 0.0
            if isinstance(year, int) and 2015 <= year <= 2030:
                year_bonus = min(0.08, max(0.0, (year - 2015) * 0.005))

            has_pdf = 0.03 if (r.get("pdf_url") or "").strip() else 0.0

            # Log-normalised citation count (papers with 10× more citations get ~+0.10)
            citations = int(r.get("citation_count") or 0)
            citation_bonus = 0.10 * (math.log1p(citations) / math.log1p(max_citations))

            score = float(sim) + year_bonus + has_pdf + citation_bonus
            scored.append((score, r))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [r for _, r in scored]
    except Exception as exc:
        logger.warning("Literature ranking failed; returning unranked results", error=str(exc))
        return results
