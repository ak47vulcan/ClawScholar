"""Writer Agent background task — phases: MAPPING_SOURCES → WRITING → ASSEMBLING → DONE."""

from __future__ import annotations

import asyncio
import re
import uuid
from typing import Any

from sqlalchemy import select, update

from app.api.websocket import broadcast_to_user
from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.llm.client import get_llm
from app.models.document import Document
from app.models.writing_run import WritingRun
from app.models.writing_section import WritingSection

logger = get_logger(__name__)

_CHAPTER_COLORS = [
    "#6366f1", "#8b5cf6", "#06b6d4", "#22c55e",
    "#f59e0b", "#ec4899", "#0ea5e9", "#a78bfa",
]


async def run_writing_job(run_id: str, user_id: str) -> None:
    """Entry point called as a FastAPI BackgroundTask after /allocate."""
    async with AsyncSessionLocal() as db:
        await _execute(run_id=run_id, user_id=user_id, db=db)


async def _emit(user_id: str, event: dict[str, Any], *, _retries: int = 2) -> None:
    for attempt in range(_retries + 1):
        try:
            await broadcast_to_user(user_id, event)
            return
        except Exception as exc:
            if attempt == _retries:
                logger.warning(
                    "WS broadcast failed after retries",
                    error=str(exc),
                    event_type=event.get("type"),
                )
                return
            await asyncio.sleep(0.5 * (2 ** attempt))


