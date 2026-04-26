"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Plus, Trash2, Archive, ChevronRight, Clock, CheckCircle2,
  AlertCircle, Loader, Circle, GitBranch,
} from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { useAgentStore } from "@/stores/agent-store";
import { useRouter } from "next/navigation";
import { WorkflowPipeline } from "./WorkflowPipeline";
import type { ProjectDetail, ProjectWorkflowItem } from "@/types/project";
import { formatRelative } from "@/lib/utils";

const WF_STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  COMPLETED: { icon: <CheckCircle2 size={13} />, color: "#22c55e", label: "Completed" },
  RUNNING: { icon: <Loader size={13} className="animate-spin" />, color: "#6366f1", label: "Running…" },
  FAILED: { icon: <AlertCircle size={13} />, color: "#ef4444", label: "Failed" },
  PENDING: { icon: <Circle size={13} />, color: "#f59e0b", label: "Pending" },
};

function WorkflowListItem({
  wf,
  index,
  isSelected,
  onClick,
}: {
  wf: ProjectWorkflowItem;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const cfg = WF_STATUS_CONFIG[wf.status] ?? WF_STATUS_CONFIG.PENDING;

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-all duration-150"
      style={{
        background: isSelected ? "rgba(99,102,241,0.1)" : "transparent",
        border: `1px solid ${isSelected ? "rgba(99,102,241,0.3)" : "transparent"}`,
      }}
    >
      <div
        className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-mono shrink-0"
        style={{
          background: isSelected ? "rgba(99,102,241,0.2)" : "var(--surface-3)",
          color: isSelected ? "#818cf8" : "var(--muted)",
        }}
      >
        #{index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: isSelected ? "var(--text)" : "var(--text-dim)" }}>
          {wf.goal_title}
        </p>
        <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>
          {formatRelative(wf.created_at)}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0" style={{ color: cfg.color }}>
        {cfg.icon}
      </div>
    </button>
  );
}

interface ProjectDetailPanelProps {
  projectId: string;
}

