import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel


class Document(BaseModel):
    __tablename__ = "documents"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(String(10), nullable=False)  # CSV, XLSX, PDF, TXT
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    embedding_status: Mapped[str] = mapped_column(String(20), default="PENDING")  # PENDING, INDEXED, FAILED
    chunk_count: Mapped[int] = mapped_column(default=0)
    metadata_: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}", name="metadata")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    source_type: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "upload" | "arxiv" | "semantic_scholar" | "pubmed"

    user: Mapped["User"] = relationship(back_populates="documents")


from app.models.user import User  # noqa: E402
