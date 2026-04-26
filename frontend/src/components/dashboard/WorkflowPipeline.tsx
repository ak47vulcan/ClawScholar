"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertCircle, Loader2, ChevronDown, X, FileText, ListChecks, BookOpen, Code2 } from "lucide-react";
import { useAgentStore } from "@/stores/agent-store";
import type { AgentLogEntry } from "@/types/agent";

type StepStatus = "done" | "active" | "error" | "pending";

interface Step {
  agentType: string;
  label: string;
  icon: string;
  color: string;
}

const STEPS: Step[] = [
  { agentType: "ORCHESTRATOR", label: "Routing", icon: "🧭", color: "#8b5cf6" },
  { agentType: "SCHEDULER", label: "Scheduler", icon: "📅", color: "#6366f1" },
  { agentType: "ANALYST", label: "Analyst", icon: "🔬", color: "#0ea5e9" },
  { agentType: "LIBRARIAN", label: "Librarian", icon: "📚", color: "#22c55e" },
];

function stepStatus(logs: AgentLogEntry[], agentType: string): { status: StepStatus; latest?: AgentLogEntry } {
  const agentLogs = logs.filter((l) => l.agentType === agentType);
  if (agentLogs.length === 0) return { status: "pending" };
  const last = agentLogs[agentLogs.length - 1];
  if (last.action === "ERROR") return { status: "error", latest: last };
  if (["COMPLETE", "VERDICT", "FINALIZE"].includes(last.action)) return { status: "done", latest: last };
  return { status: "active", latest: last };
}