async def _execute(*, run_id: str, user_id: str, db: Any) -> None:
    log = logger.bind(run_id=run_id, user_id=user_id)
    log.info("Writing job started")

    try:
        # Load run
        result = await db.execute(select(WritingRun).where(WritingRun.id == run_id))  # type: ignore[arg-type]
        run: WritingRun | None = result.scalar_one_or_none()
        if run is None:
            log.error("WritingRun not found")
            return

        sections_result = await db.execute(
            select(WritingSection).where(WritingSection.run_id == run_id).order_by(WritingSection.chapter_index)
        )
        sections: list[WritingSection] = list(sections_result.scalars().all())
        if not sections:
            log.warning("No sections to write")
            await _set_run_status(db, run_id, "FAILED")
            return

        phase_data: dict[str, Any] = run.phase_data or {}
        doc_type: str = run.doc_type
        citation_style = _citation_style(phase_data)
        style_notes = f"{_style_for_doc_type(doc_type)} Citation style: {citation_style}."
        outline = phase_data.get("outline", {})
        outline_title = outline.get("document_title", run.title)

        await _set_run_status(db, run_id, "MAPPING_SOURCES")
        await _emit(user_id, {
            "type": "WRITER_PROGRESS",
            "run_id": run_id,
            "phase": "MAPPING_SOURCES",
            "progress": 5,
        })
        source_plan = await _build_source_plan(
            sections,
            user_id,
            phase_data,
            project_id=str(run.project_id) if run.project_id else None,
        )
        phase_data["source_plan"] = source_plan
        await _update_run_phase_data(db, run_id, phase_data)
        await _emit(user_id, {
            "type": "WRITER_SOURCE_PLAN",
            "run_id": run_id,
            "source_plan": source_plan,
        })

        await _set_run_status(db, run_id, "WRITING")
        await _emit(user_id, {"type": "WRITER_PROGRESS", "run_id": run_id, "phase": "WRITING", "progress": 18})

        # Write sections sequentially so each chapter can build on the finished
        # chapters before it. This also makes progress easier to follow in the UI.
        total = len(sections)
        done_count = 0
        used_sources: list[dict[str, Any]] = []

        for idx, section in enumerate(sections):
            section_log = log.bind(chapter_index=section.chapter_index, title=section.title)
            section_log.info("Writing section")

            await _set_section_status(db, str(section.id), "WRITING")
            section.status = "WRITING"
            await _emit(user_id, {
                "type": "WRITER_SECTION_PROGRESS",
                "run_id": run_id,
                "section_id": str(section.id),
                "chapter_index": section.chapter_index,
                "status": "WRITING",
            })

            retrieved_chunks = _format_source_plan_for_section(source_plan, section.chapter_index)
            preceding_summary = _get_preceding_context(sections, idx)

            llm = await get_llm()
            chapter_dict = {
                "title": section.title,
                "description": _get_chapter_description(phase_data, section.chapter_index),
                "key_points": _get_chapter_key_points(phase_data, section.chapter_index),
                "target_pages": float(section.target_pages or 1.0),
            }
            try:
                result_data = await llm.run_writer_section(
                    chapter=chapter_dict,
                    retrieved_chunks=retrieved_chunks,
                    doc_type=doc_type,
                    style=style_notes,
                    preceding_summary=preceding_summary,
                    citation_style=citation_style,
                )
                content_md = _clean_writer_markers(result_data.get("content_md", ""))
                sources = _sources_used_for_section(source_plan, section.chapter_index, content_md)
                await _save_section_content(db, str(section.id), content_md, sources)
                section.status = "DONE"
                section.content_md = content_md
                section.sources_used = sources
                used_sources.extend(sources)
                done_count += 1
                progress = 18 + int((done_count / total) * 62)
                section_log.info("Section written", words=result_data.get("word_count", 0), sources=len(sources))
                await _emit(user_id, {
                    "type": "WRITER_SECTION_DONE",
                    "run_id": run_id,
                    "section_id": str(section.id),
                    "chapter_index": section.chapter_index,
                    "content_md": content_md,
                    "progress": progress,
                })
                await _emit(user_id, {
                    "type": "WRITER_PROGRESS",
                    "run_id": run_id,
                    "phase": "WRITING",
                    "progress": progress,
                })
            except Exception as exc:
                section_log.error("Section write failed", error=str(exc))
                await _set_section_status(db, str(section.id), "FAILED")
                section.status = "FAILED"
                done_count += 1

        # Assembly phase
        await _set_run_status(db, run_id, "ASSEMBLING")
        await _emit(user_id, {"type": "WRITER_PROGRESS", "run_id": run_id, "phase": "ASSEMBLING", "progress": 85})

        sections_md = "\n\n".join(
            f"## {s.title}\n\n{s.content_md or '[Section write failed]'}"
            for s in sorted(sections, key=lambda x: x.chapter_index)
        )

        llm = await get_llm()
        try:
            assembly = await llm.run_writer_assemble(
                doc_type=doc_type,
                sections_md=sections_md,
                outline=outline_title,
                style=style_notes,
            )
        except Exception as exc:
            log.warning(
                "Assembly LLM call failed, falling back to raw sections",
                error=str(exc),
            )
            word_count = len(sections_md.split())
            assembly = {
                "full_document_md": sections_md,
                "word_count": word_count,
                "page_estimate": round(word_count / 500, 1),
            }

        assembled_md = _ensure_title_and_final_abstract(
            _clean_writer_markers(assembly.get("full_document_md", sections_md)),
            title=outline_title,
            doc_type=doc_type,
            sections_md=sections_md,
        )
        full_md = _ensure_references(
            assembled_md,
            used_sources or _all_sources_from_plan(source_plan),
            citation_style,
        )
        word_count = assembly.get("word_count", len(full_md.split()))
        page_estimate = assembly.get("page_estimate", word_count / 500)

        # Persist assembled document into phase_data
        phase_data["full_markdown"] = full_md
        phase_data["word_count"] = word_count
        phase_data["page_estimate"] = page_estimate

        await db.execute(
            update(WritingRun)
            .where(WritingRun.id == run_id)  # type: ignore[arg-type]
            .values(status="DONE", phase_data=phase_data)
        )
        await db.commit()

        log.info("Writing job completed", word_count=word_count, page_estimate=page_estimate)
        await _emit(user_id, {
            "type": "WRITER_PROGRESS",
            "run_id": run_id,
            "phase": "DONE",
            "progress": 100,
            "word_count": word_count,
            "page_estimate": page_estimate,
        })

    except Exception as exc:
        log.error("Writing job failed", error=str(exc))
        await _set_run_status(db, run_id, "FAILED")
        await _emit(user_id, {"type": "WRITER_PROGRESS", "run_id": run_id, "phase": "FAILED", "progress": 0})


