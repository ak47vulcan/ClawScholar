import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ValidationResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    run_id: uuid.UUID
    librarian_verdict: str
    confidence_score: float | None
    evidence_sources: list[Any]
    rejection_reason: str | None
    created_at: datetime
