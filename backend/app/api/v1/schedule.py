from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.schedule_event import ScheduleEvent
from app.models.user import User
from app.schemas.schedule import (
    ScheduleBulkDeleteResponse,
    ScheduleEventCreate,
    ScheduleEventOut,
    ScheduleEventUpdate,
)

router = APIRouter()
CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("/events", response_model=list[ScheduleEventOut])
async def list_events(
    db: DB,
    user: CurrentUser,
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
) -> list[ScheduleEventOut]:
    q = select(ScheduleEvent).where(ScheduleEvent.user_id == user.id)
    if start:
        q = q.where(ScheduleEvent.end_at >= start)
    if end:
        q = q.where(ScheduleEvent.start_at <= end)
    q = q.order_by(ScheduleEvent.start_at)
    result = await db.execute(q)
    return [ScheduleEventOut.model_validate(e) for e in result.scalars().all()]


@router.post("/events", response_model=ScheduleEventOut, status_code=201)
async def create_event(
    payload: ScheduleEventCreate,
    db: DB,
    user: CurrentUser,
) -> ScheduleEventOut:
    event = ScheduleEvent(
        user_id=user.id,
        title=payload.title,
        description=payload.description,
        start_at=payload.start_at,
        end_at=payload.end_at,
        goal_id=payload.goal_id,
        color=payload.color,
        all_day=payload.all_day,
        source="manual",
    )
    db.add(event)
    await db.flush()
    await db.refresh(event)
    return ScheduleEventOut.model_validate(event)


@router.patch("/events/{event_id}", response_model=ScheduleEventOut)
async def update_event(
    event_id: uuid.UUID,
    payload: ScheduleEventUpdate,
    db: DB,
    user: CurrentUser,
) -> ScheduleEventOut:
    result = await db.execute(
        select(ScheduleEvent).where(ScheduleEvent.id == event_id, ScheduleEvent.user_id == user.id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(event, k, v)
    await db.flush()
    await db.refresh(event)
    return ScheduleEventOut.model_validate(event)


@router.delete("/events", response_model=ScheduleBulkDeleteResponse)
async def delete_all_events(db: DB, user: CurrentUser) -> ScheduleBulkDeleteResponse:
    count_result = await db.execute(
        select(func.count()).select_from(ScheduleEvent).where(ScheduleEvent.user_id == user.id)
    )
    deleted_count = int(count_result.scalar_one())
    await db.execute(delete(ScheduleEvent).where(ScheduleEvent.user_id == user.id))
    return ScheduleBulkDeleteResponse(deleted_count=deleted_count)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(event_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    result = await db.execute(
        select(ScheduleEvent).where(ScheduleEvent.id == event_id, ScheduleEvent.user_id == user.id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    await db.delete(event)
