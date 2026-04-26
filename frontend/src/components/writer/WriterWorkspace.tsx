"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, BookOpen, Brain, Database, FileSearch, ListChecks, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { useWriterStore } from "@/stores/writer-store";
import { WriterIntakePanel } from "./WriterIntakePanel";
import { ClarifyPhasePanel } from "./ClarifyPhasePanel";
import { OutlinePhasePanel } from "./OutlinePhasePanel";
import { AllocationPhasePanel } from "./AllocationPhasePanel";
import { WritingProgressPanel } from "./WritingProgressPanel";
import { WriterPreviewPanel } from "./WriterPreviewPanel";
import type { Chapter, WriterRun } from "@/types/writer";

const phaseVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.15 } },
};

export function WriterWorkspace() {
  const { activeRunId, getActiveRun } = useWriterStore();
  const [confirmedChapters, setConfirmedChapters] = useState<Chapter[] | null>(null);

  const activeRun: WriterRun | undefined = getActiveRun();

  const renderPhase = () => {
    if (!activeRunId || !activeRun) {
      return <WriterIntakePanel key="intake" />;
    }

    const { status } = activeRun;

    if (status === "CLARIFYING") {
      return <ClarifyPhasePanel key="clarify" run={activeRun} />;
    }

    if (status === "OUTLINING" || status === "VALIDATING") {
      return (
        <WriterPlanningLoader key="writer-planning" run={activeRun} />
      );
    }

    if (status === "ALLOCATING") {
      if (!confirmedChapters) {
        return (
          <OutlinePhasePanel
            key="outline"
            run={activeRun}
            onNext={(chapters) => setConfirmedChapters(chapters)}
          />
        );
      }
      return (
        <AllocationPhasePanel
          key="allocation"
          run={activeRun}
          chapters={confirmedChapters}
        />
      );
    }

    if (status === "MAPPING_SOURCES" || status === "WRITING" || status === "ASSEMBLING") {
      return <WritingProgressPanel key="progress" run={activeRun} />;
    }

    if (status === "DONE") {
      return <WriterPreviewPanel key="preview" run={activeRun} />;
    }

    if (status === "FAILED") {
      return <WriterFailedPanel key="failed" run={activeRun} />;
    }

    return <WriterIntakePanel key="intake-fallback" />;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <AnimatePresence mode="wait">
        {renderPhase()}
      </AnimatePresence>
    </div>
  );
}

