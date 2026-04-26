#!/usr/bin/env python
"""Seed the database with demo users, goals, and workflow runs for development."""
from __future__ import annotations

import asyncio
import sys

import structlog

log = structlog.get_logger(__name__)


async def seed() -> None:
    """Insert demo data into the database."""
    from app.core.database import AsyncSessionFactory
    from app.models.user import User
    from app.models.goal import ResearchGoal
    from app.models.workflow import WorkflowRun
    from app.services.auth_service import hash_password

    async with AsyncSessionFactory() as session:
        # Demo user
        demo_user = User(
            email="demo@clawscholar.dev",
            hashed_password=hash_password("demo1234"),
            full_name="Demo Researcher",
        )
        session.add(demo_user)
        await session.flush()

        # Research goals
        goal1 = ResearchGoal(
            user_id=demo_user.id,
            title="Publication Trend Analysis ML 2024",
            description="Analyze publication trends in machine learning research from 2020 to 2024 using ArXiv data.",
            status="ACTIVE",
        )
        goal2 = ResearchGoal(
            user_id=demo_user.id,
            title="Literature Review: RAG Systems",
            description="Write a comprehensive literature review on Retrieval-Augmented Generation systems.",
            status="ACTIVE",
        )
        session.add_all([goal1, goal2])
        await session.flush()

        # Workflow runs
        run1 = WorkflowRun(goal_id=goal1.id, status="COMPLETED", agent_states={"ANALYST": "IDLE", "LIBRARIAN": "IDLE"})
        run2 = WorkflowRun(goal_id=goal2.id, status="PENDING", agent_states={})
        session.add_all([run1, run2])

        await session.commit()

    log.info("seed.complete", user=demo_user.email, goals=2, runs=2)
    print("✓ Database seeded. Login: demo@clawscholar.dev / demo1234")


if __name__ == "__main__":
    sys.path.insert(0, "/app")
    asyncio.run(seed())
