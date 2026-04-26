from __future__ import annotations

import json
import os
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, get_db
from app.models.agent_log import AgentLog
from app.models.chat import ChatConversation, ChatMessage
from app.models.document import Document
from app.models.goal import ResearchGoal
from app.models.project import Project
from app.models.user import User
from app.models.workflow import WorkflowRun
from app.schemas.chat import (
    ChatMessageOut,
    ChatMessageRequest,
    ChatMessageResponse,
    ConversationCreate,
    ConversationListItem,
    ConversationOut,
    MessageCreate,
    SendMessageResponse,
)

router = APIRouter()
CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


def _title_from_message(message: str) -> str:
    msg = " ".join(message.strip().split())
    return msg[:77] + "…" if len(msg) > 80 else msg


# ── Legacy single-shot endpoint ──────────────────────────────────────────────

@router.post("/message", response_model=ChatMessageResponse, status_code=201)
async def post_chat_message(
    payload: ChatMessageRequest,
    background_tasks: BackgroundTasks,
    db: DB,
    user: CurrentUser,
) -> ChatMessageResponse:
    """Backwards-compat: creates a goal + run without a conversation thread."""
    title = _title_from_message(payload.message)
    goal = ResearchGoal(user_id=user.id, title=title, description=payload.message.strip())
    db.add(goal)
    await db.flush()
    await db.refresh(goal)

    run = WorkflowRun(goal_id=goal.id)
    db.add(run)
    await db.flush()
    await db.refresh(run)

    # Ensure the WorkflowRun exists before background tasks write AgentLogs.
    # (BackgroundTasks uses a separate DB session, so relying on get_db()'s
    # end-of-request commit can race.)
    await db.commit()

    from app.agents.orchestrator import run_workflow

    background_tasks.add_task(run_workflow, str(run.id), goal, payload.message.strip(), None, False)

    return ChatMessageResponse(goal_id=goal.id, run_id=run.id, status=run.status, goal_title=goal.title)


# ── Conversations ────────────────────────────────────────────────────────────

@router.get("/conversations", response_model=list[ConversationListItem])
async def list_conversations(db: DB, user: CurrentUser) -> list[ConversationListItem]:
    result = await db.execute(
        select(ChatConversation)
        .where(ChatConversation.user_id == user.id)
        .order_by(ChatConversation.updated_at.desc())
        .options(selectinload(ChatConversation.messages))
    )
    convs = result.scalars().all()
    out = []
    for c in convs:
        last = c.messages[-1].content[:120] if c.messages else None
        out.append(
            ConversationListItem(
                id=c.id,
                title=c.title,
                goal_id=c.goal_id,
                created_at=c.created_at,
                updated_at=c.updated_at,
                last_message=last,
            )
        )
    return out


@router.post("/conversations", response_model=ConversationOut, status_code=201)
async def create_conversation(
    payload: ConversationCreate,
    db: DB,
    user: CurrentUser,
) -> ConversationOut:
    conv = ChatConversation(user_id=user.id, title=payload.title, goal_id=payload.goal_id)
    db.add(conv)
    await db.flush()
    await db.refresh(conv, ["messages"])
    return ConversationOut.model_validate(conv)


