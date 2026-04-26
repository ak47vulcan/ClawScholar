"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWebSocket } from "./use-websocket";
import { useAgentStore } from "@/stores/agent-store";
import { useWorkflowStore } from "@/stores/workflow-store";
import { useChatStore } from "@/stores/chat-store";
import { useWriterStore } from "@/stores/writer-store";
import { useUIStore } from "@/stores/ui-store";
import { useProjectStore } from "@/stores/project-store";
import type { AgentType, WorkflowStatus } from "@/lib/constants";
import { AGENT_TYPES, WORKFLOW_STATUSES } from "@/lib/constants";
import type { WriterPhase, WritingSection } from "@/types/writer";

/** Normalize a raw WS message object from the backend.
 *  Handles snake_case aliases emitted by the Python orchestrator. */
function normalize(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    ...raw,
    // Prefer camelCase but fall back to snake_case aliases
    runId: raw.runId ?? raw.run_id,
    agentType: raw.agentType ?? raw.agent_type,
  };
}

function isValidAgentType(v: unknown): v is AgentType {
  return typeof v === "string" && (AGENT_TYPES as readonly string[]).includes(v);
}

function isValidWorkflowStatus(v: unknown): v is WorkflowStatus {
  return typeof v === "string" && (WORKFLOW_STATUSES as readonly string[]).includes(v);
}

