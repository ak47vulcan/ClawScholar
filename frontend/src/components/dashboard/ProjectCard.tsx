"use client";

import { motion } from "framer-motion";
import { Layers, CheckCircle2, Clock, AlertCircle, Archive, ChevronRight } from "lucide-react";
import { formatRelative } from "@/lib/utils";
import type { Project } from "@/types/project";

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "#22c55e",
  RUNNING: "#6366f1",
  FAILED: "#ef4444",
  PENDING: "#f59e0b",
};

function LastRunBadge({ status, at }: { status: string | null; at: string | null }) {
  if (!status) return <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>No workflows yet</span>;
  const color = STATUS_COLORS[status] ?? "var(--text-faint)";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>
        {status === "RUNNING" ? "Running…" : at ? formatRelative(at) : status}
      </span>
    </div>
  );
}

interface ProjectCardProps {
  project: Project;
  isSelected: boolean;
  onClick: () => void;
}

export function ProjectCard({ project, isSelected, onClick }: ProjectCardProps) {
  const isArchived = project.status === "ARCHIVED";

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.015, y: -1 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.15 }}
      className="w-full text-left rounded-xl p-4 flex flex-col gap-3 transition-all duration-150 relative overflow-hidden"
      style={{
        background: isSelected ? "rgba(99,102,241,0.12)" : "var(--surface-2)",
        border: `1px solid ${isSelected ? "rgba(99,102,241,0.5)" : "var(--border)"}`,
        boxShadow: isSelected ? "0 0 0 1px rgba(99,102,241,0.3), 0 4px 20px rgba(99,102,241,0.1)" : "none",
        opacity: isArchived ? 0.6 : 1,
      }}
    >
      {/* Glow strip top */}
      {isSelected && (
        <div
          className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl"
          style={{ background: "linear-gradient(90deg, #6366f1, #8b5cf6)" }}
        />
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: isSelected ? "rgba(99,102,241,0.2)" : "var(--surface-3)",
              border: `1px solid ${isSelected ? "rgba(99,102,241,0.3)" : "var(--border)"}`,
            }}
          >
            {isArchived ? (
              <Archive size={13} style={{ color: "var(--muted)" }} />
            ) : (
              <Layers size={13} style={{ color: isSelected ? "#818cf8" : "var(--text-dim)" }} />
            )}
          </div>
          <span
            className="font-semibold text-sm leading-snug line-clamp-2"
            style={{ color: isSelected ? "var(--text)" : "var(--text-dim)" }}
          >
            {project.title}
          </span>
        </div>
        <ChevronRight
          size={14}
          className="shrink-0 mt-0.5 transition-transform"
          style={{
            color: isSelected ? "#818cf8" : "var(--border)",
            transform: isSelected ? "rotate(90deg)" : "none",
          }}
        />
      </div>

      {project.description && (
        <p className="text-[11px] line-clamp-2 leading-relaxed" style={{ color: "var(--text-faint)" }}>
          {project.description}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 mt-auto pt-1" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex items-center gap-1.5">
          <Clock size={11} style={{ color: "var(--text-faint)" }} />
          <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
            {project.workflow_count} {project.workflow_count === 1 ? "Workflow" : "Workflows"}
          </span>
        </div>
        <LastRunBadge status={project.last_run_status} at={project.last_run_at} />
      </div>
    </motion.button>
  );
}
