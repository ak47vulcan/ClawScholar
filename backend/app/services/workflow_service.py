"""Workflow service: create workflow runs and trigger the orchestrator."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workflow import WorkflowRun
from app.models.goal import ResearchGoal

if TYPE_CHECKING:
    pass

log = structlog.get_logger(__name__)


async def create_workflow_run(session: AsyncSession, goal_id: uuid.UUID) -> WorkflowRun:
    """Persist a new WorkflowRun in PENDING state for the given goal.

    Args:
        session: Active async DB session.
        goal_id: UUID of the parent ResearchGoal.

    Returns:
        Newly created WorkflowRun ORM instance.
    """
    goal = await session.get(ResearchGoal, goal_id)
    if goal is None:
        raise ValueError(f"ResearchGoal {goal_id} not found")

    run = WorkflowRun(goal_id=goal_id)
    session.add(run)
    await session.commit()
    await session.refresh(run)
    log.info("workflow.created", run_id=str(run.id), goal_id=str(goal_id))
    return run


async def list_workflow_runs(
    session: AsyncSession,
    goal_id: uuid.UUID | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[WorkflowRun]:
    """Return workflow runs, optionally filtered by goal.

    Args:
        session: Active async DB session.
        goal_id: If given, restrict results to this goal.
        limit: Max rows to return.
        offset: Row offset for pagination.

    Returns:
        List of WorkflowRun ORM instances ordered by creation time descending.
    """
    stmt = select(WorkflowRun).order_by(WorkflowRun.created_at.desc()).limit(limit).offset(offset)
    if goal_id is not None:
        stmt = stmt.where(WorkflowRun.goal_id == goal_id)
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def update_workflow_status(
    session: AsyncSession,
    run_id: uuid.UUID,
    status: str,
    agent_states: dict | None = None,
) -> WorkflowRun:
    """Persist a status transition on a workflow run.

    Args:
        session: Active async DB session.
        run_id: UUID of the run to update.
        status: New status string (PENDING | RUNNING | COMPLETED | FAILED).
        agent_states: Optional updated agent state dict to merge.

    Returns:
        Updated WorkflowRun ORM instance.
    """
    run = await session.get(WorkflowRun, run_id)
    if run is None:
        raise ValueError(f"WorkflowRun {run_id} not found")

    run.status = status
    if agent_states:
        run.agent_states = {**(run.agent_states or {}), **agent_states}

    if status == "RUNNING" and run.started_at is None:
        from datetime import UTC, datetime
        run.started_at = datetime.now(UTC)
    elif status in ("COMPLETED", "FAILED"):
        from datetime import UTC, datetime
        run.completed_at = datetime.now(UTC)

    await session.commit()
    await session.refresh(run)
    log.info("workflow.status_updated", run_id=str(run_id), status=status)
    return run