@router.get("/conversations/{conv_id}", response_model=ConversationOut)
async def get_conversation(conv_id: uuid.UUID, db: DB, user: CurrentUser) -> ConversationOut:
    result = await db.execute(
        select(ChatConversation)
        .where(ChatConversation.id == conv_id, ChatConversation.user_id == user.id)
        .options(selectinload(ChatConversation.messages))
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationOut.model_validate(conv)


@router.delete("/conversations/{conv_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(conv_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    result = await db.execute(
        select(ChatConversation).where(ChatConversation.id == conv_id, ChatConversation.user_id == user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.delete(conv)


# ── Messages within a conversation ──────────────────────────────────────────

@router.post("/conversations/{conv_id}/messages", response_model=SendMessageResponse, status_code=201)
async def send_message(
    conv_id: uuid.UUID,
    payload: MessageCreate,
    background_tasks: BackgroundTasks,
    db: DB,
    user: CurrentUser,
) -> SendMessageResponse:
    # Load conversation with messages (for context)
    result = await db.execute(
        select(ChatConversation)
        .where(ChatConversation.id == conv_id, ChatConversation.user_id == user.id)
        .options(selectinload(ChatConversation.messages))
    )
    conv: ChatConversation | None = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Save the user message
    user_msg = ChatMessage(
        conversation_id=conv_id,
        role="user",
        content=payload.message.strip(),
        attachments=payload.attachments,
    )
    db.add(user_msg)

    await db.flush()
    await db.refresh(user_msg)

    # ---- Chat assistant (no big workflow) ----
    from app.llm.client import get_llm
    from app.models.document import Document
    from app.models.schedule_event import ScheduleEvent
    from app.services.document_service import extract_text
    from app.tasks.embedding_tasks import _generate_summary  # reuse LLM summarizer
    from app.services.literature_search import search_literature as search_lit

    CHAT_SYSTEM = (
        "You are ClawScholar Chat: a helpful, natural assistant for academic researchers.\n"
        "- Always respond in English by default. If the user writes in another language, still respond in English.\n"
        "- Do NOT start large multi-agent workflows.\n"
        "- Use tools only when the user asks for actions or for information from the user's data (library, schedule, projects).\n"
        "- If the user says hello, respond briefly and naturally.\n"
        "- When listing PDFs, include filename and id.\n"
        "- When asked to create a calendar event, call the tool and then confirm what you created.\n"
        "- Keep answers concise unless the user asks for detail.\n"
        "- PROJECT QUERIES: When the user asks about their projects, workflows, or research status, use list_projects "
        "and get_project_summary. The summary includes the latest workflow status and agent log digest.\n"
        "- DOCUMENT MANAGEMENT: You can assign documents to projects with assign_document_to_project or "
        "remove them with remove_document_from_project. Always confirm the action.\n"
        "- PAPER SEARCH: When calling search_web_papers, ALWAYS set academic_query to a precise "
        "academic search string. Rules for academic_query: (1) remove conversational filler like "
        "'find papers about', 'search for', 'show me'; (2) expand abbreviations (e.g. 'EV' → "
        "'electric vehicle', 'ML' → 'machine learning', 'RL' → 'reinforcement learning'); "
        "(3) use technical terminology; (4) include relevant synonyms if helpful "
        "(e.g. 'battery management' → 'battery management system BMS state of charge estimation'). "
        "The academic_query is what gets sent to arXiv/Semantic Scholar — quality here determines result quality."
    )

    tools: list[dict] = [
        {
            "type": "function",
            "function": {
                "name": "list_library_pdfs",
                "description": "List all PDFs in the user's library.",
                "parameters": {
                    "type": "object",
                    "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 200}},
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "summarize_pdf",
                "description": "Summarize a PDF from the user's library by document id.",
                "parameters": {
                    "type": "object",
                    "properties": {"doc_id": {"type": "string"}},
                    "required": ["doc_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "search_web_papers",
                "description": (
                    "Search arXiv, Semantic Scholar and PubMed for academic papers. "
                    "Returns semantically ranked results with title, abstract, year, citation count and PDF link."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "The user's original query."},
                        "academic_query": {
                            "type": "string",
                            "description": (
                                "Reformulated academic search string optimised for arXiv/Semantic Scholar. "
                                "No conversational filler. Expand abbreviations. Use technical terminology."
                            ),
                        },
                        "sources": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Sources to search: arxiv, semantic_scholar, pubmed. Default: [arxiv, semantic_scholar].",
                        },
                        "max_per_source": {"type": "integer", "minimum": 1, "maximum": 20},
                    },
                    "required": ["query"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "save_paper_pdf",
                "description": "Download a paper PDF from a URL and save it to the user's library.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string"},
                        "title": {"type": "string"},
                        "source_type": {"type": "string"},
                    },
                    "required": ["url"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "create_calendar_event",
                "description": "Create a schedule event for the user.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "start_at": {"type": "string", "description": "ISO 8601 datetime with timezone"},
                        "end_at": {"type": "string", "description": "ISO 8601 datetime with timezone"},
                        "all_day": {"type": "boolean"},
                    },
                    "required": ["title", "start_at", "end_at"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "list_calendar_events",
                "description": "List schedule events between optional start/end ISO datetimes.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "start": {"type": "string"},
                        "end": {"type": "string"},
                        "limit": {"type": "integer", "minimum": 1, "maximum": 200},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "list_projects",
                "description": "List all of the user's research projects with their status and workflow count.",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_project_summary",
                "description": (
                    "Get a detailed summary of a specific project: title, description, "
                    "latest workflow status, goal, and a digest of recent agent log messages."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {"project_id": {"type": "string"}},
                    "required": ["project_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "assign_document_to_project",
                "description": "Assign a document from the user's library to a specific project.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "doc_id": {"type": "string"},
                        "project_id": {"type": "string"},
                    },
                    "required": ["doc_id", "project_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "remove_document_from_project",
                "description": "Remove a document from its current project assignment.",
                "parameters": {
                    "type": "object",
                    "properties": {"doc_id": {"type": "string"}},
                    "required": ["doc_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "list_project_documents",
                "description": "List all documents assigned to a specific project.",
                "parameters": {
                    "type": "object",
                    "properties": {"project_id": {"type": "string"}},
                    "required": ["project_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "trigger_writer_agent",
                "description": (
                    "Start the Writer Agent to compose a document (paper, summary, article, draft) "
                    "from the user's library. Call this when the user asks to write, draft, compose, "
                    "or create any kind of written document."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "doc_type": {
                            "type": "string",
                            "enum": ["paper", "summary", "article", "draft"],
                            "description": "Type of document to compose",
                        },
                        "title": {"type": "string", "description": "Proposed document title"},
                        "initial_request": {
                            "type": "string",
                            "description": "The user's full writing request verbatim",
                        },
                        "project_id": {
                            "type": "string",
                            "description": "Optional project id when the writing belongs to an existing project",
                        },
                    },
                    "required": ["doc_type", "initial_request"],
                },
            },
        },
    ]

    async def _tool_list_library_pdfs(limit: int = 100) -> dict:
        q = (
            select(Document)
            .where(Document.user_id == user.id, Document.file_type == "PDF")
            .order_by(Document.created_at.desc())
            .limit(limit)
        )
        res = await db.execute(q)
        docs = res.scalars().all()
        return {
            "pdfs": [
                {
                    "id": str(d.id),
                    "filename": d.filename,
                    "summary": d.summary,
                    "created_at": d.created_at.isoformat(),
                    "source_url": d.source_url,
                }
                for d in docs
            ]
        }

    async def _tool_summarize_pdf(doc_id: str) -> dict:
        try:
            doc_uuid = uuid.UUID(doc_id)
        except Exception:
            return {"error": "Invalid doc_id"}

        res = await db.execute(select(Document).where(Document.id == doc_uuid, Document.user_id == user.id))
        doc = res.scalar_one_or_none()
        if not doc:
            return {"error": "Document not found"}
        if doc.file_type != "PDF":
            return {"error": "Document is not a PDF"}

        if doc.summary:
            return {"doc_id": doc_id, "filename": doc.filename, "summary": doc.summary}

        text = extract_text(doc.storage_path, doc.file_type)
        if not text.strip():
            return {"error": "Could not extract text from PDF"}

        summary = await _generate_summary(text)  # uses LLM, truncated internally by caller
        if summary:
            doc.summary = summary
            await db.flush()
            await db.refresh(doc)
            await db.commit()
        return {"doc_id": doc_id, "filename": doc.filename, "summary": summary or ""}

    async def _tool_search_web_papers(
        query: str,
        academic_query: str | None = None,
        sources: list[str] | None = None,
        max_per_source: int = 8,
    ) -> dict:
        # Prefer the LLM-reformulated academic query for better precision
        effective_query = " ".join(str(academic_query or query or "").strip().split())
        if not effective_query:
            return {"error": "Empty query"}
        src = sources or ["arxiv", "semantic_scholar"]
        results = await search_lit(query=effective_query, sources=src, max_per_source=int(max_per_source))
        trimmed = []
        for r in results[:12]:
            trimmed.append(
                {
                    "title": r.get("title", ""),
                    "authors": (r.get("authors") or [])[:6],
                    "year": r.get("year"),
                    "source": r.get("source"),
                    "url": r.get("url"),
                    "pdf_url": r.get("pdf_url"),
                    "doi": r.get("doi"),
                    "abstract": (r.get("abstract") or "")[:400],
                }
            )
        return {"results": trimmed}

    async def _tool_save_paper_pdf(url: str, title: str | None = None, source_type: str | None = None) -> dict:
        from app.config import get_settings
        from app.services.pdf_download import download_pdf
        from app.tasks.embedding_tasks import index_document

        settings = get_settings()
        url_s = str(url or "").strip()
        if not url_s:
            return {"error": "Empty url"}

        try:
            downloaded = await download_pdf(url_s)
        except Exception as exc:
            return {"error": f"Failed to download PDF: {exc}"}

        user_dir = os.path.join(settings.upload_dir, str(user.id))
        os.makedirs(user_dir, exist_ok=True)
        file_id = uuid.uuid4()
        storage_path = os.path.join(user_dir, f"{file_id}.pdf")
        with open(storage_path, "wb") as f:
            f.write(downloaded.content)

        raw_filename = (str(title or "").strip() or url_s.split("/")[-1].split("?")[0] or f"paper_{file_id}.pdf").strip()
        if not raw_filename.lower().endswith(".pdf"):
            raw_filename = raw_filename[:240].rstrip() + ".pdf"

        doc = Document(
            user_id=user.id,
            filename=raw_filename[:500],
            file_type="PDF",
            storage_path=storage_path,
            source_url=url_s[:1000],
            source_type=(str(source_type or "web")[:20]),
        )
        db.add(doc)
        await db.flush()
        await db.refresh(doc)
        await db.commit()

        background_tasks.add_task(index_document, str(doc.id))
        return {"document": {"id": str(doc.id), "filename": doc.filename, "source_url": doc.source_url}}

    async def _tool_create_calendar_event(
        title: str,
        start_at: str,
        end_at: str,
        description: str | None = None,
        all_day: bool = False,
    ) -> dict:
        def _parse_dt(s: str) -> datetime:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=UTC)
            return dt

        try:
            start_dt = _parse_dt(start_at)
            end_dt = _parse_dt(end_at)
        except Exception:
            return {"error": "Invalid start_at/end_at (expected ISO 8601 datetime)"}

        if end_dt <= start_dt:
            return {"error": "end_at must be after start_at"}

        event = ScheduleEvent(
            user_id=user.id,
            title=title[:500],
            description=(description or "")[:5000] or None,
            start_at=start_dt,
            end_at=end_dt,
            all_day=bool(all_day),
            source="manual",
            color="#6366f1",
        )
        db.add(event)
        await db.flush()
        await db.refresh(event)
        await db.commit()
        return {
            "event": {
                "id": str(event.id),
                "title": event.title,
                "start_at": event.start_at.isoformat(),
                "end_at": event.end_at.isoformat(),
                "all_day": event.all_day,
            }
        }

    async def _tool_list_calendar_events(
        start: str | None = None,
        end: str | None = None,
        limit: int = 100,
    ) -> dict:
        def _parse(s: str) -> datetime:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=UTC)
            return dt

        q = select(ScheduleEvent).where(ScheduleEvent.user_id == user.id)
        if start:
            try:
                q = q.where(ScheduleEvent.end_at >= _parse(start))
            except Exception:
                return {"error": "Invalid start (expected ISO 8601 datetime)"}
        if end:
            try:
                q = q.where(ScheduleEvent.start_at <= _parse(end))
            except Exception:
                return {"error": "Invalid end (expected ISO 8601 datetime)"}
        q = q.order_by(ScheduleEvent.start_at).limit(limit)
        res = await db.execute(q)
        events = res.scalars().all()
        return {
            "events": [
                {
                    "id": str(e.id),
                    "title": e.title,
                    "start_at": e.start_at.isoformat(),
                    "end_at": e.end_at.isoformat(),
                    "all_day": e.all_day,
                }
                for e in events
            ]
        }

    async def _tool_list_projects() -> dict:
        res = await db.execute(
            select(Project).where(Project.user_id == user.id).order_by(Project.updated_at.desc())
        )
        projects = res.scalars().all()
        out = []
        for p in projects:
            cnt = await db.execute(
                select(WorkflowRun.id)
                .join(ResearchGoal)
                .where(ResearchGoal.project_id == p.id)
            )
            workflow_count = len(cnt.scalars().all())
            out.append({
                "id": str(p.id),
                "title": p.title,
                "description": p.description,
                "status": p.status,
                "workflow_count": workflow_count,
                "updated_at": p.updated_at.isoformat(),
            })
        return {"projects": out}

    async def _tool_get_project_summary(project_id: str) -> dict:
        try:
            pid = uuid.UUID(project_id)
        except Exception:
            return {"error": "Invalid project_id"}
        res = await db.execute(
            select(Project).where(Project.id == pid, Project.user_id == user.id)
        )
        project = res.scalar_one_or_none()
        if not project:
            return {"error": "Project not found"}

        # Latest workflow + goal
        wf_res = await db.execute(
            select(WorkflowRun, ResearchGoal)
            .join(ResearchGoal, WorkflowRun.goal_id == ResearchGoal.id)
            .where(ResearchGoal.project_id == pid)
            .order_by(WorkflowRun.created_at.desc())
            .limit(1)
        )
        row = wf_res.first()
        latest_wf = latest_goal = None
        if row:
            latest_wf, latest_goal = row

        # Recent agent logs for latest workflow
        log_messages: list[dict] = []
        if latest_wf:
            log_res = await db.execute(
                select(AgentLog)
                .where(AgentLog.run_id == latest_wf.id)
                .order_by(AgentLog.created_at.desc())
                .limit(20)
            )
            for log in reversed(log_res.scalars().all()):
                log_messages.append({
                    "agent": log.agent_type,
                    "action": log.action,
                    "message": log.message,
                })

        return {
            "project": {
                "id": str(project.id),
                "title": project.title,
                "description": project.description,
                "status": project.status,
            },
            "latest_workflow": {
                "id": str(latest_wf.id),
                "status": latest_wf.status,
                "goal": latest_goal.title if latest_goal else None,
                "goal_description": latest_goal.description if latest_goal else None,
                "started_at": latest_wf.started_at.isoformat() if latest_wf.started_at else None,
                "completed_at": latest_wf.completed_at.isoformat() if latest_wf.completed_at else None,
            } if latest_wf else None,
            "recent_agent_logs": log_messages,
        }

    async def _tool_assign_document_to_project(doc_id: str, project_id: str) -> dict:
        try:
            did = uuid.UUID(doc_id)
            pid = uuid.UUID(project_id)
        except Exception:
            return {"error": "Invalid doc_id or project_id"}
        doc_res = await db.execute(select(Document).where(Document.id == did, Document.user_id == user.id))
        doc = doc_res.scalar_one_or_none()
        if not doc:
            return {"error": "Document not found"}
        proj_res = await db.execute(select(Project).where(Project.id == pid, Project.user_id == user.id))
        if not proj_res.scalar_one_or_none():
            return {"error": "Project not found"}
        meta = dict(doc.metadata_ or {})
        meta["project_id"] = str(pid)
        doc.metadata_ = meta
        await db.flush()
        await db.commit()
        return {"success": True, "doc_id": doc_id, "project_id": project_id, "filename": doc.filename}

    async def _tool_remove_document_from_project(doc_id: str) -> dict:
        try:
            did = uuid.UUID(doc_id)
        except Exception:
            return {"error": "Invalid doc_id"}
        doc_res = await db.execute(select(Document).where(Document.id == did, Document.user_id == user.id))
        doc = doc_res.scalar_one_or_none()
        if not doc:
            return {"error": "Document not found"}
        meta = dict(doc.metadata_ or {})
        meta.pop("project_id", None)
        doc.metadata_ = meta
        await db.flush()
        await db.commit()
        return {"success": True, "doc_id": doc_id, "filename": doc.filename}

    async def _tool_list_project_documents(project_id: str) -> dict:
        try:
            pid = uuid.UUID(project_id)
        except Exception:
            return {"error": "Invalid project_id"}
        res = await db.execute(
            select(Document)
            .where(
                Document.user_id == user.id,
                Document.metadata_["project_id"].astext == str(pid),
            )
            .order_by(Document.created_at.desc())
        )
        docs = res.scalars().all()
        return {
            "documents": [
                {
                    "id": str(d.id),
                    "filename": d.filename,
                    "source_type": d.source_type,
                    "embedding_status": d.embedding_status,
                    "chunk_count": d.chunk_count,
                    "summary": (d.summary or "")[:300] if d.summary else None,
                }
                for d in docs
            ]
        }

    # Build chat history (last N messages) + new user message
    history = []
    for m in (conv.messages or [])[-20:]:
        if m.role in ("user", "assistant"):
            history.append({"role": m.role, "content": m.content})
    history.append({"role": "user", "content": payload.message.strip()})

    llm = await get_llm()
    messages: list[dict] = history

    # Tool-calling loop (max 3 tool turns)
    assistant_text = ""
    for _ in range(3):
        resp = await llm.run_chat_assistant(system=CHAT_SYSTEM, messages=messages, tools=tools, max_tokens=4096)
        tool_calls = resp.get("tool_calls") or []
        assistant_text = (resp.get("content") or "").strip()

        if not tool_calls:
            break

        # Append the assistant tool-call message
        messages.append(
            {
                "role": "assistant",
                "content": assistant_text or "",
                "tool_calls": tool_calls,
            }
        )

        for tc in tool_calls:
            fn = (tc.get("function") or {}).get("name")
            raw_args = (tc.get("function") or {}).get("arguments") or "{}"
            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args)
            except Exception:
                args = {}

            if fn == "list_library_pdfs":
                out = await _tool_list_library_pdfs(limit=int(args.get("limit") or 100))
            elif fn == "summarize_pdf":
                out = await _tool_summarize_pdf(str(args.get("doc_id") or ""))
            elif fn == "search_web_papers":
                out = await _tool_search_web_papers(
                    query=str(args.get("query") or ""),
                    academic_query=(str(args.get("academic_query") or "") or None),
                    sources=(args.get("sources") if isinstance(args.get("sources"), list) else None),
                    max_per_source=int(args.get("max_per_source") or 8),
                )
            elif fn == "save_paper_pdf":
                out = await _tool_save_paper_pdf(
                    url=str(args.get("url") or ""),
                    title=(str(args.get("title") or "") or None),
                    source_type=(str(args.get("source_type") or "") or None),
                )
            elif fn == "create_calendar_event":
                out = await _tool_create_calendar_event(
                    title=str(args.get("title") or ""),
                    description=str(args.get("description") or "") or None,
                    start_at=str(args.get("start_at") or ""),
                    end_at=str(args.get("end_at") or ""),
                    all_day=bool(args.get("all_day") or False),
                )
            elif fn == "list_calendar_events":
                out = await _tool_list_calendar_events(
                    start=(str(args.get("start") or "") or None),
                    end=(str(args.get("end") or "") or None),
                    limit=int(args.get("limit") or 100),
                )
            elif fn == "list_projects":
                out = await _tool_list_projects()
            elif fn == "get_project_summary":
                out = await _tool_get_project_summary(str(args.get("project_id") or ""))
            elif fn == "assign_document_to_project":
                out = await _tool_assign_document_to_project(
                    doc_id=str(args.get("doc_id") or ""),
                    project_id=str(args.get("project_id") or ""),
                )
            elif fn == "remove_document_from_project":
                out = await _tool_remove_document_from_project(str(args.get("doc_id") or ""))
            elif fn == "list_project_documents":
                out = await _tool_list_project_documents(str(args.get("project_id") or ""))
            elif fn == "trigger_writer_agent":
                from app.services.writer_service import create_writing_run as _svc_create_wr
                wr_result = await _svc_create_wr(
                    user_id=str(user.id),
                    title=str(args.get("title") or ""),
                    doc_type=str(args.get("doc_type") or "summary"),
                    initial_request=str(args.get("initial_request") or payload.message),
                    source_doc_ids=None,
                    project_id=str(args.get("project_id") or "") or None,
                    db=db,
                )
                await db.commit()
                out = {
                    "writer_run": {
                        "run_id": wr_result["run_id"],
                        "doc_type": args.get("doc_type", "summary"),
                        "title": args.get("title", ""),
                        "status": "CLARIFYING",
                    },
                    "message": (
                        f"I've started the Writer Agent for your {args.get('doc_type', 'document')}. "
                        "Open the Writer page to answer a few clarifying questions and begin composing."
                    ),
                }
            else:
                out = {"error": f"Unknown tool: {fn}"}

            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.get("id"),
                    "content": json.dumps(out, ensure_ascii=False),
                }
            )

    assistant_msg = ChatMessage(
        conversation_id=conv_id,
        role="assistant",
        content=assistant_text or "Okay.",
        attachments=[],
    )
    db.add(assistant_msg)

    await db.flush()
    await db.refresh(assistant_msg)

    conv.updated_at = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    await db.commit()

    return SendMessageResponse(
        user_message=ChatMessageOut.model_validate(user_msg),
        assistant_message=ChatMessageOut.model_validate(assistant_msg),
    )
