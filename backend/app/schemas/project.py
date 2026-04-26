import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str | None = None


class ProjectUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None
    status: str | None = None


class ProjectWorkflowItem(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    goal_id: uuid.UUID
    goal_title: str
    goal_description: str | None
    status: str
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class ProjectResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    title: str
    description: str | None
    status: str
    created_at: datetime
    updated_at: datetime
    workflow_count: int = 0
    last_run_at: datetime | None = None
    last_run_status: str | None = None


class ProjectDetailResponse(ProjectResponse):
    workflows: list[ProjectWorkflowItem] = []


class ProjectWorkflowStart(BaseModel):
    task_description: str = Field(min_length=1)
    answers: dict[str, bool] = Field(default_factory=dict)
    writing_mode: str | None = None  # "manual" | "auto"
    doc_type: str = "summary"
    writing_title_hint: str | None = None


class ProjectWorkflowWritingIntent(BaseModel):
    initial_request: str = Field(min_length=1)
    writing_mode: str = "manual"  # "manual" | "auto"
    doc_type: str = "summary"
    title_hint: str | None = None


class ClarifyQuestion(BaseModel):
    id: str
    text: str
    context: str


class ClarifyRequest(BaseModel):
    goal: str = Field(min_length=1)


class ClarifyResponse(BaseModel):
    questions: list[ClarifyQuestion]
