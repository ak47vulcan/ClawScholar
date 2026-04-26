"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/lib/api-client";
import type {
  Project,
  ProjectDetail,
  ClarifyQuestion,
  ClarifyResponse,
  ProjectWorkflowStartPayload,
  ProjectWorkflowWritingIntentPayload,
  ProjectWorkflowWritingIntentResponse,
} from "@/types/project";

interface ProjectState {
  projects: Project[];
  selectedProjectId: string | null;
  detailCache: Record<string, ProjectDetail>;
  isLoading: boolean;

  loadProjects: () => Promise<void>;
  loadProjectDetail: (id: string) => Promise<ProjectDetail>;
  createProject: (title: string, description?: string) => Promise<Project>;
  updateProject: (id: string, updates: { title?: string; description?: string; status?: string }) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  startProjectWorkflow: (projectId: string, payload: ProjectWorkflowStartPayload) => Promise<{ run_id: string; goal_id: string }>;
  queueWorkflowWritingIntent: (
    projectId: string,
    runId: string,
    payload: ProjectWorkflowWritingIntentPayload
  ) => Promise<ProjectWorkflowWritingIntentResponse>;
  generateClarifyingQuestions: (goal: string) => Promise<ClarifyQuestion[]>;
  setSelectedProject: (id: string | null) => void;
  invalidateDetail: (id: string) => void;

  getSelectedProject: () => Project | undefined;
  getSelectedDetail: () => ProjectDetail | undefined;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      selectedProjectId: null,
      detailCache: {},
      isLoading: false,

      loadProjects: async () => {
        set({ isLoading: true });
        try {
          // Use trailing slash to avoid FastAPI's 307 redirect (which can break CORS in browsers).
          const data = await api.get<Project[]>("/projects/");
          set({ projects: data, isLoading: false });
        } catch {
          set({ isLoading: false });
        }
      },

      loadProjectDetail: async (id) => {
        const cached = get().detailCache[id];
        if (cached) return cached;
        const detail = await api.get<ProjectDetail>(`/projects/${id}`);
        set((s) => ({ detailCache: { ...s.detailCache, [id]: detail } }));
        return detail;
      },

      createProject: async (title, description) => {
        // Use trailing slash to avoid FastAPI's 307 redirect (which can break CORS in browsers).
        const project = await api.post<Project>("/projects/", { title, description });
        set((s) => ({ projects: [project, ...s.projects] }));
        return project;
      },

      updateProject: async (id, updates) => {
        const updated = await api.patch<Project>(`/projects/${id}`, updates);
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? updated : p)),
          detailCache: { ...s.detailCache, [id]: s.detailCache[id] ? { ...s.detailCache[id], ...updated } : s.detailCache[id] },
        }));
      },

      deleteProject: async (id) => {
        await api.delete(`/projects/${id}`);
        set((s) => {
          const detailCache = { ...s.detailCache };
          delete detailCache[id];
          return {
            projects: s.projects.filter((p) => p.id !== id),
            selectedProjectId: s.selectedProjectId === id ? null : s.selectedProjectId,
            detailCache,
          };
        });
      },

      startProjectWorkflow: async (projectId, payload) => {
        const result = await api.post<{ run_id: string; goal_id: string; status: string }>(
          `/projects/${projectId}/workflows`,
          payload
        );
        // Invalidate cached detail so next load includes new workflow
        get().invalidateDetail(projectId);
        return result;
      },

      queueWorkflowWritingIntent: async (projectId, runId, payload) => {
        return api.post<ProjectWorkflowWritingIntentResponse>(
          `/projects/${projectId}/workflows/${runId}/writing-intent`,
          payload
        );
      },

      generateClarifyingQuestions: async (goal) => {
        try {
          const data = await api.post<ClarifyResponse>("/projects/clarify", { goal });
          return data.questions;
        } catch {
          return [];
        }
      },

      setSelectedProject: (id) => set({ selectedProjectId: id }),

      invalidateDetail: (id) =>
        set((s) => {
          const detailCache = { ...s.detailCache };
          delete detailCache[id];
          return { detailCache };
        }),

      getSelectedProject: () => {
        const { projects, selectedProjectId } = get();
        return projects.find((p) => p.id === selectedProjectId);
      },

      getSelectedDetail: () => {
        const { detailCache, selectedProjectId } = get();
        return selectedProjectId ? detailCache[selectedProjectId] : undefined;
      },
    }),
    {
      name: "clawscholar-projects",
      partialize: (s) => ({ selectedProjectId: s.selectedProjectId }),
    }
  )
);