async def _set_run_status(db: Any, run_id: str, status: str) -> None:
    await db.execute(
        update(WritingRun).where(WritingRun.id == run_id).values(status=status)  # type: ignore[arg-type]
    )
    await db.commit()


async def _update_run_phase_data(db: Any, run_id: str, phase_data: dict[str, Any]) -> None:
    await db.execute(
        update(WritingRun).where(WritingRun.id == run_id).values(phase_data=phase_data)  # type: ignore[arg-type]
    )
    await db.commit()


async def _set_section_status(db: Any, section_id: str, status: str) -> None:
    await db.execute(
        update(WritingSection).where(WritingSection.id == section_id).values(status=status)  # type: ignore[arg-type]
    )
    await db.commit()


async def _save_section_content(db: Any, section_id: str, content_md: str, sources: list[dict[str, Any]]) -> None:
    await db.execute(
        update(WritingSection)
        .where(WritingSection.id == section_id)  # type: ignore[arg-type]
        .values(status="DONE", content_md=content_md, sources_used=sources)
    )
    await db.commit()


async def _build_source_plan(
    sections: list[WritingSection],
    user_id: str,
    phase_data: dict[str, Any],
    project_id: str | None = None,
) -> list[dict[str, Any]]:
    """Map each section to concrete PDF sources before any prose is generated."""
    try:
        from app.agents.librarian.rag.retriever import retrieve_and_rerank

        plan = []
        global_sources: dict[str, dict[str, Any]] = {}
        next_source_number = 1

        for section in sections:
            description = _get_chapter_description(phase_data, section.chapter_index)
            key_points = " ".join(_get_chapter_key_points(phase_data, section.chapter_index))
            query = f"{section.title} {description} {key_points}".strip()
            async with AsyncSessionLocal() as rag_db:
                chunks = await retrieve_and_rerank(
                    query,
                    rag_db,
                    top_k=18,
                    rerank_top_k=10,
                    user_id=user_id,
                    project_id=project_id,
                )
            grouped: dict[str, dict[str, Any]] = {}
            for chunk in chunks:
                fingerprint = _source_fingerprint(
                    doc_id=chunk.doc_id,
                    filename=chunk.source_filename,
                    source_url=chunk.source_url,
                    doi=chunk.doi,
                )
                if fingerprint not in global_sources:
                    global_sources[fingerprint] = {
                        "key": f"S{next_source_number}",
                        "doc_id": chunk.doc_id,
                        "filename": chunk.source_filename or "Unknown source",
                        "source_url": chunk.source_url,
                        "authors": chunk.authors or [],
                        "year": chunk.year,
                        "doi": chunk.doi,
                        "best_score": 0.0,
                        "matched_chapters": [],
                    }
                    next_source_number += 1

                global_source = global_sources[fingerprint]
                score = round(float(chunk.score), 4)
                global_source["best_score"] = max(float(global_source.get("best_score") or 0.0), score)
                if not any(m.get("chapter_index") == section.chapter_index for m in global_source["matched_chapters"]):
                    global_source["matched_chapters"].append({
                        "chapter_index": section.chapter_index,
                        "title": section.title,
                        "score": score,
                    })

                if fingerprint not in grouped:
                    grouped[fingerprint] = {
                        **global_source,
                        "fingerprint": fingerprint,
                        "score": score,
                        "excerpts": [],
                    }
                else:
                    grouped[fingerprint]["score"] = max(float(grouped[fingerprint].get("score") or 0.0), score)
                    grouped[fingerprint]["best_score"] = global_source["best_score"]

                if len(grouped[fingerprint]["excerpts"]) < 2:
                    grouped[fingerprint]["excerpts"].append(chunk.content[:900])
                if len(grouped) >= 6:
                    break

            sources = sorted(grouped.values(), key=lambda s: float(s.get("score") or 0.0), reverse=True)[:6]
            plan.append({
                "chapter_index": section.chapter_index,
                "title": section.title,
                "query": query,
                "sources": [_public_source(s) for s in sources],
            })

        inventory = [_public_source(s) for s in sorted(
            global_sources.values(),
            key=lambda s: float(s.get("best_score") or 0.0),
            reverse=True,
        )[:14]]
        summaries = await _load_source_summaries(global_sources.values(), user_id)
        for source in global_sources.values():
            summary = summaries.get(str(source.get("doc_id")))
            if summary:
                source["summary"] = summary
        inventory = [
            {**source, "summary": summaries.get(str(source.get("doc_id")))}
            if summaries.get(str(source.get("doc_id"))) else source
            for source in inventory
        ]
        for item in plan:
            item["sources"] = [
                {**source, "summary": summaries.get(str(source.get("doc_id")))}
                if summaries.get(str(source.get("doc_id"))) else source
                for source in item["sources"]
            ]
            item["source_inventory"] = inventory
        return plan
    except Exception as exc:
        logger.warning("Source mapping failed", error=str(exc))
        return []


