"""
Orchestrator — Custom State Graph for the Tri-Agent Research Workflow.

Flow: route_task → scheduler → analyst → librarian (validation) → finalize
     (on rejection: analyst again, max MAX_VALIDATION_RETRIES times)

All steps are persisted to the database (WorkflowRun, AgentLog, ValidationResult,
ScheduleEvent) so the history survives restarts.
"""

from __future__ import annotations

import uuid
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any

import asyncio
import os

import httpx
from app.core.logging import get_logger

logger = get_logger(__name__)
MAX_VALIDATION_RETRIES = 3


class WorkflowStatus(str, Enum):
    IDLE = "IDLE"
    PLANNING = "PLANNING"
    EXECUTING = "EXECUTING"
    REVIEWING = "REVIEWING"
    DONE = "DONE"
    FAILED = "FAILED"


class AgentType(str, Enum):
    SCHEDULER = "SCHEDULER"
    ANALYST = "ANALYST"
    LIBRARIAN = "LIBRARIAN"
    ORCHESTRATOR = "ORCHESTRATOR"


def _wants_schedule(message: str | None) -> bool:
    """Heuristic: only generate calendar entries when user asks for planning/schedule."""
    if not message:
        return False
    m = message.lower()
    keywords = (
        "kalender",
        "calendar",
        "schedule",
        "zeitplan",
        "plan",
        "plane",
        "planung",
        "wochenplan",
        "tagesplan",
        "deadline",
        "bis ",
        "bis zum",
        "bis zum ",
        "bis am",
        "am montag",
        "am dienstag",
        "am mittwoch",
        "am donnerstag",
        "am freitag",
        "am samstag",
        "am sonntag",
        "morgen",
        "übermorgen",
        "next week",
        "by ",
    )
    return any(k in m for k in keywords)


@dataclass
class OrchestratorState:
    run_id: str
    user_id: str
    goal_id: str
    goal_title: str
    goal_description: str | None
    project_id: str | None = None
    messages: list[dict[str, Any]] = field(default_factory=list)
    current_agent: AgentType = AgentType.ORCHESTRATOR
    scheduler_output: dict[str, Any] | None = None
    analyst_output: dict[str, Any] | None = None
    librarian_verdict: dict[str, Any] | None = None
    iteration: int = 0
    max_iterations: int = MAX_VALIDATION_RETRIES
    status: WorkflowStatus = WorkflowStatus.IDLE
    initial_message: str | None = None
    want_schedule: bool = False
    errors: list[str] = field(default_factory=list)
    saved_documents: list[dict[str, Any]] = field(default_factory=list)
    # DB context (set once per run, closed at the end)
    _step_start: float = field(default_factory=lambda: __import__("time").monotonic())


# ── DB helpers ──────────────────────────────────────────────────────────────

async def _db_update_run(run_id: str, status: str, agent_states: dict[str, Any] | None = None) -> None:
    """Update WorkflowRun status in the database."""
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.workflow import WorkflowRun
        from sqlalchemy import select

        async with AsyncSessionLocal() as session:
            result = await session.execute(select(WorkflowRun).where(WorkflowRun.id == uuid.UUID(run_id)))
            run = result.scalar_one_or_none()
            if run is None:
                return
            run.status = status
            if status == "RUNNING" and run.started_at is None:
                run.started_at = datetime.now(UTC)
            if status in ("COMPLETED", "FAILED"):
                run.completed_at = datetime.now(UTC)
            if agent_states is not None:
                run.agent_states = agent_states
            await session.commit()
    except Exception as exc:
        logger.warning("Failed to update WorkflowRun in DB", error=str(exc))


async def _db_write_agent_log(
    run_id: str,
    agent_type: str,
    action: str,
    message: str,
    output_data: dict[str, Any] | None = None,
    error: str | None = None,
    duration_ms: int | None = None,
) -> None:
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.agent_log import AgentLog

        async with AsyncSessionLocal() as session:
            log = AgentLog(
                run_id=uuid.UUID(run_id),
                agent_type=agent_type,
                action=action,
                message=message,
                output_data=output_data,
                error=error,
                duration_ms=duration_ms,
            )
            session.add(log)
            await session.commit()
    except Exception as exc:
        logger.warning("Failed to write AgentLog to DB", error=str(exc))


async def _db_write_validation(run_id: str, analyst_output: dict[str, Any], verdict: dict[str, Any]) -> None:
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.validation import ValidationResult

        async with AsyncSessionLocal() as session:
            vr = ValidationResult(
                run_id=uuid.UUID(run_id),
                analyst_output=analyst_output,
                librarian_verdict=verdict.get("verdict", "PARTIAL"),
                confidence_score=verdict.get("confidence_score"),
                evidence_sources=verdict.get("evidence_sources", []),
                rejection_reason=verdict.get("rejection_reason"),
            )
            session.add(vr)
            await session.commit()
    except Exception as exc:
        logger.warning("Failed to write ValidationResult to DB", error=str(exc))


