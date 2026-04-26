import uuid
from datetime import datetime

from pydantic import BaseModel


class WorkflowStartRequest(BaseModel):
    goal_id: uuid.UUID
    initial_message: str | None = None
    force_schedule: bool = False


class WorkflowResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    goal_id: uuid.UUID
    status: str
    agent_states: dict
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    goal_title: str | None = None
    project_id: uuid.UUID | None = None
