"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Search, CheckCircle2, XCircle, Download,
  FileSearch, RefreshCw, Sparkles, ArrowRight, Loader2,
  Wand2, Layers,
} from "lucide-react";
import { useAgentStore } from "@/stores/agent-store";
import type { LiteraturePaper, LiteraturePaperStatus, LiteratureSearchProgress } from "@/stores/agent-store";

const SOURCE_COLOR: Record<string, string> = {
  arxiv: "#f97316",
  semantic_scholar: "#6366f1",
  pubmed: "#22c55e",
  core: "#0ea5e9",
  openalex: "#a855f7",
};

const STATUS_CONFIG: Record<
  LiteraturePaperStatus,
  { label: string; icon: React.ReactNode; color: string; pulse?: boolean }
> = {
  pending:         { label: "Queued",              icon: <div className="w-2 h-2 rounded-full bg-current" />, color: "var(--muted)" },
  title_check:     { label: "Title check…",        icon: <Loader2 size={11} className="animate-spin" />, color: "#f59e0b", pulse: true },
  title_pass:      { label: "Title ✓",             icon: <CheckCircle2 size={11} />, color: "#22c55e" },
  title_reject:    { label: "Title rejected",      icon: <XCircle size={11} />, color: "#ef4444" },
  abstract_check:  { label: "Abstract check…",     icon: <Loader2 size={11} className="animate-spin" />, color: "#f59e0b", pulse: true },
  abstract_pass:   { label: "Abstract ✓",          icon: <CheckCircle2 size={11} />, color: "#22c55e" },
  abstract_reject: { label: "Abstract rejected",   icon: <XCircle size={11} />, color: "#ef4444" },
  downloading:     { label: "Downloading…",        icon: <Download size={11} className="animate-bounce" />, color: "#6366f1", pulse: true },
  content_check:   { label: "Verifying content…",  icon: <FileSearch size={11} />, color: "#8b5cf6", pulse: true },
  saved:           { label: "Saved",               icon: <Sparkles size={11} />, color: "#22c55e" },
  rejected:        { label: "Rejected",            icon: <XCircle size={11} />, color: "#ef4444" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function PaperRow({ paper }: { paper: LiteraturePaper }) {
  const cfg = STATUS_CONFIG[paper.status] ?? STATUS_CONFIG.pending;
  const srcColor = SOURCE_COLOR[paper.source] ?? "#6b7280";
  const isActive = ["title_check", "abstract_check", "downloading", "content_check"].includes(paper.status);
  const isSaved = paper.status === "saved";
  const isRejected = ["title_reject", "abstract_reject", "rejected"].includes(paper.status);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: isRejected ? 0.4 : 1, x: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="flex items-start gap-2.5 py-2 px-3 rounded-xl"
      style={{
        background: isSaved
          ? "rgba(34,197,94,0.06)"
          : isActive
          ? "rgba(99,102,241,0.06)"
          : "transparent",
        border: `1px solid ${
          isSaved ? "rgba(34,197,94,0.15)" : isActive ? "rgba(99,102,241,0.15)" : "transparent"
        }`,
      }}
    >
      <span
        className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 mt-0.5"
        style={{ background: `${srcColor}20`, color: srcColor }}
      >
        {paper.source || "?"}
      </span>

      <div className="flex-1 min-w-0">
        <p
          className="text-[11px] font-medium leading-snug line-clamp-2"
          style={{ color: isRejected ? "var(--muted)" : "var(--text)" }}
        >
          {paper.title || "—"}
        </p>
        {paper.year && (
          <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>
            {paper.year}
          </span>
        )}
        {paper.reason && (
          <p className="text-[9px] leading-snug mt-0.5 line-clamp-2" style={{ color: "var(--text-faint)" }}>
            {paper.reason}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0 text-[10px] font-medium" style={{ color: cfg.color }}>
        {isActive && (
          <motion.div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: cfg.color }}
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 0.9, repeat: Infinity }}
          />
        )}
        {cfg.icon}
        <span className="hidden sm:inline">{cfg.label}</span>
      </div>
    </motion.div>
  );
}

