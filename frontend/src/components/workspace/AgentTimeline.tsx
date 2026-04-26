"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, AlertCircle, Loader2 } from "lucide-react";
import { useAgentStore } from "@/stores/agent-store";
import { useWorkflowStore } from "@/stores/workflow-store";
import type { AgentLogEntry } from "@/types/agent";

type StepStatus = "done" | "active" | "error" | "pending";

interface TimelineStep {
  agentType: string;
  label: string;
  icon: string;
  description: string;
}

const STEPS: TimelineStep[] = [
  { agentType: "ORCHESTRATOR", label: "Route", icon: "🧭", description: "Analyzing goal and routing" },
  { agentType: "SCHEDULER", label: "Scheduler", icon: "📅", description: "Breaking into tasks & schedule" },
  { agentType: "ANALYST", label: "Analyst", icon: "🔬", description: "Researching & generating output" },
  { agentType: "LIBRARIAN", label: "Librarian", icon: "📚", description: "Validating sources & quality" },
];

function stepStatusFromLogs(logs: AgentLogEntry[], agentType: string): { status: StepStatus; latestLog?: AgentLogEntry } {
  const agentLogs = logs.filter((l) => l.agentType === agentType);
  if (agentLogs.length === 0) return { status: "pending" };
  const last = agentLogs[agentLogs.length - 1];
  if (last.action === "ERROR") return { status: "error", latestLog: last };
  if (["COMPLETE", "VERDICT", "FINALIZE"].includes(last.action)) return { status: "done", latestLog: last };
  return { status: "active", latestLog: last };
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done") return <CheckCircle2 size={16} className="text-green-400 shrink-0" />;
  if (status === "error") return <AlertCircle size={16} className="text-red-400 shrink-0" />;
  if (status === "active") return <Loader2 size={16} className="animate-spin text-indigo-400 shrink-0" />;
  return <Circle size={16} className="shrink-0" style={{ color: "var(--border)" }} />;
}

function SubStepList({ logs }: { logs: AgentLogEntry[] }) {
  return (
    <div className="flex flex-col gap-1 mt-2 pl-1 max-h-[80px] overflow-y-auto">
      {logs.map((log) => (
        <motion.div
          key={log.id}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-start gap-2"
        >
          <div
            className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
            style={{
              background:
                log.action === "ERROR"
                  ? "#ef4444"
                  : log.action === "COMPLETE" || log.action === "VERDICT"
                  ? "#22c55e"
                  : "#6366f1",
            }}
          />
          <div className="min-w-0">
            <p className="text-[11px] leading-snug" style={{ color: "var(--text-dim)" }}>
              <span
                className="font-mono text-[10px] mr-1 px-1 rounded"
                style={{ background: "var(--surface-3)", color: "var(--muted)" }}
              >
                {log.action}
              </span>
              {log.message}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export function AgentTimeline() {
  const { logs } = useAgentStore();
  const { workflows, selectedWorkflowId } = useWorkflowStore();

  const activeRun = workflows.find((w) => w.id === selectedWorkflowId) ?? workflows.find((w) => w.status === "RUNNING");
  const runId = activeRun?.id;
  const runLogs = runId ? logs.filter((l) => l.runId === runId) : logs;
  const hasActivity = runLogs.length > 0;

  return (
    <div className="glass flex flex-col overflow-hidden h-full" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="px-4 py-3 shrink-0 flex items-center gap-2 border-b" style={{ borderColor: "var(--border)" }}>
        <motion.div
          animate={hasActivity ? { opacity: [1, 0.4, 1] } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-2 h-2 rounded-full"
          style={{ background: hasActivity ? "#6366f1" : "var(--border)" }}
        />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Agent Pipeline
        </span>
        {activeRun && (
          <span className="ml-auto text-[10px] truncate max-w-[120px]" style={{ color: "var(--text-faint)" }}>
            {activeRun.goalTitle}
          </span>
        )}
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1">
        {STEPS.map((step, i) => {
          const { status, latestLog } = stepStatusFromLogs(runLogs, step.agentType);
          const stepLogs = runLogs.filter((l) => l.agentType === step.agentType);
          const isLast = i === STEPS.length - 1;

          return (
            <div key={step.agentType} className="relative flex flex-col">
              {/* Animated connector line */}
              {!isLast && (
                <motion.div
                  className="absolute left-[7px] top-6 w-0.5 h-4"
                  animate={{
                    background: status === "done"
                      ? "rgba(34,197,94,0.5)"
                      : status === "active"
                      ? ["rgba(99,102,241,0.8)", "rgba(139,92,246,0.8)", "rgba(99,102,241,0.8)"]
                      : "var(--border)",
                  }}
                  transition={
                    status === "active"
                      ? { duration: 1.5, repeat: Infinity }
                      : { duration: 0.4 }
                  }
                />
              )}

              <motion.div
                initial={{ opacity: 0.6 }}
                animate={{ opacity: status === "pending" ? 0.4 : 1 }}
                className="flex items-start gap-3 py-1.5"
              >
                {/* Icon with pulse ring on active */}
                <div className="relative mt-0.5 shrink-0">
                  {status === "active" && (
                    <motion.div
                      className="absolute inset-0 rounded-full"
                      style={{ background: "rgba(99,102,241,0.3)" }}
                      animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{ duration: 1.6, repeat: Infinity }}
                    />
                  )}
                  <StepIcon status={status} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-base leading-none">{step.icon}</span>
                    <span
                      className="text-xs font-semibold"
                      style={{
                        color: status === "active" ? "var(--primary)" : status === "done" ? "var(--text)" : "var(--text-dim)",
                      }}
                    >
                      {step.label}
                    </span>
                    {status === "active" && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[9px] px-1.5 py-0.5 rounded-full"
                        style={{ background: "rgba(99,102,241,0.2)", color: "var(--primary)" }}
                      >
                        RUNNING
                      </motion.span>
                    )}
                  </div>

                  {latestLog ? (
                    <p className="text-[11px] leading-snug" style={{ color: "var(--text-dim)" }}>
                      {latestLog.message}
                    </p>
                  ) : (
                    <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                      {step.description}
                    </p>
                  )}

                  {/* Indeterminate progress bar for active step */}
                  <AnimatePresence>
                    {status === "active" && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="mt-1.5 h-0.5 rounded-full overflow-hidden"
                        style={{ background: "var(--surface-3)", width: "100%" }}
                      >
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: "linear-gradient(90deg, #6366f1, #8b5cf6)", width: "40%" }}
                          animate={{ x: ["-100%", "350%"] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {stepLogs.length > 1 && <SubStepList logs={stepLogs.slice(0, -1)} />}
                </div>
              </motion.div>
            </div>
          );
        })}

        {!hasActivity && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <p className="text-xs text-center" style={{ color: "var(--text-faint)" }}>
              Submit a goal above to start the agent pipeline
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
