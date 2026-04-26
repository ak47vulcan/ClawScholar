"""ClawScholar — unified LLM execution layer (OpenAI).

This module is the single entry point for all LLM calls in the system.
Configure via:
  OPENAI_API_KEY=sk-...
  OPENAI_MODEL=gpt-4.1-mini
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from app.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

MAX_ANALYST_RETRIES = 3


_SCHEDULER_TOOL: dict[str, Any] = {
    "name": "output_schedule",
    "description": "Structured schedule decomposition of the research goal",
    "input_schema": {
        "type": "object",
        "properties": {
            "goal_summary": {"type": "string"},
            "tasks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "estimated_hours": {"type": "number"},
                        "cognitive_weight": {"type": "integer"},
                        "priority_score": {"type": "number"},
                        "dependencies": {"type": "array", "items": {"type": "string"}},
                        "tags": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["id", "title", "description", "estimated_hours", "cognitive_weight", "priority_score"],
                },
            },
            "total_estimated_hours": {"type": "number"},
            "recommended_schedule": {"type": "string"},
        },
        "required": ["goal_summary", "tasks", "total_estimated_hours"],
    },
}

_ANALYST_TOOL: dict[str, Any] = {
    "name": "submit_analysis",
    "description": "Submit the complete analysis with Python code and findings",
    "input_schema": {
        "type": "object",
        "properties": {
            "code": {
                "type": "string",
                "description": "Optional Python code to execute. Leave empty if no code execution is required.",
            },
            "findings": {"type": "string", "description": "Key findings from the analysis"},
            "methodology": {"type": "string", "description": "Methodology description"},
            "limitations": {"type": "string", "description": "Known limitations"},
        },
        "required": ["findings", "methodology"],
    },
}

_WRITER_CLARIFY_TOOL: dict[str, Any] = {
    "name": "generate_clarifications",
    "description": "Generate clarifying questions before writing a document",
    "input_schema": {
        "type": "object",
        "properties": {
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "question": {"type": "string"},
                        "input_type": {"type": "string", "enum": ["text", "choice", "multiselect", "scale"]},
                        "options": {"type": "array", "items": {"type": "string"}},
                        "scale_min": {"type": "integer"},
                        "scale_max": {"type": "integer"},
                        "hint": {"type": "string"},
                        "required": {"type": "boolean"},
                    },
                    "required": ["id", "question", "input_type"],
                },
            }
        },
        "required": ["questions"],
    },
}

_WRITER_OUTLINE_TOOL: dict[str, Any] = {
    "name": "generate_outline",
    "description": "Generate a structured document outline with chapters",
    "input_schema": {
        "type": "object",
        "properties": {
            "document_title": {"type": "string"},
            "abstract": {"type": "string"},
            "total_suggested_pages": {"type": "integer"},
            "chapters": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "index": {"type": "integer"},
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "key_points": {"type": "array", "items": {"type": "string"}},
                        "target_pages": {"type": "number"},
                    },
                    "required": ["index", "title", "description", "target_pages"],
                },
            },
        },
        "required": ["document_title", "abstract", "chapters", "total_suggested_pages"],
    },
}

_WRITER_SECTION_TOOL: dict[str, Any] = {
    "name": "write_section",
    "description": "Write a single document section in Markdown",
    "input_schema": {
        "type": "object",
        "properties": {
            "content_md": {"type": "string", "description": "Section content in Markdown (no heading)"},
            "word_count": {"type": "integer"},
            "citations": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["content_md", "word_count"],
    },
}

_WRITER_COVERAGE_TOOL: dict[str, Any] = {
    "name": "assess_outline_coverage",
    "description": "Assess whether the library has enough sources to support a proposed document outline",
    "input_schema": {
        "type": "object",
        "properties": {
            "overall_score": {"type": "number", "minimum": 0.0, "maximum": 1.0},
            "status": {"type": "string", "enum": ["SUFFICIENT", "PARTIAL", "INSUFFICIENT"]},
            "summary": {"type": "string"},
            "missing_topics": {"type": "array", "items": {"type": "string"}},
            "suggested_queries": {"type": "array", "items": {"type": "string"}},
            "chapters": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "chapter_index": {"type": "integer"},
                        "coverage_score": {"type": "number", "minimum": 0.0, "maximum": 1.0},
                        "rationale": {"type": "string"},
                        "missing_topics": {"type": "array", "items": {"type": "string"}},
                        "suggested_queries": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["chapter_index", "coverage_score", "rationale"],
                },
            },
        },
        "required": ["overall_score", "status", "summary", "chapters"],
    },
}

_WRITER_ASSEMBLE_TOOL: dict[str, Any] = {
    "name": "assemble_document",
    "description": "Assemble all sections into a complete document with abstract and bibliography",
    "input_schema": {
        "type": "object",
        "properties": {
            "full_document_md": {"type": "string", "description": "Complete document in Markdown"},
            "word_count": {"type": "integer"},
            "page_estimate": {"type": "number"},
        },
        "required": ["full_document_md", "word_count", "page_estimate"],
    },
}

_LIBRARIAN_TOOL: dict[str, Any] = {
    "name": "submit_verdict",
    "description": "Submit validation verdict for the analyst output",
    "input_schema": {
        "type": "object",
        "properties": {
            "verdict": {"type": "string", "enum": ["APPROVED", "REJECTED", "PARTIAL"]},
            "confidence_score": {"type": "number", "minimum": 0.0, "maximum": 1.0},
            "evidence_sources": {
                "type": "array",
                "items": {"type": "object", "properties": {"title": {"type": "string"}, "relevance": {"type": "number"}}},
            },
            "rejection_reason": {"type": "string"},
            "validation_notes": {"type": "string"},
        },
        "required": ["verdict", "confidence_score"],
    },
}


class ClawScholarLLM:
    """Single entry point for all agent LLM execution in ClawScholar."""

    def __init__(self) -> None:
        s = get_settings()
        self._api_key = (s.openai_api_key or "").strip()
        self._model = (s.openai_model or "").strip()

        if not self._api_key:
            raise RuntimeError("Missing OPENAI_API_KEY (required)")
        if not self._model:
            raise RuntimeError("Missing OPENAI_MODEL (required)")

        logger.info("LLM client initialised", provider="openai", model=self._model)

    def _client(self):  # type: ignore[return]
        from openai import AsyncOpenAI
        import httpx

        return AsyncOpenAI(
            api_key=self._api_key,
            timeout=httpx.Timeout(connect=10.0, read=90.0, write=90.0, pool=90.0),
        )

    @staticmethod
    def _to_openai_tools(tool: dict[str, Any]) -> list[dict[str, Any]]:
        return [
            {
                "type": "function",
                "function": {
                    "name": tool["name"],
                    "description": tool.get("description", ""),
                    "parameters": tool.get("input_schema", {"type": "object", "properties": {}}),
                },
            }
        ]

    async def _call_tool(
        self,
        *,
        system: str,
        user: str,
        tool: dict[str, Any],
        tool_name: str,
        max_tokens: int,
    ) -> dict[str, Any]:
        import httpx

        _RETRYABLE = (
            httpx.ConnectError,
            httpx.ReadTimeout,
            httpx.WriteTimeout,
            httpx.RemoteProtocolError,
            httpx.ConnectTimeout,
        )
        last_exc: Exception | None = None
        for attempt in range(4):  # up to 3 retries
            if attempt > 0:
                wait = min(2 ** attempt, 16)
                logger.warning(
                    "LLM transient error, retrying",
                    attempt=attempt,
                    wait_seconds=wait,
                    error=str(last_exc),
                    tool=tool_name,
                )
                await asyncio.sleep(wait)
            try:
                return await self._call_tool_once(
                    system=system,
                    user=user,
                    tool=tool,
                    tool_name=tool_name,
                    max_tokens=max_tokens,
                )
            except _RETRYABLE as exc:
                last_exc = exc
            except Exception:
                raise

        raise RuntimeError(f"LLM call failed after retries: {last_exc}") from last_exc

    async def _call_tool_once(
        self,
        *,
        system: str,
        user: str,
        tool: dict[str, Any],
        tool_name: str,
        max_tokens: int,
    ) -> dict[str, Any]:
        client = self._client()
        # Some newer OpenAI models (e.g. GPT-5.x) require `max_completion_tokens`
        # instead of `max_tokens`. We support both via a small fallback.
        try:
            resp = await client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                tools=self._to_openai_tools(tool),
                tool_choice={"type": "function", "function": {"name": tool_name}},
                max_completion_tokens=max_tokens,
            )
        except Exception as e:
            # Fallback for older models/APIs that still expect `max_tokens`.
            if "max_completion_tokens" not in str(e):
                raise
            resp = await client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                tools=self._to_openai_tools(tool),
                tool_choice={"type": "function", "function": {"name": tool_name}},
                max_tokens=max_tokens,
            )

        msg = resp.choices[0].message
        if msg.tool_calls:
            for tc in msg.tool_calls:
                if tc.type == "function" and tc.function and tc.function.name == tool_name:
                    args = tc.function.arguments or "{}"
                    return json.loads(args) if isinstance(args, str) else dict(args)

        content = (msg.content or "").strip()
        try:
            return json.loads(content) if content else {}
        except Exception:
            return {}

    async def run_scheduler(
        self,
        *,
        goal_title: str,
        goal_description: str | None,
        initial_message: str | None,
    ) -> dict[str, Any]:
        from app.agents.scheduler.models import SchedulerOutput
        from app.agents.scheduler.prompts import SCHEDULER_SYSTEM_PROMPT

        query = f"Research Goal: {goal_title}"
        if goal_description:
            query += f"\n\nDescription: {goal_description}"
        if initial_message:
            query += f"\n\nAdditional context: {initial_message}"

        tool_input = await self._call_tool(
            system=SCHEDULER_SYSTEM_PROMPT,
            user=query,
            tool=_SCHEDULER_TOOL,
            tool_name="output_schedule",
            max_tokens=16384,
        )
        output = SchedulerOutput.model_validate(tool_input)
        return output.model_dump()

    async def run_analyst(
        self,
        *,
        goal_title: str,
        initial_message: str | None,
        librarian_rejection: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        from app.agents.analyst.models import AnalystOutput
        from app.agents.analyst.prompts import ANALYST_SYSTEM_PROMPT, ANALYST_CORRECTION_PROMPT
        from app.agents.analyst.sandbox_client import execute_in_sandbox

        user_msg = f"Research question: {goal_title}"
        if initial_message:
            user_msg += f"\n\nContext: {initial_message}"
        if librarian_rejection and librarian_rejection.get("rejection_reason"):
            user_msg += f"\n\nPrevious attempt was rejected: {librarian_rejection['rejection_reason']}. Please revise."

        messages: list[dict[str, Any]] = [{"role": "user", "content": user_msg}]

        for attempt in range(MAX_ANALYST_RETRIES):
            user_text = "\n\n".join(m.get("content", "") for m in messages if m.get("role") == "user")
            tool_input = await self._call_tool(
                system=ANALYST_SYSTEM_PROMPT,
                user=user_text,
                tool=_ANALYST_TOOL,
                tool_name="submit_analysis",
                max_tokens=16384,
            )

            if not tool_input:
                break

            code = tool_input.get("code", "")
            if not str(code).strip():
                return AnalystOutput(
                    findings=tool_input.get("findings", ""),
                    methodology=tool_input.get("methodology", ""),
                    limitations=tool_input.get("limitations"),
                    execution_attempts=attempt + 1,
                ).model_dump()

            exec_result = await execute_in_sandbox(str(code))
            stdout = exec_result.get("stdout", "")
            stderr = exec_result.get("stderr", "")
            exit_code = exec_result.get("exit_code", 0)
            plots = exec_result.get("plots", [])

            if exit_code == 0:
                return AnalystOutput(
                    code=str(code),
                    stdout=stdout,
                    stderr=stderr,
                    plots=plots,
                    findings=tool_input.get("findings", stdout[:500]),
                    methodology=tool_input.get("methodology", ""),
                    limitations=tool_input.get("limitations"),
                    execution_attempts=attempt + 1,
                ).model_dump()

            correction = ANALYST_CORRECTION_PROMPT.format(stderr=stderr, code=code)
            messages.append({"role": "assistant", "content": f"[Attempt {attempt + 1} failed]"})
            messages.append({"role": "user", "content": correction})

        return AnalystOutput(
            findings="Analysis could not be completed after maximum retries.",
            methodology="",
            error="Max execution attempts reached",
            execution_attempts=MAX_ANALYST_RETRIES,
        ).model_dump()

    async def run_librarian(
        self,
        analyst_output: dict[str, Any],
        *,
        retrieved_context: str = "",
    ) -> dict[str, Any]:
        from app.agents.librarian.prompts import LIBRARIAN_SYSTEM_PROMPT

        findings = analyst_output.get("findings", "No findings provided")
        methodology = analyst_output.get("methodology", "")
        code_excerpt = (analyst_output.get("code") or "")[:2000]

        context_section = (
            f"\n\nRetrieved knowledge-base excerpts (use these to validate claims):\n{retrieved_context}"
            if retrieved_context else ""
        )

        content = (
            "Analyst Output to Validate:\n\n"
            f"Findings: {findings}\n\n"
            f"Methodology: {methodology}\n\n"
            f"Code (first 2000 chars): {code_excerpt}"
            f"{context_section}\n\n"
            "Please validate these findings and methodology."
        )

        result = await self._call_tool(
            system=LIBRARIAN_SYSTEM_PROMPT,
            user=content,
            tool=_LIBRARIAN_TOOL,
            tool_name="submit_verdict",
            max_tokens=8192,
        )
        return result

    async def run_summarizer(self, text: str) -> str:
        client = self._client()
        system = (
            "You are a concise academic summarizer. "
            "Given a document excerpt, produce a 2-3 sentence summary in plain English. "
            "Focus on the main topic, key contributions, and relevance. "
            "Return ONLY the summary text — no preamble."
        )
        user = f"Summarize the following document excerpt:\n\n{text[:6000]}"
        try:
            resp = await client.chat.completions.create(
                model=self._model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                max_completion_tokens=600,
            )
        except Exception as e:
            if "max_completion_tokens" not in str(e):
                raise
            resp = await client.chat.completions.create(
                model=self._model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                max_tokens=600,
            )
        return (resp.choices[0].message.content or "").strip()

    async def run_chat_assistant(
        self,
        *,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        max_tokens: int = 600,
    ) -> dict[str, Any]:
        """
        Generic chat assistant call with optional tool calling.

        `messages` is a list of OpenAI chat messages (excluding the system message).
        Returns a simplified dict with `content` and optional `tool_calls`.
        """
        client = self._client()
        try:
            resp = await client.chat.completions.create(
                model=self._model,
                messages=[{"role": "system", "content": system}, *messages],
                tools=(tools or None),
                tool_choice=("auto" if tools else None),
                max_completion_tokens=max_tokens,
            )
        except Exception as e:
            if "max_completion_tokens" not in str(e):
                raise
            resp = await client.chat.completions.create(
                model=self._model,
                messages=[{"role": "system", "content": system}, *messages],
                tools=(tools or None),
                tool_choice=("auto" if tools else None),
                max_tokens=max_tokens,
            )
        msg = resp.choices[0].message
        out: dict[str, Any] = {"content": (msg.content or "").strip()}
        if msg.tool_calls:
            out["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": tc.type,
                    "function": {
                        "name": tc.function.name if tc.function else "",
                        "arguments": tc.function.arguments if tc.function else "{}",
                    },
                }
                for tc in msg.tool_calls
            ]
        return out


    async def run_writer_clarify(
        self,
        *,
        doc_type: str,
        initial_request: str,
        library_titles: list[str],
    ) -> dict[str, Any]:
        from app.agents.writer.prompts import build_clarify_prompt

        titles_text = "\n".join(f"- {t}" for t in library_titles[:30]) if library_titles else "No documents indexed yet."
        system = build_clarify_prompt(doc_type, initial_request)
        user = f"Available library documents:\n{titles_text}\n\nUser request: {initial_request}"
        return await self._call_tool(
            system=system,
            user=user,
            tool=_WRITER_CLARIFY_TOOL,
            tool_name="generate_clarifications",
            max_tokens=4096,
        )

    async def run_writer_outline(
        self,
        *,
        doc_type: str,
        clarify_answers: str,
        library_context: str,
    ) -> dict[str, Any]:
        from app.agents.writer.prompts import build_outline_prompt

        system = build_outline_prompt(doc_type, clarify_answers, library_context)
        user = f"Generate the outline now.\n\nUser requirements:\n{clarify_answers}"
        return await self._call_tool(
            system=system,
            user=user,
            tool=_WRITER_OUTLINE_TOOL,
            tool_name="generate_outline",
            max_tokens=8192,
        )

    async def run_writer_section(
        self,
        *,
        chapter: dict[str, Any],
        retrieved_chunks: str,
        doc_type: str,
        style: str,
        preceding_summary: str,
        citation_style: str = "APA",
    ) -> dict[str, Any]:
        from app.agents.writer.prompts import build_section_prompt

        system = build_section_prompt(
            chapter_title=chapter.get("title", ""),
            chapter_description=chapter.get("description", ""),
            key_points=chapter.get("key_points", []),
            doc_type=doc_type,
            target_pages=float(chapter.get("target_pages", 1.0)),
            style_notes=style,
            retrieved_chunks=retrieved_chunks,
            preceding_summary=preceding_summary,
            citation_style=citation_style,
        )
        target_words = int(float(chapter.get("target_pages", 1.0)) * 500)
        user = (
            f"Write the section '{chapter.get('title')}' now. "
            f"You MUST produce between {int(target_words * 0.85)} and {int(target_words * 1.15)} words. "
            f"Write complete, detailed paragraphs — not summaries or bullet points. "
            f"Develop every key point fully with evidence from the provided sources."
        )
        return await self._call_tool(
            system=system,
            user=user,
            tool=_WRITER_SECTION_TOOL,
            tool_name="write_section",
            max_tokens=16384,
        )

    async def run_writer_coverage_check(
        self,
        *,
        outline: dict[str, Any],
        retrieved_context: str,
        doc_type: str,
    ) -> dict[str, Any]:
        system = (
            "You are the Writer Librarian for ClawScholar. Assess whether the user's indexed PDF library "
            "contains enough evidence to support the proposed outline. Be strict: a chapter is sufficient "
            "only when the retrieved excerpts directly support its description and key points. Prefer "
            "transparent gaps over optimistic guesses. Do not invent sources."
        )
        user = (
            f"Document type: {doc_type}\n\n"
            f"Outline JSON:\n{json.dumps(outline, ensure_ascii=False)[:6000]}\n\n"
            f"Retrieved library excerpts by chapter:\n{retrieved_context[:14000]}\n\n"
            "Return a coverage assessment. Include missing topics and search queries for weak chapters."
        )
        return await self._call_tool(
            system=system,
            user=user,
            tool=_WRITER_COVERAGE_TOOL,
            tool_name="assess_outline_coverage",
            max_tokens=8192,
        )

    async def run_writer_assemble(
        self,
        *,
        doc_type: str,
        sections_md: str,
        outline: str,
        style: str,
    ) -> dict[str, Any]:
        from app.agents.writer.prompts import build_assembly_prompt

        system = build_assembly_prompt(doc_type, sections_md, outline, style)
        user = "Assemble the complete document now. Include an abstract when appropriate, but do not add a bibliography or References section."
        return await self._call_tool(
            system=system,
            user=user,
            tool=_WRITER_ASSEMBLE_TOOL,
            tool_name="assemble_document",
            max_tokens=32768,
        )


    async def run_writer_auto_clarify(
        self,
        *,
        questions: list[dict[str, Any]],
        project_context: str,
        doc_type: str,
    ) -> dict[str, Any]:
        """Auto-answer Writer clarifying questions using project context."""
        q_text = "\n".join(
            f"[{q.get('id', i)}] {q.get('question', q.get('text', ''))}"
            f" (type: {q.get('input_type', 'text')})"
            for i, q in enumerate(questions)
        )
        system = (
            "You are an AI assistant auto-answering document-planning questions "
            "based on project context. Return JSON: "
            '{\"answers\": {\"<question_id>\": \"<answer>\", ...}}'
        )
        user = (
            f"Document type: {doc_type}\n\n"
            f"Project context:\n{project_context}\n\n"
            f"Questions:\n{q_text}\n\n"
            "Return ONLY valid JSON."
        )
        result = await self.run_chat_assistant(
            system=system,
            messages=[{"role": "user", "content": user}],
            max_tokens=2048,
        )
        content = result.get("content", "{}")
        start = content.find("{")
        end = content.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(content[start:end])
            except json.JSONDecodeError:
                pass
        return {"answers": {}}

    async def generate_multi_search_queries(
        self,
        *,
        goal_title: str,
        goal_description: str | None = None,
    ) -> list[str]:
        """Analyse the research goal and produce 3-5 diverse, API-optimised search queries.

        Each query targets a different angle or uses different terminology so that
        multi-source literature searches achieve maximum recall.
        Returns a non-empty list; falls back to the raw title on any error.
        """
        context = goal_title
        if goal_description:
            context += f"\n\nAdditional context: {goal_description[:400]}"

        system = (
            "You are an expert academic search strategist.\n"
            "Given a research goal, generate 3–5 DISTINCT search queries optimised for "
            "academic databases such as arXiv, Semantic Scholar, PubMed, CORE, and OpenAlex.\n\n"
            "RULES:\n"
            "- Each query MUST target a DIFFERENT angle, sub-topic, or terminology.\n"
            "- Keep every query SHORT (4–10 words) — academic APIs need focused terms.\n"
            "- Use synonyms, related concepts, methodological terms, or application domains.\n"
            "- Never repeat the same core phrase twice.\n"
            "- Omit filler words like 'research', 'study', 'paper', 'analysis'.\n"
            'Return ONLY valid JSON: {"queries": ["query 1", "query 2", ...]}\n'
            "No explanation, no markdown, just JSON."
        )
        user = f"Research goal:\n{context}\n\nGenerate 3–5 diverse academic search queries:"
        result = await self.run_chat_assistant(
            system=system,
            messages=[{"role": "user", "content": user}],
            max_tokens=512,
        )
        content = result.get("content", "{}")
        start = content.find("{")
        end = content.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                queries = json.loads(content[start:end]).get("queries", [])
                if isinstance(queries, list):
                    cleaned = [str(q).strip()[:120] for q in queries if str(q).strip()][:5]
                    if cleaned:
                        return cleaned
            except json.JSONDecodeError:
                pass
        return [goal_title.strip()[:120]]

    async def filter_papers_by_title(
        self,
        *,
        goal: str,
        candidates: list[dict[str, Any]],
    ) -> list[str]:
        """Stage 1: title-only screening.  Fast, cheap — rejects obvious mismatches.

        Each candidate must have: id, title.
        Returns list of IDs that are plausibly on-topic.

        Intentionally lenient — downstream stages (abstract + PDF content) will
        catch false positives.  False negatives (missing relevant papers) are far
        more costly at this stage.
        """
        if not candidates:
            return []
        items = "\n".join(
            f"[{c['id']}] {c.get('title', '').strip()}"
            for c in candidates
        )
        system = (
            "You are an academic paper screener doing a fast title-only pass.\n"
            "Given a research goal and a list of paper titles, decide which titles are "
            "plausibly related to the goal topic.\n\n"
            "RULES (apply in order):\n"
            "1. KEEP: Title is clearly about the same research area as the goal.\n"
            "2. KEEP: Title is ambiguous or only partially related — give the benefit of the doubt.\n"
            "3. KEEP: Title uses different terminology but addresses the same domain.\n"
            "4. KEEP: Title covers an adjacent method, dataset, theory, benchmark, or application that could support one outline subsection.\n"
            "5. REJECT ONLY if the title is unmistakably from a completely unrelated field "
            "   or is clearly off-topic (e.g., goal is ML but title is about ancient history).\n\n"
            "Be GENEROUS — a downstream abstract check and PDF content verification will "
            "catch false positives.  Favour recall over precision here.\n\n"
            'Return ONLY valid JSON: {"keep_ids": ["id1", "id2", ...]}\n'
            "No explanation, no markdown, just JSON."
        )
        user = f"Research goal: {goal}\n\nTitles:\n{items}\n\nJSON:"
        result = await self.run_chat_assistant(
            system=system,
            messages=[{"role": "user", "content": user}],
            max_tokens=1024,
        )
        content = result.get("content", "{}")
        start = content.find("{")
        end = content.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(content[start:end]).get("keep_ids", [])
            except json.JSONDecodeError:
                pass
        return [c["id"] for c in candidates]

    async def filter_papers_by_abstract(
        self,
        *,
        goal: str,
        candidates: list[dict[str, Any]],
    ) -> list[str]:
        """Stage 2: abstract-level confirmation.  Only called on title-stage survivors.

        Each candidate must have: id, title, abstract.
        Returns list of IDs confirmed as relevant.

        More selective than stage 1, but still lenient: PDF content verification
        (stage 3) is the final quality gate.
        """
        if not candidates:
            return []
        items = "\n".join(
            f"[{c['id']}] {c.get('title', '').strip()}\n"
            f"    Abstract: {(c.get('abstract') or '').strip()[:500]}"
            for c in candidates
        )
        system = (
            "You are an academic relevance reviewer checking titles and abstracts.\n"
            "Given a research goal and a list of papers, keep papers whose abstract "
            "suggests they are meaningfully related to the goal.\n\n"
            "RULES:\n"
            "- KEEP: Abstract describes methods, findings, or applications that contribute "
            "  to the research goal — even if only partially.\n"
            "- KEEP: Abstract is a survey or review that covers the research area.\n"
            "- KEEP: Abstract uses different terminology but addresses the same topic.\n"
            "- KEEP: Abstract is adjacent or foundational enough to support one chapter, even if it does not cover the whole document.\n"
            "- KEEP: Abstract is short or missing — give benefit of the doubt.\n"
            "- REJECT: Abstract explicitly describes a completely different domain or "
            "  application with no connection to the goal.\n"
            "- When in doubt, KEEP. A full-text PDF content check will handle false positives.\n\n"
            'Return ONLY valid JSON: {"relevant_ids": ["id1", "id2", ...]}\n'
            "No explanation, no markdown, just JSON."
        )
        user = f"Research goal: {goal}\n\nPapers:\n{items}\n\nJSON:"
        result = await self.run_chat_assistant(
            system=system,
            messages=[{"role": "user", "content": user}],
            max_tokens=1024,
        )
        content = result.get("content", "{}")
        start = content.find("{")
        end = content.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(content[start:end]).get("relevant_ids", [])
            except json.JSONDecodeError:
                pass
        return [c["id"] for c in candidates]

    async def generate_search_query(
        self,
        *,
        goal: str,
        attempt: int,
        previous_queries: list[str],
    ) -> str:
        """Generate an alternative academic search query for a retry attempt.

        Returns a short, focused query string (no longer than 120 characters).
        """
        prev = "\n".join(f"- {q}" for q in previous_queries)
        system = (
            "You are an academic search expert. A literature search returned no relevant papers. "
            "Generate a new, DIFFERENT search query for the same research goal.\n\n"
            "RULES:\n"
            "- Use different synonyms, related terms, or a different angle on the topic.\n"
            "- Keep it short (max 12 words) — academic search engines work best with focused terms.\n"
            "- Do NOT repeat the previous queries.\n"
            "- Return ONLY the query string, no explanation, no quotes."
        )
        user = (
            f"Research goal: {goal}\n\n"
            f"Previous queries that returned no relevant results:\n{prev}\n\n"
            f"Alternative query (attempt {attempt}):"
        )
        result = await self.run_chat_assistant(
            system=system,
            messages=[{"role": "user", "content": user}],
            max_tokens=64,
        )
        query = result.get("content", "").strip().strip('"').strip("'").strip()
        return query[:120] if query else goal[:120]

    async def verify_paper_content(
        self,
        *,
        goal: str,
        title: str,
        content_excerpt: str,
    ) -> bool:
        """Stage 3: content-level verification against actual PDF text.

        Called after PDF download, before saving to DB.  Returns True if the paper
        genuinely addresses the research goal based on its real content.
        """
        if not content_excerpt.strip():
            return False
        system = (
            "You are a research paper verification agent.\n"
            "You receive a research goal and an excerpt from a downloaded PDF.\n\n"
            "TASK: Decide whether this paper genuinely addresses the research goal "
            "based on its actual content (not just metadata).\n\n"
            "RULES:\n"
            "- Answer YES only if the paper's content clearly contributes to the goal.\n"
            "- Answer NO if the content reveals the paper is about a different topic, "
            "  domain, or application — even if the title seemed relevant.\n"
            "- Answer NO if the excerpt contains only boilerplate, references, or is "
            "  unreadable (garbled OCR).\n\n"
            'Return ONLY valid JSON: {"relevant": true} or {"relevant": false}\n'
            "No explanation, no markdown, just JSON."
        )
        user = (
            f"Research goal: {goal}\n\n"
            f"Paper title: {title}\n\n"
            f"PDF content excerpt (first ~2000 characters):\n{content_excerpt[:2000]}\n\nJSON:"
        )
        result = await self.run_chat_assistant(
            system=system,
            messages=[{"role": "user", "content": user}],
            max_tokens=64,
        )
        raw = result.get("content", "{}")
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return bool(json.loads(raw[start:end]).get("relevant", True))
            except json.JSONDecodeError:
                pass
        return False

    async def run_literature_relevance_filter(
        self,
        *,
        goal: str,
        candidates: list[dict[str, Any]],
    ) -> list[str]:
        """Legacy single-stage filter — delegates to title+abstract two-stage pipeline."""
        stage1 = await self.filter_papers_by_title(goal=goal, candidates=candidates)
        if not stage1:
            return []
        id_set = set(stage1)
        survivors = [c for c in candidates if c["id"] in id_set]
        return await self.filter_papers_by_abstract(goal=goal, candidates=survivors)

_instance: ClawScholarLLM | None = None
_lock = asyncio.Lock()


async def get_llm() -> ClawScholarLLM:
    global _instance
    if _instance is None:
        async with _lock:
            if _instance is None:
                _instance = ClawScholarLLM()
    return _instance
