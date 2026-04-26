import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class WorkflowRun(BaseModel):
    __tablename__ = "workflow_runs"

    goal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("research_goals.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(50), default="PENDING")  # PENDING, RUNNING, COMPLETED, FAILED
    agent_states: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    goal: Mapped["ResearchGoal"] = relationship(back_populates="workflow_runs")
    agent_logs: Mapped[list["AgentLog"]] = relationship(back_populates="run", cascade="all, delete-orphan")
    validation_results: Mapped[list["ValidationResult"]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )


from app.models.goal import ResearchGoal  # noqa: E402
from app.models.agent_log import AgentLog  # noqa: E402
from app.models.validation import ValidationResult  # noqa: E402
