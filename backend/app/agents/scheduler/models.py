from pydantic import BaseModel, Field


class SubTask(BaseModel):
    id: str
    title: str
    description: str
    estimated_hours: float = Field(ge=0.1, le=24.0)
    cognitive_weight: int = Field(ge=1, le=10)
    priority_score: float
    dependencies: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class SchedulerOutput(BaseModel):
    goal_summary: str
    tasks: list[SubTask]
    total_estimated_hours: float
    recommended_schedule: str | None = None
