"use client";

import { useState } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { GripVertical, Trash2, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Circle, Search, Loader2 } from "lucide-react";
import { useWriterStore } from "@/stores/writer-store";
import { useAgentStore } from "@/stores/agent-store";
import { LiteratureProgressPanel } from "@/components/workspace/LiteratureProgressPanel";
import type { Chapter, WriterRun } from "@/types/writer";

const CHAPTER_COLORS = [
  "#6366f1", "#8b5cf6", "#06b6d4", "#22c55e",
  "#f59e0b", "#ec4899", "#0ea5e9", "#a78bfa",
];

interface Props {
  run: WriterRun;
  onNext: (chapters: Chapter[]) => void;
}

export function OutlinePhasePanel({ run, onNext }: Props) {
  const outline = run.outline;
  const coverage = run.coverage;
  const { startSourceSearch } = useWriterStore();
  const [chapters, setChapters] = useState<Chapter[]>(outline?.chapters ?? []);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isStartingSearch, setIsStartingSearch] = useState(false);

  const sourceWorkflowId = run.source_search?.workflow_run_id ?? run.source_workflow_id ?? null;
  const writerLitId = sourceWorkflowId ?? `writer-${run.id}`;
  const litProgress = useAgentStore((s) => s.literatureProgressByRun[writerLitId] ?? (s.literatureProgress?.runId === writerLitId ? s.literatureProgress : null));
  const isSearchActive =
    run.sourceSearchActive === true ||
    run.source_search?.status === "RUNNING" ||
    (litProgress?.runId === writerLitId &&
      litProgress.phase !== "idle" &&
      litProgress.phase !== "done");
  const needsSources = Boolean(coverage?.needs_sources || run.sourceSearchRecommended || (coverage?.overall_score ?? 1) < 0.7);
  const missingTopics = coverage?.missing_topics ?? [];
  const suggestedQueries = coverage?.suggested_queries ?? [];

  const handleStartSourceSearch = async () => {
    if (isStartingSearch) return;
    setIsStartingSearch(true);
    try {
      await startSourceSearch(run.id);
    } finally {
      setIsStartingSearch(false);
    }
  };

  const toggleExpand = (idx: number) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      return n;
    });

  const deleteChapter = (idx: number) => {
    setChapters((prev) =>
      prev.filter((_, i) => i !== idx).map((ch, i) => ({ ...ch, index: i }))
    );
  };

  const updateTitle = (idx: number, title: string) => {
    setChapters((prev) => prev.map((ch, i) => (i === idx ? { ...ch, title } : ch)));
  };

  const getCoverage = (chapterIndex: number) =>
    coverage?.chapters.find((c) => c.chapter_index === chapterIndex);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 flex flex-col max-w-6xl mx-auto w-full px-6 py-8"
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
        <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
          {outline?.document_title ?? run.title}
        </h2>
        {outline?.abstract && (
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            {outline.abstract.slice(0, 200)}…
          </p>
        )}
        {coverage && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs" style={{ color: "var(--text-faint)" }}>
              AI source coverage:
            </span>
            <CoverageBar score={coverage.overall_score} />
            <span className="text-xs font-medium" style={{ color: coverageColor(coverage.overall_score) }}>
              {Math.round(coverage.overall_score * 100)}%
            </span>
            {coverage.status && (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: `${coverageColor(coverage.overall_score)}18`,
                  color: coverageColor(coverage.overall_score),
                }}
              >
                {coverage.status}
              </span>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {coverage && needsSources && !isSearchActive && (
          <motion.div
            key="coverage-gap"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="rounded-2xl p-4 flex flex-col gap-3"
            style={{
              background: "linear-gradient(135deg, rgba(245,158,11,0.12), rgba(99,102,241,0.08))",
              border: "1px solid rgba(245,158,11,0.22)",
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(245,158,11,0.16)", color: "#f59e0b" }}
              >
                <AlertTriangle size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {run.source_search?.status === "DONE" ? "More literature is still needed" : "Literature coverage is not ready yet"}
                </p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-dim)" }}>
                  {coverage.summary || "The AI coverage check found weakly supported outline areas. Search can fetch and index PDFs for those chapters before writing starts."}
                </p>
              </div>
              <button
                onClick={handleStartSourceSearch}
                disabled={isStartingSearch}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50 shrink-0"
                style={{
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  color: "#fff",
                  boxShadow: "0 4px 16px rgba(99,102,241,0.28)",
                }}
              >
                {isStartingSearch ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                {run.source_search?.status === "DONE" ? "Search again" : "Find sources"}
              </button>
            </div>

            {(missingTopics.length > 0 || suggestedQueries.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {missingTopics.length > 0 && (
                  <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#f59e0b" }}>
                      Missing topics
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {missingTopics.slice(0, 5).map((topic) => (
                        <span key={topic} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24" }}>
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {suggestedQueries.length > 0 && (
                  <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#818cf8" }}>
                      Search plan
                    </p>
                    <p className="text-[11px] truncate" style={{ color: "var(--text-dim)" }}>
                      {suggestedQueries[0]}
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reorderable chapter list */}
      <Reorder.Group
        axis="y"
        values={chapters}
        onReorder={setChapters}
        className="space-y-2"
      >
        <AnimatePresence>
          {chapters.map((ch, idx) => {
            const cov = getCoverage(ch.index);
            const color = CHAPTER_COLORS[idx % CHAPTER_COLORS.length];
            const isExpanded = expanded.has(idx);

            return (
              <Reorder.Item key={ch.index} value={ch} className="list-none">
                <motion.div
                  layout
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div className="flex items-center gap-2 p-3">
                    {/* Drag handle */}
                    <div
                      className="cursor-grab active:cursor-grabbing p-1 rounded"
                      style={{ color: "var(--text-faint)" }}
                    >
                      <GripVertical size={14} />
                    </div>

                    {/* Color dot + index */}
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: `${color}30`, color }}
                    >
                      {idx + 1}
                    </div>

                    {/* Title (editable) */}
                    {editingIndex === idx ? (
                      <input
                        autoFocus
                        className="flex-1 bg-transparent outline-none text-sm font-medium"
                        style={{ color: "var(--text)" }}
                        value={ch.title}
                        onChange={(e) => updateTitle(idx, e.target.value)}
                        onBlur={() => setEditingIndex(null)}
                        onKeyDown={(e) => e.key === "Enter" && setEditingIndex(null)}
                      />
                    ) : (
                      <button
                        className="flex-1 text-left text-sm font-medium truncate"
                        style={{ color: "var(--text)" }}
                        onClick={() => setEditingIndex(idx)}
                      >
                        {ch.title}
                      </button>
                    )}

                    {/* Coverage icon */}
                    {cov && (
                      <div title={`Coverage: ${Math.round(cov.coverage_score * 100)}%`}>
                        {cov.coverage_score >= 0.6 ? (
                          <CheckCircle2 size={14} style={{ color: "#22c55e" }} />
                        ) : cov.coverage_score >= 0.3 ? (
                          <Circle size={14} style={{ color: "#f59e0b" }} />
                        ) : (
                          <AlertTriangle size={14} style={{ color: "#ef4444" }} />
                        )}
                      </div>
                    )}

                    {/* Page count */}
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-md flex-shrink-0"
                      style={{
                        background: `${color}20`,
                        color,
                        fontSize: "10px",
                      }}
                    >
                      {ch.target_pages.toFixed(1)}pp
                    </span>

                    {/* Expand */}
                    <button
                      onClick={() => toggleExpand(idx)}
                      style={{ color: "var(--text-faint)" }}
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => deleteChapter(idx)}
                      style={{ color: "var(--text-faint)" }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Expanded details */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="px-4 pb-4 space-y-3 overflow-hidden"
                      >
                        {ch.description && (
                          <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                            {ch.description}
                          </p>
                        )}
                        {ch.key_points.length > 0 && (
                          <ul className="space-y-1">
                            {ch.key_points.map((kp, i) => (
                              <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: "var(--text-dim)" }}>
                                <span style={{ color }}>&bull;</span>
                                {kp}
                              </li>
                            ))}
                          </ul>
                        )}
                        {cov && cov.relevant_filenames.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {cov.relevant_filenames.slice(0, 3).map((f, i) => (
                              <span
                                key={i}
                                className="text-xs px-2 py-0.5 rounded-lg"
                                style={{
                                  background: "rgba(255,255,255,0.05)",
                                  color: "var(--text-dim)",
                                }}
                              >
                                {f.length > 30 ? f.slice(0, 28) + "…" : f}
                              </span>
                            ))}
                          </div>
                        )}
                        {cov && cov.rationale && (
                          <p className="text-xs leading-relaxed" style={{ color: "var(--text-faint)" }}>
                            {cov.rationale}
                          </p>
                        )}
                        {cov && (cov.missing_topics?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {cov.missing_topics!.slice(0, 3).map((topic) => (
                              <span
                                key={topic}
                                className="text-[10px] px-2 py-0.5 rounded-lg"
                                style={{
                                  background: "rgba(245,158,11,0.1)",
                                  color: "#f59e0b",
                                }}
                              >
                                {topic}
                              </span>
                            ))}
                          </div>
                        )}
                        {cov && cov.warning && (
                          <p className="text-xs" style={{ color: "#f59e0b" }}>
                            {cov.warning}
                          </p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </Reorder.Item>
            );
          })}
        </AnimatePresence>
      </Reorder.Group>

      {/* ── Source search feedback section ── */}
      <AnimatePresence>
        {(isSearchActive || sourceWorkflowId) && (
          <motion.div
            key="source-search"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="space-y-3"
          >
            {/* Banner */}
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{
                background: "rgba(99,102,241,0.07)",
                border: "1px solid rgba(99,102,241,0.18)",
              }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "rgba(99,102,241,0.15)" }}
              >
                <Search size={13} className="text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>
                  Source acquisition workflow
                </p>
                <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                  Matching papers are searched, verified, downloaded, indexed, then coverage is checked again.
                </p>
              </div>
              {isSearchActive ? <Loader2 size={14} className="animate-spin shrink-0 text-indigo-400" /> : <CheckCircle2 size={14} className="shrink-0 text-green-400" />}
            </div>

            <LiteratureProgressPanel runId={writerLitId} />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={() => onNext(chapters)}
        disabled={chapters.length === 0 || isSearchActive || (needsSources && run.source_search?.status !== "DONE")}
        className="flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold disabled:opacity-40"
        style={{
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
          color: "#fff",
        }}
      >
        {isSearchActive
          ? "Source search running…"
          : needsSources && run.source_search?.status !== "DONE"
          ? "Find sources before continuing"
          : needsSources
          ? "Proceed with current sources →"
          : "Accept & Configure Pages →"}
      </motion.button>
      </div>
    </motion.div>
  );
}
function CoverageBar({ score }: { score: number }) {
  const color = coverageColor(score);
  return (
    <div className="w-24 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${score * 100}%`, background: color }}
      />
    </div>
  );
}

function coverageColor(score: number) {
  if (score >= 0.7) return "#22c55e";
  if (score >= 0.4) return "#f59e0b";
  return "#ef4444";
}
