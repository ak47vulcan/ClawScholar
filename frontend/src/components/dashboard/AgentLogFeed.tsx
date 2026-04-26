"use client";

import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Clock, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { useAgentStore } from "@/stores/agent-store";
import { formatRelative } from "@/lib/utils";
import { AGENT_COLORS } from "@/lib/constants";
import type { AgentLogEntry } from "@/types/agent";
import { listContainerVariants, listItemVariants } from "@/lib/motion-variants";

const ACTION_ICONS: Record<string, React.ReactNode> = {
  COMPLETE: <CheckCircle size={12} className="text-green-400" />,
  VERDICT: <CheckCircle size={12} className="text-green-400" />,
  FINALIZE: <CheckCircle size={12} className="text-green-400" />,
  ERROR: <AlertTriangle size={12} className="text-red-400" />,
  ANALYZE: <Loader2 size={12} className="text-indigo-400 animate-spin" />,
  ROUTE: <Loader2 size={12} className="text-purple-400 animate-spin" />,
  DECOMPOSE: <Loader2 size={12} className="text-indigo-400 animate-spin" />,
  VALIDATE: <Loader2 size={12} className="text-amber-400 animate-spin" />,
  RETRY: <Loader2 size={12} className="text-orange-400 animate-spin" />,
};

// Maps ClawScholar agent type → label shown in the feed
const AGENT_SKILL_LABELS: Record<string, string> = {
  SCHEDULER: "scheduler-agent",
  ANALYST: "analyst-agent",
  LIBRARIAN: "librarian-agent",
  ORCHESTRATOR: "orchestrator",
};

function LogEntry({ entry }: { entry: AgentLogEntry }) {
  const { toggleLogExpanded } = useAgentStore();
  const color = AGENT_COLORS[entry.agentType];

  return (
    <motion.div variants={listItemVariants} className="group">
      <button
        onClick={() => toggleLogExpanded(entry.id)}
        className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-[var(--surface-2)] transition-colors text-left"
      >
        {/* Agent color strip — wider + glow when active */}
        <div
          className="w-1 self-stretch rounded-full shrink-0 mt-0.5"
          style={{
            background: color,
            boxShadow: entry.action !== "COMPLETE" && entry.action !== "VERDICT" && entry.action !== "FINALIZE" && entry.action !== "ERROR"
              ? `0 0 6px ${color}80`
              : undefined,
          }}
        />

        {/* Icon */}
        <span className="mt-0.5 shrink-0">
          {ACTION_ICONS[entry.action] ?? <div className="w-3 h-3 rounded-full" style={{ background: color }} />}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-semibold font-mono" style={{ color }}>
              {AGENT_SKILL_LABELS[entry.agentType] ?? entry.agentType.toLowerCase()}
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>·</span>
            <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              {entry.action}
            </span>
          </div>
          <p className="text-xs truncate" style={{ color: "var(--text-dim)" }}>{entry.message}</p>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-1.5 shrink-0">
          {entry.durationMs !== undefined && (
            <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
              <Clock size={10} />
              {entry.durationMs < 1000 ? `${entry.durationMs}ms` : `${(entry.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
          <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
            {formatRelative(entry.timestamp)}
          </span>
          {entry.payload && (
            <motion.span animate={{ rotate: entry.isExpanded ? 90 : 0 }}>
              <ChevronRight size={12} style={{ color: "var(--muted)" }} />
            </motion.span>
          )}
        </div>
      </button>

      <AnimatePresence>
        {entry.isExpanded && entry.payload && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <pre className="mx-4 mb-2 p-2 rounded-md text-[11px] font-mono overflow-x-auto"
              style={{ background: "var(--surface-3)", color: "var(--text-dim)" }}>
              {JSON.stringify(entry.payload, null, 2)}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function AgentLogFeed({ compact }: { compact?: boolean }) {
  const logs = useAgentStore((s) => s.logs);
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length]);

  const displayLogs = compact ? logs.slice(-5) : logs;

  return (
    <div className={`glass flex flex-col overflow-hidden ${compact ? "max-h-48" : "h-full"}`}>
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 border-b shrink-0 transition-all duration-300 ${isStreaming ? "topbar-live-glow" : ""}`}
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>Agent Feed</span>
          <span className="text-xs px-2 py-0.5 rounded-badge font-medium"
            style={{ background: "var(--surface-3)", color: "var(--text-dim)" }}>
            {logs.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`status-dot streaming-indicator ${isStreaming ? "status-dot-active" : "status-dot-idle"}`} />
          <span className="text-[10px] font-medium" style={{ color: isStreaming ? "var(--success)" : "var(--muted)" }}>
            {isStreaming ? "Live" : "Paused"}
          </span>
        </div>
      </div>

      {/* Log list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto divide-y divide-[color:var(--border)]">
        <motion.div variants={listContainerVariants} initial="hidden" animate="visible">
          {displayLogs.map((entry) => (
            <LogEntry key={entry.id} entry={entry} />
          ))}
        </motion.div>

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="px-4 py-2 flex items-center gap-2">
            <div className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1 h-1 rounded-full"
                  style={{ background: "var(--muted)" }}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </div>
            <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>Agents processing…</span>
          </div>
        )}
      </div>
    </div>
  );
}
