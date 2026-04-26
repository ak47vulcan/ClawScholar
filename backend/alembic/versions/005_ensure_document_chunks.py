"""ensure document_chunks table exists (repair migration for pgvector bootstrap failures)

Revision ID: 005
Revises: 004
Create Date: 2026-04-24

This migration is a safety net. Migration 002 creates document_chunks, but if the
postgres container lacked the pgvector extension at startup the DDL was silently lost
while alembic still marked 002 as applied. This migration recreates the table
idempotently so it always exists regardless of prior failures.
"""

from __future__ import annotations

from alembic import op

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
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
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_document_chunks_document_id ON document_chunks (document_id)"
    )


def downgrade() -> None:
    pass
