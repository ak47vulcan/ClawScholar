"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { ClarificationPanel } from "@/components/workspace/ClarificationPanel";
import { useUIStore } from "@/stores/ui-store";
import { useAgentStore } from "@/stores/agent-store";
import { useWorkflowStore } from "@/stores/workflow-store";
import { api } from "@/lib/api-client";

type Phase = "input" | "clarifying" | "submitting";

const EXAMPLE_GOALS = [
  "I have a deadline on Tuesday for an EV paper — block deep-work slots and gather key PDFs",
  "Write a literature review on Retrieval-Augmented Generation systems",
  "Identify the top 10 most cited papers on transformer architectures",
  "Plan my week for a submission and save the most relevant papers",
];

interface GoalResponse {
  id: string;
  title: string;
  description?: string | null;
}

interface WorkflowResponse {
  id: string;
  goal_id: string;
  status: string;
}

export function GoalInput() {
  const [goal, setGoal] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [pendingGoal, setPendingGoal] = useState("");

  const addToast = useUIStore((s) => s.addToast);
  const { clearLogs, setActiveRunId, setStreaming } = useAgentStore();
  const { addWorkflow, setSelectedWorkflow } = useWorkflowStore();

  const handleSubmit = () => {
    if (!goal.trim()) return;
    setPendingGoal(goal.trim());
    setPhase("clarifying");
  };

  const handleConfirm = async (enrichedGoal: string) => {
    setPhase("submitting");
    try {
      const description = enrichedGoal;
      const title = description.length > 80 ? `${description.slice(0, 77)}…` : description;

      const createdGoal = await api.post<GoalResponse>("/goals", { title, description });

      const run = await api.post<WorkflowResponse>("/workflows/start", {
        goal_id: createdGoal.id,
        initial_message: description,
        force_schedule: true,
      });

      clearLogs();
      setActiveRunId(run.id);
      setStreaming(true);

      addWorkflow({
        id: run.id,
        goalId: createdGoal.id,
        goalTitle: createdGoal.title,
        status: "RUNNING",
        agentAssigned: "ORCHESTRATOR",
        progress: 0,
        startedAt: new Date().toISOString(),
        cognitiveWeight: 5,
      });
      setSelectedWorkflow(run.id);

      addToast({
        type: "success",
        message: `Workflow started for "${createdGoal.title.slice(0, 50)}"`,
      });
      setGoal("");
      setPhase("input");
    } catch (err: unknown) {
      addToast({ type: "error", message: err instanceof Error ? err.message : "Failed to start workflow" });
      setPhase("input");
    }
  };

  return (
    <div className="glass p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Zap size={16} className="text-indigo-400" />
        <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
          Workspace task
        </h2>
      </div>

      <AnimatePresence mode="wait">
        {phase === "input" && (
          <motion.div
            key="input"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-4"
          >
            <div className="relative">
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder='E.g. "I have a deadline on Tuesday for an EV paper. Block deep-work slots, find and save key PDFs, then draft an outline."'
                rows={4}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
                }}
                className="w-full resize-none text-sm rounded-lg px-3 py-2.5 transition-all duration-150 outline-none"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--primary)";
                  e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.15)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--border)";
                  e.target.style.boxShadow = "none";
                }}
              />
              <span className="absolute bottom-2 right-3 text-[10px]" style={{ color: "var(--text-faint)" }}>
                ⌘ + Enter
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                Examples
              </p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_GOALS.map((eg) => (
                  <motion.button
                    key={eg}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => setGoal(eg)}
                    className="text-[11px] px-2.5 py-1 rounded-badge text-left transition-colors"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      color: "var(--text-dim)",
                    }}
                  >
                    {eg.length > 50 ? eg.slice(0, 50) + "…" : eg}
                  </motion.button>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="primary"
                size="md"
                icon={<Send size={14} />}
                disabled={!goal.trim()}
                onClick={handleSubmit}
              >
                Next
              </Button>
            </div>
          </motion.div>
        )}

        {phase === "clarifying" && (
          <ClarificationPanel
            goalText={pendingGoal}
            onConfirm={handleConfirm}
            onBack={() => setPhase("input")}
          />
        )}

        {phase === "submitting" && (
          <motion.div
            key="submitting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-10 gap-3"
          >
            <Loader2 size={24} className="animate-spin text-indigo-400" />
            <p className="text-sm" style={{ color: "var(--text-dim)" }}>Starting workflow…</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
