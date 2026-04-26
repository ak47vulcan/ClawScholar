import type { AgentType, WorkflowStatus, EmbeddingStatus } from "@/lib/constants";

export type AgentStatus = "IDLE" | "ACTIVE" | "WAITING" | "ERROR";

export interface AgentLogEntry {
  id: string;
  runId: string;
  agentType: AgentType;
  action: string;
  message: string;
  timestamp: string;
  durationMs?: number;
  isExpanded: boolean;
  payload?: Record<string, unknown>;
}

export interface WorkflowCard {
  id: string;
  goalId?: string | null;
  projectId?: string | null;
  goalTitle: string;
  status: WorkflowStatus;
  agentAssigned: AgentType;
  progress: number;
  startedAt: string | null;
  cognitiveWeight: number;

  // Captured run outputs (populated from WebSocket AGENT_LOG payloads)
  schedulerOutput?: Record<string, unknown>;
  analystOutput?: Record<string, unknown>;
  librarianVerdict?: Record<string, unknown>;
  finalResult?: Record<string, unknown>;
}

export interface DocumentItem {
  id: string;
  filename: string;
  fileType: string;
  embeddingStatus: EmbeddingStatus;
  chunkCount: number;
  createdAt: string;
  summary?: string | null;
  sourceUrl?: string | null;
  sourceType?: string | null;
  projectId?: string | null;
}

export interface AgentStreamMessage {
  type: "AGENT_LOG" | "STATUS_UPDATE" | "WORKFLOW_PROGRESS" | "PING" | "PONG";
  runId?: string;
  agentType?: AgentType;
  action?: string;
  message?: string;
  status?: string;
  progress?: number;
  payload?: Record<string, unknown>;
  timestamp: string;
}
