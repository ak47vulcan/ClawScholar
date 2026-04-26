"use client";

import { Search, Bell, Activity } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { useAgentStore } from "@/stores/agent-store";
import { AGENT_COLORS, AGENT_TYPES } from "@/lib/constants";
import type { AgentStatus } from "@/types/agent";

interface TopbarProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

const STATUS_LOAD: Record<AgentStatus, number> = {
  IDLE: 0,
  ACTIVE: 100,
  WAITING: 55,
  ERROR: 25,
};

function AgentLoadIndicator({ statuses }: { statuses: Record<string, AgentStatus> }) {
  const load = Math.round(
    AGENT_TYPES.reduce((sum, agent) => sum + STATUS_LOAD[statuses[agent] ?? "IDLE"], 0) / AGENT_TYPES.length
  );
  const activeAgents = AGENT_TYPES.filter((agent) => statuses[agent] === "ACTIVE").length;
  const color = load < 35 ? "#22c55e" : load < 70 ? "#f59e0b" : "#ef4444";

  return (
    <div
      className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
      title={`${activeAgents} active agents, ${load}% load`}
    >
      <Activity size={13} style={{ color }} />
      <span>Agent Load</span>
      <div className="flex items-center gap-0.5">
        {AGENT_TYPES.map((agent) => {
          const isActive = statuses[agent] === "ACTIVE";
          const isWaiting = statuses[agent] === "WAITING";
          return (
            <span
              key={agent}
              className="w-1.5 h-3 rounded-full transition-all duration-300"
              style={{
                background: isActive || isWaiting ? AGENT_COLORS[agent] : "var(--surface-3)",
                opacity: isActive ? 1 : isWaiting ? 0.65 : 0.45,
              }}
            />
          );
        })}
      </div>
      <span className="tabular-nums" style={{ color }}>{load}%</span>
    </div>
  );
}

export function Topbar({ title, subtitle, action }: TopbarProps) {
  const { openCommandPalette } = useUIStore();
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const agentStatuses = useAgentStore((s) => s.agentStatuses);

  return (
    <header
      className="flex items-center gap-4 px-6 border-b shrink-0"
      style={{
        height: "var(--topbar-height)",
        borderColor: "var(--border)",
        background: "var(--surface-1)",
      }}
    >
      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs truncate" style={{ color: "var(--text-dim)" }}>{subtitle}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {action && action}
        {/* Live indicator */}
        <div
          className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-all duration-300 ${isStreaming ? "topbar-live-glow" : ""}`}
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: isStreaming ? "#22c55e" : "var(--muted)" }}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${isStreaming ? "streaming-indicator" : ""}`}
            style={{ background: isStreaming ? "#22c55e" : "var(--muted)", display: "inline-block" }}
          />
          Live
        </div>

        <AgentLoadIndicator statuses={agentStatuses} />

        <button
          onClick={openCommandPalette}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors focus-ring"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-dim)",
          }}
          aria-label="Open command palette"
        >
          <Search size={13} />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden sm:inline px-1 rounded text-[10px]" style={{ background: "var(--surface-3)", color: "var(--muted)" }}>
            ⌘K
          </kbd>
        </button>

        <button
          className="relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--surface-2)]"
          style={{ color: "var(--text-dim)" }}
          aria-label="Notifications"
        >
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500" />
        </button>
      </div>
    </header>
  );
}