function StageIndicator({ progress }: { progress: LiteratureSearchProgress }) {
  const phases: { key: string; label: string; icon: React.ReactNode }[] = [
    { key: "query",    label: "AI Queries",  icon: <Wand2 size={9} /> },
    { key: "search",   label: "Search",      icon: <Search size={9} /> },
    { key: "filter",   label: "Filter",      icon: <FileSearch size={9} /> },
    { key: "download", label: "Download",    icon: <Download size={9} /> },
    { key: "save",     label: "Save",        icon: <Sparkles size={9} /> },
  ];

  const activeIdx =
    progress.phase === "query_generation" ? 0
    : progress.phase === "searching" ? 1
    : progress.phase === "filtering" ? 2
    : progress.phase === "downloading" ? 3
    : progress.phase === "done" ? 4
    : progress.phase === "retrying" ? 1
    : 0;

  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {phases.map((p, i) => {
        const done = i < activeIdx || progress.phase === "done";
        const active = i === activeIdx && progress.phase !== "done";
        return (
          <div key={p.key} className="flex items-center gap-0.5">
            <div
              className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full transition-all"
              style={{
                background: done
                  ? "rgba(34,197,94,0.12)"
                  : active
                  ? "rgba(99,102,241,0.15)"
                  : "var(--surface-2)",
                color: done ? "#22c55e" : active ? "#818cf8" : "var(--muted)",
              }}
            >
              {active ? <Loader2 size={9} className="animate-spin" /> : p.icon}
              {p.label}
            </div>
            {i < phases.length - 1 && (
              <ArrowRight size={8} style={{ color: "var(--border)" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Animated section showing AI-generated search queries */
function QueryGenerationSection({ progress }: { progress: LiteratureSearchProgress }) {
  const isGenerating = progress.queryGenerating ?? false;
  const queries = progress.queries ?? [];
  const hasQueries = queries.length > 0;
  const isVisible = progress.phase === "query_generation" || hasQueries;

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-4 py-3"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2.5">
        <div
          className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
          style={{ background: "rgba(139,92,246,0.15)" }}
        >
          <Wand2 size={10} style={{ color: "#a78bfa" }} />
        </div>
        <span className="text-[11px] font-semibold" style={{ color: "var(--text)" }}>
          AI Query Generation
        </span>

        {isGenerating && (
          <motion.div
            className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: "rgba(139,92,246,0.1)", color: "#a78bfa" }}
            animate={{ opacity: [1, 0.6, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            <Loader2 size={9} className="animate-spin" />
            Analyzing topic…
          </motion.div>
        )}

        {!isGenerating && hasQueries && (
          <span
            className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}
          >
            <CheckCircle2 size={9} />
            {queries.length} quer{queries.length === 1 ? "y" : "ies"} generated
          </span>
        )}
      </div>

      {/* Generating skeleton */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-1.5"
          >
            {[70, 55, 80].map((w, i) => (
              <motion.div
                key={i}
                className="h-6 rounded-lg"
                style={{ width: `${w}%`, background: "var(--surface-2)" }}
                animate={{ opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generated query chips */}
      <AnimatePresence>
        {!isGenerating && hasQueries && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-wrap gap-1.5"
          >
            {queries.map((q, i) => (
              <motion.div
                key={q}
                initial={{ opacity: 0, scale: 0.85, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.07 }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-medium"
                style={{
                  background: "rgba(99,102,241,0.08)",
                  border: "1px solid rgba(99,102,241,0.18)",
                  color: "#818cf8",
                }}
              >
                <Search size={8} style={{ opacity: 0.7, flexShrink: 0 }} />
                <span className="truncate max-w-[220px]">{q}</span>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function LiteratureProgressPanel({ runId }: { runId: string }) {
  const progress = useAgentStore((s) => s.literatureProgressByRun[runId] ?? (s.literatureProgress?.runId === runId ? s.literatureProgress : null));

  if (!progress || progress.runId !== runId) return null;
  if (progress.phase === "idle") return null;

  const saved = progress.papers.filter((p) => p.status === "saved");
  const rejected = progress.papers.filter((p) =>
    ["title_reject", "abstract_reject", "rejected"].includes(p.status)
  );
  const active = progress.papers.filter((p) =>
    ["title_check", "abstract_check", "downloading", "content_check"].includes(p.status)
  );
  const hasQueries = (progress.queries?.length ?? 0) > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
    >
      {/* ── Header ── */}
      <div
        className="px-4 py-3 flex items-center justify-between gap-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(99,102,241,0.12)" }}
          >
            <BookOpen size={13} className="text-indigo-400" />
          </div>
          <div>
            <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>
              Literature Search
            </span>
            {progress.maxAttempts > 1 && progress.attempt > 0 && (
              <span
                className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}
              >
                Attempt {progress.attempt}/{progress.maxAttempts}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Multi-query badge */}
          {hasQueries && progress.attempt <= 1 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full"
              style={{ background: "rgba(139,92,246,0.1)", color: "#a78bfa" }}
            >
              <Layers size={9} />
              {progress.queries!.length}× parallel queries
            </motion.div>
          )}

          {/* Counters */}
          <div className="flex items-center gap-2 text-[10px]">
            {saved.length > 0 && (
              <span className="flex items-center gap-1 font-semibold" style={{ color: "#22c55e" }}>
                <CheckCircle2 size={10} />
                {saved.length} saved
              </span>
            )}
            {rejected.length > 0 && (
              <span className="flex items-center gap-1" style={{ color: "var(--muted)" }}>
                <XCircle size={10} />
                {rejected.length} rejected
              </span>
            )}
            {progress.papers.length > 0 && (
              <span style={{ color: "var(--text-faint)" }}>/ {progress.papers.length} total</span>
            )}
          </div>

          {/* State badges */}
          <AnimatePresence>
            {progress.phase === "retrying" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full"
                style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}
              >
                <RefreshCw size={9} className="animate-spin" />
                Retrying…
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {progress.phase === "done" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full"
                style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}
              >
                <CheckCircle2 size={9} />
                Done
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── AI Query Generation section ── */}
      <QueryGenerationSection progress={progress} />

      {/* ── Active query + stage indicator ── */}
      <AnimatePresence>
        {progress.phase !== "query_generation" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-4 py-2.5 flex flex-col gap-2"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            {progress.query && (
              <div className="flex items-center gap-2">
                <Search size={10} style={{ color: "var(--muted)" }} className="shrink-0" />
                <p className="text-[11px] font-mono truncate" style={{ color: "var(--text-dim)" }}>
                  &ldquo;{progress.query}&rdquo;
                </p>
              </div>
            )}
            <StageIndicator progress={progress} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Paper list ── */}
      <div className="p-2 max-h-[34rem] overflow-y-auto flex flex-col gap-0.5">
        <AnimatePresence initial={false}>
          {active.map((p) => <PaperRow key={p.id} paper={p} />)}
          {saved.map((p) => <PaperRow key={p.id} paper={p} />)}
          {progress.papers
            .filter(
              (p) =>
                !["title_reject", "abstract_reject", "rejected"].includes(p.status) &&
                !active.includes(p) &&
                !saved.includes(p)
            )
            .map((p) => <PaperRow key={p.id} paper={p} />)}
          {rejected.map((p) => <PaperRow key={p.id} paper={p} />)}
        </AnimatePresence>

        {progress.papers.length === 0 && progress.phase === "searching" && (
          <div
            className="flex items-center justify-center gap-2 py-6 text-[11px]"
            style={{ color: "var(--muted)" }}
          >
            <Loader2 size={13} className="animate-spin" />
            Querying academic databases…
          </div>
        )}

        {progress.papers.length === 0 && progress.phase === "query_generation" && (
          <div
            className="flex flex-col items-center justify-center gap-2 py-6 text-[11px]"
            style={{ color: "var(--muted)" }}
          >
            <div className="flex items-center gap-2">
              <Wand2 size={13} style={{ opacity: 0.6 }} />
              AI is crafting targeted search queries…
            </div>
            {(progress.queries?.length ?? 0) > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 px-4">
                {progress.queries!.slice(0, 5).map((query) => (
                  <span
                    key={query}
                    className="text-[10px] px-2 py-1 rounded-lg"
                    style={{ background: "rgba(99,102,241,0.1)", color: "#818cf8" }}
                  >
                    {query}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
