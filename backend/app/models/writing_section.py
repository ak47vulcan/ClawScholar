import uuid

from sqlalchemy import ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class WritingSection(BaseModel):
    __tablename__ = "writing_sections"

    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("writing_runs.id", ondelete="CASCADE"))
    chapter_index: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    target_pages: Mapped[float] = mapped_column(Numeric(5, 1), nullable=False, default=1.0)
    status: Mapped[str] = mapped_column(String(30), default="PENDING")  # PENDING|WRITING|DONE|FAILED
    content_md: Mapped[str | None] = mapped_column(Text, nullable=True)
    sources_used: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")

    run: Mapped["WritingRun"] = relationship(back_populates="sections")


from app.models.writing_run import WritingRun  # noqa: E402
