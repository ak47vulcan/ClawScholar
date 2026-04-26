from __future__ import annotations

import json
import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.goal import ResearchGoal
from app.models.document import Document
from app.models.project import Project
from app.models.user import User
from app.models.workflow import WorkflowRun
from app.schemas.project import (
    ClarifyRequest,
    ClarifyResponse,
    ClarifyQuestion,
    ProjectCreate,
    ProjectDetailResponse,
    ProjectResponse,
    ProjectUpdate,
    ProjectWorkflowItem,
    ProjectWorkflowStart,
    ProjectWorkflowWritingIntent,
)

router = APIRouter()
CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=list[ProjectResponse])
@router.get("/", response_model=list[ProjectResponse])
async def list_projects(db: DB, user: CurrentUser) -> list[ProjectResponse]:
    result = await db.execute(
        select(Project)
        .where(Project.user_id == user.id)
        .order_by(Project.updated_at.desc())
    )
    projects = result.scalars().all()

    responses: list[ProjectResponse] = []
    for p in projects:
        # Count workflows via goals
        count_result = await db.execute(
            select(func.count(WorkflowRun.id))
            .join(ResearchGoal)
            .where(ResearchGoal.project_id == p.id)
        )
        workflow_count = count_result.scalar() or 0

        # Last run info
        last_run_result = await db.execute(
            select(WorkflowRun)
            .join(ResearchGoal)
            .where(ResearchGoal.project_id == p.id)
            .order_by(WorkflowRun.created_at.desc())
            .limit(1)
        )
        last_run = last_run_result.scalar_one_or_none()

        responses.append(
            ProjectResponse(
                id=p.id,
                title=p.title,
                description=p.description,
                status=p.status,
                created_at=p.created_at,
                updated_at=p.updated_at,
                workflow_count=workflow_count,
                last_run_at=last_run.created_at if last_run else None,
                last_run_status=last_run.status if last_run else None,
            )
        )

    return responses


@router.post("", response_model=ProjectResponse, status_code=201)
@router.post("/", response_model=ProjectResponse, status_code=201)
async def create_project(payload: ProjectCreate, db: DB, user: CurrentUser) -> ProjectResponse:
    project = Project(user_id=user.id, title=payload.title, description=payload.description)
    db.add(project)
    await db.flush()
    await db.refresh(project)
    return ProjectResponse(
        id=project.id,
        title=project.title,
        description=project.description,
        status=project.status,
        created_at=project.created_at,
        updated_at=project.updated_at,
        workflow_count=0,
    )


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(project_id: uuid.UUID, db: DB, user: CurrentUser) -> ProjectDetailResponse:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Fetch workflows with goal info
    wf_result = await db.execute(
        select(WorkflowRun, ResearchGoal.title, ResearchGoal.description)
        .join(ResearchGoal)
        .where(ResearchGoal.project_id == project_id)
        .order_by(WorkflowRun.created_at.desc())
    )
    workflow_items: list[ProjectWorkflowItem] = []
    for run, goal_title, goal_desc in wf_result.all():
        workflow_items.append(
            ProjectWorkflowItem(
                id=run.id,
                goal_id=run.goal_id,
                goal_title=goal_title,
                goal_description=goal_desc,
                status=run.status,
                created_at=run.created_at,
                started_at=run.started_at,
                completed_at=run.completed_at,
            )
        )

    return ProjectDetailResponse(
        id=project.id,
        title=project.title,
        description=project.description,
        status=project.status,
        created_at=project.created_at,
        updated_at=project.updated_at,
        workflow_count=len(workflow_items),
        last_run_at=workflow_items[0].created_at if workflow_items else None,
        last_run_status=workflow_items[0].status if workflow_items else None,
        workflows=workflow_items,
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID, payload: ProjectUpdate, db: DB, user: CurrentUser
) -> ProjectResponse:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if payload.title is not None:
        project.title = payload.title
    if payload.description is not None:
        project.description = payload.description
    if payload.status is not None:
        project.status = payload.status

    await db.flush()
    await db.refresh(project)
    return ProjectResponse.model_validate(project)


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.delete(project)


@router.post("/{project_id}/workflows", status_code=201)
async def start_project_workflow(
    project_id: uuid.UUID,
    payload: ProjectWorkflowStart,
    background_tasks: BackgroundTasks,
    db: DB,
    user: CurrentUser,
) -> dict:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.user_id == user.id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    enriched = payload.task_description
    if payload.answers:
        extras = [k for k, v in payload.answers.items() if v]
        if extras:
            enriched += "\n\nAdditional context: " + "; ".join(extras)

    title = enriched[:77] + "…" if len(enriched) > 80 else enriched
    writing_intent = None
    if payload.writing_mode in ("manual", "auto"):
        writing_intent = {
            "mode": payload.writing_mode,
            "doc_type": payload.doc_type,
            "title_hint": payload.writing_title_hint or title,
        }

    goal = ResearchGoal(
        user_id=user.id,
        project_id=project_id,
        title=title,
        description=enriched,
        writing_intent=writing_intent,
    )
    db.add(goal)
    await db.flush()
    await db.refresh(goal)

    run = WorkflowRun(goal_id=goal.id)
    db.add(run)
    await db.flush()
    await db.refresh(run)

    await db.commit()

    from app.agents.orchestrator import run_workflow
    background_tasks.add_task(run_workflow, str(run.id), goal, enriched, None, True, writing_intent)

    return {"run_id": str(run.id), "goal_id": str(goal.id), "status": run.status}