function WriterPlanningLoader({ run }: { run: WriterRun }) {
  const { status, progress, activity } = run;
  const steps = [
    { key: "OUTLINING", label: "Outline", detail: "Structuring chapters and argument flow", icon: <Wand2 size={13} /> },
    { key: "VALIDATING", label: "Literature", detail: "Checking whether PDFs cover each chapter", icon: <FileSearch size={13} /> },
    { key: "ALLOCATING", label: "Ready", detail: "Preparing source-aware page allocation", icon: <Sparkles size={13} /> },
  ];
  const currentIndex = status === "OUTLINING" ? 0 : status === "VALIDATING" ? 1 : 2;
  const shownProgress = progress ?? (status === "OUTLINING" ? 28 : 68);
  const activityItems = activity?.items ?? [];
  const liveCards = [
    {
      icon: <Brain size={15} />,
      label: "Reasoning",
      value: status === "OUTLINING" ? "Planning chapter logic" : "Evaluating evidence fit",
      color: "#a78bfa",
    },
    {
      icon: <Database size={15} />,
      label: "Inputs",
      value: status === "OUTLINING" ? "Answers and library summaries" : "Indexed PDF chunks",
      color: "#22d3ee",
    },
    {
      icon: <BookOpen size={15} />,
      label: "Output",
      value: status === "OUTLINING" ? "Outline and key points" : "Coverage and gaps",
      color: "#22c55e",
    },
  ];

  return (
    <motion.div
      variants={phaseVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="flex-1 flex items-center justify-center px-6 py-10"
    >
      <div
        className="w-full max-w-5xl rounded-[28px] p-8 overflow-hidden relative"
        style={{
          background: "linear-gradient(145deg, var(--surface-1), var(--surface-2))",
          border: "1px solid var(--border)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.16)",
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(129,140,248,0.7), transparent)" }}
        />
        <div className="flex flex-col xl:flex-row gap-8 items-stretch">
          <div className="relative w-40 h-40 shrink-0">
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ border: "1px solid rgba(129,140,248,0.25)" }}
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className="absolute inset-5 rounded-full"
              style={{ border: "1px dashed rgba(34,211,238,0.35)" }}
              animate={{ rotate: -360 }}
              transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
            />
            <div
              className="absolute inset-12 rounded-2xl flex items-center justify-center text-2xl font-bold"
              style={{ background: "rgba(99,102,241,0.16)", color: "#c7d2fe" }}
            >
              {Math.round(shownProgress)}%
            </div>
          </div>

          <div className="flex-1 w-full space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#818cf8" }}>
                Writer pipeline
              </p>
              <h2 className="text-2xl font-semibold mt-2" style={{ color: "var(--text)" }}>
                {activity?.step ?? (status === "OUTLINING" ? "Building the outline" : "Checking literature coverage")}
              </h2>
              <p className="text-sm mt-2" style={{ color: "var(--text-dim)" }}>
                {activity?.detail ?? "The Writer is turning your answers into a source-aware plan before any text is drafted."}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {liveCards.map((card) => (
                <motion.div
                  key={card.label}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl p-4 flex items-center gap-3"
                  style={{ background: `${card.color}10`, border: `1px solid ${card.color}26` }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${card.color}18`, color: card.color }}
                  >
                    {card.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                      {card.label}
                    </p>
                    <p className="text-xs font-semibold truncate" style={{ color: card.color }}>
                      {card.value}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {steps.map((step, index) => {
                const active = index === currentIndex;
                const done = index < currentIndex;
                return (
                  <div
                    key={step.key}
                    className="rounded-2xl p-4"
                    style={{
                      background: done
                        ? "rgba(34,197,94,0.08)"
                        : active
                        ? "rgba(99,102,241,0.12)"
                        : "rgba(255,255,255,0.035)",
                      border: `1px solid ${done ? "rgba(34,197,94,0.2)" : active ? "rgba(99,102,241,0.28)" : "rgba(255,255,255,0.07)"}`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: done ? "#4ade80" : active ? "#c7d2fe" : "var(--text-dim)" }}>
                        {step.icon}
                        {step.label}
                      </span>
                      {active && (
                        <motion.span
                          className="w-2 h-2 rounded-full"
                          style={{ background: "#818cf8" }}
                          animate={{ opacity: [1, 0.35, 1] }}
                          transition={{ duration: 1.1, repeat: Infinity }}
                        />
                      )}
                    </div>
                    <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--text-faint)" }}>
                      {step.detail}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, #22d3ee, #6366f1, #a855f7)" }}
                animate={{ width: `${shownProgress}%` }}
                transition={{ type: "spring", stiffness: 90, damping: 18 }}
              />
            </div>

            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <ListChecks size={14} className="text-indigo-300" />
                <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>
                  Information being processed
                </span>
              </div>
              <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {(activityItems.length > 0 ? activityItems : fallbackPlanningItems(run)).slice(0, 8).map((item, index) => (
                  <motion.div
                    key={`${item.label}-${index}`}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="rounded-xl px-3 py-2"
                    style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.055)" }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                      {item.label}
                    </p>
                    <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-dim)" }}>
                      {item.value}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function fallbackPlanningItems(run: WriterRun): Array<{ label: string; value: string }> {
  const questionCount = run.questions?.length ?? 0;
  const chapterCount = run.outline?.chapters?.length ?? 0;
  return [
    { label: "Document", value: run.title },
    { label: "Document type", value: run.doc_type },
    { label: "Clarifying answers", value: `${questionCount} planning prompts available` },
    { label: "Current phase", value: run.status === "OUTLINING" ? "Generating outline" : "Checking source coverage" },
    ...(chapterCount > 0 ? [{ label: "Drafted chapters", value: `${chapterCount} outline chapters` }] : []),
  ];
}

function WriterFailedPanel({ run }: { run: WriterRun }) {
  const { deleteRun, setActiveRun } = useWriterStore();
  const sections = run.sections ?? [];
  const doneCount = sections.filter((s) => s.status === "DONE").length;
  const total = sections.length;

  const handleRetry = async () => {
    // Delete the failed run and reset to intake so the user can start over
    // with the same parameters. The intake panel will be pre-populated by the user.
    await deleteRun(run.id).catch(() => null);
    setActiveRun(null);
  };

  return (
    <motion.div
      key="failed"
      variants={phaseVariants}
      initial="initial"
      animate="animate"
      className="flex-1 flex items-center justify-center px-6 py-10"
    >
      <div
        className="w-full max-w-lg rounded-3xl p-8 text-center space-y-6"
        style={{
          background: "rgba(239,68,68,0.06)",
          border: "1px solid rgba(239,68,68,0.2)",
        }}
      >
        <div className="flex items-center justify-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}
          >
            <AlertTriangle size={28} />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
            Writing failed
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-dim)" }}>
            The writing agent encountered a connection error while contacting the AI provider.
            {total > 0 && (
              <span>
                {" "}{doneCount} of {total} section{total !== 1 ? "s" : ""} were completed before the failure.
              </span>
            )}
          </p>
          <p className="text-xs" style={{ color: "var(--text-faint)" }}>
            The system now retries automatically on transient errors. Please start a new run — it should complete successfully.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleRetry}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
            style={{
              background: "rgba(99,102,241,0.14)",
              border: "1px solid rgba(99,102,241,0.28)",
              color: "#a5b4fc",
            }}
          >
            <RefreshCw size={14} />
            Start new run
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
