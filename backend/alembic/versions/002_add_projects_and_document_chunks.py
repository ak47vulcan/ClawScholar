"""add projects and document_chunks

Revision ID: 002
Revises: 001
Create Date: 2026-04-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ensure pgvector is available (pgvector/pgvector image supports this).
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ── projects ────────────────────────────────────────────────────────────
    op.create_table(
        "projects",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="ACTIVE"),
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_projects_user_id", "projects", ["user_id"], unique=False)

    # ── research_goals: project_id ──────────────────────────────────────────
    op.add_column("research_goals", sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_research_goals_project_id", "research_goals", ["project_id"], unique=False)
    op.create_foreign_key(
        "research_goals_project_id_fkey",
        "research_goals",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # ── document_chunks (pgvector storage) ──────────────────────────────────
    # Use raw SQL because SQLAlchemy doesn't provide a built-in pgvector type here.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS document_chunks (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            chunk_index integer NOT NULL,
            content text NOT NULL,
            embedding vector NOT NULL,
            UNIQUE (document_id, chunk_index)
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_document_chunks_document_id ON document_chunks (document_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS document_chunks")
    op.drop_constraint("research_goals_project_id_fkey", "research_goals", type_="foreignkey")
    op.drop_index("ix_research_goals_project_id", table_name="research_goals")
    op.drop_column("research_goals", "project_id")
    op.drop_index("ix_projects_user_id", table_name="projects")
    op.drop_table("projects")
