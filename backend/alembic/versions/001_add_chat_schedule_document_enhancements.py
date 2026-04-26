"""add chat, schedule, document enhancements

Revision ID: 001
Revises:
Create Date: 2026-04-21
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from sqlalchemy import inspect

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    def _has_column(table: str, column: str) -> bool:
        return any(c.get("name") == column for c in insp.get_columns(table))

    # ── documents: new columns ──────────────────────────────────────────────
    if insp.has_table("documents"):
        if not _has_column("documents", "summary"):
            op.add_column("documents", sa.Column("summary", sa.Text(), nullable=True))
        if not _has_column("documents", "source_url"):
            op.add_column("documents", sa.Column("source_url", sa.String(1000), nullable=True))
        if not _has_column("documents", "source_type"):
            op.add_column("documents", sa.Column("source_type", sa.String(20), nullable=True))

    # ── chat_conversations ──────────────────────────────────────────────────
    if not insp.has_table("chat_conversations"):
        op.create_table(
            "chat_conversations",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column(
                "user_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "goal_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("research_goals.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("title", sa.String(500), nullable=False, server_default="New Conversation"),
        )
    op.create_index("ix_chat_conversations_user_id", "chat_conversations", ["user_id"], unique=False, if_not_exists=True)

    # ── chat_messages ───────────────────────────────────────────────────────
    if not insp.has_table("chat_messages"):
        op.create_table(
            "chat_messages",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column(
                "conversation_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("chat_conversations.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("role", sa.String(20), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column(
                "run_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("workflow_runs.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("attachments", postgresql.JSONB(), server_default="[]", nullable=False),
        )
    op.create_index(
        "ix_chat_messages_conversation_id",
        "chat_messages",
        ["conversation_id"],
        unique=False,
        if_not_exists=True,
    )

    # ── schedule_events ─────────────────────────────────────────────────────
    if not insp.has_table("schedule_events"):
        op.create_table(
            "schedule_events",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column(
                "user_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "goal_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("research_goals.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column(
                "run_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("workflow_runs.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("title", sa.String(500), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("source", sa.String(20), nullable=False, server_default="manual"),
            sa.Column("color", sa.String(30), nullable=True),
            sa.Column("all_day", sa.Boolean(), nullable=False, server_default="false"),
        )
    op.create_index("ix_schedule_events_user_id", "schedule_events", ["user_id"], unique=False, if_not_exists=True)
    op.create_index("ix_schedule_events_start_at", "schedule_events", ["start_at"], unique=False, if_not_exists=True)


def downgrade() -> None:
    op.drop_table("schedule_events")
    op.drop_table("chat_messages")
    op.drop_table("chat_conversations")
    op.drop_column("documents", "source_type")
    op.drop_column("documents", "source_url")
    op.drop_column("documents", "summary")
