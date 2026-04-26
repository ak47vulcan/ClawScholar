"use client";

import { create } from "zustand";
import type { DocumentItem } from "@/types/agent";
import { api } from "@/lib/api-client";

interface UploadQueueItem {
  id: string;
  file: File;
  progress: number;
  status: "uploading" | "done" | "error";
}

interface DocumentState {
  documents: DocumentItem[];
  uploadQueue: UploadQueueItem[];
  searchQuery: string;
  isLoading: boolean;

  loadDocuments: (opts?: { goalId?: string | null; projectId?: string | null }) => Promise<void>;
  setDocuments: (docs: DocumentItem[]) => void;
  addDocument: (doc: DocumentItem) => void;
  removeDocument: (id: string) => void;
  removeDocuments: (ids: string[]) => void;
  updateEmbeddingStatus: (id: string, status: DocumentItem["embeddingStatus"]) => void;
  setSearchQuery: (q: string) => void;
  addToUploadQueue: (item: UploadQueueItem) => void;
  updateUploadProgress: (id: string, progress: number) => void;
  removeFromQueue: (id: string) => void;
  assignToProject: (docId: string, projectId: string | null) => Promise<void>;

  filteredDocuments: () => DocumentItem[];
}

interface ApiDocResponse {
  id: string;
  user_id: string;
  filename: string;
  file_type: string;
  embedding_status: string;
  chunk_count: number;
  summary?: string | null;
  source_url?: string | null;
  source_type?: string | null;
  created_at: string;
  project_id?: string | null;
}

function toDocumentItem(d: ApiDocResponse): DocumentItem {
  return {
    id: d.id,
    filename: d.filename,
    fileType: d.file_type,
    embeddingStatus: d.embedding_status as DocumentItem["embeddingStatus"],
    chunkCount: d.chunk_count,
    createdAt: d.created_at,
    summary: d.summary,
    sourceUrl: d.source_url,
    sourceType: d.source_type,
    projectId: d.project_id ?? null,
  };
}

export const useDocumentStore = create<DocumentState>()((set, get) => ({
  documents: [],
  uploadQueue: [],
  searchQuery: "",
  isLoading: false,

  loadDocuments: async (opts) => {
    set({ isLoading: true });
    try {
      const params = new URLSearchParams();
      if (opts?.goalId) params.set("goal_id", opts.goalId);
      if (opts?.projectId) params.set("project_id", opts.projectId);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const data = await api.get<ApiDocResponse[]>(`/documents/${qs}`);
      set({ documents: data.map(toDocumentItem) });
    } finally {
      set({ isLoading: false });
    }
  },

  assignToProject: async (docId, projectId) => {
    const data = await api.patch<ApiDocResponse>(`/documents/${docId}/project`, {
      project_id: projectId,
    });
    const updated = toDocumentItem(data);
    set((s) => ({ documents: s.documents.map((d) => (d.id === docId ? updated : d)) }));
  },

  setDocuments: (documents) => set({ documents }),
  addDocument: (doc) => set((s) => ({ documents: [doc, ...s.documents] })),
  removeDocument: (id) => set((s) => ({ documents: s.documents.filter((d) => d.id !== id) })),
  removeDocuments: (ids) => {
    const idSet = new Set(ids);
    set((s) => ({ documents: s.documents.filter((d) => !idSet.has(d.id)) }));
  },
  updateEmbeddingStatus: (id, status) =>
    set((s) => ({ documents: s.documents.map((d) => (d.id === id ? { ...d, embeddingStatus: status } : d)) })),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  addToUploadQueue: (item) => set((s) => ({ uploadQueue: [...s.uploadQueue, item] })),
  updateUploadProgress: (id, progress) =>
    set((s) => ({ uploadQueue: s.uploadQueue.map((u) => (u.id === id ? { ...u, progress } : u)) })),
  removeFromQueue: (id) => set((s) => ({ uploadQueue: s.uploadQueue.filter((u) => u.id !== id) })),

  filteredDocuments: () => {
    const q = get().searchQuery.toLowerCase();
    if (!q) return get().documents;
    return get().documents.filter(
      (d) =>
        d.filename.toLowerCase().includes(q) ||
        (d.summary ?? "").toLowerCase().includes(q)
    );
  },
}));