def _format_source_plan_for_section(source_plan: list[dict[str, Any]], chapter_index: int) -> str:
    item = next((p for p in source_plan if p.get("chapter_index") == chapter_index), None)
    if not item or not item.get("sources"):
        return "No assigned sources found for this chapter. Omit unsupported claims and continue with cautious synthesis."
    parts = []
    for source in _dedupe_sources(item["sources"]):
        authors = ", ".join(source.get("authors") or []) or "Unknown author"
        year = source.get("year") or "n.d."
        score = source.get("score") or source.get("best_score") or 0
        header = f"[{source['key']}] relevance {float(score):.3f} — {authors} ({year}). {source.get('filename', 'Unknown source')}"
        excerpts = "\n".join(f"- {excerpt}" for excerpt in source.get("excerpts", []))
        parts.append(f"{header}\n{excerpts}")

    inventory = _format_source_inventory(item.get("source_inventory") or [], chapter_index)
    return "\n\n".join(parts + ([inventory] if inventory else []))


def _sources_for_section(source_plan: list[dict[str, Any]], chapter_index: int) -> list[dict[str, Any]]:
    item = next((p for p in source_plan if p.get("chapter_index") == chapter_index), None)
    return _dedupe_sources(list((item or {}).get("sources") or []))


def _sources_used_for_section(
    source_plan: list[dict[str, Any]],
    chapter_index: int,
    content_md: str,
) -> list[dict[str, Any]]:
    item = next((p for p in source_plan if p.get("chapter_index") == chapter_index), None) or {}
    assigned = _sources_for_section(source_plan, chapter_index)
    available = _dedupe_sources(assigned + list(item.get("source_inventory") or []))
    cited_keys = set(re.findall(r"\[(S\d+)\]", content_md))
    if not cited_keys:
        return assigned
    return [source for source in available if source.get("key") in cited_keys] or assigned


