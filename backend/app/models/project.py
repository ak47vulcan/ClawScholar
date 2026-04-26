import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class Project(BaseModel):
    __tablename__ = "projects"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE")  # ACTIVE, ARCHIVED

    user: Mapped["User"] = relationship(back_populates="projects")
    goals: Mapped[list["ResearchGoal"]] = relationship(back_populates="project", cascade="all, delete-orphan")


from app.models.user import User  # noqa: E402
from app.models.goal import ResearchGoal  # noqa: E402
