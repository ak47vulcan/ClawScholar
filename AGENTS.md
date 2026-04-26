# AGENTS.md — ClawScholar Codebase Guide

> **Purpose of this file:** Structured guide for AI assistants working on this codebase. Explains what ClawScholar is, why each file exists, and how the system hangs together. **Read this before touching any file. Keep it up-to-date when adding files or changing architecture.**

---

## What is ClawScholar?

ClawScholar is a **proactive, multi-agent research automation platform** built for academic researchers.

It is **not** a chatbot. It is a system that:

1. Accepts a natural-language research goal ("Analyse ML publication trends in 2024")
2. Decomposes it into atomic sub-tasks via the **Scheduler Agent**
3. Executes Python data analysis in a sandboxed container via the **Analyst Agent**
4. Validates every claim against a private knowledge base via the **Librarian Agent**
5. Delivers only verified, cited results to the researcher
6. Composes publication-ready documents from library sources via the **Writer Agent**

**Core differentiator:** The **Validation Loop** ensures Analyst output is never shown to the user without Librarian sign-off. If rejected, the Analyst retries with feedback (max 3 iterations).

**Key architecture principle:** Every LLM call in the system flows through a **single entry point** — `backend/app/llm/client.py` — which implements the OpenAI integration.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────┐
│  Channels: WeChat · Telegram · Web Dashboard                       │
└────────────────────────────┬───────────────────────────────────────┘
                             │ webhook / REST / WebSocket
┌────────────────────────────▼───────────────────────────────────────┐
│  LLM Layer  (backend/app/llm/)                                     │
│  client.py  — ALL LLM calls (OpenAI)                               │
│  Skills  (backend/app/skills/) — injected into system prompts      │
└────────────────────────────┬───────────────────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────────────────┐
│  Orchestrator  (backend/app/agents/orchestrator.py)                │
│  Custom state-graph: PLANNING → EXECUTING → REVIEWING → DONE       │
│   ├── Scheduler  → prompts.py · models.py                          │
│   ├── Analyst    → prompts.py · models.py · sandbox_client.py      │
│   └── Librarian  → prompts.py · models.py · rag/                   │
│            ↑  REJECTED (max 3×) ─────────────────────────┘         │
└──────┬──────────────────────┬──────────────────────────────────────┘
       │                      │
  PostgreSQL 16          Redis 7              Sandbox Container
  (+ pgvector)        (task queue)       (isolated code runner)

