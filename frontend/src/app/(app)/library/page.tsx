"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FolderOpen, Layers } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { DocumentTable } from "@/components/library/DocumentTable";
import { UploadZone } from "@/components/library/UploadZone";
import { LiteratureSearch } from "@/components/library/LiteratureSearch";
import { useDocumentStore } from "@/stores/document-store";
import { useProjectStore } from "@/stores/project-store";

const POLL_INTERVAL_MS = 4000;

export default function LibraryPage() {
  const { loadDocuments, documents } = useDocumentStore();
  const { projects, loadProjects } = useProjectStore();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    loadProjects().catch(() => null);
  }, []);

  useEffect(() => {
    loadDocuments({ projectId: selectedProjectId }).catch(() => null);
  }, [selectedProjectId]);

  // Poll while any document is still being processed
  useEffect(() => {
    const hasPending = documents.some(
      (d) => d.embeddingStatus === "PENDING" || d.embeddingStatus === "INDEXING"
    );
    if (hasPending) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          loadDocuments({ projectId: selectedProjectId }).catch(() => null);
        }, POLL_INTERVAL_MS);
      }
    } else {
      clearPoll();
    }
    return clearPoll;
  }, [documents, selectedProjectId]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Knowledge Library" subtitle="Upload documents, search for literature, manage your vector index" />

      {/* Project filter tabs */}
      <div
        className="flex items-center gap-1.5 px-6 py-2.5 shrink-0 overflow-x-auto"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <button
          onClick={() => setSelectedProjectId(null)}
          className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all"
          style={{
            background: selectedProjectId === null ? "rgba(99,102,241,0.12)" : "var(--surface-2)",
            border: `1px solid ${selectedProjectId === null ? "rgba(99,102,241,0.3)" : "var(--border)"}`,
            color: selectedProjectId === null ? "#818cf8" : "var(--text-dim)",
          }}
        >
          <Layers size={11} />
          All Documents
        </button>
        {projects.map((project) => (
          <motion.button
            key={project.id}
            onClick={() => setSelectedProjectId(project.id)}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all"
            style={{
              background:
                selectedProjectId === project.id ? "rgba(99,102,241,0.12)" : "var(--surface-2)",
              border: `1px solid ${
                selectedProjectId === project.id ? "rgba(99,102,241,0.3)" : "var(--border)"
              }`,
              color: selectedProjectId === project.id ? "#818cf8" : "var(--text-dim)",
            }}
          >
            <FolderOpen size={11} />
            {project.title.length > 26 ? project.title.slice(0, 24) + "…" : project.title}
          </motion.button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden p-6 grid grid-cols-1 xl:grid-cols-4 gap-5" style={{ gridTemplateRows: "1fr" }}>
        {/* Left panel: Upload + Literature Search */}
        <div className="xl:col-span-1 flex flex-col gap-4 overflow-y-auto min-h-0">
          <UploadZone />
          <LiteratureSearch projectId={selectedProjectId} />
        </div>

        {/* Right: Document list */}
        <div className="xl:col-span-3 flex flex-col overflow-hidden min-h-0">
          <DocumentTable selectedProjectId={selectedProjectId} />
        </div>
      </div>
    </div>
  );
}