async def _db_write_schedule_events(
    run_id: str, user_id: str, goal_id: str, scheduler_output: dict[str, Any]
) -> None:
    """Parse scheduler_output and persist ScheduleEvent rows."""
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.schedule_event import ScheduleEvent

        items: list[dict[str, Any]] = []
        for key in ("schedule_items", "tasks", "plan"):
            raw = scheduler_output.get(key)
            if isinstance(raw, list):
                items = raw
                break

        if not items:
            raw_schedule = scheduler_output.get("recommended_schedule") or scheduler_output.get("schedule")
            if isinstance(raw_schedule, str) and raw_schedule.strip():
                items = [{"title": line.strip(), "source": "agent"} for line in raw_schedule.splitlines() if line.strip()]

        if not items:
            return

        async with AsyncSessionLocal() as session:
            now = datetime.now(UTC)
            for i, it in enumerate(items):
                if not isinstance(it, dict):
                    continue
                title = it.get("title") or it.get("task") or str(it)
                if not title:
                    continue

                # Parse time slots; fall back to sequential 1h slots starting today
                try:
                    start_at = datetime.fromisoformat(it.get("start_at") or it.get("when") or "")
                except (ValueError, TypeError):
                    from datetime import timedelta
                    start_at = now.replace(hour=9, minute=0, second=0, microsecond=0) + timedelta(days=i)

                try:
                    end_at = datetime.fromisoformat(it.get("end_at") or "")
                except (ValueError, TypeError):
                    from datetime import timedelta
                    end_at = start_at + timedelta(hours=1)

                event = ScheduleEvent(
                    user_id=uuid.UUID(user_id),
                    goal_id=uuid.UUID(goal_id) if goal_id else None,
                    run_id=uuid.UUID(run_id),
                    title=str(title)[:500],
                    description=str(it.get("notes") or it.get("details") or ""),
                    start_at=start_at,
                    end_at=end_at,
                    source="agent",
                    color="#6366f1",
                )
                session.add(event)
            await session.commit()
    except Exception as exc:
        logger.warning("Failed to write ScheduleEvents to DB", error=str(exc))


# ── WebSocket helpers ────────────────────────────────────────────────────────

def _status_map(status: WorkflowStatus) -> str:
    return {
        WorkflowStatus.IDLE: "PENDING",
        WorkflowStatus.PLANNING: "RUNNING",
        WorkflowStatus.EXECUTING: "RUNNING",
        WorkflowStatus.REVIEWING: "RUNNING",
        WorkflowStatus.DONE: "COMPLETED",
        WorkflowStatus.FAILED: "FAILED",
    }.get(status, status.value)


async def _emit_event(
    state: OrchestratorState,
    action: str,
    message: str,
    payload: dict[str, Any] | None = None,
) -> None:
    from app.api.websocket import broadcast_to_user

    frontend_status = _status_map(state.status)
    event = {
        "type": "AGENT_LOG",
        "runId": state.run_id,
        "agentType": state.current_agent.value,
        "action": action,
        "message": message,
        "status": frontend_status,
        "payload": payload,
        "timestamp": datetime.now(UTC).isoformat(),
        "run_id": state.run_id,
        "agent_type": state.current_agent.value,
    }
    await broadcast_to_user(state.user_id, event)

    progress_event = {
        "type": "WORKFLOW_PROGRESS",
        "runId": state.run_id,
        "run_id": state.run_id,
        "status": frontend_status,
        "progress": _estimate_progress(state),
        "timestamp": datetime.now(UTC).isoformat(),
    }
    await broadcast_to_user(state.user_id, progress_event)


def _estimate_progress(state: OrchestratorState) -> int:
    if state.status == WorkflowStatus.IDLE:
        return 0
    if state.status == WorkflowStatus.PLANNING:
        return 10
    if state.status == WorkflowStatus.EXECUTING:
        return 30 + min(state.iteration * 20, 40)
    if state.status == WorkflowStatus.REVIEWING:
        return 80
    if state.status in (WorkflowStatus.DONE, WorkflowStatus.FAILED):
        return 100
    return 50


# ── Agent steps ──────────────────────────────────────────────────────────────

async def _route_task(state: OrchestratorState) -> OrchestratorState:
    import time

    state.status = WorkflowStatus.PLANNING
    state.current_agent = AgentType.ORCHESTRATOR
    await _emit_event(state, "ROUTE", f"Analyzing goal: {state.goal_title}")
    await _db_write_agent_log(state.run_id, "ORCHESTRATOR", "ROUTE", f"Routing goal: {state.goal_title}")
    # Workspace runs can force schedule generation regardless of heuristics.
    force = bool(getattr(state, "_force_schedule", False))
    state.want_schedule = force or _wants_schedule(state.initial_message)
    state._step_start = time.monotonic()
    state.current_agent = AgentType.SCHEDULER if state.want_schedule else AgentType.ANALYST
    return state


async def _lit_broadcast(user_id: str, run_id: str, phase: str, **kwargs: Any) -> None:
    """Emit a LITERATURE_PROGRESS WebSocket event."""
    try:
        from app.api.websocket import broadcast_to_user
        await broadcast_to_user(user_id, {"type": "LITERATURE_PROGRESS", "runId": run_id, "phase": phase, **kwargs})
    except Exception as exc:
        logger.debug("literature WS emit failed", phase=phase, error=str(exc))


def _normalize_paper_key(value: str | None) -> str:
    """Normalize paper titles/DOIs enough to catch repeat downloads."""
    if not value:
        return ""
    value = value.lower().strip()
    value = re.sub(r"^https?://(dx\.)?doi\.org/", "", value)
    value = re.sub(r"^doi:\s*", "", value)
    value = re.sub(r"\.pdf$", "", value)
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


