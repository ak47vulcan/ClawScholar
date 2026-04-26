import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.goal import ResearchGoal
from app.models.user import User
from app.schemas.goal import GoalCreate, GoalResponse, GoalUpdate

router = APIRouter()
CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("/", response_model=list[GoalResponse])
async def list_goals(db: DB, user: CurrentUser) -> list[GoalResponse]:
    result = await db.execute(select(ResearchGoal).where(ResearchGoal.user_id == user.id).order_by(ResearchGoal.created_at.desc()))
    goals = result.scalars().all()
    return [GoalResponse.model_validate(g) for g in goals]


@router.post("/", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(payload: GoalCreate, db: DB, user: CurrentUser) -> GoalResponse:
    goal = ResearchGoal(user_id=user.id, **payload.model_dump())
    db.add(goal)
    await db.flush()
    await db.refresh(goal)
    return GoalResponse.model_validate(goal)


@router.get("/{goal_id}", response_model=GoalResponse)
async def get_goal(goal_id: uuid.UUID, db: DB, user: CurrentUser) -> GoalResponse:
    result = await db.execute(select(ResearchGoal).where(ResearchGoal.id == goal_id, ResearchGoal.user_id == user.id))
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    return GoalResponse.model_validate(goal)


@router.patch("/{goal_id}", response_model=GoalResponse)
async def update_goal(goal_id: uuid.UUID, payload: GoalUpdate, db: DB, user: CurrentUser) -> GoalResponse:
    result = await db.execute(select(ResearchGoal).where(ResearchGoal.id == goal_id, ResearchGoal.user_id == user.id))
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(goal, k, v)
    await db.flush()
    await db.refresh(goal)
    return GoalResponse.model_validate(goal)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(goal_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    result = await db.execute(select(ResearchGoal).where(ResearchGoal.id == goal_id, ResearchGoal.user_id == user.id))
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    await db.delete(goal)