┌────────────────────────────────────────────────────────────────────┐
│  Writer Agent  (backend/app/agents/writer/)                        │
│  Independent async pipeline triggered via /writer API              │
│   CLARIFYING → OUTLINING → ALLOCATING → WRITING → ASSEMBLING → DONE│
│   Sequential section writing so each chapter receives prior context│
│   Coverage check: RAG retrieval + AI gap assessment                │
│   Export: python-docx (Word) · reportlab (PDF)                     │
└────────────────────────────────────────────────────────────────────┘
```

---

## Root-Level Files

| File | Purpose |
|---|---|
| `docker-compose.yml` | All 6 services: backend, frontend, postgres, redis, sandbox, worker. |
| `.env.example` | Annotated template for all env vars. Copy to `.env`, never commit. |
| `.gitignore` | Ignores `.env`, `__pycache__`, `.next`, `node_modules`, `uploads/`. |
| `Makefile` | `make up/logs/migrate/test/lint/shell`. |
| `README.md` | Human-facing overview with architecture diagram, quickstart, env table. |
| `AGENTS.md` | **This file.** Keep up-to-date. |
| `prompt` | Original product specification (German). Source of truth for intended features. Do not modify. |
| `docs/requirements_from_pdfs.md` | Extracted competition requirements + gap analysis (generated from PDF sources). |
| `Präsentation/` | Standalone browser presentation/demo app for a 6-minute ClawScholar walkthrough with realistic dummy data. |

---

## Backend (`backend/`)

Built with **FastAPI** (async), **SQLAlchemy 2.0** (async), **Alembic**, **structlog**.

### `backend/app/main.py`
FastAPI application factory. Uses `lifespan` to connect/disconnect PostgreSQL and Redis. Registers all API routers and the WebSocket endpoint. Adds CORS middleware and global exception handlers.

### `backend/app/config.py`
Pydantic `BaseSettings`. Reads all env vars from `.env`. Single import point for config — never read `os.environ` directly elsewhere.

Key settings:
- `openai_api_key` — OpenAI API key (required)
- `openai_model` — model id, e.g. `gpt-4.1-mini` (required)

### `backend/app/core/`

| File | Purpose |
|---|---|
| `database.py` | Async SQLAlchemy engine + `AsyncSessionFactory`. Exports `get_session` dependency. |
| `redis.py` | Async Redis connection pool. Exports `get_redis` dependency. |
| `security.py` | bcrypt password hashing + JWT encode/decode. No business logic. |
| `logging.py` | structlog with JSON in production, pretty-print in dev. Every log includes `request_id`. |
| `exceptions.py` | Custom exception classes + FastAPI handlers returning consistent JSON errors. |

### `backend/app/models/`

SQLAlchemy ORM models. All inherit from `base.py`'s `Base` with `UUIDMixin` + `TimestampMixin`.

| File | Table | Key Columns |
|---|---|---|
| `user.py` | `users` | `email`, `hashed_password`, `full_name`, `settings` (JSONB) |
| `project.py` | `projects` | `user_id` (FK), `title`, `description`, `status` (ACTIVE/ARCHIVED) |
| `goal.py` | `research_goals` | `user_id` (FK), `project_id` (FK, nullable), `title`, `description`, `status`, `deadline` |
| `workflow.py` | `workflow_runs` | `goal_id` (FK), `status`, `agent_states` (JSONB), `started_at`, `completed_at` |
| `agent_log.py` | `agent_logs` | `run_id` (FK), `agent_type`, `action`, `input_data`, `output_data`, `duration_ms` |
| `document.py` | `documents` | `user_id` (FK), `filename`, `file_type`, `storage_path`, `embedding_status` |
| `validation.py` | `validation_results` | `run_id` (FK), `analyst_output`, `librarian_verdict`, `confidence_score` |
| `writing_run.py` | `writing_runs` | `user_id` (FK), `project_id` (FK nullable), `source_workflow_id` (FK nullable), `title`, `doc_type`, `target_pages`, `status`, `phase_data` (JSONB) |
| `writing_section.py` | `writing_sections` | `run_id` (FK), `chapter_index`, `title`, `target_pages` (Numeric 5,1), `status`, `content_md`, `sources_used` (JSONB) |
| `writing_output.py` | `writing_outputs` | `run_id` (FK), `format` (md/docx/pdf), `storage_path` |

### `backend/app/schemas/`
Pydantic v2 request/response models. Pattern: `XCreate` (input), `XResponse` (output), `XUpdate` (partial update).

### `backend/app/api/`

| File | Responsibility |
|---|---|
| `deps.py` | `get_session`, `get_current_user` (JWT decode → DB lookup). |
| `v1/auth.py` | POST `/auth/register`, POST `/auth/login`. Returns access + refresh tokens. |
| `v1/projects.py` | CRUD for projects + `POST /projects/{id}/workflows` + `POST /projects/{id}/workflows/{run_id}/writing-intent` to queue Writer handoff after research + `POST /projects/clarify`. |
| `v1/goals.py` | CRUD for research goals. Requires auth. |
| `v1/workflows.py` | POST to start a workflow run; GET to list/get status. Triggers orchestrator. |
| `v1/documents.py` | POST `/documents/upload` (multipart); GET list; DELETE single document; POST `/documents/bulk-delete` for multi-select library deletion. |
| `v1/agents.py` | GET agent logs for a run. |
| `v1/settings.py` | GET/PUT user settings. |
| `v1/writer.py` | 9 Writer endpoints (see Writer Agent section below). |
| `websocket.py` | WebSocket at `/ws/agent-stream`. Pushes events via `broadcast_to_user`. |

### `backend/app/services/`

| File | Responsibility |
|---|---|
| `auth_service.py` | `register_user`, `authenticate_user`, JWT helpers. |
| `document_service.py` | File storage (disk / S3), PDF/CSV/XLSX parsing, triggers embedding task. |
| `workflow_service.py` | `create_workflow_run`, `list_workflow_runs`, `update_workflow_status`. |
| `notification_service.py` | `ConnectionManager` (WebSocket pool) + `emit_agent_log` + `emit_workflow_progress`. |
| `writer_service.py` | Core DB ops for writing runs: `create_writing_run`, `submit_clarify_answers`, `accept_outline_and_allocate`, `get_run_detail`, `list_runs`, `get_run_preview`, `delete_run`. |
| `writer_coverage_service.py` | Writer outline coverage: retrieves chapter evidence from indexed PDFs, runs an LLM sufficiency check, returns missing topics/search queries, and waits for newly downloaded PDFs to be indexed before re-checking. |
| `writer_source_service.py` | Creates project-visible source-acquisition workflows for Writer coverage gaps, runs literature search/download/indexing, re-checks coverage, and broadcasts Writer coverage updates. |
| `export_service.py` | `export_docx(markdown, doc_type) → Path` (python-docx) and `export_pdf(markdown, doc_type) → Path` (reportlab). Per-doc-type style configs (font, spacing, margins). |

---

## LLM Layer (`backend/app/llm/`)

This is the **central LLM integration layer**. All agent logic that calls an LLM goes through here.

### `client.py` — The single LLM entry point

`ClawScholarLLM` exposes methods for all seven LLM operations:

```python
# Research pipeline
await client.run_scheduler(goal_title, goal_description, initial_message) → dict
await client.run_analyst(goal_title, initial_message, librarian_verdict)  → dict
await client.run_librarian(analyst_output)                                 → dict