async def _find_existing_literature_document(
    *,
    user_id: str,
    paper: dict[str, Any],
    pdf_url: str,
    title: str,
) -> dict[str, Any] | None:
    """Return a matching library PDF if the candidate was already saved."""
    try:
        from sqlalchemy import select
        from app.core.database import AsyncSessionLocal
        from app.models.document import Document

        candidate_urls = {u[:1000] for u in (pdf_url, str(paper.get("url") or "")) if u}
        candidate_doi = _normalize_paper_key(str(paper.get("doi") or ""))
        candidate_title = _normalize_paper_key(title)

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Document).where(
                    Document.user_id == uuid.UUID(user_id),
                    Document.file_type == "PDF",
                )
            )
            docs = result.scalars().all()

        for doc in docs:
            meta = doc.metadata_ or {}
            doc_urls = {
                u[:1000]
                for u in (
                    doc.source_url,
                    str(meta.get("literature_url") or ""),
                    str(meta.get("url") or ""),
                )
                if u
            }
            if candidate_urls and candidate_urls.intersection(doc_urls):
                return {
                    "document_id": str(doc.id),
                    "filename": doc.filename,
                    "storage_path": doc.storage_path,
                    "source": doc.source_type or paper.get("source") or "library",
                    "pdf_url": doc.source_url or pdf_url,
                }

            if candidate_doi and candidate_doi == _normalize_paper_key(str(meta.get("doi") or "")):
                return {
                    "document_id": str(doc.id),
                    "filename": doc.filename,
                    "storage_path": doc.storage_path,
                    "source": doc.source_type or paper.get("source") or "library",
                    "pdf_url": doc.source_url or pdf_url,
                }

            doc_title = _normalize_paper_key(doc.filename)
            if candidate_title and doc_title and candidate_title == doc_title:
                return {
                    "document_id": str(doc.id),
                    "filename": doc.filename,
                    "storage_path": doc.storage_path,
                    "source": doc.source_type or paper.get("source") or "library",
                    "pdf_url": doc.source_url or pdf_url,
                }
    except Exception as exc:
        logger.warning("Existing literature lookup failed", error=str(exc))
    return None


def _extract_seed_search_queries(goal_description: str | None) -> list[str]:
    """Pull Writer coverage-suggested queries into attempt 1 instead of relying only on regeneration."""
    if not goal_description:
        return []
    lines = goal_description.splitlines()
    seeds: list[str] = []
    in_suggested = False
    for line in lines:
        stripped = line.strip()
        lower = stripped.lower()
        if lower.startswith("suggested search queries"):
            in_suggested = True
            continue
        if in_suggested and lower.endswith(":") and not lower.startswith("-"):
            break
        if in_suggested and stripped.startswith("-"):
            query = stripped.lstrip("- ").strip()
            if query and query.lower() != "none listed":
                seeds.append(query[:160])
    return list(dict.fromkeys(seeds))[:6]


