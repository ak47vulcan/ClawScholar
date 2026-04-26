import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class WritingOutput(BaseModel):
    __tablename__ = "writing_outputs"

    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("writing_runs.id", ondelete="CASCADE"))
    format: Mapped[str] = mapped_column(String(10), nullable=False)  # md|docx|pdf
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)

    run: Mapped["WritingRun"] = relationship(back_populates="outputs")


from app.models.writing_run import WritingRun  # noqa: E402
