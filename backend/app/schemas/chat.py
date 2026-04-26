from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


# ── Requests ────────────────────────────────────────────────────────────────

class ConversationCreate(BaseModel):
    title: str = Field(default="New Conversation", max_length=500)
    goal_id: uuid.UUID | None = None


class MessageCreate(BaseModel):
    message: str = Field(min_length=1, max_length=10000)
    attachments: list[dict] = Field(default_factory=list)


class ChatMessageRequest(BaseModel):
    """Legacy single-shot endpoint (kept for backwards-compat)."""
    message: str = Field(min_length=1, max_length=10000)
    goal_id: uuid.UUID | None = None


# ── Responses ───────────────────────────────────────────────────────────────

class ChatMessageResponse(BaseModel):
    """Legacy response (kept for backwards-compat)."""
    goal_id: uuid.UUID
    run_id: uuid.UUID
    status: str
    goal_title: str


class ChatMessageOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    run_id: uuid.UUID | None
    attachments: list
    created_at: datetime


class ConversationOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    goal_id: uuid.UUID | None
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[ChatMessageOut] = []


class ConversationListItem(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    title: str
    goal_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    last_message: str | None = None


class SendMessageResponse(BaseModel):
    user_message: ChatMessageOut
    assistant_message: ChatMessageOut
