from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ScheduleEventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str | None = None
    start_at: datetime
    end_at: datetime
    goal_id: uuid.UUID | None = None
    color: str | None = None
    all_day: bool = False


class ScheduleEventUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    description: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    color: str | None = None
    all_day: bool | None = None


class ScheduleEventOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    goal_id: uuid.UUID | None
    run_id: uuid.UUID | None
    title: str
    description: str | None
    start_at: datetime
    end_at: datetime
    source: str
    color: str | None
    all_day: bool
    created_at: datetime


class ScheduleBulkDeleteResponse(BaseModel):
    deleted_count: int