# Writer Agent
await client.run_writer_clarify(doc_type, initial_request, library_titles) → dict
await client.run_writer_outline(doc_type, clarify_answers, library_context) → dict
await client.run_writer_coverage_check(outline, retrieved_context, doc_type) → dict
await client.run_writer_section(chapter, retrieved_chunks, doc_type, style, preceding_summary) → dict
await client.run_writer_assemble(doc_type, sections_md, outline, style) → dict
```

All use `_call_tool(system, user, tool, tool_name, max_tokens)` internally. `get_llm()` is an async singleton factory.

### Skills (`backend/app/skills/`)

| File | Injected into | Key content |
|---|---|---|
| `SOUL.md` | All agents (prepended) | ClawScholar persona, core rules, routing logic |
| `SCHEDULER_SKILL.md` | Scheduler prompt | Decomposition rules, cognitive-weight formula, output format |
| `ANALYST_SKILL.md` | Analyst prompt | Observation-action loop, code quality rules, sandbox constraints |
| `LIBRARIAN_SKILL.md` | Librarian prompt | Validation steps, verdict decision rules, confidence calibration |
| `WRITER_SKILL.md` | Writer prompts (all 4) | Academic writing persona, doc-type style table, no-hallucination policy, citation rules |

---

## Agents (`backend/app/agents/`)

### `orchestrator.py`

Custom async state-graph. `OrchestratorState` dataclass holds all run state.

Nodes: `_run_scheduler → _run_analyst → _run_librarian`. Conditional edges implement the Validation Loop (`REJECTED` → retry Analyst, max 3×). Every node pushes real-time WebSocket events via `broadcast_to_user`. In `_finalize`, if documents were saved to the library, emits `WRITER_SUGGESTED` event so the frontend can show a "Start Writer" toast.

**Critical rule:** The edge `_run_analyst → _run_librarian` is unconditional. Analyst output **never** goes directly to the user.

### `scheduler/`, `analyst/`, `librarian/`

Each contains `prompts.py` (loads SOUL + skill file), `models.py` (Pydantic types). Analyst also has `sandbox_client.py` (Redis → Docker sandbox). Librarian has `rag/` (embeddings, retriever, reranker, indexer).

### `writer/`

| File | Purpose |
|---|---|
| `models.py` | Pydantic: `ClarifyQuestion`, `ClarifyOutput`, `Chapter`, `OutlineOutput`, `ChapterCoverage`, `CoverageOutput`, `SectionDraft`, `AssemblyOutput` |
| `prompts.py` | `build_clarify_prompt`, `build_outline_prompt`, `build_section_prompt`, `build_assembly_prompt` — each loads SOUL.md + WRITER_SKILL.md |
| `writer_orchestrator.py` | `run_writing_job(run_id, user_id)` — loads run+sections, maps unique PDF sources and summaries to chapters with global source keys, writes sections sequentially with previous-chapter context, writes the final abstract during assembly, appends deterministic references, persists `phase_data["full_markdown"]`, emits DONE |

### Writer API (`api/v1/writer.py`)

```
POST   /writer/runs                  → create run, returns questions
GET    /writer/runs                  → list runs
GET    /writer/runs/{id}             → full run detail with sections
POST   /writer/runs/{id}/clarify     → submit answers → LLM generates outline + coverage check
POST   /writer/runs/{id}/source-search → create project workflow for missing sources, search/download/index PDFs, re-check coverage
POST   /writer/runs/{id}/allocate    → submit page allocations → starts background writing job
GET    /writer/runs/{id}/preview     → full markdown
GET    /writer/runs/{id}/export/docx → StreamingResponse .docx
GET    /writer/runs/{id}/export/pdf  → StreamingResponse .pdf
DELETE /writer/runs/{id}             → 204
```

### `librarian/rag/`

| File | Purpose |
|---|---|
| `embeddings.py` | OpenAI `text-embedding-3-small` vectors. Redis cache 1 h. |
| `retriever.py` | Hybrid: pgvector cosine + BM25, fused with Reciprocal Rank Fusion. Also used by Writer coverage check (cosine ≥ 0.3, no LLM). |
| `reranker.py` | `CrossEncoderReranker` using `cross-encoder/ms-marco-MiniLM-L-6-v2`. Falls back to identity ranking. |
| `indexer.py` | Chunking (512 tokens, 50 overlap) → embedding → pgvector insert. |

### `backend/app/tasks/`

| File | Purpose |
|---|---|
| `worker.py` | arq `WorkerSettings`. Lists all task functions, Redis DSN, retry policy. |
| `embedding_tasks.py` | `embed_document(document_id)` — fetches, chunks, embeds, inserts into pgvector. |
| `cleanup_tasks.py` | `cleanup_old_logs` (30 d), `cleanup_old_runs` (90 d). Scheduled daily. |

---

## Sandbox (`sandbox/`)

Isolated Docker container. **No internet. Read-only FS. 1 CPU, 512 MB RAM.**

| File | Purpose |
|---|---|
| `executor.py` | Listens on Redis `sandbox:execute`. Runs security check → subprocess → captures stdout/plots (base64) → sends to `sandbox:result:{task_id}`. |
| `security.py` | AST walker that blocks dangerous imports before execution. |
| `requirements.txt` | `pandas`, `numpy`, `matplotlib`, `plotly`, `scipy`, `scikit-learn`, `openpyxl`. |
| `Dockerfile` | `python:3.12-slim`, `USER nobody`, no shell. |

---

## Frontend (`frontend/`)

Built with **Next.js 14 App Router**, **TypeScript strict mode**, **Tailwind CSS**, **Zustand**, **Framer Motion**.

### App Structure (`src/app/`)

| Route | What it renders |
|---|---|
| `/` | Redirects to `/dashboard` |
| `/auth/login` | Login form |
| `/auth/register` | Registration form |
| `/dashboard` | Project list + selected project detail with workflow pipeline + agent feed |
| `/workspace` | New project wizard + recent projects; with `?project=<id>`: full workspace |
| `/chat` | Conversational interface with inline tool-call badges + WriterRunCard integration |
| `/writer` | Writer Agent multi-phase wizard (see below) |
| `/library` | Upload zone + Index health + Document table |
| `/schedule` | Scheduled job list + upcoming runs |
| `/settings` | Theme, LLM provider (API keys) |
| `/help` | Searchable FAQ |

### Writer Page (`/writer`)

Multi-phase document composition wizard. URL deep-link: `/writer?run={id}` (navigated from chat `WriterRunCard`).

Phase flow driven by `activeRun.status`:

| Status | Panel rendered |
|---|---|
| no active run | `WriterIntakePanel` — doc-type pills + title + request textarea |
| `CLARIFYING` | `ClarifyPhasePanel` — dynamic questions (text / choice / multiselect / Radix Slider) |
| `OUTLINING` | Loading shimmer |
| `VALIDATING` / `ALLOCATING` | `OutlinePhasePanel` — Framer Motion `Reorder` drag-and-drop, inline editable titles, coverage indicators (RAG-based) |
| (after outline accept) | `AllocationPhasePanel` — stacked bar with draggable dividers (pointer capture), animated page count badges |
| `WRITING` / `ASSEMBLING` | `WritingProgressPanel` — real-time section progress via WebSocket |
| `DONE` | `WriterPreviewPanel` — custom Markdown renderer, Word/PDF download |

### Components (`src/components/`)

#### `layout/`
| Component | Purpose |
|---|---|
| `Sidebar.tsx` | Collapsible nav with live agent status dots. Includes Writer nav item (`PenLine` icon). |
| `Topbar.tsx` | Page header with compact Agent Load indicator, live status, command search, and actions. |
| `CommandPalette.tsx` | `⌘K` modal for keyboard navigation. |

#### `writer/`
| Component | Purpose |
|---|---|
| `WriterRunList.tsx` | Left sidebar: run list with doc-type badge, status, relative date, delete. |
| `WriterWorkspace.tsx` | Phase router with `AnimatePresence mode="wait"`. Manages `confirmedChapters` state for outline → allocation transition. |
| `WriterIntakePanel.tsx` | Doc-type pills (Paper/Article/Summary/Draft) + title + request textarea. |
| `ClarifyPhasePanel.tsx` | Dynamic clarifying questions; input types: textarea, choice pills, multiselect pills, Radix Slider. |
| `OutlinePhasePanel.tsx` | Framer Motion `Reorder.Group` for drag reorder; inline editable titles; coverage icons + source chips. |
| `AllocationPhasePanel.tsx` | Stacked bar (56px, colored segments); draggable dividers using `setPointerCapture`; Radix Slider for total pages. |
| `WritingProgressPanel.tsx` | Phase indicator (MAPPING_SOURCES→WRITING→ASSEMBLING→DONE); live agent focus panel, expandable per-section PDF summary cards, per-section status rows, overall progress bar. |
| `WriterPreviewPanel.tsx` | Custom line-by-line Markdown renderer; Copy MD / Export Word / Export PDF buttons. |

#### `chat/`
| Component | Purpose |
|---|---|
| `WriterRunCard.tsx` | Inline card in `MessageBubble` when assistant triggers Writer. Shows doc-type, title, "Open →" link to `/writer?run={id}`. |
| `MessageBubble.tsx` | Renders `WriterRunCard` when `attachment.writer_run` is present. |
| `ToolCallBadge.tsx` | Inline badges for tool calls. |

#### `dashboard/`, `workspace/`, `library/`, `shared/`
Workspace includes `WorkflowRefinementChat.tsx` as the controller for the floating project chat, `WorkflowFloatingChatPanel.tsx` for the bottom-right overlay, plus `WorkflowChatMessages.tsx`, `WorkflowChatComposer.tsx`, and `workflow-refinement-suggestions.ts` for the overlay body/input.

### State Management (`src/stores/`)

| Store | What it holds | Persisted? |
|---|---|---|
| `auth-store.ts` | `user`, `accessToken`, `refreshToken`. | Yes (localStorage) |
| `project-store.ts` | `projects`, `selectedProjectId`, `detailCache`. | Partial (selectedProjectId only) |
| `agent-store.ts` | `logs` (max 200), `agentStatuses` (SCHEDULER/ANALYST/LIBRARIAN/ORCHESTRATOR/**WRITER**), `isStreaming`, `activeRunId`. | No |
| `workflow-store.ts` | `workflows`, `cognitiveLoad`, `selectedWorkflowId`. | No |
| `document-store.ts` | `documents`, `uploadQueue`, `searchQuery`. | No |
| `writer-store.ts` | `runs: WriterRun[]`, `activeRunId`, `isLoading`. Actions: `loadRuns`, `loadRun`, `createRun`, `submitClarify`, `acceptOutlineAndAllocate`, `deleteRun`, `updateRunFromWS`, `updateSectionFromWS`. | No |
| `ui-store.ts` | `sidebarOpen`, `theme`, `commandPaletteOpen`, `toasts`. | Yes |
| `chat-store.ts` | `conversations`, `messages`, `activeConversationId`. `ChatAttachment` now includes optional `writer_run` payload field. | Partial |

### Hooks (`src/hooks/`)

| Hook | Purpose |
|---|---|
| `use-websocket.ts` | Generic WebSocket hook with auto-reconnect. |
| `use-agent-stream.ts` | Dispatches to stores for: `AGENT_LOG`, `STATUS_UPDATE`, `WORKFLOW_PROGRESS`, `WRITER_PROGRESS`, `WRITER_SECTION_DONE`, `WRITER_SECTION_PROGRESS`, `WRITER_SUGGESTED`. |
| `use-auth.ts` | Wraps `auth-store` with router navigation. |
| `use-upload.ts` | Calls `api.upload`, updates `document-store`, shows toast. |
| `use-workflow-refinement-chat.ts` | Holds project chat state, conversation creation, refinement messages, and follow-up workflow starts for the floating workspace chat. |
| `use-workflow-writing-intent.ts` | Detects write/draft requests in the workflow chat, queues them against the active workflow, and opens the Writer run when it is ready. |

### Library (`src/lib/`)

| File | Purpose |
|---|---|
| `api-client.ts` | Typed `fetch` wrapper. Also exposes `api.fetchBlob` for file download (writer export). |
| `constants.ts` | `API_BASE`, `WS_BASE`, agent types (incl. `WRITER`), `AGENT_COLORS` (WRITER = `#ec4899`), `KANBAN_COLUMNS`, `WORKFLOW_STATUSES`. |
| `utils.ts` | `cn()`, `formatDate`, `formatTime`, `formatRelative`, `truncate`, `fileTypeIcon`. |
| `mock-data.ts` | Static mock data. Only loaded in `development` mode. |
| `motion-variants.ts` | Framer Motion `Variants` objects. Import here; don't define inline in components. |
| `chat-tool-parser.ts` | Parses tool-hint markers from assistant messages for `ToolCallBadge`. |

