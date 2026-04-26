"""Background task: prune old agent logs and completed workflow runs."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import delete, select

from app.core.database import AsyncSessionFactory
from app.models.agent_log import AgentLog
from app.models.workflow import WorkflowRun

log = structlog.get_logger(__name__)

_LOG_RETENTION_DAYS = 30
_RUN_RETENTION_DAYS = 90


async def cleanup_old_logs(ctx: dict) -> dict:
    """Delete AgentLog rows older than LOG_RETENTION_DAYS.

    Args:
        ctx: arq worker context (unused, required by arq interface).

    Returns:
        Dict with ``deleted_logs`` count.
    """
    cutoff = datetime.now(UTC) - timedelta(days=_LOG_RETENTION_DAYS)
    async with AsyncSessionFactory() as session:
        result = await session.execute(delete(AgentLog).where(AgentLog.created_at < cutoff))
        await session.commit()
    count = result.rowcount
    log.info("cleanup.logs", deleted=count, cutoff=cutoff.isoformat())
    return {"deleted_logs": count}


async def cleanup_old_runs(ctx: dict) -> dict:
    """Delete completed/failed WorkflowRun rows older than RUN_RETENTION_DAYS.

    Args:
        ctx: arq worker context (unused).

    Returns:
        Dict with ``deleted_runs`` count.
    """
    cutoff = datetime.now(UTC) - timedelta(days=_RUN_RETENTION_DAYS)
    async with AsyncSessionFactory() as session:
        result = await session.execute(
            delete(WorkflowRun).where(
                WorkflowRun.status.in_(["COMPLETED", "FAILED"]),
                WorkflowRun.completed_at < cutoff,
            )
        )
        await session.commit()
    count = result.rowcount
    log.info("cleanup.runs", deleted=count, cutoff=cutoff.isoformat())
    return {"deleted_runs": count}