async def _run_literature_and_save_pdfs(state: OrchestratorState) -> OrchestratorState:
    """Search, three-stage filter, and download papers.

    Attempt 1 uses AI-generated multi-query search across all sources.
    Attempts 2–3 fall back to single LLM-generated alternative queries.
    """
    import time

    state.current_agent = AgentType.LIBRARIAN
    t0 = time.monotonic()
    await _emit_event(state, "SEARCH", "Searching literature and saving PDFs")

    try:
        from app.config import get_settings
        from app.core.database import AsyncSessionLocal
        from app.models.document import Document
        from app.services.literature_search import (
            search_arxiv, search_semantic_scholar, search_core, search_openalex,
            _dedupe_results, _rank_results, _backfill_pdf_urls,
        )
        from app.services.pdf_download import download_pdf
        from app.services.pdf_content import extract_text_from_bytes
        from app.tasks.embedding_tasks import index_document
        from app.llm.client import get_llm as _get_llm

        settings = get_settings()
        # Build a rich filter goal: title + description + user's initial message
        _goal_parts = [state.goal_title]
        if state.goal_description:
            _goal_parts.append(state.goal_description)
        if state.initial_message:
            _goal_parts.append(f"Additional context: {state.initial_message[:600]}")
        filter_goal = "\n".join(_goal_parts)

        _llm = await _get_llm()
        _MAX_ATTEMPTS = 5
        _TARGET_SAVED = 5      # keep searching until we have at least this many
        _TARGET_MAX_SAVED = 10  # hard cap per run
        previous_queries: list[str] = []
        saved: list[dict[str, Any]] = []
        seen_document_ids: set[str] = set()

        # ── Phase 0: AI query generation (attempt 1 only) ─────────────────────
        await _lit_broadcast(state.user_id, state.run_id, "QUERY_GENERATION",
                              generating=True, queries=[])
        try:
            generated_queries = await _llm.generate_multi_search_queries(
                goal_title=state.goal_title,
                goal_description=state.goal_description,
            )
        except Exception as _qe:
            logger.warning("Multi-query generation failed; using raw title", error=str(_qe))
            generated_queries = [state.goal_title.strip()[:200]]
        seed_queries = _extract_seed_search_queries(state.goal_description)
        if seed_queries:
            generated_queries = list(dict.fromkeys([*seed_queries, *generated_queries]))[:8]

        await _lit_broadcast(state.user_id, state.run_id, "QUERY_GENERATION",
                              generating=False, queries=generated_queries)

        for attempt in range(1, _MAX_ATTEMPTS + 1):
            # ── Build query list for this attempt ─────────────────────────────
            if attempt == 1:
                queries_this_attempt = generated_queries
                search_query = generated_queries[0]
            else:
                try:
                    search_query = await _llm.generate_search_query(
                        goal=filter_goal, attempt=attempt, previous_queries=previous_queries
                    )
                except Exception:
                    search_query = state.goal_title.strip()[:200]
                queries_this_attempt = [search_query]

            previous_queries.extend(queries_this_attempt)
            await _lit_broadcast(
                state.user_id, state.run_id, "SEARCH_START",
                query=search_query, queries=queries_this_attempt,
                attempt=attempt, maxAttempts=_MAX_ATTEMPTS,
            )

            # ── Search all sources across all queries in parallel ──────────────
            search_tasks: list[Any] = []
            for q in queries_this_attempt:
                search_tasks.extend([
                    search_arxiv(q, 5),
                    search_semantic_scholar(q, 5),
                    search_core(q, 5),
                    search_openalex(q, 5),
                ])

            raw_results = await asyncio.gather(*search_tasks, return_exceptions=True)
            combined: list[dict[str, Any]] = []
            for r in raw_results:
                if isinstance(r, list):
                    combined.extend(r)

            await _backfill_pdf_urls(combined)
            deduped = _dedupe_results(combined)
            ranked = await _rank_results(search_query, deduped)

            # Assign stable temp IDs for per-paper WS tracking
            paper_map: dict[str, dict[str, Any]] = {str(i): r for i, r in enumerate(ranked)}

            await _lit_broadcast(state.user_id, state.run_id, "CANDIDATES",
                                  attempt=attempt,
                                  papers=[
                                      {"id": pid, "title": r.get("title", ""),
                                       "source": r.get("source", ""), "year": r.get("year"),
                                       "abstract": (r.get("abstract") or "")[:200]}
                                      for pid, r in paper_map.items()
                                  ])

            if not paper_map:
                await _lit_broadcast(state.user_id, state.run_id, "RETRY",
                                      attempt=attempt + 1, reason="No results from search APIs")
                continue

            # ── Stage 1: title screening ──────────────────────────────────────
            s1_candidates = [{"id": pid, "title": r.get("title", "")} for pid, r in paper_map.items()]
            try:
                keep_s1 = set(str(k) for k in await _llm.filter_papers_by_title(
                    goal=filter_goal, candidates=s1_candidates))
            except Exception:
                keep_s1 = set(paper_map.keys())

            for pid, r in paper_map.items():
                passed = pid in keep_s1
                await _lit_broadcast(state.user_id, state.run_id, "PAPER_STATUS",
                                      attempt=attempt, paperId=pid,
                                      title=r.get("title", ""),
                                      source=r.get("source", ""),
                                      year=r.get("year"),
                                      status="title_pass" if passed else "title_reject")

            s1_survivors = {pid: r for pid, r in paper_map.items() if pid in keep_s1}
            if not s1_survivors:
                await _lit_broadcast(state.user_id, state.run_id, "RETRY",
                                      attempt=attempt + 1,
                                      reason="All papers rejected at title screening stage")
                continue

            # ── Stage 2: abstract confirmation ────────────────────────────────
            s2_candidates = [
                {"id": pid, "title": r.get("title", ""), "abstract": r.get("abstract", "")}
                for pid, r in s1_survivors.items()
            ]
            try:
                keep_s2 = set(str(k) for k in await _llm.filter_papers_by_abstract(
                    goal=filter_goal, candidates=s2_candidates))
            except Exception:
                keep_s2 = set(s1_survivors.keys())

            for pid, r in s1_survivors.items():
                passed = pid in keep_s2
                await _lit_broadcast(state.user_id, state.run_id, "PAPER_STATUS",
                                      attempt=attempt, paperId=pid,
                                      title=r.get("title", ""),
                                      source=r.get("source", ""),
                                      year=r.get("year"),
                                      status="abstract_pass" if passed else "abstract_reject")

            s2_survivors = {pid: r for pid, r in s1_survivors.items() if pid in keep_s2}
            pdf_ready = {pid: r for pid, r in s2_survivors.items()
                         if (r.get("pdf_url") or "").strip()}

            if not pdf_ready:
                await _lit_broadcast(state.user_id, state.run_id, "RETRY",
                                      attempt=attempt + 1,
                                      reason="No downloadable PDFs after relevance filtering")
                continue

            # ── Stage 3: download + content verification ──────────────────────
            # Try to save enough papers to reach the target; cap at _TARGET_MAX_SAVED total
            still_needed = _TARGET_MAX_SAVED - len(saved)
            for pid, r in list(pdf_ready.items())[:still_needed]:
                url = str(r.get("pdf_url") or "").strip()
                title = str(r.get("title") or "").strip() or "paper"
                source = str(r.get("source") or "web").strip()[:20]

                existing_doc = await _find_existing_literature_document(
                    user_id=state.user_id,
                    paper=r,
                    pdf_url=url,
                    title=title,
                )
                if existing_doc:
                    document_id = str(existing_doc["document_id"])
                    if document_id in seen_document_ids:
                        await _lit_broadcast(state.user_id, state.run_id, "PAPER_STATUS",
                                              attempt=attempt, paperId=pid, title=title,
                                              source=source, year=r.get("year"),
                                              status="rejected", rejectedAt="stage3",
                                              reason="Already counted in this refinement run")
                        continue

                    await _lit_broadcast(state.user_id, state.run_id, "PAPER_STATUS",
                                          attempt=attempt, paperId=pid, title=title,
                                          source=source, year=r.get("year"),
                                          status="content_check",
                                          documentId=document_id,
                                          reason="Already in library; verifying against missing outline areas")
                    try:
                        storage_path = str(existing_doc.get("storage_path") or "")
                        with open(storage_path, "rb") as fh:
                            excerpt = extract_text_from_bytes(fh.read(), max_chars=2000)
                        is_relevant = await _llm.verify_paper_content(
                            goal=filter_goal, title=title, content_excerpt=excerpt)
                    except Exception as exc:
                        logger.warning("Existing PDF verification failed", document_id=document_id, error=str(exc))
                        is_relevant = False

                    if not is_relevant:
                        await _lit_broadcast(state.user_id, state.run_id, "PAPER_STATUS",
                                              attempt=attempt, paperId=pid, title=title,
                                              source=source, year=r.get("year"),
                                              status="rejected", rejectedAt="stage3",
                                              reason="Existing paper does not fit the missing outline areas")
                        continue

                    seen_document_ids.add(document_id)
                    saved.append({
                        "document_id": document_id,
                        "filename": str(existing_doc.get("filename") or title),
                        "source": str(existing_doc.get("source") or source),
                        "pdf_url": str(existing_doc.get("pdf_url") or url),
                        "already_saved": True,
                    })
                    await _lit_broadcast(state.user_id, state.run_id, "PAPER_STATUS",
                                          attempt=attempt, paperId=pid, title=title,
                                          source=source, year=r.get("year"),
                                          status="saved", documentId=document_id,
                                          reason="Already saved and relevant to the missing outline areas")
                    continue

                await _lit_broadcast(state.user_id, state.run_id, "PAPER_STATUS",
                                      attempt=attempt, paperId=pid, title=title,
                                      source=source, year=r.get("year"),
                                      status="downloading")
                try:
                    downloaded = await download_pdf(url)
                    pdf_bytes = downloaded.content
                except Exception as exc:
                    logger.warning("PDF download failed", url=url, error=str(exc))
                    await _lit_broadcast(state.user_id, state.run_id, "PAPER_STATUS",
                                          attempt=attempt, paperId=pid, title=title,
                                          source=source, year=r.get("year"),
                                          status="rejected", rejectedAt="download",
                                          reason=str(exc))
                    continue

                await _lit_broadcast(state.user_id, state.run_id, "PAPER_STATUS",
                                      attempt=attempt, paperId=pid, title=title,
                                      source=source, year=r.get("year"),
                                      status="content_check")
                try:
                    excerpt = extract_text_from_bytes(pdf_bytes, max_chars=2000)
                    is_relevant = await _llm.verify_paper_content(
                        goal=filter_goal, title=title, content_excerpt=excerpt)
                except Exception:
                    is_relevant = False

                if not is_relevant:
                    await _lit_broadcast(state.user_id, state.run_id, "PAPER_STATUS",
                                          attempt=attempt, paperId=pid, title=title,
                                          source=source, year=r.get("year"),
                                          status="rejected", rejectedAt="stage3")
                    continue

                # Save to disk and DB
                user_dir = os.path.join(settings.upload_dir, state.user_id)
                os.makedirs(user_dir, exist_ok=True)
                file_id = uuid.uuid4()
                storage_path = os.path.join(user_dir, f"{file_id}.pdf")
                with open(storage_path, "wb") as fh:
                    fh.write(pdf_bytes)

                filename = (title if title.lower().endswith(".pdf") else f"{title}.pdf")[:500]
                meta: dict[str, Any] = {
                    "goal_id": state.goal_id, "run_id": state.run_id,
                    "literature_url": str(r.get("url") or "")[:1000],
                    "authors": r.get("authors") or [],
                    "year": r.get("year"), "doi": r.get("doi"),
                }
                if state.project_id:
                    meta["project_id"] = state.project_id

                async with AsyncSessionLocal() as db:
                    doc = Document(
                        user_id=uuid.UUID(state.user_id), filename=filename, file_type="PDF",
                        storage_path=storage_path, source_url=url[:1000], source_type=source,
                        metadata_=meta,
                    )
                    db.add(doc)
                    await db.flush()
                    await db.refresh(doc)
                    await db.commit()

                asyncio.create_task(index_document(str(doc.id)))
                seen_document_ids.add(str(doc.id))
                saved.append({"document_id": str(doc.id), "filename": filename, "source": source, "pdf_url": url})

                await _lit_broadcast(state.user_id, state.run_id, "PAPER_STATUS",
                                      attempt=attempt, paperId=pid, title=title,
                                      source=source, year=r.get("year"),
                                      status="saved", documentId=str(doc.id))

            if len(saved) >= _TARGET_SAVED:
                break  # Reached the minimum target — no need to retry

            if len(saved) >= _TARGET_MAX_SAVED:
                break  # Hard cap reached

            if attempt < _MAX_ATTEMPTS:
                reason = (
                    "Papers found but none passed content verification"
                    if saved == [] else
                    f"Only {len(saved)}/{_TARGET_SAVED} sources found — searching for more"
                )
                await _lit_broadcast(state.user_id, state.run_id, "RETRY",
                                      attempt=attempt + 1,
                                      reason=reason)

        # ── Finalize ──────────────────────────────────────────────────────────
        state.saved_documents = saved
        await _lit_broadcast(state.user_id, state.run_id, "DONE",
                              savedCount=len(saved), attempts=len(previous_queries))
        duration_ms = int((time.monotonic() - t0) * 1000)
        await _emit_event(state, "COMPLETE", f"Saved {len(saved)} PDFs to library", {"saved": saved})
        await _db_write_agent_log(
            state.run_id, "LIBRARIAN", "SAVE_PDFS", f"Saved {len(saved)} PDFs to library",
            output_data={"saved": saved}, duration_ms=duration_ms,
        )
    except Exception as exc:
        state.errors.append(f"Literature step error: {exc}")
        logger.error("Literature step failed", run_id=state.run_id, error=str(exc))
        await _emit_event(state, "ERROR", f"Literature search/save error: {exc}")
        await _db_write_agent_log(state.run_id, "LIBRARIAN", "ERROR", str(exc), error=str(exc))

    return state