### Types (`src/types/`)

| File | Purpose |
|---|---|
| `agent.ts` | `AgentLogEntry`, `WorkflowCard`, `DocumentItem`, `AgentStreamMessage`. |
| `user.ts` | `User`, `TokenResponse`. |
| `api.ts` | API request/response types mirroring backend Pydantic schemas. |
| `workflow.ts` | `SubTask`, `WorkflowRun`, `CognitiveLoadBreakdown`, `DeepWorkBlock`. |
| `writer.ts` | `WriterPhase`, `DocType`, `ClarifyQuestion`, `Chapter`, `OutlineData`, `ChapterCoverage`, `CoverageData`, `WritingSection`, `ChapterAllocation`, `WriterRun`. |

---

## Scripts (`scripts/`)

| Script | Purpose |
|---|---|
| `seed_db.py` | Inserts demo user + goals + runs for local development. |
| `health_check.sh` | Verifies all 4 services are healthy. |
| `generate_api_types.sh` | Generates `frontend/src/types/generated-api.ts` from live OpenAPI schema. |

---

## Alembic Migrations (`backend/alembic/versions/`)

| File | Creates |
|---|---|
| `001_*` | Core tables: users, projects, research_goals, workflow_runs, agent_logs, documents, validation_results |
| `002_*` | Chat tables (conversations, messages) |
| `003_add_writer_agent.py` | `writing_runs`, `writing_sections`, `writing_outputs` |
| `007_link_writer_runs_to_projects.py` | Adds `project_id` and `source_workflow_id` to `writing_runs` so Writer source searches appear as project workflows. |

