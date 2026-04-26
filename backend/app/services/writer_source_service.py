"""Project-visible source acquisition for Writer coverage gaps."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.writing_run import WritingRun

logger = get_logger(__name__)


async def start_writer_source_search(
    *,
    run_id: str,
    user_id: str,
    db: AsyncSession,
) -> dict[str, Any]:
    """Create a project-visible workflow that searches missing Writer sources."""
    from app.models.goal import ResearchGoal
    from app.models.workflow import WorkflowRun
    from app.services.writer_service import _get_run

    run = await _get_run(run_id, user_id, db)
    phase_data = dict(run.phase_data or {})
    existing_search = phase_data.get("source_search") or {}
    if existing_search.get("status") == "RUNNING" and existing_search.get("workflow_run_id"):
        return {"run_id": run_id, "status": run.status, "source_search": existing_search, "already_running": True}

    coverage = phase_data.get("coverage") or {}
    outline = phase_data.get("outline") or {}
    chapters = outline.get("chapters") or []
    weak_titles = [
        ch.get("title", "")
        for ch in chapters
        for cov in coverage.get("chapters", [])
        if cov.get("chapter_index") == ch.get("index") and float(cov.get("coverage_score", 1.0)) < 0.7
    ]

    if not run.project_id:
        phase_data["source_search"] = {
            "status": "READY",
            "message": "Searching can run here, but this writer run is not linked to a project.",
        }
        run.phase_data = phase_data
        await db.flush()
        return {"run_id": run_id, "status": run.status, "source_search": phase_data["source_search"]}

    goal_title = f"Refinement workflow: missing literature for {run.title}"[:500]
    goal_description = _build_source_search_description(run, coverage, weak_titles)
    goal = ResearchGoal(
        user_id=uuid.UUID(user_id),
        project_id=run.project_id,
        title=goal_title,
        description=goal_description,
    )
    db.add(goal)
    await db.flush()
    await db.refresh(goal)

    workflow = WorkflowRun(goal_id=goal.id)
    db.add(workflow)
    await db.flush()
    await db.refresh(workflow)

    run.source_workflow_id = workflow.id
    phase_data["source_search"] = {
        "status": "RUNNING",
        "workflow_run_id": str(workflow.id),
        "goal_id": str(goal.id),
        "project_id": str(run.project_id),
        "goal_title": goal_title,
        "missing_topics": coverage.get("missing_topics", []),
        "suggested_queries": coverage.get("suggested_queries", []),
    }
    run.phase_data = phase_data
    await db.flush()

    return {
        "run_id": run_id,
        "status": run.status,
        "source_search": phase_data["source_search"],
    }


async def run_writer_source_search(run_id: str, user_id: str, workflow_run_id: str | None = None) -> None:
    """Background task: search for missing sources after the user starts it."""
    from app.agents.orchestrator import run_literature_search_standalone
    from app.api.websocket import broadcast_to_user
    from app.core.database import AsyncSessionLocal
    from app.services.writer_coverage_service import wait_for_documents_indexed
    from app.services.writer_service import _check_coverage

    ws_run_id = workflow_run_id or f"writer-{run_id}"
    log = logger.bind(run_id=run_id, ws_run_id=ws_run_id)
    log.info("Writer source search started")

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(WritingRun).where(
                    WritingRun.id == run_id,
                    WritingRun.user_id == uuid.UUID(user_id),
                )
            )
            run = result.scalar_one_or_none()
            if run is None:
                log.warning("WritingRun not found; aborting source search")
                return

            phase_data = run.phase_data or {}
            initial_request = phase_data.get("initial_request", run.title)
            answers_text = phase_data.get("answers_text", "")
            outline = phase_data.get("outline", {})
            chapters = outline.get("chapters", [])
            project_id = str(run.project_id) if run.project_id else None
            coverage = phase_data.get("coverage") or {}
            source_search = phase_data.get("source_search") or {}
            goal_id = source_search.get("goal_id")
            goal_title = source_search.get("goal_title") or f"Refinement workflow: missing literature for {run.title}"
            weak_titles = [
                ch.get("title", "")
                for ch in chapters
                for cov in coverage.get("chapters", [])
                if cov.get("chapter_index") == ch.get("index") and float(cov.get("coverage_score", 1.0)) < 0.7
            ]
            goal_description = _build_source_search_description(run, coverage, weak_titles)
            if answers_text:
                goal_description += f"\n\nUser writing requirements:\n{answers_text[:700]}"
            if initial_request and initial_request != run.title:
                goal_description += f"\n\nOriginal writer request:\n{initial_request[:500]}"

        await _mark_source_workflow_running(ws_run_id)
        saved_documents = await run_literature_search_standalone(
            user_id=user_id,
            goal_title=goal_title,
            goal_description=goal_description,
            ws_run_id=ws_run_id,
            project_id=project_id,
            goal_id=goal_id,
        )
        await wait_for_documents_indexed([d["document_id"] for d in saved_documents if d.get("document_id")])

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(WritingRun).where(WritingRun.id == run_id))
            run = result.scalar_one_or_none()
            if run is None:
                return

            phase_data = dict(run.phase_data or {})
            outline = phase_data.get("outline", {})
            new_coverage = await _check_coverage(
                outline.get("chapters", []),
                db,
                outline=outline,
                doc_type=run.doc_type,
                user_id=user_id,
            )
            source_search = dict(phase_data.get("source_search") or {})
            source_search["status"] = "DONE"
            source_search["saved_count"] = len(saved_documents)
            source_search["workflow_run_id"] = ws_run_id
            phase_data["coverage"] = new_coverage
            phase_data["source_search"] = source_search
            run.phase_data = phase_data
            await db.commit()

        await _mark_source_workflow_complete(ws_run_id, "COMPLETED")
        await broadcast_to_user(user_id, {
            "type": "WORKFLOW_PROGRESS",
            "runId": ws_run_id,
            "run_id": ws_run_id,
            "status": "COMPLETED",
            "progress": 100,
        })
        await broadcast_to_user(user_id, {
            "type": "WRITER_COVERAGE_UPDATE",
            "run_id": run_id,
            "coverage": new_coverage,
            "source_search": source_search,
        })
        log.info("Writer source search complete", overall_coverage=new_coverage.get("overall_score"))

    except Exception as exc:
        log.error("Writer source search failed", error=str(exc))
        await _mark_source_workflow_complete(ws_run_id, "FAILED")
        try:
            from app.api.websocket import broadcast_to_user as _bc

            await _bc(user_id, {
                "type": "WORKFLOW_PROGRESS",
                "runId": ws_run_id,
                "run_id": ws_run_id,
                "status": "FAILED",
                "progress": 100,
            })
            await _bc(user_id, {
                "type": "WRITER_COVERAGE_UPDATE",
                "run_id": run_id,
                "error": str(exc),
            })
        except Exception:
            pass


def _build_source_search_description(run: WritingRun, coverage: dict[str, Any], weak_titles: list[str]) -> str:
    outline = (run.phase_data or {}).get("outline") or {}
    chapters = outline.get("chapters") or []
    chapter_lines = []
    for ch in chapters:
        if not weak_titles or ch.get("title") in weak_titles:
            key_points = ", ".join(str(k) for k in (ch.get("key_points") or [])[:4])
            chapter_lines.append(f"- {ch.get('title')}: {ch.get('description', '')} {key_points}".strip())

    suggested = "\n".join(f"- {q}" for q in (coverage.get("suggested_queries") or [])[:8])
    missing = "\n".join(f"- {m}" for m in (coverage.get("missing_topics") or [])[:8])
    coverage_score = float(coverage.get("overall_score") or 0.0)
    return (
        "Find, verify, download, and index open-access academic PDFs that fill the Writer Agent's "
        "source gaps for this document outline. Prefer papers that directly support at least one "
        "weak outline area; reject papers that are merely generally related or thematically unrelated "
        "after abstract/PDF checks.\n\n"
        f"Document: {run.title}\n"
        f"Coverage status: {coverage.get('status', 'UNKNOWN')} ({coverage_score:.0%})\n\n"
        f"Weak outline areas:\n{chr(10).join(chapter_lines) or '- General outline support'}\n\n"
        f"Missing topics:\n{missing or '- None listed'}\n\n"
        f"Suggested search queries:\n{suggested or '- Use the weak outline areas above'}"
    )


async def _mark_source_workflow_running(workflow_run_id: str) -> None:
    from datetime import UTC, datetime
    from app.core.database import AsyncSessionLocal
    from app.models.workflow import WorkflowRun

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(WorkflowRun).where(WorkflowRun.id == uuid.UUID(workflow_run_id)))
            workflow = result.scalar_one_or_none()
            if workflow:
                workflow.status = "RUNNING"
                workflow.started_at = workflow.started_at or datetime.now(UTC)
                await db.commit()
    except Exception as exc:
        logger.warning("Failed to mark writer source workflow running", workflow_run_id=workflow_run_id, error=str(exc))


async def _mark_source_workflow_complete(workflow_run_id: str, status: str) -> None:
    from datetime import UTC, datetime
    from app.core.database import AsyncSessionLocal
    from app.models.workflow import WorkflowRun

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(WorkflowRun).where(WorkflowRun.id == uuid.UUID(workflow_run_id)))
            workflow = result.scalar_one_or_none()
            if workflow:
                workflow.status = status
                workflow.completed_at = datetime.now(UTC)
                await db.commit()
    except Exception as exc:
        logger.warning("Failed to mark writer source workflow complete", workflow_run_id=workflow_run_id, error=str(exc))