@router.post("/{project_id}/workflows/{run_id}/writing-intent")
async def queue_project_workflow_writing_intent(
    project_id: uuid.UUID,
    run_id: uuid.UUID,
    payload: ProjectWorkflowWritingIntent,
    db: DB,
    user: CurrentUser,
) -> dict:
    """Attach a Writer request to a project workflow.

    Running workflows pick this up in the Orchestrator finalizer after PDFs are
    saved and indexed. Completed workflows can create the Writer run immediately.
    """
    result = await db.execute(
        select(WorkflowRun, ResearchGoal)
        .join(ResearchGoal, WorkflowRun.goal_id == ResearchGoal.id)
        .where(
            WorkflowRun.id == run_id,
            ResearchGoal.project_id == project_id,
            ResearchGoal.user_id == user.id,
        )
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Workflow not found")

    run, goal = row
    if run.status == "FAILED":
        raise HTTPException(status_code=409, detail="Cannot queue writing for a failed workflow")

    title = payload.title_hint or _title_from_writing_request(payload.initial_request)
    writing_intent = {
        "mode": payload.writing_mode if payload.writing_mode in ("manual", "auto") else "manual",
        "doc_type": payload.doc_type or "summary",
        "title_hint": title,
        "initial_request": payload.initial_request,
    }
    goal.writing_intent = writing_intent

    if run.status == "COMPLETED":
        from app.services.writer_coverage_service import wait_for_documents_indexed
        from app.services.writer_service import create_writing_run

        docs = await _workflow_documents(db, user.id, run_id)
        await wait_for_documents_indexed([str(d.id) for d in docs], timeout_seconds=30)
        project_context = _writer_project_context(goal, payload.initial_request, docs)
        created = await create_writing_run(
            user_id=str(user.id),
            title=title,
            doc_type=writing_intent["doc_type"],
            initial_request=project_context,
            source_doc_ids=[str(d.id) for d in docs],
            project_id=str(project_id),
            source_workflow_id=str(run_id),
            db=db,
        )
        await db.commit()
        return {
            "status": "created",
            "run_id": str(run_id),
            "writer_run_id": created["run_id"],
            "message": "The research is complete, so I created the Writer run now.",
        }

    await db.commit()
    return {
        "status": "queued",
        "run_id": str(run_id),
        "message": "Writing is queued. I will open the Writer tab when the research workflow finishes.",
    }


def _title_from_writing_request(request: str) -> str:
    text = " ".join(request.strip().split())
    return text[:77] + "…" if len(text) > 80 else text


async def _workflow_documents(db: AsyncSession, user_id: uuid.UUID, run_id: uuid.UUID) -> list[Document]:
    result = await db.execute(
        select(Document)
        .where(
            Document.user_id == user_id,
            Document.metadata_["run_id"].astext == str(run_id),
        )
        .order_by(Document.created_at.desc())
    )
    return list(result.scalars().all())


def _writer_project_context(goal: ResearchGoal, request: str, docs: list[Document]) -> str:
    source_names = ", ".join(d.filename for d in docs[:10]) or "No indexed project PDFs yet"
    return (
        f"Writing request: {request}\n"
        f"Project goal: {goal.title}\n"
        f"Research context: {goal.description or goal.title}\n"
        f"Project PDFs from the completed workflow: {source_names}"
    )


@router.post("/clarify", response_model=ClarifyResponse)
async def generate_clarifying_questions(
    payload: ClarifyRequest, user: CurrentUser
) -> ClarifyResponse:
    try:
        from app.llm.client import get_llm
        llm = await get_llm()

        system = (
            "You are a research workflow assistant. Given a research goal or task, "
            "generate exactly 4 targeted yes/no clarifying questions that would help "
            "the system execute the task better. Each question should be concise, "
            "specific to the goal, and in English. "
            "Respond ONLY with a JSON object like: "
            '{"questions": [{"id": "1", "text": "...", "context": "..."}, ...]}'
        )
        result = await llm.run_chat_assistant(
            system=system,
            messages=[{"role": "user", "content": f"Research goal: {payload.goal}"}],
            max_tokens=800,
        )
        content = result.get("content", "")
        # Extract JSON from the response
        start = content.find("{")
        end = content.rfind("}") + 1
        if start >= 0 and end > start:
            data = json.loads(content[start:end])
            questions = [
                ClarifyQuestion(id=str(q["id"]), text=q["text"], context=q.get("context", ""))
                for q in data.get("questions", [])
            ]
            return ClarifyResponse(questions=questions)
    except Exception:
        pass

    # Fallback to static questions
    return ClarifyResponse(questions=_static_questions(payload.goal))


def _static_questions(goal: str) -> list[ClarifyQuestion]:
    return [
        ClarifyQuestion(
            id="pdf_search",
            text="Should I automatically search for and download relevant academic papers?",
            context="For literature research and knowledge base",
        ),
        ClarifyQuestion(
            id="calendar_blocks",
            text="Should I schedule calendar blocks for working on this?",
            context="Deep-work time blocks in your calendar",
        ),
        ClarifyQuestion(
            id="code_analysis",
            text="Should the Analyst write Python code for data analysis?",
            context="If quantitative data or visualisations are needed",
        ),
        ClarifyQuestion(
            id="detailed_breakdown",
            text="Should the task be broken down into detailed sub-tasks?",
            context="For more complex workflows with multiple steps",
        ),
        ClarifyQuestion(
            id="writing_intent",
            text="Should a written document be produced from the research findings?",
            context="Creates a formatted paper/summary/article in the Writer tab",
        ),
        ClarifyQuestion(
            id="auto_write",
            text="Should the writing happen fully automatically (no manual input needed)?",
            context="AI will answer all writing questions and produce the document without interaction",
        ),
    ]
