"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/lib/api-client";
import type { WorkflowCard } from "@/types/agent";
import type { WorkflowStatus } from "@/lib/constants";

interface WorkflowState {
  workflows: WorkflowCard[];
  cognitiveLoad: number;
  selectedWorkflowId: string | null;

  setWorkflows: (workflows: WorkflowCard[]) => void;
  addWorkflow: (workflow: WorkflowCard) => void;
  updateWorkflow: (id: string, updates: Partial<WorkflowCard>) => void;
  setSelectedWorkflow: (id: string | null) => void;
  setCognitiveLoad: (load: number) => void;
  loadWorkflows: () => Promise<void>;

  getByStatus: (status: WorkflowStatus) => WorkflowCard[];
}

interface ApiWorkflow {
  id: string;
  goal_id?: string | null;
  project_id?: string | null;
  goal_title?: string | null;
  status: WorkflowStatus;
  started_at?: string | null;
  completed_at?: string | null;
  agent_states?: Record<string, unknown>;
}

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      workflows: [],
      cognitiveLoad: 0,
      selectedWorkflowId: null,

      setWorkflows: (workflows) => set({ workflows }),
      addWorkflow: (workflow) =>
        set((s) => ({
          workflows: s.workflows.some((w) => w.id === workflow.id)
            ? s.workflows.map((w) => (w.id === workflow.id ? { ...w, ...workflow } : w))
            : [workflow, ...s.workflows],
        })),
      updateWorkflow: (id, updates) =>
        set((s) => ({
          workflows: s.workflows.map((w) => (w.id === id ? { ...w, ...updates } : w)),
        })),
      setSelectedWorkflow: (id) => set({ selectedWorkflowId: id }),
      setCognitiveLoad: (load) => set({ cognitiveLoad: load }),

      loadWorkflows: async () => {
        try {
          const data = await api.get<ApiWorkflow[]>("/workflows");
          const cards: WorkflowCard[] = data.map((w) => ({
            id: w.id,
            goalId: w.goal_id ?? null,
            projectId: w.project_id ?? null,
            goalTitle: w.goal_title ?? "Untitled",
            status: w.status,
            agentAssigned: "ORCHESTRATOR",
            progress: w.status === "COMPLETED" ? 100 : w.status === "RUNNING" ? 50 : 0,
            startedAt: w.started_at ?? null,
            cognitiveWeight: 0,
          }));
          set((s) => {
            // Merge: keep local-only data (schedulerOutput etc.) for existing runs
            const merged = cards.map((incoming) => {
              const existing = s.workflows.find((w) => w.id === incoming.id);
              return existing ? { ...existing, ...incoming } : incoming;
            });
            return { workflows: merged };
          });
        } catch {
          // Silently fail — show stale data rather than error
        }
      },

      getByStatus: (status) => get().workflows.filter((w) => w.status === status),
    }),
    {
      name: "clawscholar-workflows",
      partialize: (s) => ({ selectedWorkflowId: s.selectedWorkflowId, workflows: s.workflows }),
    }
  )
);
