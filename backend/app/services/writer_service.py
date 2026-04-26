"""Writer Agent service — all DB operations for writing runs."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.llm.client import get_llm
from app.models.document import Document
from app.models.writing_run import WritingRun
from app.models.writing_section import WritingSection

logger = get_logger(__name__)


async def create_writing_run(
    *,
    user_id: str,
    title: str,
    doc_type: str,
    initial_request: str,
    source_doc_ids: list[str] | None,
    project_id: str | None = None,
    source_workflow_id: str | None = None,
    db: AsyncSession,
) -> dict[str, Any]:
    """Create a new WritingRun and immediately return AI clarifying questions."""
    # Fetch library titles for context
    doc_query = select(Document.filename, Document.summary).where(
        Document.user_id == uuid.UUID(user_id),
        Document.embedding_status == "INDEXED",
    )
    if source_doc_ids:
        doc_query = doc_query.where(Document.id.in_([uuid.UUID(doc_id) for doc_id in source_doc_ids]))
    elif project_id:
        doc_query = doc_query.where(Document.metadata_["project_id"].astext == str(project_id))
    doc_result = await db.execute(doc_query.limit(50))
    doc_rows = doc_result.all()
    if not doc_rows and (source_doc_ids or project_id):
        fallback = await db.execute(
            select(Document.filename, Document.summary)
            .where(Document.user_id == uuid.UUID(user_id), Document.embedding_status == "INDEXED")
            .limit(50)
        )
        doc_rows = fallback.all()
    library_titles = [row.filename for row in doc_rows]

    # Generate clarifying questions
    llm = await get_llm()
    clarify_data = await llm.run_writer_clarify(
        doc_type=doc_type,
        initial_request=initial_request,
        library_titles=library_titles,
    )
    questions = _filter_writer_questions(clarify_data.get("questions", []))

    # Create DB row
    run = WritingRun(
        user_id=uuid.UUID(user_id),
        project_id=uuid.UUID(project_id) if project_id else None,
        source_workflow_id=uuid.UUID(source_workflow_id) if source_workflow_id else None,
        title=title or initial_request[:80],
        doc_type=doc_type,
        phase_data={"initial_request": initial_request, "questions": questions},
    )
    db.add(run)
    await db.flush()
    await db.refresh(run)

    logger.info("WritingRun created", run_id=str(run.id), doc_type=doc_type)
    return {
        "run_id": str(run.id),
        "status": run.status,
        "questions": questions,
    }


async def submit_clarify_answers(
    *,
    run_id: str,
    user_id: str,
    answers: dict[str, Any],
    db: AsyncSession,
) -> dict[str, Any]:
    """Persist answers, generate outline via LLM, return it."""
    run = await _get_run(run_id, user_id, db)
    run.status = "OUTLINING"
    await db.flush()
    await _emit_writer_activity(
        user_id,
        run_id,
        phase="OUTLINING",
        progress=8,
        step="Answers received",
        detail="Preparing your clarifying answers for the outline agent.",
        run=run,
        db=db,
        items=[
            {"label": "Document type", "value": run.doc_type},
            {"label": "Answered prompts", "value": str(len(answers))},
        ],
    )

    # Build library context (titles + summaries)
    doc_query = select(Document.id, Document.filename, Document.summary).where(
        Document.user_id == uuid.UUID(user_id),
        Document.embedding_status == "INDEXED",
    )
    if run.project_id:
        doc_query = doc_query.where(Document.metadata_["project_id"].astext == str(run.project_id))
    doc_result = await db.execute(doc_query.limit(30))
    docs = doc_result.all()
    await _emit_writer_activity(
        user_id,
        run_id,
        phase="OUTLINING",
        progress=18,
        step="Reading library context",
        detail="Collecting indexed PDF titles and summaries that can ground the outline.",
        run=run,
        db=db,
        items=[
            {"label": "Indexed PDFs considered", "value": str(len(docs))},
            *[
                {"label": "Library source", "value": str(d.filename)[:90]}
                for d in docs[:4]
            ],
        ],
    )
    library_context_parts = []
    for d in docs:
        summary_text = d.summary or "No summary available."
        library_context_parts.append(f"- {d.filename}: {summary_text[:200]}")
    library_context = "\n".join(library_context_parts) if library_context_parts else "No indexed documents found."

    # Format answers for prompt
    questions = _filter_writer_questions(run.phase_data.get("questions", []))
    answers_text_parts = []
    for q in questions:
        ans = answers.get(q.get("id", ""), "")
        answers_text_parts.append(f"Q: {q.get('question', '')}\nA: {ans}")
    clarify_answers_text = "\n\n".join(answers_text_parts)
    await _emit_writer_activity(
        user_id,
        run_id,
        phase="OUTLINING",
        progress=30,
        step="Synthesizing outline constraints",
        detail="Combining your answers, document type, library context, and requested style into one planning prompt.",
        run=run,
        db=db,
        items=[
            *[
                {"label": str(q.get("question", "Question"))[:70], "value": str(answers.get(q.get("id", ""), ""))[:110]}
                for q in questions[:4]
                if str(answers.get(q.get("id", ""), "")).strip()
            ],
        ],
    )

    llm = await get_llm()
    await _emit_writer_activity(
        user_id,
        run_id,
        phase="OUTLINING",
        progress=38,
        step="Outline agent drafting",
        detail="The Writer Agent is forming chapter order, argument flow, key points, and default page targets.",
        run=run,
        db=db,
        items=[
            {"label": "Inputs", "value": "answers + indexed source summaries"},
            {"label": "Output", "value": "document title, abstract, chapters, key points"},
        ],
    )
    outline_data = await llm.run_writer_outline(
        doc_type=run.doc_type,
        clarify_answers=clarify_answers_text,
        library_context=library_context,
    )

    # Get target pages from outline
    target_pages = int(outline_data.get("total_suggested_pages", 10))

    phase_data = dict(run.phase_data)
    phase_data["answers"] = answers
    phase_data["answers_text"] = clarify_answers_text
    phase_data["outline"] = outline_data

    run.status = "ALLOCATING"
    run.target_pages = target_pages
    run.phase_data = phase_data
    await db.flush()

    logger.info("Outline generated", run_id=run_id, chapters=len(outline_data.get("chapters", [])))
    await _emit_writer_activity(
        user_id,
        run_id,
        phase="OUTLINING",
        progress=50,
        step="Outline completed",
        detail="The outline is ready; the coverage agent will now check whether each chapter has enough literature.",
        run=run,
        db=db,
        items=[
            {"label": "Title", "value": str(outline_data.get("document_title") or run.title)[:100]},
            {"label": "Chapters", "value": str(len(outline_data.get("chapters", [])))},
            *[
                {"label": f"Chapter {int(ch.get('index', i)) + 1}", "value": str(ch.get("title", ""))[:90]}
                for i, ch in enumerate((outline_data.get("chapters") or [])[:5])
            ],
        ],
    )
    run.status = "VALIDATING"
    await db.flush()
    await _emit_writer_activity(
        user_id,
        run_id,
        phase="VALIDATING",
        progress=58,
        step="Coverage agent retrieving evidence",
        detail="Each outline chapter is queried against your indexed PDF library before writing starts.",
        run=run,
        db=db,
        items=[
            {"label": "Chapters checked", "value": str(len(outline_data.get("chapters", [])))},
            {"label": "Retrieval target", "value": "chapter descriptions + key points"},
        ],
    )

    # Run an AI-assisted coverage check against the user's indexed PDF library.
    coverage = await _check_coverage(
        outline_data.get("chapters", []),
        db,
        outline=outline_data,
        doc_type=run.doc_type,
        user_id=user_id,
        project_id=str(run.project_id) if run.project_id else None,
    )
    phase_data["coverage"] = coverage
    run.phase_data = phase_data
    run.status = "ALLOCATING"
    await db.flush()
    await _emit_writer_activity(
        user_id,
        run_id,
        phase="VALIDATING",
        progress=82,
        step="Coverage check complete",
        detail="The Writer now knows which chapters are well-supported and where additional literature may be needed.",
        run=run,
        db=db,
        items=[
            {"label": "Coverage", "value": f"{float(coverage.get('overall_score') or 0.0):.0%}"},
            {"label": "Status", "value": str(coverage.get("status") or "UNKNOWN")},
            *[
                {"label": "Missing topic", "value": str(topic)[:90]}
                for topic in (coverage.get("missing_topics") or [])[:4]
            ],
        ],
    )

    return {
        "run_id": run_id,
        "status": "ALLOCATING",
        "outline": outline_data,
        "coverage": coverage,
        "target_pages": target_pages,
    }


async def _emit_writer_activity(
    user_id: str,
    run_id: str,
    *,
    phase: str,
    progress: int,
    step: str,
    detail: str,
    items: list[dict[str, str]],
    run: WritingRun | None = None,
    db: AsyncSession | None = None,
) -> None:
    from app.api.websocket import broadcast_to_user

    activity = {
        "step": step,
        "detail": detail,
        "items": [item for item in items if item.get("value")],
    }
    if run is not None:
        phase_data = dict(run.phase_data or {})
        phase_data["activity"] = activity
        phase_data["progress"] = progress
        run.phase_data = phase_data
        if db is not None:
            await db.flush()

    await broadcast_to_user(user_id, {
        "type": "WRITER_PROGRESS",
        "run_id": run_id,
        "phase": phase,
        "progress": progress,
        "activity": activity,
    })


def _filter_writer_questions(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Remove legacy planning questions that are now handled automatically."""
    filtered: list[dict[str, Any]] = []
    for question in questions:
        text = str(question.get("question") or "").lower()
        if "citation style" in text:
            continue
        if "abstract" in text and ("include" in text or "needed" in text or "want" in text):
            continue
        filtered.append(question)
    return filtered