def _all_sources_from_plan(source_plan: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    for item in source_plan:
        sources.extend(item.get("sources") or [])
    return _dedupe_sources(sources)


def _dedupe_sources(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for source in sources:
        fingerprint = str(source.get("fingerprint") or source.get("doc_id") or source.get("key") or "")
        if not fingerprint:
            fingerprint = _normalize_key(str(source.get("filename") or ""))
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        out.append(source)
    return out


def _source_fingerprint(*, doc_id: str, filename: str | None, source_url: str | None, doi: str | None) -> str:
    if doi:
        return f"doi:{_normalize_key(doi)}"
    if source_url:
        return f"url:{_normalize_key(source_url)}"
    if filename:
        return f"title:{_normalize_key(filename)}"
    return f"doc:{doc_id}"


def _normalize_key(value: str | None) -> str:
    if not value:
        return ""
    value = value.lower().strip()
    value = re.sub(r"^https?://(dx\.)?doi\.org/", "", value)
    value = re.sub(r"^doi:\s*", "", value)
    value = re.sub(r"\.pdf$", "", value)
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def _public_source(source: dict[str, Any]) -> dict[str, Any]:
    return {
        "key": source.get("key"),
        "doc_id": source.get("doc_id"),
        "filename": source.get("filename") or "Unknown source",
        "source_url": source.get("source_url"),
        "authors": source.get("authors") or [],
        "year": source.get("year"),
        "doi": source.get("doi"),
        "score": round(float(source.get("score") or source.get("best_score") or 0.0), 4),
        "best_score": round(float(source.get("best_score") or source.get("score") or 0.0), 4),
        "matched_chapters": source.get("matched_chapters") or [],
        "fingerprint": source.get("fingerprint") or _source_fingerprint(
            doc_id=str(source.get("doc_id") or ""),
            filename=source.get("filename"),
            source_url=source.get("source_url"),
            doi=source.get("doi"),
        ),
        "summary": source.get("summary"),
        "excerpts": list(source.get("excerpts") or []),
    }


async def _load_source_summaries(sources: Any, user_id: str) -> dict[str, str]:
    doc_ids = []
    for source in sources:
        doc_id = str(source.get("doc_id") or "")
        if doc_id:
            try:
                doc_ids.append(uuid.UUID(doc_id))
            except ValueError:
                continue
    if not doc_ids:
        return {}

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Document.id, Document.summary)
            .where(Document.user_id == uuid.UUID(user_id), Document.id.in_(list(dict.fromkeys(doc_ids))))
        )
        return {str(row.id): row.summary for row in result.all() if row.summary}


def _format_source_inventory(sources: list[dict[str, Any]], current_chapter_index: int) -> str:
    unique = _dedupe_sources(sources)[:12]
    if not unique:
        return ""
    lines = [
        "Document-level source inventory for continuity and weighting. "
        "Prefer the assigned chapter sources above; use this inventory to understand which PDFs support other outline areas. "
        "Do not use inventory-only entries as evidence unless their excerpt is included in the assigned chapter sources."
    ]
    for source in unique:
        matches = []
        for match in source.get("matched_chapters") or []:
            label = f"chapter {int(match.get('chapter_index', 0)) + 1}"
            if match.get("chapter_index") == current_chapter_index:
                label += " (current)"
            matches.append(f"{label}: {float(match.get('score') or 0):.3f}")
        lines.append(
            f"- [{source.get('key')}] {source.get('filename', 'Unknown source')} "
            f"best relevance {float(source.get('best_score') or source.get('score') or 0):.3f}; "
            f"matched {', '.join(matches) or 'document-level context'}"
        )
    return "\n".join(lines)


def _ensure_references(markdown: str, used_sources: list[dict[str, Any]], citation_style: str) -> str:
    markdown = _strip_existing_references(markdown.replace("## Bibliography", "## References"))
    sources: dict[str, dict[str, Any]] = {}
    for source in _dedupe_sources(used_sources):
        key = str(source.get("key") or "").strip()
        if key:
            sources[key] = source
    if not sources:
        return markdown.rstrip() + "\n\n## References\n\nNo cited library sources were assigned."
    lines = ["", "## References", ""]
    for key, source in sorted(sources.items(), key=lambda item: _source_key_number(item[0])):
        lines.append(f"- [{key}] {_format_reference(source, citation_style)}")
    return markdown.rstrip() + "\n".join(lines)


def _strip_existing_references(markdown: str) -> str:
    match = re.search(r"(?im)^##\s+(references|bibliography)\s*$", markdown)
    if not match:
        return markdown
    return markdown[:match.start()].rstrip()


