"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  FileText,
  Files,
  PackageCheck,
  PenLine,
  Sparkles,
} from "lucide-react";
import { useWriterStore } from "@/stores/writer-store";
import type { WriterRun, WriterSource, WriterSourcePlanItem, WritingSection } from "@/types/writer";

const CHAPTER_COLORS = [
  "#6366f1", "#8b5cf6", "#06b6d4", "#22c55e",
  "#f59e0b", "#ec4899", "#0ea5e9", "#a78bfa",
];

const PHASE_STEPS = [
  { key: "MAPPING_SOURCES", label: "Mapping sources" },
  { key: "WRITING", label: "Writing sections" },
  { key: "ASSEMBLING", label: "Assembling document" },
  { key: "DONE", label: "Complete" },
];

interface Props {
  run: WriterRun;
}

export function WritingProgressPanel({ run }: Props) {
  const sections: WritingSection[] = run.sections ?? [];
  const doneCount = sections.filter((s) => s.status === "DONE").length;
  const total = sections.length;
  const progress = run.progress ?? (total > 0 ? Math.round((doneCount / total) * 100) : 0);
  const isAssembling = run.status === "ASSEMBLING";
  const isMapping = run.status === "MAPPING_SOURCES";
  const currentSection = sections.find((s) => s.status === "WRITING");
  const queuedCount = sections.filter((s) => s.status === "PENDING").length;
  const failedCount = sections.filter((s) => s.status === "FAILED").length;
  const sourcePlanByChapter = new Map((run.source_plan ?? []).map((item) => [item.chapter_index, item]));
  const sourceCount = new Set(
    (run.source_plan ?? []).flatMap((item) =>
      item.sources.map((source) => source.fingerprint ?? source.doc_id ?? source.key)
    )
  ).size;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 flex flex-col max-w-6xl mx-auto w-full px-6 py-8 space-y-8"
    >
      {/* Phase indicator */}
      <div className="flex items-center gap-0">
        {PHASE_STEPS.map((step, i) => {
          const currentIdx = PHASE_STEPS.findIndex((s) => s.key === run.status);
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <div key={step.key} className="flex items-center gap-0">
              <div className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full transition-all"
                  style={{
                    background: isDone
                      ? "#22c55e"
                      : isCurrent
                      ? "#6366f1"
                      : "rgba(255,255,255,0.15)",
                    boxShadow: isCurrent ? "0 0 8px rgba(99,102,241,0.6)" : "none",
                  }}
                />
                <span
                  className="text-xs transition-all"
                  style={{
                    color: isDone
                      ? "#22c55e"
                      : isCurrent
                      ? "#a5b4fc"
                      : "var(--text-faint)",
                    fontWeight: isCurrent ? 600 : 400,
                  }}
                >
                  {step.label}
                </span>
              </div>
              {i < PHASE_STEPS.length - 1 && (
                <div
                  className="mx-3 h-px flex-1"
                  style={{ width: "40px", background: isDone ? "#22c55e40" : "rgba(255,255,255,0.06)" }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Overall progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-dim)" }}>
          <span>
            {isMapping ? "Assigning PDFs to outline sections…" : isAssembling ? "Assembling final document…" : `${doneCount} / ${total} sections written`}
          </span>
          <span className="font-semibold tabular-nums" style={{ color: "#818cf8" }}>
            {progress}%
          </span>
        </div>
        <div className="relative h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ background: "linear-gradient(90deg, #6366f1, #8b5cf6)" }}
            animate={{ width: `${progress}%` }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
          />
          {/* Shimmer when writing */}
          {(run.status === "WRITING" || run.status === "MAPPING_SOURCES") && (
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${progress}%`,
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
                backgroundSize: "200% 100%",
                animation: "shimmer 2s infinite",
              }}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_0.75fr] gap-4">
        <div
          className="rounded-3xl p-5 overflow-hidden relative"
          style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(129,140,248,0.22)" }}
        >
          <div
            className="absolute inset-0 opacity-50"
            style={{ background: "linear-gradient(120deg, transparent, rgba(34,211,238,0.08), transparent)" }}
          />
          <div className="relative flex flex-col md:flex-row md:items-center gap-4 justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#a5b4fc" }}>
                Agent focus
              </p>
              <h3 className="mt-2 text-xl font-semibold truncate" style={{ color: "var(--text)" }}>
                {isMapping
                  ? "Classifying PDFs for each section"
                  : isAssembling
                  ? "Writing final abstract and assembling document"
                  : currentSection
                  ? currentSection.title
                  : run.status === "DONE"
                  ? "All sections completed"
                  : "Waiting for the next section"}
              </h3>
              <p className="mt-2 text-sm max-w-2xl" style={{ color: "var(--text-dim)" }}>
                {isAssembling
                  ? "The agent now reads the completed sections, writes the final abstract, smooths transitions, and appends verified references."
                  : currentSection
                  ? "The current section is being drafted with its assigned PDFs and the context from previously completed sections."
                  : isMapping
                  ? "The source mapper is matching library PDFs to outline sections before any prose is written."
                  : "The writing queue is synchronized with the latest section status."}
              </p>
            </div>
            <motion.div
              className="w-24 h-24 rounded-3xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(99,102,241,0.16)", color: "#c7d2fe" }}
              animate={run.status === "WRITING" || isMapping || isAssembling ? { scale: [1, 1.04, 1] } : { scale: 1 }}
              transition={{ duration: 1.4, repeat: Infinity }}
            >
              {isAssembling ? <Sparkles size={30} /> : isMapping ? <Files size={30} /> : <PenLine size={30} />}
            </motion.div>
          </div>
        </div>

        <div className="grid grid-cols-3 lg:grid-cols-1 gap-3">
          <MiniMetric icon={<CheckCircle2 size={14} />} label="Done" value={`${doneCount}`} color="#22c55e" />
          <MiniMetric icon={<Activity size={14} />} label="Active" value={currentSection ? "1" : "0"} color="#818cf8" active={Boolean(currentSection)} />
          <MiniMetric icon={<Clock3 size={14} />} label={failedCount ? "Failed" : "Queued"} value={`${failedCount || queuedCount}`} color={failedCount ? "#ef4444" : "#22d3ee"} />
        </div>
      </div>

      {isMapping && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-3"
        >
          <StatusTile icon={<Files size={15} />} label="PDF source map" value="Building" color="#22d3ee" active />
          <StatusTile icon={<PackageCheck size={15} />} label="Unique PDFs" value={`${sourceCount} ready`} color="#22c55e" />
          <StatusTile icon={<PenLine size={15} />} label="Drafting" value="Queued" color="#818cf8" />
        </motion.div>
      )}

      {(run.source_plan?.length ?? 0) > 0 && (
        <SourcePlanGrid sourcePlan={run.source_plan!} activeChapterIndex={currentSection?.chapter_index} />
      )}

      {/* Assembling shimmer */}
      {isAssembling && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative h-10 rounded-2xl overflow-hidden flex items-center justify-center"
          style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}
        >
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.2) 50%, transparent 100%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 2s infinite",
            }}
          />
          <span className="relative text-sm font-medium" style={{ color: "#a5b4fc" }}>
            ✨ Assembling document…
          </span>
        </motion.div>
      )}

      {/* Section list */}
      <div className="space-y-2">
        {sections.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{ color: "var(--text-faint)" }}>
            Preparing sections…
          </div>
        ) : (
          sections
            .slice()
            .sort((a, b) => a.chapter_index - b.chapter_index)
            .map((section) => (
              <SectionRow
                key={section.id}
                section={section}
                sourceCount={sourcePlanByChapter.get(section.chapter_index)?.sources.length ?? 0}
              />
            ))
        )}
      </div>
    </motion.div>
  );
}

function StatusTile({
  icon,
  label,
  value,
  color,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  active?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-4 flex items-center gap-3"
      style={{ background: `${color}10`, border: `1px solid ${color}28` }}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}18`, color }}>
        {icon}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          {label}
        </p>
        <p className="text-sm font-semibold" style={{ color }}>
          {value}
          {active && (
            <motion.span
              className="inline-block ml-1"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              ...
            </motion.span>
          )}
        </p>
      </div>
    </div>
  );
}

function MiniMetric({
  icon,
  label,
  value,
  color,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  active?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-3 flex items-center gap-2"
      style={{ background: `${color}10`, border: `1px solid ${color}24` }}
    >
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}18`, color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          {label}
        </p>
        <p className="text-sm font-semibold" style={{ color }}>
          {value}
          {active && (
            <motion.span
              className="inline-block ml-1"
              animate={{ opacity: [0.25, 1, 0.25] }}
              transition={{ duration: 1.1, repeat: Infinity }}
            >
              live
            </motion.span>
          )}
        </p>
      </div>
    </div>
  );
}

function SourcePlanGrid({
  sourcePlan,
  activeChapterIndex,
}: {
  sourcePlan: WriterSourcePlanItem[];
  activeChapterIndex?: number;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>
            Section PDF map
          </p>
          <h3 className="text-lg font-semibold mt-1" style={{ color: "var(--text)" }}>
            Assigned literature with summaries
          </h3>
        </div>
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
          Click a PDF to expand
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {sourcePlan.map((item) => {
          const active = item.chapter_index === activeChapterIndex;
          return (
            <motion.div
              key={item.chapter_index}
              layout
              className="rounded-3xl p-4"
              style={{
                background: active ? "rgba(99,102,241,0.10)" : "rgba(255,255,255,0.035)",
                border: active ? "1px solid rgba(129,140,248,0.35)" : "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
                    {item.title}
                  </p>
                  <p className="text-[11px] mt-1 line-clamp-1" style={{ color: "var(--text-faint)" }}>
                    Query: {item.query}
                  </p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(34,211,238,0.1)", color: "#22d3ee" }}>
                  {item.sources.length} PDFs
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {item.sources.slice(0, 6).map((source) => (
                  <SourcePdfCard key={`${item.chapter_index}-${source.key}`} source={source} />
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function SourcePdfCard({ source }: { source: WriterSource }) {
  const [open, setOpen] = useState(false);
  const summary = source.summary || source.excerpts?.[0] || "No summary is available yet. The section writer still receives the retrieved PDF excerpts for citation-aware drafting.";
  const score = Math.round(((source.score ?? source.best_score ?? 0) as number) * 100);

  return (
    <motion.button
      layout
      type="button"
      onClick={() => setOpen((value) => !value)}
      className="w-full text-left rounded-2xl p-3 transition-colors"
      style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(99,102,241,0.14)", color: "#a5b4fc" }}>
          <FileText size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate" style={{ color: "var(--text)" }}>
            [{source.key}] {source.filename}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-faint)" }}>
            Relevance {score}% {source.year ? `· ${source.year}` : ""}
          </p>
        </div>
        <motion.span animate={{ rotate: open ? 180 : 0 }} style={{ color: "var(--text-faint)" }}>
          <ChevronDown size={14} />
        </motion.span>
      </div>

      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-3 pt-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
            {summary}
          </p>
          {(source.authors?.length ?? 0) > 0 && (
            <p className="text-[10px] mt-2 line-clamp-1" style={{ color: "var(--text-faint)" }}>
              {source.authors!.slice(0, 4).join(", ")}
            </p>
          )}
        </motion.div>
      )}
    </motion.button>
  );
}

function SectionRow({ section, sourceCount }: { section: WritingSection; sourceCount: number }) {
  const color = CHAPTER_COLORS[section.chapter_index % CHAPTER_COLORS.length];
  const isWriting = section.status === "WRITING";
  const isDone = section.status === "DONE";
  const isFailed = section.status === "FAILED";

  return (
    <motion.div
      layout
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
    >
      {/* Status icon */}
      <div className="flex-shrink-0">
        {isDone ? (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            <CheckCircle2 size={16} style={{ color: "#22c55e" }} />
          </motion.div>
        ) : isFailed ? (
          <AlertCircle size={16} style={{ color: "#ef4444" }} />
        ) : isWriting ? (
          <div
            className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: color, borderTopColor: "transparent" }}
          />
        ) : (
          <Circle size={16} style={{ color: "var(--text-faint)" }} />
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between">
          <span
            className="text-sm font-medium truncate"
            style={{ color: isDone ? "var(--text)" : "var(--text-dim)" }}
          >
            {section.title}
          </span>
          <span
            className="text-xs flex-shrink-0 ml-2 px-1.5 py-0.5 rounded-md"
            style={{ background: `${color}20`, color, fontSize: "10px" }}
          >
            {(section.target_pages ?? 1).toFixed(1)}pp
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--text-faint)" }}>
          <span>{sourceCount} assigned PDFs</span>
          <span>·</span>
          <span>{isDone ? "Written" : isWriting ? "Agent writing now" : isFailed ? "Needs retry" : "Queued"}</span>
        </div>

        {/* Progress bar */}
        <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
          {isWriting && (
            <div
              className="h-full rounded-full"
              style={{
                width: "60%",
                background: `linear-gradient(90deg, ${color}80, ${color})`,
                backgroundSize: "200% 100%",
                animation: "shimmer 1.8s infinite",
              }}
            />
          )}
          {isDone && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 0.4 }}
              className="h-full rounded-full"
              style={{ background: "#22c55e" }}
            />
          )}
          {isFailed && (
            <div className="h-full w-full rounded-full" style={{ background: "#ef444460" }} />
          )}
        </div>
      </div>
    </motion.div>
  );
}