async def accept_outline_and_allocate(
    *,
    run_id: str,
    user_id: str,
    chapters: list[dict[str, Any]],
    chapter_allocations: list[dict[str, Any]],
    db: AsyncSession,
) -> dict[str, Any]:
    """Persist final outline + page allocations, create WritingSection rows, trigger writing."""
    from fastapi import HTTPException

    run = await _get_run(run_id, user_id, db)
    coverage = (run.phase_data or {}).get("coverage") or {}
    source_search = (run.phase_data or {}).get("source_search") or {}
    source_search_completed = source_search.get("status") == "DONE"
    if not source_search_completed and (coverage.get("needs_sources") or float(coverage.get("overall_score") or 0.0) < 0.7):
        raise HTTPException(
            status_code=409,
            detail="Source coverage is insufficient. Start a source search before writing.",
        )

    # Build allocation lookup
    alloc_map: dict[int, float] = {
        a["chapter_index"]: float(a.get("target_pages", 1.0))
        for a in chapter_allocations
    }

    # Update outline in phase_data with user-edited chapters
    phase_data = dict(run.phase_data or {})
    existing_outline = phase_data.get("outline", {})
    existing_outline["chapters"] = chapters
    phase_data["outline"] = existing_outline
    phase_data["allocations"] = chapter_allocations
    run.phase_data = phase_data
    run.status = "WRITING"
    await db.flush()

    # Create WritingSection rows
    for ch in chapters:
        idx = ch["index"]
        pages = alloc_map.get(idx, float(ch.get("target_pages", 1.0)))
        section = WritingSection(
            run_id=run.id,
            chapter_index=idx,
            title=ch["title"],
            target_pages=pages,
        )
        db.add(section)
    await db.flush()

    return {"run_id": run_id, "status": "WRITING"}


