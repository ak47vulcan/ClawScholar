"use client";

import { motion } from "framer-motion";
import { useAgentStore } from "@/stores/agent-store";
import { AGENT_COLORS } from "@/lib/constants";
import type { AgentType } from "@/lib/constants";

interface PipelineNode {
  type: AgentType;
  label: string;
  emoji: string;
}

const PIPELINE: PipelineNode[] = [
  { type: "ORCHESTRATOR", label: "Orchestrator", emoji: "🧭" },
  { type: "SCHEDULER", label: "Scheduler", emoji: "📅" },
  { type: "ANALYST", label: "Analyst", emoji: "🔬" },
  { type: "LIBRARIAN", label: "Librarian", emoji: "📚" },
];

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "var(--primary)",
  WAITING: "var(--warning)",
  ERROR: "var(--danger)",
  IDLE: "var(--muted)",
};

export function AgentFlowGraph() {
  const { agentStatuses, logs } = useAgentStore();

  const latestLogByAgent = PIPELINE.reduce<Record<AgentType, string | undefined>>(
    (acc, node) => {
      const agentLogs = logs.filter((l) => l.agentType === node.type);
      acc[node.type] = agentLogs.length > 0 ? agentLogs[agentLogs.length - 1].message : undefined;
      return acc;
    },
    {} as Record<AgentType, string | undefined>
  );

  const hasActivity = logs.length > 0;

  return (
    <div
      className="glass p-4 flex flex-col gap-1"
      style={{ minHeight: 0 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <motion.div
          animate={hasActivity ? { opacity: [1, 0.3, 1] } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-2 h-2 rounded-full"
          style={{ background: hasActivity ? "var(--primary)" : "var(--border)" }}
        />
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Agent Pipeline
        </p>
      </div>

      <div className="flex items-stretch gap-0">
        {PIPELINE.map((node, i) => {
          const status = agentStatuses[node.type] ?? "IDLE";
          const color = AGENT_COLORS[node.type];
          const statusColor = STATUS_COLORS[status] ?? "var(--muted)";
          const isActive = status === "ACTIVE";
          const isDone = status === "IDLE" && latestLogByAgent[node.type] !== undefined;
          const isLast = i === PIPELINE.length - 1;
          const latestMsg = latestLogByAgent[node.type];

          return (
            <div key={node.type} className="flex items-center flex-1 min-w-0">
              {/* Node */}
              <motion.div
                animate={{ opacity: status === "IDLE" && !isDone ? 0.5 : 1 }}
                className="flex-1 min-w-0 rounded-xl p-2.5 flex flex-col gap-1 relative"
                style={{
                  background: isActive
                    ? `${color}12`
                    : "var(--surface-2)",
                  border: `1px solid ${isActive ? `${color}40` : "var(--border)"}`,
                  transition: "all 0.3s",
                }}
              >
                {/* Pulse ring for active node */}
                {isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-xl"
                    style={{ border: `1px solid ${color}` }}
                    animate={{ opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                  />
                )}

                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{node.emoji}</span>
                  <span className="text-[11px] font-semibold truncate" style={{ color: isActive ? color : "var(--text-dim)" }}>
                    {node.label}
                  </span>
                </div>

                {/* Status dot */}
                <div className="flex items-center gap-1">
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    animate={isActive ? { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] } : {}}
                    transition={{ duration: 1.2, repeat: Infinity }}
                    style={{ background: statusColor }}
                  />
                  <span className="text-[9px] font-medium uppercase tracking-wide" style={{ color: statusColor }}>
                    {status}
                  </span>
                </div>

                {latestMsg && (
                  <p className="text-[9px] leading-snug truncate" style={{ color: "var(--text-faint)" }}>
                    {latestMsg}
                  </p>
                )}
              </motion.div>

              {/* Connector arrow */}
              {!isLast && (
                <div className="flex items-center px-1 shrink-0">
                  <motion.div
                    className="h-0.5 w-4"
                    animate={{
                      background: isActive
                        ? [`${color}80`, `${color}ff`, `${color}80`]
                        : ["var(--border)", "var(--border)"],
                    }}
                    transition={isActive ? { duration: 1.2, repeat: Infinity } : {}}
                  />
                  <div
                    className="w-0 h-0"
                    style={{
                      borderTop: "3px solid transparent",
                      borderBottom: "3px solid transparent",
                      borderLeft: `4px solid ${isActive ? color : "var(--border)"}`,
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