def _ensure_title_and_final_abstract(markdown: str, *, title: str, doc_type: str, sections_md: str) -> str:
    markdown = markdown.strip()
    if not markdown.startswith("# "):
        markdown = f"# {title}\n\n{markdown}"
    if doc_type not in {"paper", "article"}:
        return markdown
    if re.search(r"(?im)^##?\s+abstract\s*$", markdown):
        return markdown

    body = re.sub(r"(?im)^#\s+.+\n+", "", sections_md).strip()
    sentences = re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", body))
    abstract = " ".join(s for s in sentences[:5] if s).strip()
    if len(abstract) < 200:
        abstract = (
            "This document synthesizes the completed sections into a coherent academic argument. "
            "It summarizes the central concepts, evidence, and implications developed across the paper."
        )

    lines = markdown.splitlines()
    return "\n".join([lines[0], "", "## Abstract", "", abstract, "", *lines[1:]]).strip()


def _source_key_number(key: str) -> tuple[int, str]:
    match = re.search(r"\d+", key)
    return (int(match.group(0)) if match else 10_000, key)


def _format_reference(source: dict[str, Any], citation_style: str) -> str:
    authors = source.get("authors") or []
    author_text = ", ".join(authors[:6]) if authors else "Unknown author"
    year = source.get("year") or "n.d."
    title = str(source.get("filename") or "Untitled source").removesuffix(".pdf")
    doi = source.get("doi")
    url = source.get("source_url")
    suffix = f" doi:{doi}" if doi else f" {url}" if url else ""
    style = citation_style.upper()
    if style == "IEEE":
        return f"{author_text}, \"{title},\" {year}.{suffix}".strip()
    if style == "MLA":
        return f"{author_text}. \"{title}.\" {year}.{suffix}".strip()
    if style == "CHICAGO":
        return f"{author_text}. {year}. \"{title}.\"{suffix}".strip()
    if style == "HARVARD":
        return f"{author_text} {year}, {title}.{suffix}".strip()
    return f"{author_text}. ({year}). {title}.{suffix}".strip()


def _get_preceding_context(sections: list[WritingSection], current_idx: int) -> str:
    if current_idx == 0:
        return ""
    parts: list[str] = []
    for prev in sections[:current_idx]:
        if not prev.content_md:
            continue
        text = _clean_writer_markers(prev.content_md)
        words = text.split()
        excerpt = " ".join(words[-260:]) if len(words) > 260 else text
        parts.append(f"Previous chapter: {prev.title}\n{excerpt}")
    joined = "\n\n".join(parts)
    return joined[-6500:]


def _clean_writer_markers(content: str) -> str:
    content = content.replace("[SOURCES INSUFFICIENT]", "")
    content = re.sub(r"(?im)^>\s*⚠️.*source coverage.*\n?", "", content)
    content = re.sub(r"\n{3,}", "\n\n", content)
    return content.strip()


def _get_chapter_description(phase_data: dict[str, Any], chapter_index: int) -> str:
    chapters = (phase_data.get("outline") or {}).get("chapters", [])
    for ch in chapters:
        if ch.get("index") == chapter_index:
            return ch.get("description", "")
    return ""


def _get_chapter_key_points(phase_data: dict[str, Any], chapter_index: int) -> list[str]:
    chapters = (phase_data.get("outline") or {}).get("chapters", [])
    for ch in chapters:
        if ch.get("index") == chapter_index:
            return ch.get("key_points", [])
    return []


def _style_for_doc_type(doc_type: str) -> str:
    styles = {
        "paper": "Third-person academic prose, APA citations, formal language, hedged claims.",
        "article": "Accessible academic style, first or third person acceptable, clear section headings.",
        "summary": "Concise, bullet-friendly where appropriate, executive summary tone.",
        "draft": "Informal exploratory prose, first person acceptable, emphasis on ideas over polish.",
    }
    return styles.get(doc_type, "Professional academic writing.")


def _citation_style(phase_data: dict[str, Any]) -> str:
    text = str(phase_data.get("answers_text") or phase_data.get("answers") or "").lower()
    for style in ("APA", "MLA", "Chicago", "IEEE", "Harvard"):
        if style.lower() in text:
            return style
    return "APA"
