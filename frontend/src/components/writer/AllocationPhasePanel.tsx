"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as Slider from "@radix-ui/react-slider";
import { useWriterStore } from "@/stores/writer-store";
import type { Chapter, ChapterAllocation, WriterRun } from "@/types/writer";

const CHAPTER_COLORS = [
  "#6366f1", "#8b5cf6", "#06b6d4", "#22c55e",
  "#f59e0b", "#ec4899", "#0ea5e9", "#a78bfa",
];

interface Props {
  run: WriterRun;
  chapters: Chapter[];
}

export function AllocationPhasePanel({ run, chapters }: Props) {
  const { acceptOutlineAndAllocate } = useWriterStore();
  const [totalPages, setTotalPages] = useState<number>(
    run.target_pages ?? run.outline?.total_suggested_pages ?? 10
  );
  const [loading, setLoading] = useState(false);

  // dividerFractions[i] = cumulative fraction at end of chapter i (0..1)
  const initFractions = useCallback(() => {
    const equalFrac = 1 / Math.max(chapters.length, 1);
    return chapters.map((_, i) => (i + 1) * equalFrac);
  }, [chapters]);

  const [dividers, setDividers] = useState<number[]>(initFractions);

  useEffect(() => {
    setDividers(initFractions());
  }, [initFractions]);

  const barRef = useRef<HTMLDivElement>(null);
  const draggingIdx = useRef<number | null>(null);

  const getPageForChapter = (idx: number): number => {
    const start = idx === 0 ? 0 : dividers[idx - 1];
    const end = dividers[idx] ?? 1;
    return Math.max(0.5, Math.round((end - start) * totalPages * 10) / 10);
  };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, dividerIdx: number) => {
      e.preventDefault();
      draggingIdx.current = dividerIdx;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const idx = draggingIdx.current;
      if (idx === null || !barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      const raw = (e.clientX - rect.left) / rect.width;
      const minGap = 0.5 / Math.max(totalPages, 1);
      const minPos = idx === 0 ? minGap : dividers[idx - 1] + minGap;
      const maxPos =
        idx === dividers.length - 1 ? 1 - minGap : dividers[idx + 1] - minGap;
      const clamped = Math.max(minPos, Math.min(maxPos, raw));
      setDividers((prev) => prev.map((d, i) => (i === idx ? clamped : d)));
    },
    [dividers, totalPages]
  );

  const handlePointerUp = useCallback(() => {
    draggingIdx.current = null;
  }, []);

  const allocations: ChapterAllocation[] = chapters.map((ch, idx) => ({
    chapter_index: ch.index,
    target_pages: getPageForChapter(idx),
  }));

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await acceptOutlineAndAllocate(run.id, chapters, allocations);
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
        className="flex flex-col space-y-8 px-8 py-10 rounded-[2rem] relative overflow-hidden group transition-all duration-700 hover:shadow-xl"
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
          Configure page allocation
        </h2>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Drag the dividers to adjust how many pages each chapter gets.
        </p>
      </div>

      {/* Total pages control */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium" style={{ color: "var(--text-dim)" }}>
            Total pages
          </label>
          <motion.span
            key={totalPages}
            initial={{ scale: 1.15, opacity: 0.7 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-sm font-bold tabular-nums"
            style={{ color: "#818cf8" }}
          >
            {totalPages} pages
          </motion.span>
        </div>
        <Slider.Root
          min={0.5}
          max={50}
          step={0.5}
          value={[totalPages]}
          onValueChange={([v]) => setTotalPages(v)}
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
            className="block w-5 h-5 rounded-full cursor-pointer outline-none"
            style={{
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              boxShadow: "0 0 0 3px rgba(99,102,241,0.3)",
            }}
          />
        </Slider.Root>
        <div className="flex justify-between text-xs" style={{ color: "var(--text-faint)" }}>
          <span>3pp</span>
          <span>50pp</span>
        </div>
      </div>

      {/* Stacked allocation bar */}
      <div className="space-y-4">
        <div
          ref={barRef}
          className="relative h-14 rounded-2xl overflow-hidden flex select-none"
          style={{
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {chapters.map((ch, idx) => {
            const start = idx === 0 ? 0 : dividers[idx - 1];
            const end = dividers[idx] ?? 1;
            const width = (end - start) * 100;
            const color = CHAPTER_COLORS[idx % CHAPTER_COLORS.length];

            return (
              <div
                key={ch.index}
                className="relative flex items-center justify-center overflow-hidden"
                style={{
                  width: `${width}%`,
                  background: `${color}30`,
                  transition: draggingIdx.current !== null ? "none" : "width 0.1s ease",
                  borderRight: idx < chapters.length - 1 ? `1px solid rgba(255,255,255,0.06)` : "none",
                }}
              >
                <span
                  className="text-xs font-bold tabular-nums"
                  style={{ color, opacity: width > 6 ? 1 : 0 }}
                >
                  {Math.round(width)}%
                </span>
              </div>
            );
          })}

          {/* Divider handles */}
          {dividers.slice(0, chapters.length - 1).map((frac, idx) => (
            <div
              key={idx}
              className="absolute top-0 bottom-0 flex items-center justify-center cursor-col-resize z-10 group"
              style={{
                left: `calc(${frac * 100}% - 4px)`,
                width: "8px",
              }}
              onPointerDown={(e) => handlePointerDown(e, idx)}
            >
              <div
                className="h-full transition-all group-hover:w-1.5 group-active:w-1.5"
                style={{
                  width: "3px",
                  background: "rgba(255,255,255,0.15)",
                  boxShadow: "0 0 6px rgba(99,102,241,0)",
                }}
              />
            </div>
          ))}
        </div>

        {/* Chapter labels */}
        <div className="flex" style={{ gap: 0 }}>
          {chapters.map((ch, idx) => {
            const start = idx === 0 ? 0 : dividers[idx - 1];
            const end = dividers[idx] ?? 1;
            const width = (end - start) * 100;
            const color = CHAPTER_COLORS[idx % CHAPTER_COLORS.length];
            const pages = getPageForChapter(idx);

            return (
              <div
                key={ch.index}
                className="flex flex-col items-center justify-start pt-1 px-1 overflow-hidden"
                style={{ width: `${width}%`, transition: "width 0.1s ease" }}
              >
                <motion.span
                  key={pages}
                  initial={{ scale: 1.12, opacity: 0.7 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-xs font-bold tabular-nums"
                  style={{ color, fontSize: "10px" }}
                >
                  {Math.round(width)}%
                </motion.span>
                {width > 8 && (
                  <span
                    className="text-xs truncate w-full text-center mt-0.5"
                    style={{ color: "var(--text-faint)", fontSize: "9px" }}
                  >
                    {ch.title.length > 14 ? ch.title.slice(0, 13) + "…" : ch.title}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-chapter list */}
      <div className="space-y-2">
        {chapters.map((ch, idx) => {
          const color = CHAPTER_COLORS[idx % CHAPTER_COLORS.length];
          const pages = getPageForChapter(idx);
          const start = idx === 0 ? 0 : dividers[idx - 1];
          const end = dividers[idx] ?? 1;
          const percentage = Math.round((end - start) * 100);
          return (
            <div
              key={ch.index}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
            >
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
              <span className="flex-1 text-sm truncate" style={{ color: "var(--text)" }}>
                {ch.title}
              </span>
              <motion.span
                key={pages}
                initial={{ scale: 1.15 }}
                animate={{ scale: 1 }}
                className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-lg flex items-center gap-2"
                style={{ background: `${color}20`, color }}
              >
                <span>{percentage}%</span>
                <span className="opacity-60 text-[10px]">({pages.toFixed(1)}p)</span>
              </motion.span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-sm" style={{ color: "var(--text-dim)" }}>
        <span>Total: {allocations.reduce((s, a) => s + a.target_pages, 0).toFixed(1)} pages</span>
        <span style={{ color: "var(--text-faint)" }}>~{Math.round(totalPages * 500).toLocaleString()} words</span>
      </div>

      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={handleConfirm}
        disabled={loading}
        className="flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold disabled:opacity-40"
        style={{
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
          color: "#fff",
        }}
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Starting…
          </>
        ) : (
          "Confirm & Start Writing →"
        )}
      </motion.button>
      </div>
    </motion.div>
  );
}
