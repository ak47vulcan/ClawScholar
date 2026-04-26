import uuid

from sqlalchemy import Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class ValidationResult(BaseModel):
    __tablename__ = "validation_results"

    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workflow_runs.id", ondelete="CASCADE"))
    analyst_output: Mapped[dict] = mapped_column(JSONB, nullable=False)
    librarian_verdict: Mapped[str] = mapped_column(String(20), nullable=False)  # APPROVED, REJECTED, PARTIAL
    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    evidence_sources: Mapped[list] = mapped_column(JSONB, default=list, server_default="[]")
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    run: Mapped["WorkflowRun"] = relationship(back_populates="validation_results")


from app.models.workflow import WorkflowRun  # noqa: E402