function StructuredPayload({ payload, agentType }: { payload: Record<string, unknown>; agentType: string }) {
  // Scheduler: show sub-tasks
  const subTasks = agentType === "SCHEDULER" &&
    (Array.isArray(payload.sub_tasks) ? payload.sub_tasks as Record<string, unknown>[] :
     Array.isArray((payload.output as Record<string, unknown>)?.sub_tasks) ? ((payload.output as Record<string, unknown>).sub_tasks) as Record<string, unknown>[] : null);

  if (subTasks && subTasks.length > 0) {
    return (
      <div className="mt-1.5 rounded-lg overflow-hidden" style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b" style={{ borderColor: "var(--border)" }}>
          <ListChecks size={10} style={{ color: "var(--muted)" }} />
          <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Subtasks ({subTasks.length})
          </span>
        </div>
        <div className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
          {subTasks.map((t, i) => (
            <div key={i} className="px-2 py-1.5">
              <p className="text-[10px] font-medium" style={{ color: "var(--text-dim)" }}>
                {i + 1}. {String(t.title || t.name || "Task")}
              </p>
              {!!t.description && (
                <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: "var(--text-faint)" }}>
                  {String(t.description).slice(0, 120)}{String(t.description).length > 120 ? "…" : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Librarian: show retrieved papers / verdict
  const papers = agentType === "LIBRARIAN" &&
    (Array.isArray(payload.retrieved_chunks) ? payload.retrieved_chunks as Record<string, unknown>[] :
     Array.isArray(payload.sources) ? payload.sources as Record<string, unknown>[] : null);

  if (papers && papers.length > 0) {
    return (
      <div className="mt-1.5 rounded-lg overflow-hidden" style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b" style={{ borderColor: "var(--border)" }}>
          <BookOpen size={10} style={{ color: "var(--muted)" }} />
          <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Sources ({papers.length})
          </span>
        </div>
        <div className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
          {papers.slice(0, 8).map((p, i) => (
            <div key={i} className="px-2 py-1.5">
              <p className="text-[10px] font-medium truncate" style={{ color: "var(--text-dim)" }}>
                {String(p.title || p.source || p.filename || `Source ${i + 1}`)}
              </p>
              {(p.score != null || p.confidence != null) && (
                <p className="text-[9px] mt-0.5" style={{ color: "var(--text-faint)" }}>
                  Score: {Number(p.score ?? p.confidence).toFixed(3)}
                </p>
              )}
            </div>
          ))}
          {papers.length > 8 && (
            <p className="px-2 py-1 text-[9px]" style={{ color: "var(--text-faint)" }}>
              +{papers.length - 8} more
            </p>
          )}
        </div>
      </div>
    );
  }

  // Analyst: show code snippet
  const code = agentType === "ANALYST" && (
    typeof payload.code === "string" ? payload.code :
    typeof (payload.output as Record<string, unknown>)?.code === "string" ? (payload.output as Record<string, unknown>).code as string : null
  );

  if (code) {
    return (
      <div className="mt-1.5 rounded-lg overflow-hidden" style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b" style={{ borderColor: "var(--border)" }}>
          <Code2 size={10} style={{ color: "var(--muted)" }} />
          <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Generated Code
          </span>
        </div>
        <pre className="px-2 py-2 text-[9px] overflow-x-auto leading-relaxed max-h-32" style={{ color: "var(--text-dim)", fontFamily: "monospace" }}>
          {String(code).slice(0, 600)}{String(code).length > 600 ? "\n…" : ""}
        </pre>
      </div>
    );
  }

  // Verdict / general payload
  const verdict = payload.verdict ?? payload.status ?? payload.result;
  const confidence = payload.confidence_score ?? payload.confidence;
  if (verdict || confidence != null) {
    return (
      <div className="mt-1.5 flex flex-wrap gap-2">
        {!!verdict && (
          <span
            className="text-[9px] px-2 py-0.5 rounded font-mono font-semibold"
            style={{
              background:
                String(verdict) === "APPROVED" ? "rgba(34,197,94,0.15)" :
                String(verdict) === "REJECTED" ? "rgba(239,68,68,0.15)" :
                "rgba(99,102,241,0.12)",
              color:
                String(verdict) === "APPROVED" ? "#4ade80" :
                String(verdict) === "REJECTED" ? "#f87171" :
                "#818cf8",
            }}
          >
            {String(verdict)}
          </span>
        )}
        {confidence != null && (
          <span className="text-[9px] px-2 py-0.5 rounded font-mono" style={{ background: "var(--surface-3)", color: "var(--text-faint)" }}>
            confidence: {Number(confidence).toFixed(2)}
          </span>
        )}
      </div>
    );
  }

  // Fallback: key-value
  const keys = Object.keys(payload).filter((k) => typeof payload[k] !== "object" || payload[k] === null);
  if (keys.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
      {keys.slice(0, 6).map((k) => (
        <span key={k} className="text-[9px]" style={{ color: "var(--text-faint)" }}>
          <span className="font-mono" style={{ color: "var(--muted)" }}>{k}:</span>{" "}
          {String(payload[k] ?? "—").slice(0, 40)}
        </span>
      ))}
    </div>
  );
}

interface LogEntryProps {
  log: AgentLogEntry;
  color: string;
  agentType: string;
}

function LogEntry({ log, color, agentType }: LogEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const hasPayload = log.payload && Object.keys(log.payload).length > 0;

  return (
    <div className="flex items-start gap-2">
      <div
        className="w-1 self-stretch rounded-full shrink-0 mt-1"
        style={{ background: color, minHeight: 12 }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{ background: "var(--surface-3)", color: "var(--muted)" }}
          >
            {log.action}
          </span>
          {log.durationMs && (
            <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
              {log.durationMs}ms
            </span>
          )}
          {hasPayload && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded transition-colors"
              style={{
                background: expanded ? "rgba(99,102,241,0.12)" : "var(--surface-3)",
                color: expanded ? "#818cf8" : "var(--text-faint)",
                border: "1px solid var(--border)",
              }}
            >
              <FileText size={8} />
              Details
              <ChevronDown size={8} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            </button>
          )}
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
          {log.message}
        </p>
        <AnimatePresence>
          {expanded && hasPayload && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <StructuredPayload payload={log.payload!} agentType={agentType} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface StepDetailPanelProps {
  step: Step;
  logs: AgentLogEntry[];
  onClose: () => void;
}

function StepDetailPanel({ step, logs, onClose }: StepDetailPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="overflow-hidden"
    >
      <div
        className="mt-3 rounded-xl p-4 flex flex-col gap-2"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-base">{step.icon}</span>
            <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{step.label} — Detail Log</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ background: "var(--surface-3)", color: "var(--text-faint)" }}
            >
              {logs.length} entries
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--surface-3)]"
          >
            <X size={12} style={{ color: "var(--muted)" }} />
          </button>
        </div>
        {logs.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-faint)" }}>No activity yet</p>
        ) : (
          <div className="flex flex-col gap-2.5 max-h-72 overflow-y-auto pr-1">
            {logs.map((log) => (
              <LogEntry key={log.id} log={log} color={step.color} agentType={step.agentType} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface WorkflowPipelineProps {
  runId: string | null;
  workflowStatus?: string;
}

export function WorkflowPipeline({ runId, workflowStatus }: WorkflowPipelineProps) {
  const { logs } = useAgentStore();
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const runLogs = runId ? logs.filter((l) => l.runId === runId) : [];
  const isComplete = workflowStatus === "COMPLETED" || workflowStatus === "FAILED";

  return (
    <div className="flex flex-col gap-3">
      {/* Horizontal pipeline */}
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const { status, latest } = stepStatus(runLogs, step.agentType);
          const isExpanded = expandedStep === step.agentType;
          const isLast = i === STEPS.length - 1;

          return (
            <div key={step.agentType} className="flex items-center flex-1">
              {/* Node */}
              <button
                onClick={() => setExpandedStep(isExpanded ? null : step.agentType)}
                className="flex-1 flex flex-col items-center gap-2 py-3 px-2 rounded-xl transition-all duration-150 group"
                style={{
                  background:
                    status === "active"
                      ? `${step.color}15`
                      : isExpanded
                      ? "var(--surface-2)"
                      : "transparent",
                  border: `1px solid ${
                    status === "active"
                      ? `${step.color}40`
                      : isExpanded
                      ? "var(--border)"
                      : "transparent"
                  }`,
                }}
              >
                {/* Icon with status ring */}
                <div className="relative">
                  {status === "active" && (
                    <motion.div
                      className="absolute inset-[-4px] rounded-full"
                      style={{ background: `${step.color}20` }}
                      animate={{ scale: [1, 1.4, 1], opacity: [0.8, 0, 0.8] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  )}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                    style={{
                      background:
                        status === "done"
                          ? "rgba(34,197,94,0.15)"
                          : status === "active"
                          ? `${step.color}20`
                          : status === "error"
                          ? "rgba(239,68,68,0.15)"
                          : "var(--surface-2)",
                      border: `1.5px solid ${
                        status === "done"
                          ? "rgba(34,197,94,0.4)"
                          : status === "active"
                          ? `${step.color}60`
                          : status === "error"
                          ? "rgba(239,68,68,0.4)"
                          : "var(--border)"
                      }`,
                    }}
                  >
                    {status === "done" ? (
                      <CheckCircle2 size={18} className="text-green-400" />
                    ) : status === "error" ? (
                      <AlertCircle size={18} className="text-red-400" />
                    ) : status === "active" ? (
                      <Loader2 size={18} className="animate-spin" style={{ color: step.color }} />
                    ) : (
                      <span className="opacity-50">{step.icon}</span>
                    )}
                  </div>
                </div>

                {/* Label */}
                <div className="flex flex-col items-center gap-0.5">
                  <span
                    className="text-[11px] font-semibold"
                    style={{
                      color:
                        status === "active"
                          ? step.color
                          : status === "done"
                          ? "var(--text)"
                          : "var(--text-faint)",
                    }}
                  >
                    {step.label}
                  </span>
                  {status === "active" && latest && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-[9px] text-center max-w-[80px] leading-tight truncate"
                      style={{ color: step.color }}
                    >
                      {latest.message.slice(0, 30)}
                    </motion.span>
                  )}
                  {status === "active" && (
                    <motion.div
                      className="h-0.5 w-10 rounded-full overflow-hidden mt-1"
                      style={{ background: `${step.color}20` }}
                    >
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: step.color, width: "40%" }}
                        animate={{ x: ["-100%", "350%"] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                      />
                    </motion.div>
                  )}
                  {(status === "done" || status === "error") && runLogs.filter((l) => l.agentType === step.agentType).length > 0 && (
                    <ChevronDown
                      size={10}
                      className="transition-transform"
                      style={{
                        color: "var(--text-faint)",
                        transform: isExpanded ? "rotate(180deg)" : "none",
                      }}
                    />
                  )}
                </div>
              </button>

              {/* Connector arrow */}
              {!isLast && (
                <div className="flex items-center justify-center w-6 shrink-0">
                  <motion.div
                    className="flex items-center gap-0.5"
                    animate={
                      status === "done" || status === "active"
                        ? {
                            opacity: [0.4, 1, 0.4],
                          }
                        : {}
                    }
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <div
                      className="h-0.5 w-3"
                      style={{
                        background:
                          status === "done"
                            ? "rgba(34,197,94,0.5)"
                            : status === "active"
                            ? `${step.color}60`
                            : "var(--border)",
                      }}
                    />
                    <div
                      className="w-0 h-0"
                      style={{
                        borderTop: "3px solid transparent",
                        borderBottom: "3px solid transparent",
                        borderLeft: `4px solid ${
                          status === "done"
                            ? "rgba(34,197,94,0.5)"
                            : status === "active"
                            ? `${step.color}60`
                            : "var(--border)"
                        }`,
                      }}
                    />
                  </motion.div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Expandable step detail */}
      <AnimatePresence>
        {expandedStep && (
          <StepDetailPanel
            key={expandedStep}
            step={STEPS.find((s) => s.agentType === expandedStep)!}
            logs={runLogs.filter((l) => l.agentType === expandedStep)}
            onClose={() => setExpandedStep(null)}
          />
        )}
      </AnimatePresence>

      {/* Empty state */}
      {runLogs.length === 0 && !isComplete && (
        <p className="text-center text-[11px] py-2" style={{ color: "var(--text-faint)" }}>
          Workflow not yet started
        </p>
      )}
    </div>
  );
}