export function ProjectDetailPanel({ projectId }: ProjectDetailPanelProps) {
  const { loadProjectDetail, deleteProject, projects } = useProjectStore();
  const { setActiveRunId, setStreaming } = useAgentStore();
  const router = useRouter();

  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const project = projects.find((p) => p.id === projectId);

  useEffect(() => {
    setIsLoading(true);
    loadProjectDetail(projectId)
      .then((d) => {
        setDetail(d);
        // Auto-select first (most recent) workflow
        if (d.workflows.length > 0) {
          const runningWf = d.workflows.find((w) => w.status === "RUNNING");
          const toSelect = runningWf ?? d.workflows[0];
          setSelectedWorkflowId(toSelect.id);
          if (toSelect.status === "RUNNING") {
            setActiveRunId(toSelect.id);
            setStreaming(true);
          }
        }
      })
      .finally(() => setIsLoading(false));
  }, [projectId]);

  const selectedWf = detail?.workflows.find((w) => w.id === selectedWorkflowId);

  const handleDelete = async () => {
    if (!confirm(`Really delete project "${project?.title}"?`)) return;
    setIsDeleting(true);
    await deleteProject(projectId);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--primary)" }} />
      </div>
    );
  }

  if (!project || !detail) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col h-full overflow-hidden"
    >
      {/* Project header */}
      <div className="px-5 py-4 shrink-0 flex items-start justify-between gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="min-w-0">
          <h2 className="font-bold text-base leading-tight" style={{ color: "var(--text)" }}>
            {project.title}
          </h2>
          {project.description && (
            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-dim)" }}>
              {project.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
              style={{
                background: project.status === "ACTIVE" ? "rgba(34,197,94,0.15)" : "var(--surface-3)",
                color: project.status === "ACTIVE" ? "#22c55e" : "var(--muted)",
              }}
            >
              {project.status === "ACTIVE" ? "Active" : "Archived"}
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
              {detail.workflow_count} {detail.workflow_count === 1 ? "Workflow" : "Workflows"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => router.push(`/workspace?project=${projectId}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.3)" }}
          >
            <Plus size={12} />
            New Workflow
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/10"
            style={{ border: "1px solid var(--border)" }}
            title="Delete project"
          >
            {isDeleting ? <Loader2 size={12} className="animate-spin text-red-400" /> : <Trash2 size={12} style={{ color: "var(--muted)" }} />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Workflow list sidebar */}
        <div
          className="w-48 shrink-0 flex flex-col overflow-hidden"
          style={{ borderRight: "1px solid var(--border)" }}
        >
          <div className="px-3 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              Workflow History
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
            {detail.workflows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-center px-2">
                <GitBranch size={16} style={{ color: "var(--text-faint)" }} />
                <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                  No workflows yet
                </p>
              </div>
            ) : (
              detail.workflows.map((wf, i) => (
                <WorkflowListItem
                  key={wf.id}
                  wf={wf}
                  index={detail.workflows.length - 1 - i}
                  isSelected={wf.id === selectedWorkflowId}
                  onClick={() => {
                    setSelectedWorkflowId(wf.id);
                    if (wf.status === "RUNNING") {
                      setActiveRunId(wf.id);
                      setStreaming(true);
                    }
                  }}
                />
              ))
            )}
          </div>
        </div>

        {/* Workflow detail */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          <AnimatePresence mode="wait">
            {selectedWf ? (
              <motion.div
                key={selectedWf.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-4"
              >
                {/* Workflow info */}
                <div
                  className="rounded-xl p-3 flex items-start justify-between gap-3"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>
                      {selectedWf.goal_title}
                    </p>
                    {selectedWf.goal_description && selectedWf.goal_description !== selectedWf.goal_title && (
                      <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: "var(--text-dim)" }}>
                        {selectedWf.goal_description}
                      </p>
                    )}
                    <p className="text-[10px] mt-1" style={{ color: "var(--text-faint)" }}>
                      Started {formatRelative(selectedWf.created_at)}
                      {selectedWf.completed_at && ` · Completed ${formatRelative(selectedWf.completed_at)}`}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {(() => {
                      const cfg = WF_STATUS_CONFIG[selectedWf.status];
                      return (
                        <span
                          className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full"
                          style={{ background: `${cfg.color}20`, color: cfg.color }}
                        >
                          {cfg.icon}
                          {cfg.label}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Pipeline visualization */}
                <div
                  className="rounded-xl p-4"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
                    Agent Pipeline
                  </p>
                  <WorkflowPipeline runId={selectedWf.id} workflowStatus={selectedWf.status} />
                </div>

                {/* Result for completed workflows */}
                {selectedWf.status === "COMPLETED" && (
                  <WorkflowResult runId={selectedWf.id} />
                )}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-16 gap-3"
              >
                <GitBranch size={32} style={{ color: "var(--border)" }} />
                <p className="text-sm" style={{ color: "var(--text-faint)" }}>
                  Select a workflow
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

function WorkflowResult({ runId }: { runId: string }) {
  const { logs } = useAgentStore();
  const verdictLog = logs
    .filter((l) => l.runId === runId && l.agentType === "LIBRARIAN")
    .findLast((l) => l.action === "VERDICT" || l.action === "COMPLETE");

  const analystLog = logs
    .filter((l) => l.runId === runId && l.agentType === "ANALYST")
    .findLast((l) => l.action === "COMPLETE" || l.action === "FINALIZE");

  if (!verdictLog && !analystLog) return null;

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: "var(--surface-2)", border: "1px solid rgba(34,197,94,0.3)" }}
    >
      <div className="flex items-center gap-2">
        <CheckCircle2 size={14} className="text-green-400" />
        <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>Result</p>
      </div>
      {analystLog && (
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
          {analystLog.message}
        </p>
      )}
      {verdictLog && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
            Librarian: {verdictLog.message.slice(0, 60)}
          </span>
        </div>
      )}
    </div>
  );
}
