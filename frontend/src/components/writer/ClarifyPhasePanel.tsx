"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, ChevronRight, Check } from "lucide-react";
import * as Slider from "@radix-ui/react-slider";
import { useWriterStore } from "@/stores/writer-store";
import { listContainerVariants, listItemVariants } from "@/lib/motion-variants";
import type { ClarifyQuestion, WriterRun } from "@/types/writer";

interface Props {
  run: WriterRun;
}

export function ClarifyPhasePanel({ run }: Props) {
  const { submitClarify } = useWriterStore();
  const questions: ClarifyQuestion[] = (run.questions ?? []).filter((q) => !isLegacyCitationQuestion(q));
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);

  const setAnswer = (id: string, value: unknown) =>
    setAnswers((prev) => ({ ...prev, [id]: value }));

  const toggleMulti = (id: string, option: string) => {
    const current = (answers[id] as string[]) ?? [];
    const updated = current.includes(option)
      ? current.filter((o) => o !== option)
      : [...current, option];
    setAnswer(id, updated);
  };

  const requiredQuestions = questions.filter((q) => q.required !== false);
  const answered = requiredQuestions.filter((q) => {
    const a = answers[q.id];
    return a !== undefined && a !== "" && !(Array.isArray(a) && a.length === 0);
  }).length;

  const allAnswered = answered === requiredQuestions.length;

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await submitClarify(run.id, answers);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 flex flex-col max-w-5xl mx-auto w-full px-6 py-8"
    >
      <div 
        className="flex flex-col space-y-6 px-8 py-10 rounded-[2rem] relative overflow-hidden group transition-all duration-700 hover:shadow-xl"
        style={{
          background: "linear-gradient(145deg, var(--surface-1), var(--surface-2))",
          border: "1px solid var(--border)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.04)",
          backdropFilter: "blur(14px)",
        }}
      >
        {/* Dynamic top glow */}
        <div
          className="absolute top-0 left-1/3 w-1/3 h-px pointer-events-none opacity-30 group-hover:opacity-60 group-hover:w-full group-hover:left-0 transition-all duration-1000 ease-out"
          style={{ background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.5), transparent)" }}
        />
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8" }}
          >
            <MessageSquare size={14} />
          </div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
            A few questions first
          </h2>
        </div>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Help the AI understand exactly what you need so it can create a perfect document.
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
          <motion.div
            className="h-1 rounded-full"
            style={{ background: "linear-gradient(90deg, #6366f1, #8b5cf6)" }}
            animate={{ width: `${(answered / Math.max(requiredQuestions.length, 1)) * 100}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 30 }}
          />
        </div>
        <span className="text-xs tabular-nums" style={{ color: "var(--text-dim)" }}>
          {answered} / {requiredQuestions.length}
        </span>
      </div>

      {/* Questions */}
      <motion.div
        variants={listContainerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-5"
      >
        {questions.map((q) => (
          <motion.div
            key={q.id}
            variants={listItemVariants}
            className="rounded-2xl p-5 space-y-3"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="space-y-0.5">
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                {q.question}
                {q.required !== false && <span style={{ color: "#6366f1" }}> *</span>}
              </p>
              {q.hint && (
                <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                  {q.hint}
                </p>
              )}
            </div>

            {q.input_type === "text" && (
              <textarea
                value={(answers[q.id] as string) ?? ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "var(--text)",
                }}
                onFocus={(e) => (e.target.style.borderColor = "rgba(99,102,241,0.5)")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
              />
            )}

            {(q.input_type === "choice" || q.input_type === "multiselect") && (
              <div className="flex flex-wrap gap-2">
                {(q.options ?? []).map((opt) => {
                  const isMulti = q.input_type === "multiselect";
                  const selected = isMulti
                    ? ((answers[q.id] as string[]) ?? []).includes(opt)
                    : answers[q.id] === opt;
                  return (
                    <motion.button
                      key={opt}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() =>
                        isMulti ? toggleMulti(q.id, opt) : setAnswer(q.id, opt)
                      }
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm transition-all"
                      style={{
                        background: selected ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
                        border: "1px solid",
                        borderColor: selected
                          ? "rgba(99,102,241,0.5)"
                          : "rgba(255,255,255,0.08)",
                        color: selected ? "#a5b4fc" : "var(--text-dim)",
                      }}
                    >
                      {selected && <Check size={11} />}
                      {opt}
                    </motion.button>
                  );
                })}
              </div>
            )}

            {q.input_type === "scale" && (
              <div className="space-y-3">
                <Slider.Root
                  min={q.scale_min ?? 1}
                  max={q.scale_max ?? 10}
                  step={1}
                  value={[(answers[q.id] as number) ?? q.scale_min ?? 1]}
                  onValueChange={([v]) => setAnswer(q.id, v)}
                  className="relative flex items-center w-full h-5 select-none touch-none"
                >
                  <Slider.Track
                    className="relative flex-1 h-1.5 rounded-full"
                    style={{ background: "rgba(255,255,255,0.08)" }}
                  >
                    <Slider.Range
                      className="absolute h-full rounded-full"
                      style={{ background: "linear-gradient(90deg, #6366f1, #8b5cf6)" }}
                    />
                  </Slider.Track>
                  <Slider.Thumb
                    className="block w-4 h-4 rounded-full shadow-lg outline-none cursor-pointer"
                    style={{
                      background: "#6366f1",
                      boxShadow: "0 0 0 3px rgba(99,102,241,0.3)",
                    }}
                  />
                </Slider.Root>
                <div className="flex justify-between text-xs" style={{ color: "var(--text-faint)" }}>
                  <span>{q.scale_min ?? 1}</span>
                  <span
                    className="font-semibold"
                    style={{ color: "#818cf8" }}
                  >
                    {(answers[q.id] as number) ?? q.scale_min ?? 1}
                  </span>
                  <span>{q.scale_max ?? 10}</span>
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </motion.div>

      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={handleSubmit}
        disabled={!allAnswered || loading}
        className="flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
        style={{
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
          color: "#fff",
        }}
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Generating outline…
          </>
        ) : (
          <>
            Generate Outline
            <ChevronRight size={14} />
          </>
        )}
      </motion.button>
      </div>
    </motion.div>
  );
}

function isLegacyCitationQuestion(question: ClarifyQuestion) {
  const text = question.question.toLowerCase();
  if (text.includes("citation style")) return true;
  return text.includes("abstract") && (text.includes("include") || text.includes("needed") || text.includes("want"));
}