---

## Environment Variables

| Variable | Used by | Notes |
|---|---|---|
| `OPENAI_API_KEY` | `llm/client.py` | ✅ Required |
| `OPENAI_MODEL` | `llm/client.py` | ✅ Required (e.g. `gpt-4.1-mini`) |
| `EMBEDDINGS_API_KEY` | `librarian/rag/embeddings.py` | Optional (BM25 only if absent) |
| `EMBEDDINGS_BASE_URL` | `librarian/rag/embeddings.py` | Optional (for OpenAI-compatible embeddings) |
| `EMBEDDINGS_MODEL` | `librarian/rag/embeddings.py` | Default `text-embedding-3-small` |
| `DATABASE_URL` | `core/database.py` | ✅ Required |
| `REDIS_URL` | `core/redis.py` + sandbox | ✅ Required |
| `JWT_SECRET_KEY` | `auth_service.py` | ✅ Required |
| `NEXT_PUBLIC_API_URL` | `api-client.ts` | ✅ Required |
| `NEXT_PUBLIC_WS_URL` | `use-websocket.ts` | ✅ Required |
| `SANDBOX_TIMEOUT_SECONDS` | `sandbox/executor.py` | Default 30 |

---

## What is NOT Yet Implemented

| Feature | Where it goes | Notes |
|---|---|---|
| **Calendar write-back** | New: `agents/` + `/schedule` | Creates deep-work blocks, scored by cognitive load |
| **Google Calendar OAuth** | `api/v1/auth.py` + scheduler | Callback stub exists |
| **Citation export (BibTeX/RIS)** | `librarian/` + `/library` page | `format_citation` returns stub |
| **Streaming code output** | `analyst/` + WebSocket | Currently returns full output at end |
| **Cross-encoder GPU inference** | `librarian/rag/reranker.py` | CPU-only today |
| **Tests** | `backend/tests/` (empty) | Add pytest + httpx async client |

