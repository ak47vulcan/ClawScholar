"use client";

import { create } from "zustand";
import { api } from "@/lib/api-client";
import { useAgentStore } from "@/stores/agent-store";
import type {
  WriterRun,
  DocType,
  Chapter,
  ChapterAllocation,
  WritingSection,
} from "@/types/writer";

interface WriterState {
  runs: WriterRun[];
  activeRunId: string | null;
  isLoading: boolean;

  loadRuns: () => Promise<void>;
  loadRun: (runId: string) => Promise<void>;
  createRun: (docType: DocType, title: string, initialRequest: string) => Promise<string>;
  submitClarify: (runId: string, answers: Record<string, unknown>) => Promise<void>;
  acceptOutlineAndAllocate: (
    runId: string,
    chapters: Chapter[],
    allocations: ChapterAllocation[]
  ) => Promise<void>;
  startSourceSearch: (runId: string) => Promise<void>;
  setActiveRun: (id: string | null) => void;
  deleteRun: (runId: string) => Promise<void>;
  updateRunFromWS: (runId: string, update: Partial<WriterRun>) => void;
  updateSectionFromWS: (
    runId: string,
    sectionId: string,
    update: Partial<WritingSection>
  ) => void;
  updateRunCoverage: (
    runId: string,
    coverage: import("@/types/writer").CoverageData,
    sourceSearch?: WriterRun["source_search"]
  ) => void;
  syncActiveRun: () => Promise<void>;
  getActiveRun: () => WriterRun | undefined;
}

export const useWriterStore = create<WriterState>()((set, get) => ({
  runs: [],
  activeRunId: null,
  isLoading: false,

  loadRuns: async () => {
    set({ isLoading: true });
    try {
      const data = await api.get<WriterRun[]>("/writer/runs");
      set({ runs: data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  loadRun: async (runId) => {
    try {
      const data = await api.get<WriterRun>(`/writer/runs/${runId}`);
      set((s) => ({
        runs: s.runs.some((r) => r.id === runId)
          ? s.runs.map((r) => (r.id === runId ? data : r))
          : [data, ...s.runs],
      }));
    } catch {
      // ignore
    }
  },

  createRun: async (docType, title, initialRequest) => {
    const result = await api.post<{ run_id: string; status: string; questions: unknown[] }>(
      "/writer/runs",
      { doc_type: docType, title, initial_request: initialRequest }
    );
    await get().loadRuns();
    return result.run_id;
  },

  submitClarify: async (runId, answers) => {
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === runId
          ? {
              ...r,
              status: "OUTLINING",
              progress: 8,
              activity: {
                step: "Answers received",
                detail: "Preparing your clarifying answers for the outline agent.",
                items: Object.keys(answers).slice(0, 4).map((key) => ({
                  label: key,
                  value: String(answers[key]).slice(0, 90),
                })),
              },
            }
          : r
      ),
    }));
    const data = await api.post<Partial<WriterRun> & { source_search_recommended?: boolean }>(
      `/writer/runs/${runId}/clarify`,
      { answers }
    );
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === runId
          ? {
              ...r,
              ...data,
              status: data.status ?? r.status,
              outline: data.outline ?? r.outline,
              coverage: data.coverage ?? r.coverage,
              target_pages: data.target_pages ?? r.target_pages,
              sourceSearchRecommended: data.source_search_recommended ?? data.coverage?.needs_sources ?? false,
              sourceSearchActive: false,
            }
          : r
      ),
    }));
  },

  acceptOutlineAndAllocate: async (runId, chapters, allocations) => {
    const data = await api.post<{ run_id: string; status: string }>(
      `/writer/runs/${runId}/allocate`,
      { chapters, chapter_allocations: allocations }
    );
    // Optimistic status update
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === runId ? { ...r, status: data.status as WriterRun["status"], allocations } : r
      ),
    }));
    // Load full run with sections so WritingProgressPanel has data to display
    await get().loadRun(runId);
  },

  startSourceSearch: async (runId) => {
    const data = await api.post<Partial<WriterRun>>(`/writer/runs/${runId}/source-search`, {});
    const workflowId = data.source_search?.workflow_run_id ?? `writer-${runId}`;
    if (data.source_search?.status === "RUNNING" || data.source_search?.status === "READY") {
      useAgentStore.getState().setLiteratureProgress({
        runId: workflowId,
        phase: "query_generation",
        query: "",
        queries: data.source_search?.suggested_queries ?? [],
        queryGenerating: true,
        attempt: 0,
        maxAttempts: 5,
        papers: [],
        savedCount: 0,
      });
    }
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === runId
          ? {
              ...r,
              ...data,
              source_search: data.source_search ?? r.source_search,
              source_workflow_id: data.source_search?.workflow_run_id ?? r.source_workflow_id,
              sourceSearchActive: true,
            }
          : r
      ),
    }));
  },

  setActiveRun: (id) => set({ activeRunId: id }),

  deleteRun: async (runId) => {
    await api.delete(`/writer/runs/${runId}`);
    set((s) => ({
      runs: s.runs.filter((r) => r.id !== runId),
      activeRunId: s.activeRunId === runId ? null : s.activeRunId,
    }));
  },

  updateRunFromWS: (runId, update) => {
    set((s) => ({
      runs: s.runs.map((r) => (r.id === runId ? { ...r, ...update } : r)),
    }));
  },

  updateSectionFromWS: (runId, sectionId, update) => {
    const { runs } = useWriterStore.getState();
    const run = runs.find((r) => r.id === runId);
    // Run not in store at all — fetch it, update will be applied on next WS event or poll
    if (!run) {
      useWriterStore.getState().loadRun(runId).catch(() => null);
      return;
    }
    set((s) => ({
      runs: s.runs.map((r) => {
        if (r.id !== runId) return r;
        const existing = r.sections ?? [];
        // If the section exists, update it in place; otherwise add a placeholder
        const sections = existing.some((sec) => sec.id === sectionId)
          ? existing.map((sec) => (sec.id === sectionId ? { ...sec, ...update } : sec))
          : [...existing, { id: sectionId, chapter_index: 0, title: "", target_pages: 1, status: "PENDING" as const, ...update }];
        return { ...r, sections };
      }),
    }));
  },

  updateRunCoverage: (runId, coverage, sourceSearch) => {
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === runId
          ? {
              ...r,
              coverage,
              source_search: sourceSearch ?? r.source_search,
              sourceSearchActive: false,
              sourceSearchRecommended: coverage.needs_sources ?? coverage.overall_score < 0.7,
            }
          : r
      ),
    }));
  },

  syncActiveRun: async () => {
    const { activeRunId, loadRun } = useWriterStore.getState();
    if (activeRunId) await loadRun(activeRunId).catch(() => null);
  },

  getActiveRun: () => {
    const { runs, activeRunId } = get();
    return runs.find((r) => r.id === activeRunId);
  },
}));
