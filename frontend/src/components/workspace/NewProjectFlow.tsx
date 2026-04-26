"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, ArrowLeft, Zap, Loader2, Check, X,
  Sparkles, FolderOpen,
} from "lucide-react";
import { useProjectStore } from "@/stores/project-store";
import { useAgentStore } from "@/stores/agent-store";
import type { ClarifyQuestion } from "@/types/project";

type Phase = "goal" | "clarifying" | "loading_questions" | "submitting";

const PLACEHOLDER_GOALS = [
  "Analyse ML publication trends in 2024 and create a summary",
  "Find the top-10 most cited papers on transformer architectures",
  "Write a literature review on Retrieval-Augmented Generation",
  "Plan my week for a paper submission and collect relevant PDFs",
];

interface NewProjectFlowProps {
  onCreated: (projectId: string, runId: string) => void;
}

export function NewProjectFlow({ onCreated }: NewProjectFlowProps) {
  const { createProject, generateClarifyingQuestions, startProjectWorkflow } = useProjectStore();
  const { clearLogs, setActiveRunId, setStreaming } = useAgentStore();

  const [phase, setPhase] = useState<Phase>("goal");
  const [title, setTitle] = useState("");
  const [goalText, setGoalText] = useState("");
  const [questions, setQuestions] = useState<ClarifyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const handleGoalSubmit = async () => {
    if (!goalText.trim()) return;
    setPhase("loading_questions");
    setError(null);
    const derivedTitle = goalText.length > 60 ? goalText.slice(0, 57) + "…" : goalText;
    setTitle(derivedTitle);
    const qs = await generateClarifyingQuestions(goalText.trim());
    setQuestions(qs);
    setPhase("clarifying");
  };

  const toggleAnswer = (id: string) => {
    setAnswers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleStart = async () => {
    setPhase("submitting");
    setError(null);
    try {
      const project = await createProject(title, goalText.trim());
      // Derive writing_mode from clarification answers
      const wantsWriting = answers["writing_intent"] === true;
      const wantsAuto = answers["auto_write"] === true;
      const writingMode = wantsWriting ? (wantsAuto ? "auto" : "manual") : undefined;
      const result = await startProjectWorkflow(project.id, {
        task_description: goalText.trim(),
        answers,
        ...(writingMode ? { writing_mode: writingMode, doc_type: "summary" } : {}),
      });
      clearLogs();
      setActiveRunId(result.run_id);
      setStreaming(true);
      onCreated(project.id, result.run_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start project";
      setError(msg === "Failed to fetch" ? "Cannot reach the backend. Make sure the server is running on port 8000." : msg);
      setPhase("clarifying");
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="text-center">
        <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center mx-auto mb-3">
          <Zap size={22} className="text-indigo-400" />
        </div>
        <h2 className="text-xl font-bold" style={{ color: "var(--text)" }}>
          Start New Project
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>
          Describe your research goal — the agents handle the rest.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {/* Phase: Goal input */}
        {(phase === "goal" || phase === "loading_questions") && (
          <motion.div
            key="goal"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="flex flex-col gap-4"
          >
            <div
              className="rounded-2xl p-5 flex flex-col gap-4"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
            >
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider block mb-2" style={{ color: "var(--muted)" }}>
                  RESEARCH GOAL
                </label>
                <textarea
                  autoFocus
                  value={goalText}
                  onChange={(e) => setGoalText(e.target.value)}
                  placeholder='Describe your goal, e.g. "Analyse ML trends in 2024 and create a report..."'
                  rows={4}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGoalSubmit();
                  }}
                  className="w-full resize-none text-sm rounded-xl px-4 py-3 outline-none transition-all"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "rgba(99,102,241,0.5)";
                    e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.1)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--border)";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <p className="text-[10px] mt-1 text-right" style={{ color: "var(--text-faint)" }}>⌘ + Enter</p>
              </div>

              {/* Example goals */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted)" }}>
                  Examples
                </p>
                <div className="flex flex-wrap gap-2">
                  {PLACEHOLDER_GOALS.map((eg) => (
                    <button
                      key={eg}
                      onClick={() => setGoalText(eg)}
                      className="text-[11px] px-2.5 py-1 rounded-lg transition-colors text-left"
                      style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
                    >
                      {eg.length > 50 ? eg.slice(0, 50) + "…" : eg}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleGoalSubmit}
              disabled={!goalText.trim() || phase === "loading_questions"}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                color: "white",
                boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
              }}
            >
              {phase === "loading_questions" ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating questions…
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Continue with AI Questions
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </motion.div>
        )}

        {/* Phase: Clarifying questions */}
        {phase === "clarifying" && (
          <motion.div
            key="clarifying"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="flex flex-col gap-4"
          >
            <div
              className="rounded-2xl p-5 flex flex-col gap-4"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
            >
              {/* Goal preview */}
              <div
                className="rounded-xl px-3 py-2.5 flex items-start gap-2"
                style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}
              >
                <Zap size={13} className="text-indigo-400 mt-0.5 shrink-0" />
                <p className="text-xs leading-relaxed line-clamp-2" style={{ color: "var(--text-dim)" }}>
                  {goalText}
                </p>
              </div>

              {/* Questions */}
              <div className="flex flex-col gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  FOLLOW-UP QUESTIONS — Click to enable
                </p>
                {questions.map((q) => {
                  const isYes = answers[q.id] === true;
                  return (
                    <motion.button
                      key={q.id}
                      onClick={() => toggleAnswer(q.id)}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className="flex items-start gap-3 p-4 rounded-xl text-left transition-all duration-150"
                      style={{
                        background: isYes ? "rgba(99,102,241,0.1)" : "var(--surface-2)",
                        border: `1px solid ${isYes ? "rgba(99,102,241,0.4)" : "var(--border)"}`,
                      }}
                    >
                      {/* Toggle indicator */}
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-all"
                        style={{
                          background: isYes ? "#6366f1" : "var(--surface-3)",
                          border: `1.5px solid ${isYes ? "#6366f1" : "var(--border)"}`,
                        }}
                      >
                        {isYes ? (
                          <Check size={12} className="text-white" />
                        ) : (
                          <X size={10} style={{ color: "var(--muted)" }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug" style={{ color: isYes ? "var(--text)" : "var(--text-dim)" }}>
                          {q.text}
                        </p>
                        {q.context && (
                          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-faint)" }}>
                            {q.context}
                          </p>
                        )}
                      </div>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                        style={{
                          background: isYes ? "#6366f1" : "var(--surface-3)",
                          color: isYes ? "white" : "var(--muted)",
                        }}
                      >
                        {isYes ? "YES" : "NO"}
                      </span>
                    </motion.button>
                  );
                })}
              </div>

              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setPhase("goal")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm transition-colors"
                style={{ background: "var(--surface-2)", color: "var(--text-dim)", border: "1px solid var(--border)" }}
              >
                <ArrowLeft size={14} />
                Back
              </button>
              <button
                onClick={handleStart}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  color: "white",
                  boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
                }}
              >
                <Zap size={15} />
                Create Project & Start Workflow
              </button>
            </div>
          </motion.div>
        )}

        {/* Phase: Submitting */}
        {phase === "submitting" && (
          <motion.div
            key="submitting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-4 py-12"
          >
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
              </div>
              <motion.div
                className="absolute inset-[-4px] rounded-2xl"
                style={{ border: "1px solid rgba(99,102,241,0.3)" }}
                animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.2, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                Creating project…
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
                Initialising agents
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
