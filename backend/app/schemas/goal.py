import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class GoalCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str | None = None
    deadline: datetime | None = None


class GoalUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None
    deadline: datetime | None = None
    status: str | None = None


class GoalResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    description: str | None
    status: str
    deadline: datetime | None
    priority_score: float
    created_at: datetime
    updated_at: datetime