export function useAgentStream() {
  const router = useRouter();
  const { appendLog, setAgentStatus, setStreaming, setLiteratureProgress, updateLiteraturePaper } = useAgentStore();
  const { updateWorkflow, setSelectedWorkflow } = useWorkflowStore();
  const { activeConversationId, appendAssistantMessage, setTypingRunId } = useChatStore();
  const { updateRunFromWS, updateSectionFromWS } = useWriterStore();
  const { addToast } = useUIStore();

  const onMessage = useCallback((data: unknown) => {
    if (!data || typeof data !== "object") return;
    const msg = normalize(data as Record<string, unknown>);
    const type = msg.type as string | undefined;
    if (!type) return;

    switch (type) {
      case "AGENT_LOG": {
        const agentType = isValidAgentType(msg.agentType) ? msg.agentType : undefined;
        if (agentType && msg.action && msg.message) {
          const runId = (msg.runId as string | undefined) ?? "unknown";
          appendLog({
            id: `${Date.now()}-${Math.random()}`,
            runId,
            agentType,
            action: msg.action as string,
            message: msg.message as string,
            timestamp: (msg.timestamp as string | undefined) ?? new Date().toISOString(),
            payload: msg.payload as Record<string, unknown> | undefined,
          });

          // Derive agent status from action
          const action = msg.action as string;
          if (action === "ERROR") {
            setAgentStatus(agentType, "ERROR");
          } else if (action === "COMPLETE" || action === "VERDICT" || action === "FINALIZE") {
            setAgentStatus(agentType, "IDLE");
          } else {
            setAgentStatus(agentType, "ACTIVE");
          }

          // Persist important payloads into the workflow card so the UI can show results
          const payload = msg.payload as Record<string, unknown> | undefined;
          if (runId && payload) {
            if (agentType === "SCHEDULER" && action === "COMPLETE") {
              updateWorkflow(runId, { schedulerOutput: payload });
            }
            if (agentType === "ANALYST" && action === "COMPLETE") {
              updateWorkflow(runId, { analystOutput: payload });
            }
            if (agentType === "LIBRARIAN" && action === "VERDICT") {
              updateWorkflow(runId, { librarianVerdict: payload });
            }
            if (agentType === "ORCHESTRATOR" && action === "FINALIZE") {
              updateWorkflow(runId, { finalResult: payload });
              setAgentStatus("SCHEDULER", "IDLE");
              setAgentStatus("ANALYST", "IDLE");
              setAgentStatus("LIBRARIAN", "IDLE");
              setAgentStatus("ORCHESTRATOR", "IDLE");
              setTypingRunId(null);
              // If a chat conversation is active, reload it to fetch the backend-written assistant message
              if (activeConversationId) {
                const { loadConversation } = useChatStore.getState();
                loadConversation(activeConversationId).catch(() => null);
              }
            }
          }
        }
        break;
      }

      case "STATUS_UPDATE": {
        const agentType = isValidAgentType(msg.agentType) ? msg.agentType : undefined;
        if (agentType && msg.status) {
          setAgentStatus(agentType, msg.status as "IDLE" | "ACTIVE" | "WAITING" | "ERROR");
        }
        break;
      }

      case "WORKFLOW_PROGRESS": {
        const runId = msg.runId as string | undefined;
        if (runId) {
          if (typeof msg.progress === "number") {
            updateWorkflow(runId, { progress: msg.progress });
          }
          if (isValidWorkflowStatus(msg.status)) {
            updateWorkflow(runId, { status: msg.status });
          }
        }
        break;
      }

      case "WRITER_PROGRESS": {
        const runId = msg.run_id as string | undefined;
        if (runId) {
          updateRunFromWS(runId, {
            status: msg.phase as WriterPhase,
            progress: typeof msg.progress === "number" ? msg.progress : undefined,
            word_count: typeof msg.word_count === "number" ? msg.word_count : undefined,
            page_estimate: typeof msg.page_estimate === "number" ? msg.page_estimate : undefined,
            activity: msg.activity as import("@/types/writer").WriterRun["activity"] | undefined,
          });
          setAgentStatus("WRITER", msg.phase === "DONE" || msg.phase === "FAILED" ? "IDLE" : "ACTIVE");
          // Reload full run on terminal state so full_markdown and final sections
          // are present in the store without requiring a manual page refresh.
          if (msg.phase === "DONE" || msg.phase === "FAILED") {
            useWriterStore.getState().loadRun(runId).catch(() => null);
          }
        }
        break;
      }

      case "WRITER_SECTION_DONE": {
        const runId = msg.run_id as string | undefined;
        const sectionId = msg.section_id as string | undefined;
        if (runId && sectionId) {
          updateSectionFromWS(runId, sectionId, {
            status: "DONE",
            content_md: msg.content_md as string | undefined,
          });
        }
        break;
      }

      case "WRITER_SECTION_PROGRESS": {
        const runId = msg.run_id as string | undefined;
        const sectionId = msg.section_id as string | undefined;
        if (runId && sectionId) {
          updateSectionFromWS(runId, sectionId, {
            status: msg.status as WritingSection["status"],
          });
        }
        break;
      }

      case "WRITER_SOURCE_PLAN": {
        const runId = msg.run_id as string | undefined;
        if (runId) {
          updateRunFromWS(runId, {
            source_plan: msg.source_plan as import("@/types/writer").WriterSourcePlanItem[] | undefined,
          });
        }
        break;
      }

      case "WRITER_SUGGESTED": {
        addToast({
          type: "info",
          message: (msg.message as string) ?? "Library updated. Want to draft a document?",
        });
        break;
      }

      case "WRITER_COVERAGE_UPDATE": {
        const runId = msg.run_id as string | undefined;
        const coverage = msg.coverage as import("@/types/writer").CoverageData | undefined;
        const sourceSearch = msg.source_search as import("@/types/writer").WriterRun["source_search"] | undefined;
        if (runId) {
          if (coverage) {
            useWriterStore.getState().updateRunCoverage(runId, coverage, sourceSearch);
            const pct = Math.round((coverage.overall_score ?? 0) * 100);
            addToast({
              type: pct >= 60 ? "success" : "info",
              message: `Source coverage updated: ${pct}% — outline panel refreshed.`,
            });
          } else {
            // error case — mark search as done so UI unlocks
            useWriterStore.getState().updateRunFromWS(runId, { sourceSearchActive: false });
          }
        }
        break;
      }

      case "WRITER_RUN_CREATED": {
        const runId = msg.runId as string | undefined;
        const mode = msg.mode as string | undefined;
        if (runId) {
          const writerStore = useWriterStore.getState();
          writerStore.loadRun(runId).then(() => writerStore.setActiveRun(runId)).catch(() => null);
          if (msg.auto_open === true) {
            router.push(`/writer?run=${runId}`);
          }
        }
        addToast({
          type: mode === "auto" ? "success" : "info",
          message: (msg.message as string) ?? "Writing run created. Open the Writer tab.",
        });
        break;
      }

      case "WRITER_SOURCE_WORKFLOW_CREATED": {
        const projectId = msg.project_id as string | undefined;
        const workflow = msg.workflow as Record<string, unknown> | undefined;
        const workflowId = workflow?.id as string | undefined;
        if (workflowId) {
          useWorkflowStore.getState().addWorkflow({
            id: workflowId,
            goalId: (workflow?.goal_id as string | null | undefined) ?? null,
            projectId: projectId ?? null,
            goalTitle: (workflow?.goal_title as string | undefined) ?? "Find missing Writer sources",
            status: "RUNNING",
            agentAssigned: "LIBRARIAN",
            progress: 5,
            startedAt: new Date().toISOString(),
            cognitiveWeight: 4,
          });
          setSelectedWorkflow(workflowId);
        }
        if (projectId) {
          const projectStore = useProjectStore.getState();
          projectStore.invalidateDetail(projectId);
          projectStore.loadProjectDetail(projectId).catch(() => null);
        }
        break;
      }

      case "LITERATURE_PROGRESS": {
        const runId = msg.runId as string | undefined;
        if (!runId) break;
        const phase = msg.phase as string;

        if (phase === "QUERY_GENERATION") {
          const isGenerating = msg.generating as boolean;
          const queries = (msg.queries as string[] | undefined) ?? [];
          const existing = useAgentStore.getState().literatureProgressByRun[runId];
          if (existing?.runId === runId) {
            setLiteratureProgress({
              ...existing,
              phase: "query_generation",
              queries,
              queryGenerating: isGenerating,
            });
          } else {
            setLiteratureProgress({
              runId,
              phase: "query_generation",
              query: "",
              queries,
              queryGenerating: isGenerating,
              attempt: 0,
              maxAttempts: 3,
              papers: [],
              savedCount: 0,
            });
          }
        } else if (phase === "SEARCH_START") {
          const queries = (msg.queries as string[] | undefined) ?? [];
          const existing = useAgentStore.getState().literatureProgressByRun[runId];
          setLiteratureProgress({
            runId,
            phase: "searching",
            query: (msg.query as string) ?? "",
            queries: queries.length > 0 ? queries : existing?.queries,
            queryGenerating: false,
            attempt: (msg.attempt as number) ?? 1,
            maxAttempts: (msg.maxAttempts as number) ?? 3,
            papers: [],
            savedCount: 0,
          });
        } else if (phase === "CANDIDATES") {
          const papers = ((msg.papers as unknown[]) ?? []).map((p: unknown) => {
            const paper = p as Record<string, unknown>;
            return {
              id: String(paper.id),
              title: String(paper.title ?? ""),
              source: String(paper.source ?? ""),
              year: paper.year as number | null | undefined,
              abstract: paper.abstract as string | undefined,
              status: "title_check" as const,
            };
          });
          const literatureProgress = useAgentStore.getState().literatureProgressByRun[runId];
          if (literatureProgress?.runId === runId) {
            setLiteratureProgress({ ...literatureProgress, phase: "filtering", papers });
          }
        } else if (phase === "PAPER_STATUS") {
          const paperId = String(msg.paperId ?? "");
          const status = msg.status as import("@/stores/agent-store").LiteraturePaperStatus;
          updateLiteraturePaper(runId, paperId, {
            title: (msg.title as string) ?? undefined,
            source: (msg.source as string) ?? undefined,
            year: msg.year as number | null | undefined,
            status,
            reason: msg.reason as string | undefined,
            rejectedAt: msg.rejectedAt as "download" | "stage3" | undefined,
            documentId: msg.documentId as string | undefined,
          });
          const prog = useAgentStore.getState().literatureProgressByRun[runId];
          if (prog?.runId === runId) {
            const downloading = ["downloading", "content_check"].includes(status);
            setLiteratureProgress({
              ...prog,
              phase: downloading ? "downloading" : prog.phase,
            });
          }
        } else if (phase === "RETRY") {
          const prog = useAgentStore.getState().literatureProgressByRun[runId];
          if (prog?.runId === runId) {
            setLiteratureProgress({
              ...prog,
              phase: "retrying",
              attempt: (msg.attempt as number) ?? prog.attempt + 1,
            });
          }
        } else if (phase === "DONE") {
          const prog = useAgentStore.getState().literatureProgressByRun[runId];
          if (prog?.runId === runId) {
            setLiteratureProgress({ ...prog, phase: "done", savedCount: (msg.savedCount as number) ?? prog.savedCount });
          }
        }
        break;
      }

      case "PING":
      case "PONG":
        break;
    }
  }, [appendLog, setAgentStatus, updateWorkflow, setSelectedWorkflow, updateRunFromWS, updateSectionFromWS, addToast, setLiteratureProgress, updateLiteraturePaper, router]);

  const onOpen = useCallback(() => {
    setStreaming(true);
    // Re-sync writer state after reconnect to recover any missed WS events
    useWriterStore.getState().syncActiveRun().catch(() => null);
  }, [setStreaming]);
  const onClose = useCallback(() => setStreaming(false), [setStreaming]);

  // The backend WebSocket endpoint is /ws/agent-stream (single global stream per user)
  return useWebSocket("/agent-stream", { onMessage, onOpen, onClose });
}
