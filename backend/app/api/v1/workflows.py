import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.goal import ResearchGoal
from app.models.user import User
from app.models.workflow import WorkflowRun
from app.schemas.workflow import WorkflowResponse, WorkflowStartRequest

router = APIRouter()
CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.post("/start", response_model=WorkflowResponse, status_code=201)
async def start_workflow(
    payload: WorkflowStartRequest,
    background_tasks: BackgroundTasks,
    db: DB,
    user: CurrentUser,
) -> WorkflowResponse:
    result = await db.execute(
        select(ResearchGoal).where(ResearchGoal.id == payload.goal_id, ResearchGoal.user_id == user.id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    run = WorkflowRun(goal_id=goal.id)
    db.add(run)
    await db.flush()
    await db.refresh(run)

    # Start orchestrator in background
    from app.agents.orchestrator import run_workflow
    background_tasks.add_task(
        run_workflow,
        str(run.id),
        goal,
        payload.initial_message,
        None,
        payload.force_schedule,
    )

    return WorkflowResponse.model_validate(run)


@router.get("/{run_id}", response_model=WorkflowResponse)
async def get_workflow(run_id: uuid.UUID, db: DB, user: CurrentUser) -> WorkflowResponse:
    result = await db.execute(
        select(WorkflowRun)
        .join(ResearchGoal)
        .where(WorkflowRun.id == run_id, ResearchGoal.user_id == user.id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Workflow run not found")
    return WorkflowResponse.model_validate(run)


@router.get("/", response_model=list[WorkflowResponse])
async def list_workflows(db: DB, user: CurrentUser) -> list[WorkflowResponse]:
    result = await db.execute(
        select(WorkflowRun, ResearchGoal.title, ResearchGoal.project_id)
        .join(ResearchGoal)
        .where(ResearchGoal.user_id == user.id)
        .order_by(WorkflowRun.created_at.desc())
    )
    responses = []
    for run, goal_title, project_id in result.all():
        r = WorkflowResponse.model_validate(run)
        r.goal_title = goal_title
        r.project_id = project_id
        responses.append(r)
    return responses
