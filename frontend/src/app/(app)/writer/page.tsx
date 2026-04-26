"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Topbar } from "@/components/layout/Topbar";
import { WriterRunList } from "@/components/writer/WriterRunList";
import { WriterWorkspace } from "@/components/writer/WriterWorkspace";
import { useWriterStore } from "@/stores/writer-store";
import type { WriterPhase } from "@/types/writer";

const IN_PROGRESS_PHASES: WriterPhase[] = ["WRITING", "ASSEMBLING"];

function WriterPageContent() {
  const { loadRuns, setActiveRun, loadRun, activeRunId } = useWriterStore();
  const activeRun = useWriterStore((s) => s.runs.find((r) => r.id === s.activeRunId));
  const searchParams = useSearchParams();
  const runParam = searchParams.get("run");

  useEffect(() => {
    loadRuns().catch(() => null);
  }, []);

  // Deep-link from chat: /writer?run={id}
  useEffect(() => {
    if (runParam && runParam !== activeRunId) {
      loadRun(runParam).then(() => setActiveRun(runParam)).catch(() => null);
    }
  }, [runParam]);

  // Polling fallback: re-fetch state every 15 s while writing, assembling or fetching sources
  // so missed WS events don't leave the UI frozen
  useEffect(() => {
    if (!activeRun || (!IN_PROGRESS_PHASES.includes(activeRun.status) && activeRun.source_search?.status !== "RUNNING")) return;
    const id = setInterval(() => loadRun(activeRun.id).catch(() => null), 15_000);
    return () => clearInterval(id);
  }, [activeRun?.id, activeRun?.status, activeRun?.source_search?.status]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Topbar
        title="Writer"
        subtitle="Compose documents from your research library"
      />

      <div className="flex flex-1 min-h-0">
        {/* Left sidebar — run list */}
        <motion.aside
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-64 flex-shrink-0 flex flex-col border-r"
          style={{ borderColor: "rgba(255,255,255,0.07)" }}
        >
          <WriterRunList />
        </motion.aside>

        {/* Main workspace */}
        <main
          className="flex-1 flex flex-col min-h-0 overflow-y-auto"
          style={{ background: "var(--background)" }}
        >
          <WriterWorkspace />
        </main>
      </div>
    </div>
  );
}

export default function WriterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <div
            className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "#6366f1", borderTopColor: "transparent" }}
          />
        </div>
      }
    >
      <WriterPageContent />
    </Suspense>
  );
}
