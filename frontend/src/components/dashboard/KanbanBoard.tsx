"use client";

import { motion } from "framer-motion";
import { Clock, CheckCircle2, AlertCircle, Loader2, Circle } from "lucide-react";
import { useWorkflowStore } from "@/stores/workflow-store";
import { AGENT_COLORS, KANBAN_COLUMNS, type WorkflowStatus } from "@/lib/constants";
import { formatRelative } from "@/lib/utils";
import type { WorkflowCard } from "@/types/agent";

const STATUS_META: Record<WorkflowStatus, { label: string; icon: React.ReactNode; color: string }> = {
  PENDING: { label: "Pending", icon: <Circle size={12} />, color: "var(--muted)" },
  RUNNING: { label: "Running", icon: <Loader2 size={12} className="animate-spin" />, color: "#6366f1" },
  COMPLETED: { label: "Completed", icon: <CheckCircle2 size={12} />, color: "#22c55e" },
  FAILED: { label: "Failed", icon: <AlertCircle size={12} />, color: "#ef4444" },
};

function WorkflowCardItem({ card }: { card: WorkflowCard }) {
  const { setSelectedWorkflow } = useWorkflowStore();
  const agentColor = AGENT_COLORS[card.agentAssigned];
  const meta = STATUS_META[card.status];

  return (
    <motion.div
      layoutId={card.id}
      whileHover={{ y: -2, boxShadow: "var(--glass-shadow-hover)" }}
      transition={{ duration: 0.15 }}
      onClick={() => setSelectedWorkflow(card.id)}
      className="glass-flat p-3 cursor-pointer select-none gradient-border"
      style={{ borderLeft: `3px solid ${agentColor}` }}
    >
      <p className="text-xs font-medium mb-2 line-clamp-2" style={{ color: "var(--text)" }}>
        {card.goalTitle}
      </p>

      {/* Progress bar */}
      {card.status === "RUNNING" && (
        <div className="mb-2">
          <div className="w-full h-1 rounded-full overflow-hidden progress-track">
            <motion.div
              className="h-full rounded-full progress-shimmer"
              initial={{ width: 0 }}
              animate={{ width: `${card.progress}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
          <p className="text-[10px] mt-0.5 text-right tabular-nums" style={{ color: "var(--muted)" }}>
            {card.progress}%
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1" style={{ color: meta.color }}>
          {meta.icon}
          <span className="text-[10px] font-medium">{card.agentAssigned}</span>
        </div>
        {card.startedAt && (
          <div className="flex items-center gap-1" style={{ color: "var(--text-faint)" }}>
            <Clock size={10} />
            <span className="text-[10px]">{formatRelative(card.startedAt)}</span>
          </div>
        )}
        <div
          className="flex items-center gap-1 px-1.5 py-0.5 rounded"
          style={{ background: "var(--surface-3)", color: "var(--muted)" }}
        >
          <span className="text-[9px] font-bold">W</span>
          <span className="text-[10px] font-medium tabular-nums">{card.cognitiveWeight}</span>
        </div>
      </div>
    </motion.div>
  );
}

function KanbanColumn({ status }: { status: WorkflowStatus }) {
  const cards = useWorkflowStore((s) => s.getByStatus(status));
  const meta = STATUS_META[status];

  return (
    <div className="flex flex-col gap-2 min-w-0" style={{ borderTop: `2px solid ${meta.color}40` }}>
      {/* Column header */}
      <div className="flex items-center gap-2 px-1 mb-1 pt-2">
        <span style={{ color: meta.color }}>{meta.icon}</span>
        <span className="text-xs font-semibold" style={{ color: "var(--text-dim)" }}>
          {meta.label}
        </span>
        <span
          className="ml-auto text-[10px] font-medium w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: "var(--surface-3)", color: "var(--muted)" }}
        >
          {cards.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2">
        {cards.length === 0 ? (
          <div
            className="rounded-lg py-6 flex items-center justify-center border border-dashed"
            style={{ borderColor: "var(--border)", color: "var(--text-faint)" }}
          >
            <span className="text-xs">Empty</span>
          </div>
        ) : (
          cards.map((card) => <WorkflowCardItem key={card.id} card={card} />)
        )}
      </div>
    </div>
  );
}

export function KanbanBoard() {
  return (
    <div className="glass flex flex-col h-full overflow-hidden">
      <div className="flex items-center px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
        <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Workflow Board</span>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-4 gap-4 min-w-[700px]">
          {KANBAN_COLUMNS.map((status) => (
            <KanbanColumn key={status} status={status} />
          ))}
        </div>
      </div>
    </div>
  );
}
