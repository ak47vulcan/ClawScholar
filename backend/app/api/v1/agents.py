import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.agent_log import AgentLog
from app.models.user import User
from app.models.workflow import WorkflowRun
from app.models.goal import ResearchGoal
from app.schemas.agent import AgentLogResponse

router = APIRouter()
CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("/logs/{run_id}", response_model=list[AgentLogResponse])
async def get_agent_logs(run_id: uuid.UUID, db: DB, user: CurrentUser) -> list[AgentLogResponse]:
    result = await db.execute(
        select(WorkflowRun)
        .join(ResearchGoal)
        .where(WorkflowRun.id == run_id, ResearchGoal.user_id == user.id)
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Workflow run not found")

    logs_result = await db.execute(
        select(AgentLog).where(AgentLog.run_id == run_id).order_by(AgentLog.created_at.asc())
    )
    return [AgentLogResponse.model_validate(log) for log in logs_result.scalars().all()]
