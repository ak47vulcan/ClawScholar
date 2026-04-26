"use client";

import { create } from "zustand";
import type { AgentLogEntry, AgentStatus } from "@/types/agent";
import type { AgentType } from "@/lib/constants";

const MAX_LOGS = 200;

export type LiteraturePaperStatus =
  | "pending"
  | "title_check" | "title_pass" | "title_reject"
  | "abstract_check" | "abstract_pass" | "abstract_reject"
  | "downloading" | "content_check"
  | "saved" | "rejected";

export interface LiteraturePaper {
  id: string;
  title: string;
  source: string;
  year?: number | null;
  abstract?: string;
  status: LiteraturePaperStatus;
  reason?: string;
  rejectedAt?: "download" | "stage3";
  documentId?: string;
}

export interface LiteratureSearchProgress {
  runId: string;
  phase: "idle" | "query_generation" | "searching" | "filtering" | "downloading" | "retrying" | "done";
  query: string;
  /** AI-generated multi-query variants used in attempt 1 */
  queries?: string[];
  /** True while the AI is still generating search queries */
  queryGenerating?: boolean;
  attempt: number;
  maxAttempts: number;
  papers: LiteraturePaper[];
  savedCount: number;
}

interface AgentState {
  logs: AgentLogEntry[];
  agentStatuses: Record<AgentType, AgentStatus>;
  activeRunId: string | null;
  isStreaming: boolean;
  literatureProgress: LiteratureSearchProgress | null;
  literatureProgressByRun: Record<string, LiteratureSearchProgress>;

  appendLog: (entry: Omit<AgentLogEntry, "isExpanded">) => void;
  setAgentStatus: (agentType: AgentType, status: AgentStatus) => void;
  toggleLogExpanded: (id: string) => void;
  clearLogs: () => void;
  setStreaming: (v: boolean) => void;
  setActiveRunId: (id: string | null) => void;
  setLiteratureProgress: (p: LiteratureSearchProgress | null) => void;
  updateLiteraturePaper: (runId: string, paperId: string, update: Partial<LiteraturePaper>) => void;
}

export const useAgentStore = create<AgentState>()((set) => ({
  logs: [],
  agentStatuses: {
    SCHEDULER: "IDLE",
    ANALYST: "IDLE",
    LIBRARIAN: "IDLE",
    ORCHESTRATOR: "IDLE",
    WRITER: "IDLE",
  },
  activeRunId: null,
  isStreaming: false,
  literatureProgress: null,
  literatureProgressByRun: {},

  appendLog: (entry) =>
    set((s) => ({
      logs: [...s.logs.slice(-(MAX_LOGS - 1)), { ...entry, isExpanded: false }],
    })),

  setAgentStatus: (agentType, status) =>
    set((s) => ({ agentStatuses: { ...s.agentStatuses, [agentType]: status } })),

  toggleLogExpanded: (id) =>
    set((s) => ({
      logs: s.logs.map((l) => (l.id === id ? { ...l, isExpanded: !l.isExpanded } : l)),
    })),

  clearLogs: () => set({ logs: [] }),
  setStreaming: (v) => set({ isStreaming: v }),
  setActiveRunId: (id) => set({ activeRunId: id }),

  setLiteratureProgress: (p) =>
    set((s) => ({
      literatureProgress: p,
      literatureProgressByRun: p ? { ...s.literatureProgressByRun, [p.runId]: p } : s.literatureProgressByRun,
    })),

  updateLiteraturePaper: (runId, paperId, update) =>
    set((s) => {
      const prog = s.literatureProgressByRun[runId] ?? (s.literatureProgress?.runId === runId ? s.literatureProgress : null);
      if (!prog) return s;
      const existingIdx = prog.papers.findIndex((p) => p.id === paperId);
      const papers =
        existingIdx >= 0
          ? prog.papers.map((p, i) => (i === existingIdx ? { ...p, ...update } : p))
          : [...prog.papers, { id: paperId, title: "", source: "", status: "pending" as const, ...update }];
      const savedCount = papers.filter((p) => p.status === "saved").length;
      const next = { ...prog, papers, savedCount };
      return {
        literatureProgress: s.literatureProgress?.runId === runId ? next : s.literatureProgress,
        literatureProgressByRun: { ...s.literatureProgressByRun, [runId]: next },
      };
    }),
}));
