"use client";

import { motion, AnimatePresence } from "framer-motion";
import { FileText, Newspaper, AlignLeft, PenLine, Plus, Trash2 } from "lucide-react";
import { useWriterStore } from "@/stores/writer-store";
import { listItemVariants, listContainerVariants } from "@/lib/motion-variants";
import { formatRelative } from "@/lib/utils";
import type { DocType, WriterRun } from "@/types/writer";

const DOC_TYPE_CONFIG: Record<DocType, { icon: React.ElementType; color: string; label: string }> = {
  paper: { icon: FileText, color: "#6366f1", label: "Paper" },
  article: { icon: Newspaper, color: "#06b6d4", label: "Article" },
  summary: { icon: AlignLeft, color: "#22c55e", label: "Summary" },
  draft: { icon: PenLine, color: "#f59e0b", label: "Draft" },
};

const STATUS_LABELS: Record<string, string> = {
  CLARIFYING: "Clarifying",
  OUTLINING: "Outlining",
  VALIDATING: "Validating",
  ALLOCATING: "Configuring",
  WRITING: "Writing",
  ASSEMBLING: "Assembling",
  DONE: "Done",
  FAILED: "Failed",
};

const STATUS_COLORS: Record<string, string> = {
  DONE: "#22c55e",
  FAILED: "#ef4444",
  WRITING: "#6366f1",
  ASSEMBLING: "#8b5cf6",
  CLARIFYING: "#f59e0b",
};

export function WriterRunList() {
  const { runs, activeRunId, setActiveRun, deleteRun } = useWriterStore();

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-white/5">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setActiveRun(null)}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{
            background:
              activeRunId === null
                ? "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))"
                : "rgba(255,255,255,0.04)",
            border: "1px solid",
            borderColor: activeRunId === null ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.07)",
            color: activeRunId === null ? "#a5b4fc" : "var(--text-dim)",
          }}
        >
          <Plus size={14} />
          New Document
        </motion.button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <motion.div
          variants={listContainerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-1"
        >
          <AnimatePresence>
            {runs.map((run) => (
              <RunItem
                key={run.id}
                run={run}
                isActive={run.id === activeRunId}
                onSelect={() => setActiveRun(run.id)}
                onDelete={() => deleteRun(run.id)}
              />
            ))}
          </AnimatePresence>
          {runs.length === 0 && (
            <div className="px-3 py-8 text-center text-xs" style={{ color: "var(--text-faint)" }}>
              No documents yet.
              <br />
              Start by creating a new one.
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function RunItem({
  run,
  isActive,
  onSelect,
  onDelete,
}: {
  run: WriterRun;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const cfg = DOC_TYPE_CONFIG[run.doc_type] ?? DOC_TYPE_CONFIG.draft;
  const Icon = cfg.icon;
  const statusColor = STATUS_COLORS[run.status] ?? "var(--text-faint)";

  return (
    <motion.div
      variants={listItemVariants}
      layout
      onClick={onSelect}
      className="group relative flex items-start gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all"
      style={{
        background: isActive ? "rgba(99,102,241,0.1)" : "transparent",
        border: "1px solid",
        borderColor: isActive ? "rgba(99,102,241,0.25)" : "transparent",
      }}
      whileHover={{
        background: isActive ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.03)",
        borderColor: isActive ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.06)",
      }}
    >
      <div
        className="mt-0.5 p-1.5 rounded-lg flex-shrink-0"
        style={{ background: `${cfg.color}20`, color: cfg.color }}
      >
        <Icon size={12} />
      </div>

      <div className="flex-1 min-w-0">
        <p
          className="text-xs font-medium truncate leading-tight"
          style={{ color: isActive ? "#e2e8f0" : "var(--text)" }}
        >
          {run.title || "Untitled"}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs" style={{ color: statusColor, fontSize: "10px" }}>
            ● {STATUS_LABELS[run.status] ?? run.status}
          </span>
          <span style={{ color: "var(--text-faint)", fontSize: "10px" }}>
            {formatRelative(run.created_at)}
          </span>
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity"
        style={{ color: "var(--text-faint)" }}
      >
        <Trash2 size={11} />
      </button>
    </motion.div>
  );
}
