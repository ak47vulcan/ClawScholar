"""link writer runs to projects and source workflows

Revision ID: 007
Revises: 006
Create Date: 2026-04-24
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "writing_runs",
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "writing_runs",
        sa.Column("source_workflow_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_writing_runs_project_id_projects",
        "writing_runs",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_writing_runs_source_workflow_id_workflow_runs",
        "writing_runs",
        "workflow_runs",
        ["source_workflow_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_writing_runs_project_id", "writing_runs", ["project_id"], unique=False)
    op.create_index("ix_writing_runs_source_workflow_id", "writing_runs", ["source_workflow_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_writing_runs_source_workflow_id", table_name="writing_runs")
    op.drop_index("ix_writing_runs_project_id", table_name="writing_runs")
    op.drop_constraint("fk_writing_runs_source_workflow_id_workflow_runs", "writing_runs", type_="foreignkey")
    op.drop_constraint("fk_writing_runs_project_id_projects", "writing_runs", type_="foreignkey")
    op.drop_column("writing_runs", "source_workflow_id")
    op.drop_column("writing_runs", "project_id")
