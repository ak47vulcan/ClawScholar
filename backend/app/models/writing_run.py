import uuid

from sqlalchemy import ForeignKey, Integer, String, Text, Numeric
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class WritingRun(BaseModel):
    __tablename__ = "writing_runs"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    source_workflow_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_runs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(50), nullable=False)  # paper|summary|article|draft
    target_pages: Mapped[float | None] = mapped_column(Numeric(5, 1), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="CLARIFYING")
    phase_data: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")

    sections: Mapped[list["WritingSection"]] = relationship(
        back_populates="run", cascade="all, delete-orphan", order_by="WritingSection.chapter_index"
    )
    outputs: Mapped[list["WritingOutput"]] = relationship(back_populates="run", cascade="all, delete-orphan")


from app.models.writing_section import WritingSection  # noqa: E402
from app.models.writing_output import WritingOutput  # noqa: E402
