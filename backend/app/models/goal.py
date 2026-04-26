import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class ResearchGoal(BaseModel):
    __tablename__ = "research_goals"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE")  # ACTIVE, COMPLETED, ARCHIVED
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    priority_score: Mapped[float] = mapped_column(default=0.0)
    writing_intent: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    user: Mapped["User"] = relationship(back_populates="goals")
    project: Mapped["Project | None"] = relationship(back_populates="goals")
    workflow_runs: Mapped[list["WorkflowRun"]] = relationship(back_populates="goal", cascade="all, delete-orphan")


from app.models.user import User  # noqa: E402
from app.models.workflow import WorkflowRun  # noqa: E402
from app.models.project import Project  # noqa: E402
