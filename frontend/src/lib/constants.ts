export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
export const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws";

export const AGENT_TYPES = ["SCHEDULER", "ANALYST", "LIBRARIAN", "ORCHESTRATOR", "WRITER"] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export const WORKFLOW_STATUSES = ["PENDING", "RUNNING", "COMPLETED", "FAILED"] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const EMBEDDING_STATUSES = ["PENDING", "INDEXING", "INDEXED", "FAILED"] as const;
export type EmbeddingStatus = (typeof EMBEDDING_STATUSES)[number];

export const VALIDATION_VERDICTS = ["APPROVED", "REJECTED", "PARTIAL"] as const;
export type ValidationVerdict = (typeof VALIDATION_VERDICTS)[number];

export const AGENT_COLORS: Record<AgentType, string> = {
  SCHEDULER: "#6366f1",
  ANALYST: "#22c55e",
  LIBRARIAN: "#f59e0b",
  ORCHESTRATOR: "#8b5cf6",
  WRITER: "#ec4899",
};

export const KANBAN_COLUMNS: WorkflowStatus[] = ["PENDING", "RUNNING", "COMPLETED", "FAILED"];