async def auto_create_and_run_writing(
    *,
    user_id: str,
    writing_intent: dict[str, Any],
    project_context: str,
    project_id: str | None = None,
    source_workflow_id: str | None = None,
    db: AsyncSession,
) -> dict[str, Any]:
    """Create and fully configure a WritingRun without user input.

    Chains: create_writing_run → run_writer_auto_clarify (LLM) →
    submit_clarify_answers → accept_outline_and_allocate.
    Returns run_id ready for run_writing_job to be called.
    """
    from app.llm.client import get_llm

    doc_type = writing_intent.get("doc_type", "summary")
    title = writing_intent.get("title_hint", "Auto-generated document")

    created = await create_writing_run(
        user_id=user_id,
        title=title,
        doc_type=doc_type,
        initial_request=project_context[:800],
        source_doc_ids=None,
        project_id=project_id,
        source_workflow_id=source_workflow_id,
        db=db,
    )
    run_id = created["run_id"]
    questions: list[dict[str, Any]] = created.get("questions") or []

    llm = await get_llm()
    auto_answers_data = await llm.run_writer_auto_clarify(
        questions=questions,
        project_context=project_context,
        doc_type=doc_type,
    )
    answers = auto_answers_data.get("answers", {})

    outline_data = await submit_clarify_answers(
        run_id=run_id,
        user_id=user_id,
        answers=answers,
        db=db,
    )
    chapters: list[dict[str, Any]] = (outline_data.get("outline") or {}).get("chapters", [])
    allocations = [
        {"chapter_index": ch.get("index", i), "target_pages": float(ch.get("target_pages", 1.0))}
        for i, ch in enumerate(chapters)
    ]

    await accept_outline_and_allocate(
        run_id=run_id,
        user_id=user_id,
        chapters=chapters,
        chapter_allocations=allocations,
        db=db,
    )
    return {"run_id": run_id, "user_id": user_id}