async def _run_scheduler(state: OrchestratorState) -> OrchestratorState:
    import time

    state.status = WorkflowStatus.EXECUTING
    state.current_agent = AgentType.SCHEDULER
    t0 = time.monotonic()
    await _emit_event(state, "DECOMPOSE", "Breaking goal into sub-tasks and schedule")

    try:
        from app.llm.client import get_llm

        client = await get_llm()
        result = await client.run_scheduler(
            goal_title=state.goal_title,
            goal_description=state.goal_description,
            initial_message=state.initial_message,
        )
        state.scheduler_output = result
        duration_ms = int((time.monotonic() - t0) * 1000)
        task_count = len(result.get("tasks", []) or result.get("schedule_items", []))
        await _emit_event(state, "COMPLETE", f"Decomposed into {task_count} tasks", result)
        await _db_write_agent_log(
            state.run_id, "SCHEDULER", "COMPLETE",
            f"Decomposed into {task_count} tasks",
            output_data=result, duration_ms=duration_ms,
        )
        # Persist schedule events
        await _db_write_schedule_events(state.run_id, state.user_id, state.goal_id, result)
    except Exception as exc:
        state.errors.append(f"Scheduler error: {exc}")
        logger.error("Scheduler failed", run_id=state.run_id, error=str(exc))
        await _emit_event(state, "ERROR", f"Scheduler error: {exc}")
        await _db_write_agent_log(state.run_id, "SCHEDULER", "ERROR", str(exc), error=str(exc))

    return state


