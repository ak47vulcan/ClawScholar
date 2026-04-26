"use client";

import { Cog } from "lucide-react";
import { useWorkflowStore } from "@/stores/workflow-store";
import { useAgentStore } from "@/stores/agent-store";
import { ValidationBadge } from "./ValidationBadge";

export function WorkspaceHeader() {
  const workflows = useWorkflowStore((s) => s.workflows);
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const running = workflows.find((w) => w.status === "RUNNING");
  const lastCompleted = workflows.filter((w) => w.status === "COMPLETED").at(-1);
  const active = running ?? lastCompleted;
  const verdict = (active?.librarianVerdict?.verdict as string | undefined) ?? (running ? "PENDING" : undefined);
  const confidence = active?.librarianVerdict?.confidence_score as number | undefined;

  return (
    <div
      className="flex items-center gap-3 px-6 py-3 border-b shrink-0"
      style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
    >
      {/* Agent engine badge */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: isStreaming ? "#22c55e" : "var(--muted)" }}
        />
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          ClawScholar
        </span>
      </div>

      <span style={{ color: "var(--border)" }}>|</span>

      <div className="flex-1 min-w-0">
        {active ? (
          <p className="text-xs font-medium truncate" style={{ color: "var(--text-dim)" }}>
            {running && (
              <Cog size={11} className="inline animate-spin mr-1.5" style={{ color: "var(--primary)" }} />
            )}
            <span style={{ color: "var(--text)" }}>{active.goalTitle}</span>
          </p>
        ) : (
          <p className="text-xs" style={{ color: "var(--text-faint)" }}>
            No active run — submit a goal to start
          </p>
        )}
      </div>

      <ValidationBadge
        verdict={(verdict as any) ?? "PENDING"}
        confidence={typeof confidence === "number" ? confidence : undefined}
      />
    </div>
  );
}
