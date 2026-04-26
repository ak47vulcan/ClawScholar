"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ChevronLeft, ArrowRight, Calendar, BookOpen, ListTree } from "lucide-react";
import { Button } from "@/components/shared/Button";

interface ClarificationQuestion {
  id: string;
  question: string;
  yesLabel: string;
  noLabel: string;
  yesContext: string;
  icon: React.ReactNode;
}

const QUESTIONS: ClarificationQuestion[] = [
  {
    id: "schedule",
    question: "Should I block time on your calendar for this goal?",
    yesLabel: "Yes, block time",
    noLabel: "Skip",
    yesContext: "Please also block dedicated deep-work slots on my calendar.",
    icon: <Calendar size={16} className="text-indigo-400" />,
  },
  {
    id: "papers",
    question: "Should I search for and save relevant research papers?",
    yesLabel: "Yes, find papers",
    noLabel: "Skip",
    yesContext: "Please search for and save the most relevant research papers to my library.",
    icon: <BookOpen size={16} className="text-purple-400" />,
  },
  {
    id: "breakdown",
    question: "Do you want a step-by-step task breakdown?",
    yesLabel: "Yes, break it down",
    noLabel: "Skip",
    yesContext: "Please decompose this goal into concrete sub-tasks with time estimates.",
    icon: <ListTree size={16} className="text-teal-400" />,
  },
];

interface Props {
  goalText: string;
  onConfirm: (enrichedGoal: string) => void;
  onBack: () => void;
}

export function ClarificationPanel({ goalText, onConfirm, onBack }: Props) {
  const [answers, setAnswers] = useState<Record<string, boolean | null>>(
    Object.fromEntries(QUESTIONS.map((q) => [q.id, null]))
  );

  const allAnswered = QUESTIONS.every((q) => answers[q.id] !== null);

  const answer = (id: string, value: boolean) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const handleConfirm = () => {
    const extras = QUESTIONS.filter((q) => answers[q.id] === true)
      .map((q) => q.yesContext)
      .join(" ");
    const enriched = extras ? `${goalText}\n\n${extras}` : goalText;
    onConfirm(enriched);
  };

  return (
    <motion.div
      key="clarifying"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-4"
    >
      {/* Goal preview */}
      <div className="glass-flat rounded-xl p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--muted)" }}>
          Your goal
        </p>
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
          {goalText.length > 120 ? goalText.slice(0, 120) + "…" : goalText}
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold mb-3" style={{ color: "var(--text)" }}>
          A few quick questions before I start:
        </p>

        <div className="flex flex-col gap-2">
          {QUESTIONS.map((q, i) => {
            const ans = answers[q.id];
            return (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="rounded-xl p-3.5"
                style={{
                  background: ans !== null ? "rgba(99,102,241,0.06)" : "var(--surface-2)",
                  border: `1px solid ${ans !== null ? "rgba(99,102,241,0.25)" : "var(--border)"}`,
                  transition: "all 0.2s",
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">{q.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium mb-2.5" style={{ color: "var(--text)" }}>
                      {q.question}
                    </p>
                    {ans !== null ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-1.5"
                      >
                        <CheckCircle2 size={12} className="text-indigo-400" />
                        <span className="text-[11px]" style={{ color: "var(--primary)" }}>
                          {ans ? q.yesLabel : q.noLabel}
                        </span>
                        <button
                          onClick={() => setAnswers((p) => ({ ...p, [q.id]: null }))}
                          className="ml-2 text-[10px] underline"
                          style={{ color: "var(--text-faint)" }}
                        >
                          change
                        </button>
                      </motion.div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => answer(q.id, true)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                          style={{
                            background: "rgba(99,102,241,0.15)",
                            color: "var(--primary)",
                            border: "1px solid rgba(99,102,241,0.3)",
                          }}
                        >
                          {q.yesLabel}
                        </button>
                        <button
                          onClick={() => answer(q.id, false)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:bg-[var(--surface-3)]"
                          style={{
                            background: "var(--surface-3)",
                            color: "var(--text-dim)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {q.noLabel}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs transition-colors"
          style={{ color: "var(--text-faint)" }}
        >
          <ChevronLeft size={13} />
          Edit goal
        </button>

        <AnimatePresence>
          {allAnswered && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <Button
                variant="primary"
                size="md"
                icon={<ArrowRight size={14} />}
                onClick={handleConfirm}
              >
                Start workflow
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