async def _run_analyst(state: OrchestratorState) -> OrchestratorState:
    import time

    state.status = WorkflowStatus.EXECUTING
    state.current_agent = AgentType.ANALYST
    t0 = time.monotonic()
    iteration_msg = f" (iteration {state.iteration + 1}/{state.max_iterations})" if state.iteration > 0 else ""
    await _emit_event(state, "ANALYZE", f"Running analysis{iteration_msg}")

    try:
        from app.llm.client import get_llm

        client = await get_llm()
        result = await client.run_analyst(
            goal_title=state.goal_title,
            initial_message=state.initial_message,
            librarian_rejection=state.librarian_verdict,
        )
        state.analyst_output = result
        duration_ms = int((time.monotonic() - t0) * 1000)
        await _emit_event(state, "COMPLETE", "Analysis complete", {"code_generated": bool(result.get("code"))})
        await _db_write_agent_log(
            state.run_id, "ANALYST", "COMPLETE", "Analysis complete",
            output_data=result, duration_ms=duration_ms,
        )
    except Exception as exc:
        state.errors.append(f"Analyst error: {exc}")
        logger.error("Analyst failed", run_id=state.run_id, error=str(exc))
        await _emit_event(state, "ERROR", f"Analyst error: {exc}")
        await _db_write_agent_log(state.run_id, "ANALYST", "ERROR", str(exc), error=str(exc))

    return state


async def _run_librarian(state: OrchestratorState) -> OrchestratorState:
    import time

    state.status = WorkflowStatus.REVIEWING
    state.current_agent = AgentType.LIBRARIAN
    t0 = time.monotonic()
    await _emit_event(state, "VALIDATE", "Validating analyst output against sources")

    try:
        from app.llm.client import get_llm
        from app.core.database import AsyncSessionLocal
        from app.agents.librarian.rag.retriever import retrieve_and_rerank

        # Retrieve relevant document chunks to ground the Librarian in actual evidence
        retrieved_context = ""
        findings_query = (state.analyst_output or {}).get("findings", state.goal_title or "")
        retrieved_chunks: list = []
        try:
            async with AsyncSessionLocal() as rag_db:
                retrieved_chunks = await retrieve_and_rerank(
                    findings_query[:500], rag_db, top_k=10, rerank_top_k=5, user_id=state.user_id
                )
            if retrieved_chunks:
                parts = [
                    f"[{i + 1}] {c.source_filename or 'Unknown'}: {c.content[:600]}"
                    for i, c in enumerate(retrieved_chunks)
                ]
                retrieved_context = "\n\n".join(parts)
                logger.info(
                    "Librarian: retrieved document chunks for validation",
                    run_id=state.run_id,
                    chunk_count=len(retrieved_chunks),
                )
        except Exception as rag_exc:
            logger.warning("Librarian: chunk retrieval failed, validating without context", error=str(rag_exc))

        client = await get_llm()
        verdict = await client.run_librarian(state.analyst_output or {}, retrieved_context=retrieved_context)

        # Back-fill evidence_sources from retrieved chunks if LLM left it empty
        if retrieved_chunks and not verdict.get("evidence_sources"):
            verdict["evidence_sources"] = [
                {"title": c.source_filename or "Unknown source", "relevance": round(c.score, 3)}
                for c in retrieved_chunks[:5]
            ]
        state.librarian_verdict = verdict
        duration_ms = int((time.monotonic() - t0) * 1000)
        verdict_str = verdict.get("verdict", "UNKNOWN")
        confidence = verdict.get("confidence_score", 0.0)
        await _emit_event(state, "VERDICT", f"Verdict: {verdict_str} (confidence: {confidence:.2f})", verdict)
        await _db_write_agent_log(
            state.run_id, "LIBRARIAN", "VERDICT",
            f"Verdict: {verdict_str}",
            output_data=verdict, duration_ms=duration_ms,
        )
        await _db_write_validation(state.run_id, state.analyst_output or {}, verdict)
    except Exception as exc:
        state.errors.append(f"Librarian error: {exc}")
        logger.error("Librarian failed", run_id=state.run_id, error=str(exc))
        state.librarian_verdict = {"verdict": "PARTIAL", "confidence_score": 0.0, "rejection_reason": str(exc)}
        await _emit_event(state, "ERROR", f"Validation error (marking as unverified): {exc}")
        await _db_write_agent_log(state.run_id, "LIBRARIAN", "ERROR", str(exc), error=str(exc))

    return state