---

## Coding Rules (Enforce These)

1. **No direct DB access in routes.** Always go through a service function.
2. **No Analyst output to the user without Librarian approval.** The validation loop is non-negotiable.
3. **No secrets in code.** All config via `app/config.py` → `.env`.
4. **Files under 200 lines.** If a file grows beyond that, split it.
5. **Structured logging everywhere.** Use `structlog.get_logger(__name__)`. Include `run_id` in agent log calls.
6. **Async everywhere in backend.** No `time.sleep`, no synchronous SQLAlchemy, no `requests`.
7. **`"use client"` only where needed in frontend.** Prefer Server Components.
8. **Graceful degradation.** If RAG fails → `PARTIAL`, not crash. If gateway fails → fall back to direct mode.
9. **TypeScript strict mode.** No `any`. No `@ts-ignore`. Fix the type.
10. **Update `AGENTS.md` when adding new files or changing architecture.**
11. **`llm/client.py` is the single LLM gateway.** Never call provider SDKs directly from agent or orchestrator code — always go through `get_llm()`.
12. **Never send unvalidated content to messaging channels.** Librarian verdict must be `APPROVED` or `PARTIAL` before sending results to WeChat/Telegram.
13. **Language policy:** repository content is English. Developer chat may be German; do not translate code/docs into German.
