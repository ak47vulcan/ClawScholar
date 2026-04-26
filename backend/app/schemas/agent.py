import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AgentLogResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    run_id: uuid.UUID
    agent_type: str
    action: str
    message: str | None
    input_data: dict[str, Any] | None
    output_data: dict[str, Any] | None
    error: str | None
    duration_ms: int | None
    created_at: datetime


class AgentStreamEvent(BaseModel):
    """WebSocket event emitted for every agent action."""

    type: str  # AGENT_LOG | STATUS_UPDATE | WORKFLOW_PROGRESS | PING
    run_id: str | None = None
    agent_type: str | None = None
    action: str | None = None
    message: str | None = None
    status: str | None = None
    progress: int | None = None
    payload: dict[str, Any] | None = None
    timestamp: datetime