async def _handle_rejection(state: OrchestratorState) -> OrchestratorState:
    state.iteration += 1
    state.current_agent = AgentType.ORCHESTRATOR
    await _emit_event(state, "RETRY", f"Rejection handled, retrying analyst (attempt {state.iteration})")
    return state


async def _finalize(state: OrchestratorState) -> OrchestratorState:
    state.status = WorkflowStatus.DONE
    state.current_agent = AgentType.ORCHESTRATOR
    final_payload = {
        "scheduler_output": state.scheduler_output,
        "analyst_output": state.analyst_output,
        "librarian_verdict": state.librarian_verdict,
        "saved_documents": state.saved_documents,
        "errors": state.errors,
    }
    await _emit_event(state, "FINALIZE", "Workflow complete", final_payload)
    await _db_write_agent_log(state.run_id, "ORCHESTRATOR", "FINALIZE", "Workflow complete", output_data=final_payload)

    # Trigger Writer Agent based on writing_intent set at workflow start or
    # queued while the workflow was running.
    writing_intent = getattr(state, "_writing_intent", None)
    if not writing_intent:
        try:
            from app.core.database import AsyncSessionLocal
            from app.models.goal import ResearchGoal

            async with AsyncSessionLocal() as _db:
                goal = await _db.get(ResearchGoal, uuid.UUID(state.goal_id))
                writing_intent = goal.writing_intent if goal else None
        except Exception as exc:
            logger.warning("Failed to load queued writing intent", run_id=state.run_id, error=str(exc))

    if writing_intent:
        mode = writing_intent.get("mode")
        request = str(writing_intent.get("initial_request") or "").strip()
        project_context = (
            f"Writing request: {request or writing_intent.get('title_hint') or state.goal_title}\n"
            f"Goal: {state.goal_title}\n"
            f"Findings: {(state.analyst_output or {}).get('findings', '')[:800]}\n"
            f"Sources: {', '.join(d.get('filename', '') for d in (state.saved_documents or [])[:5])}"
        )
        try:
            from app.core.database import AsyncSessionLocal
            from app.services.writer_service import auto_create_and_run_writing, create_writing_run
            from app.services.writer_coverage_service import wait_for_documents_indexed
            from app.agents.writer.writer_orchestrator import run_writing_job
            from app.api.websocket import broadcast_to_user as _broadcast

            doc_ids = [str(d.get("document_id")) for d in state.saved_documents if d.get("document_id")]
            await wait_for_documents_indexed(doc_ids, timeout_seconds=45)

            if mode == "auto":
                async with AsyncSessionLocal() as _db:
                    result = await auto_create_and_run_writing(
                        user_id=state.user_id,
                        writing_intent=writing_intent,
                        project_context=project_context,
                        project_id=state.project_id,
                        source_workflow_id=state.run_id,
                        db=_db,
                    )
                    await _db.commit()
                import asyncio as _asyncio
                _asyncio.create_task(run_writing_job(result["run_id"], state.user_id))
                await _broadcast(state.user_id, {
                    "type": "WRITER_RUN_CREATED",
                    "run_id": result["run_id"],
                    "mode": "auto",
                    "auto_open": True,
                    "project_id": state.project_id,
                    "source_workflow_id": state.run_id,
                    "message": "Writing started automatically based on your research.",
                })
            else:
                async with AsyncSessionLocal() as _db:
                    result = await create_writing_run(
                        user_id=state.user_id,
                        title=writing_intent.get("title_hint", state.goal_title),
                        doc_type=writing_intent.get("doc_type", "summary"),
                        initial_request=project_context,
                        source_doc_ids=doc_ids,
                        project_id=state.project_id,
                        source_workflow_id=state.run_id,
                        db=_db,
                    )
                    await _db.commit()
                await _broadcast(state.user_id, {
                    "type": "WRITER_RUN_CREATED",
                    "run_id": result["run_id"],
                    "mode": "manual",
                    "auto_open": True,
                    "project_id": state.project_id,
                    "source_workflow_id": state.run_id,
                    "message": "A writing run has been pre-filled with your research. Continue in the Writer tab.",
                })
        except Exception as exc:
            logger.warning("Failed to create writer run from workflow", error=str(exc))
    elif state.saved_documents:
        # Fallback: no writing intent set — show the old suggestion toast
        try:
            from app.api.websocket import broadcast_to_user as _broadcast
            await _broadcast(state.user_id, {
                "type": "WRITER_SUGGESTED",
                "run_id": state.run_id,
                "message": f"Library updated with {len(state.saved_documents)} new source(s). Want to draft a document?",
                "document_count": len(state.saved_documents),
            })
        except Exception:
            pass

    db_status = "COMPLETED" if not state.errors else "FAILED"
    await _db_update_run(
        state.run_id,
        db_status,
        {
            "scheduler": state.scheduler_output,
            "analyst": state.analyst_output,
            "librarian": state.librarian_verdict,
        },
    )
    return state