async def get_run_detail(*, run_id: str, user_id: str, db: AsyncSession) -> dict[str, Any]:
    run = await _get_run(run_id, user_id, db)
    sections_result = await db.execute(
        select(WritingSection).where(WritingSection.run_id == run.id).order_by(WritingSection.chapter_index)
    )
    sections = [_section_to_dict(s) for s in sections_result.scalars().all()]
    return _run_to_dict(run, sections)


async def list_runs(*, user_id: str, db: AsyncSession) -> list[dict[str, Any]]:
    result = await db.execute(
        select(WritingRun).where(WritingRun.user_id == uuid.UUID(user_id)).order_by(WritingRun.created_at.desc())
    )
    return [_run_to_dict(r, []) for r in result.scalars().all()]


async def get_run_preview(*, run_id: str, user_id: str, db: AsyncSession) -> dict[str, Any]:
    run = await _get_run(run_id, user_id, db)
    full_md = (run.phase_data or {}).get("full_markdown", "")
    if not full_md:
        # Assemble from sections
        sections_result = await db.execute(
            select(WritingSection).where(WritingSection.run_id == run.id).order_by(WritingSection.chapter_index)
        )
        sections = list(sections_result.scalars().all())
        parts = [f"## {s.title}\n\n{s.content_md or ''}" for s in sections if s.content_md]
        full_md = "\n\n".join(parts)
    word_count = len(full_md.split()) if full_md else 0
    return {"full_markdown": full_md, "word_count": word_count}


async def delete_run(*, run_id: str, user_id: str, db: AsyncSession) -> None:
    run = await _get_run(run_id, user_id, db)
    await db.delete(run)
    await db.flush()


# ─── helpers ───────────────────────────────────────────────────────────────────

async def _get_run(run_id: str, user_id: str, db: AsyncSession) -> WritingRun:
    from fastapi import HTTPException
    result = await db.execute(
        select(WritingRun).where(WritingRun.id == run_id, WritingRun.user_id == uuid.UUID(user_id))
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Writing run not found")
    return run


async def _check_coverage(
    chapters: list[dict[str, Any]],
    db: AsyncSession,
    *,
    outline: dict[str, Any] | None = None,
    doc_type: str = "summary",
    user_id: str,
    project_id: str | None = None,
) -> dict[str, Any]:
    """AI-assisted coverage check using indexed PDFs as retrieved evidence."""
    from app.services.writer_coverage_service import check_outline_coverage

    return await check_outline_coverage(
        chapters=chapters,
        outline=outline or {"chapters": chapters},
        doc_type=doc_type,
        user_id=user_id,
        project_id=project_id,
        db=db,
    )


def _run_to_dict(run: WritingRun, sections: list[dict]) -> dict[str, Any]:
    pd = run.phase_data or {}
    return {
        "id": str(run.id),
        "title": run.title,
        "doc_type": run.doc_type,
        "project_id": str(run.project_id) if run.project_id else None,
        "source_workflow_id": str(run.source_workflow_id) if run.source_workflow_id else None,
        "target_pages": run.target_pages,
        "status": run.status,
        "created_at": run.created_at.isoformat(),
        "updated_at": run.updated_at.isoformat(),
        "questions": pd.get("questions"),
        "outline": pd.get("outline"),
        "coverage": pd.get("coverage"),
        "source_plan": pd.get("source_plan"),
        "source_search": pd.get("source_search"),
        "allocations": pd.get("allocations"),
        "full_markdown": pd.get("full_markdown"),
        "word_count": pd.get("word_count"),
        "page_estimate": pd.get("page_estimate"),
        "progress": pd.get("progress"),
        "activity": pd.get("activity"),
        "sections": sections,
    }




def _section_to_dict(s: WritingSection) -> dict[str, Any]:
    return {
        "id": str(s.id),
        "chapter_index": s.chapter_index,
        "title": s.title,
        "target_pages": float(s.target_pages or 1.0),
        "status": s.status,
        "content_md": s.content_md,
        "sources_used": s.sources_used or [],
    }
