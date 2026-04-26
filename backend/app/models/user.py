from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class User(BaseModel):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    is_active: Mapped[bool] = mapped_column(default=True)

    projects: Mapped[list["Project"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    goals: Mapped[list["ResearchGoal"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    documents: Mapped[list["Document"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    chat_conversations: Mapped[list["ChatConversation"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    schedule_events: Mapped[list["ScheduleEvent"]] = relationship(back_populates="user", cascade="all, delete-orphan")


from app.models.project import Project  # noqa: E402
from app.models.goal import ResearchGoal  # noqa: E402
from app.models.document import Document  # noqa: E402
from app.models.chat import ChatConversation  # noqa: E402
from app.models.schedule_event import ScheduleEvent  # noqa: E402