# ── Public entry point ───────────────────────────────────────────────────────

async def run_workflow(
    run_id: str,
    goal: Any,
    initial_message: str | None = None,
    conversation_id: str | None = None,
    force_schedule: bool = False,
    writing_intent: dict[str, Any] | None = None,
) -> OrchestratorState:
    """Entry point called from the API in a background task."""
    import time

    goal_id = str(getattr(goal, "id", ""))
    raw_project_id = getattr(goal, "project_id", None)
    state = OrchestratorState(
        run_id=run_id,
        user_id=str(getattr(goal, "user_id", "")),
        goal_id=goal_id,
        project_id=str(raw_project_id) if raw_project_id else None,
        goal_title=goal.title,
        goal_description=goal.description,
        initial_message=initial_message,
    )
    # internal flags: don't leak into DB state
    setattr(state, "_force_schedule", force_schedule)
    setattr(state, "_writing_intent", writing_intent)

    await _db_update_run(run_id, "RUNNING")

    try:
        state = await _route_task(state)
        if state.want_schedule:
            state = await _run_scheduler(state)
        else:
            await _emit_event(state, "SKIP", "Skipping schedule (not requested)")
            await _db_write_agent_log(state.run_id, "ORCHESTRATOR", "SKIP", "Skipping schedule (not requested)")

        # Workspace-like behavior: if a schedule was requested/forced, also pull and store literature early.
        if state.want_schedule:
            state = await _run_literature_and_save_pdfs(state)

        while state.iteration < state.max_iterations:
            state = await _run_analyst(state)
            state = await _run_librarian(state)

            verdict = (state.librarian_verdict or {}).get("verdict", "PARTIAL")
            if verdict == "APPROVED":
                break
            if verdict == "REJECTED" and state.iteration < state.max_iterations - 1:
                state = await _handle_rejection(state)
            else:
                break

    except Exception as exc:
        state.errors.append(f"Orchestrator fatal: {exc}")
        logger.error("Orchestrator fatal error", run_id=run_id, error=str(exc))
        state.status = WorkflowStatus.FAILED
        await _db_update_run(run_id, "FAILED")

    state = await _finalize(state)

    # Write assistant reply to chat conversation if applicable
    if conversation_id:
        await _db_write_assistant_message(conversation_id, run_id, state)

    return state


async def run_literature_search_standalone(
    *,
    user_id: str,
    goal_title: str,
    goal_description: str | None = None,
    ws_run_id: str,
    project_id: str | None = None,
    goal_id: str | None = None,
) -> list[dict[str, Any]]:
    """Standalone literature search — no full workflow required.

    Used by the Writer agent when source coverage is insufficient after outline
    generation.  Emits ``LITERATURE_PROGRESS`` WebSocket events tagged with
    ``ws_run_id`` so the frontend can show progress in-context.

    Returns the list of saved-document dicts (same shape as
    ``OrchestratorState.saved_documents``).
    """
    fake_state = OrchestratorState(
        run_id=ws_run_id,
        user_id=user_id,
        goal_id=goal_id or "",
        goal_title=goal_title,
        goal_description=goal_description,
        project_id=project_id,
        initial_message=None,
    )
    fake_state.status = WorkflowStatus.EXECUTING
    fake_state.current_agent = AgentType.LIBRARIAN
    state = await _run_literature_and_save_pdfs(fake_state)
    return state.saved_documents


async def _db_write_assistant_message(
    conversation_id: str, run_id: str, state: OrchestratorState
) -> None:
    """Write the assistant's summary reply into the chat conversation."""
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.chat import ChatMessage

        # Build a short human-readable summary
        verdict = (state.librarian_verdict or {}).get("verdict", "N/A")
        confidence = (state.librarian_verdict or {}).get("confidence_score", 0.0)
        findings = (state.analyst_output or {}).get("findings", "")
        schedule_note = ""
        if state.want_schedule and state.scheduler_output:
            task_count = len(
                state.scheduler_output.get("tasks")
                or state.scheduler_output.get("schedule_items")
                or []
            )
            if task_count:
                schedule_note = f"\n\n📅 **{task_count} schedule events** have been added to your calendar."

        content = (
            f"✅ Workflow complete for **{state.goal_title}**\n\n"
            f"**Verdict:** {verdict} (confidence: {confidence:.0%})\n\n"
            + (f"**Key Findings:**\n{findings}\n\n" if findings else "")
            + (f"**Errors:** {'; '.join(state.errors)}\n\n" if state.errors else "")
            + schedule_note
        ).strip()

        async with AsyncSessionLocal() as session:
            msg = ChatMessage(
                conversation_id=uuid.UUID(conversation_id),
                role="assistant",
                content=content,
                run_id=uuid.UUID(run_id),
            )
            session.add(msg)
            await session.commit()
    except Exception as exc:
        logger.warning("Failed to write assistant ChatMessage", error=str(exc))
