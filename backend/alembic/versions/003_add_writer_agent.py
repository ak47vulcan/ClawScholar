"""add writer agent tables

Revision ID: 003
Revises: 002
Create Date: 2026-04-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── writing_runs ─────────────────────────────────────────────────────────
    op.create_table(
        "writing_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("doc_type", sa.String(length=50), nullable=False),
        sa.Column("target_pages", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="CLARIFYING"),
        sa.Column("phase_data", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_writing_runs_user_id", "writing_runs", ["user_id"], unique=False)
    op.create_index("ix_writing_runs_status", "writing_runs", ["status"], unique=False)

    # ── writing_sections ─────────────────────────────────────────────────────
    op.create_table(
        "writing_sections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("writing_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chapter_index", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("target_pages", sa.Numeric(5, 1), nullable=False, server_default="1.0"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="PENDING"),
        sa.Column("content_md", sa.Text(), nullable=True),
        sa.Column("sources_used", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_writing_sections_run_id", "writing_sections", ["run_id"], unique=False)

    # ── writing_outputs ───────────────────────────────────────────────────────
    op.create_table(
        "writing_outputs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("writing_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("format", sa.String(length=10), nullable=False),
        sa.Column("storage_path", sa.String(length=1000), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_writing_outputs_run_id", "writing_outputs", ["run_id"], unique=False)


def downgrade() -> None:
    op.drop_table("writing_outputs")
    op.drop_table("writing_sections")
    op.drop_index("ix_writing_runs_status", table_name="writing_runs")
    op.drop_index("ix_writing_runs_user_id", table_name="writing_runs")
    op.drop_table("writing_runs")
