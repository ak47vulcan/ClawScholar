"""Writer Agent API — compose academic documents from library sources."""

from __future__ import annotations

import uuid
from io import BytesIO
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.user import User

router = APIRouter()
CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.post("/runs", status_code=201)
async def create_writing_run(
    payload: dict[str, Any],
    db: DB,
    user: CurrentUser,
) -> dict[str, Any]:
    from app.services.writer_service import create_writing_run as svc_create

    title = str(payload.get("title") or "")
    doc_type = str(payload.get("doc_type") or "summary")
    initial_request = str(payload.get("initial_request") or title)
    source_doc_ids = payload.get("source_doc_ids")
    project_id = payload.get("project_id")
    source_workflow_id = payload.get("source_workflow_id")

    result = await svc_create(
        user_id=str(user.id),
        title=title,
        doc_type=doc_type,
        initial_request=initial_request,
        source_doc_ids=source_doc_ids,
        project_id=str(project_id) if project_id else None,
        source_workflow_id=str(source_workflow_id) if source_workflow_id else None,
        db=db,
    )
    await db.commit()
    return result


@router.get("/runs")
async def list_writing_runs(db: DB, user: CurrentUser) -> list[dict[str, Any]]:
    from app.services.writer_service import list_runs
    return await list_runs(user_id=str(user.id), db=db)


@router.get("/runs/{run_id}")
async def get_writing_run(run_id: uuid.UUID, db: DB, user: CurrentUser) -> dict[str, Any]:
    from app.services.writer_service import get_run_detail
    return await get_run_detail(run_id=str(run_id), user_id=str(user.id), db=db)


@router.post("/runs/{run_id}/clarify")
async def submit_clarify(
    run_id: uuid.UUID,
    payload: dict[str, Any],
    background_tasks: BackgroundTasks,
    db: DB,
    user: CurrentUser,
) -> dict[str, Any]:
    from app.services.writer_service import submit_clarify_answers

    answers = payload.get("answers", {})
    if not isinstance(answers, dict):
        raise HTTPException(status_code=422, detail="answers must be an object")

    result = await submit_clarify_answers(
        run_id=str(run_id),
        user_id=str(user.id),
        answers=answers,
        db=db,
    )
    await db.commit()

    coverage = result.get("coverage") or {}
    overall_score: float = float(coverage.get("overall_score", 1.0))
    chapter_scores: list[dict[str, Any]] = coverage.get("chapters", [])
    has_low_coverage = overall_score < 0.6 or any(
        float(c.get("coverage_score", 1.0)) < 0.45 for c in chapter_scores
    )

    result["source_search_recommended"] = bool(coverage.get("needs_sources", has_low_coverage))
    return result


@router.post("/runs/{run_id}/source-search")
async def start_source_search(
    run_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: DB,
    user: CurrentUser,
) -> dict[str, Any]:
    from app.services.writer_source_service import start_writer_source_search, run_writer_source_search

    result = await start_writer_source_search(
        run_id=str(run_id),
        user_id=str(user.id),
        db=db,
    )
    await db.commit()

    source_search = result.get("source_search") or {}
    workflow_run_id = source_search.get("workflow_run_id")
    project_id = source_search.get("project_id")
    if workflow_run_id and project_id and not result.get("already_running"):
        from app.api.websocket import broadcast_to_user

        await broadcast_to_user(str(user.id), {
            "type": "WRITER_SOURCE_WORKFLOW_CREATED",
            "run_id": str(run_id),
            "project_id": project_id,
            "workflow": {
                "id": workflow_run_id,
                "goal_id": source_search.get("goal_id"),
                "goal_title": source_search.get("goal_title") or "Find missing Writer sources",
                "status": "RUNNING",
            },
        })
    if not result.get("already_running"):
        background_tasks.add_task(run_writer_source_search, str(run_id), str(user.id), workflow_run_id)
    return result


@router.post("/runs/{run_id}/allocate")
async def submit_allocation(
    run_id: uuid.UUID,
    payload: dict[str, Any],
    background_tasks: BackgroundTasks,
    db: DB,
    user: CurrentUser,
) -> dict[str, Any]:
    from app.services.writer_service import accept_outline_and_allocate
    from app.agents.writer.writer_orchestrator import run_writing_job

    chapters = payload.get("chapters", [])
    chapter_allocations = payload.get("chapter_allocations", [])

    result = await accept_outline_and_allocate(
        run_id=str(run_id),
        user_id=str(user.id),
        chapters=chapters,
        chapter_allocations=chapter_allocations,
        db=db,
    )
    await db.commit()

    background_tasks.add_task(run_writing_job, str(run_id), str(user.id))
    return result


@router.get("/runs/{run_id}/preview")
async def get_preview(run_id: uuid.UUID, db: DB, user: CurrentUser) -> dict[str, Any]:
    from app.services.writer_service import get_run_preview
    return await get_run_preview(run_id=str(run_id), user_id=str(user.id), db=db)


@router.get("/runs/{run_id}/export/docx")
async def export_docx(run_id: uuid.UUID, db: DB, user: CurrentUser) -> StreamingResponse:
    from app.services.writer_service import get_run_preview
    from app.services.export_service import export_docx as svc_export_docx

    preview = await get_run_preview(run_id=str(run_id), user_id=str(user.id), db=db)
    md = preview.get("full_markdown", "")
    if not md:
        raise HTTPException(status_code=404, detail="No content to export yet")

    # Need doc_type for styling
    from app.services.writer_service import _get_run
    run = await _get_run(str(run_id), str(user.id), db)

    path = svc_export_docx(md, run.doc_type)
    content = path.read_bytes()
    filename = f"{run.title[:50].replace(' ', '_')}.docx"
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/runs/{run_id}/export/pdf")
async def export_pdf(run_id: uuid.UUID, db: DB, user: CurrentUser) -> StreamingResponse:
    from app.services.writer_service import get_run_preview
    from app.services.export_service import export_pdf as svc_export_pdf

    preview = await get_run_preview(run_id=str(run_id), user_id=str(user.id), db=db)
    md = preview.get("full_markdown", "")
    if not md:
        raise HTTPException(status_code=404, detail="No content to export yet")

    from app.services.writer_service import _get_run
    run = await _get_run(str(run_id), str(user.id), db)

    path = svc_export_pdf(md, run.doc_type)
    content = path.read_bytes()
    filename = f"{run.title[:50].replace(' ', '_')}.pdf"
    return StreamingResponse(
        BytesIO(content),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/runs/{run_id}", status_code=204)
async def delete_writing_run(run_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    from app.services.writer_service import delete_run
    await delete_run(run_id=str(run_id), user_id=str(user.id), db=db)
    await db.commit()
