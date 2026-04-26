"""change target_pages to numeric

Revision ID: 004
Revises: 003
Create Date: 2026-04-24 03:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '004'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.alter_column('writing_runs', 'target_pages',
               existing_type=sa.INTEGER(),
               type_=sa.Numeric(precision=5, scale=1),
               existing_nullable=True)

def downgrade() -> None:
    op.alter_column('writing_runs', 'target_pages',
               existing_type=sa.Numeric(precision=5, scale=1),
               type_=sa.INTEGER(),
               existing_nullable=True)
