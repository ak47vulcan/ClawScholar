"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, Loader2, Search, Brain, FileText, Sparkles, BookOpen, Zap } from "lucide-react";

// ─── Stage definitions ───────────────────────────────────────────────────────

interface Stage {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  /** ms after sending when this stage starts */
  startsAt: number;
  /** ms after starting when it completes (0 = waits for next stage start) */
  duration: number;
}

function buildStages(isPaperSearch: boolean): Stage[] {
  if (isPaperSearch) {
    return [
      {
        id: "analyze",
        label: "Analysing request",
        sublabel: "Understanding research context",
        icon: <Brain size={13} />,
        startsAt: 0,
        duration: 900,
      },
      {
        id: "reformulate",
        label: "Optimising search query",
        sublabel: "Formulating precise academic search terms",
        icon: <Sparkles size={13} />,
        startsAt: 900,
        duration: 1200,
      },
      {
        id: "search",
        label: "Searching databases",
        sublabel: "arXiv · Semantic Scholar · PubMed",
        icon: <Search size={13} />,
        startsAt: 2100,
        duration: 4500,
      },
      {
        id: "rank",
        label: "Ranking relevance",
        sublabel: "AI Embeddings · Citation analysis",
        icon: <Zap size={13} />,
        startsAt: 6600,
        duration: 2000,
      },
      {
        id: "compose",
        label: "Composing response",
        sublabel: "Curating results",
        icon: <FileText size={13} />,
        startsAt: 8600,
        duration: 0,
      },
    ];
  }

  return [
    {
      id: "understand",
      label: "Understanding request",
      icon: <Brain size={13} />,
      startsAt: 0,
      duration: 600,
    },
    {
      id: "context",
      label: "Checking context",
      sublabel: "Library & Calendar",
      icon: <BookOpen size={13} />,
      startsAt: 600,
      duration: 1200,
    },
    {
      id: "compose",
      label: "Formulating response",
      icon: <Sparkles size={13} />,
      startsAt: 1800,
      duration: 0,
    },
  ];
}

function isPaperSearchMessage(message: string): boolean {
  const t = message.toLowerCase();
  return (
    t.includes("paper") ||
    t.includes("studie") ||
    t.includes("studien") ||
    t.includes("publikation") ||
    t.includes("literatur") ||
    t.includes("artikel") ||
    t.includes("research") ||
    t.includes("arxiv") ||
    t.includes("suche") ||
    t.includes("search") ||
    t.includes("finde") ||
    t.includes("find") ||
    t.includes("recommend") ||
    t.includes("empfiehl") ||
    t.includes("zeig") ||
    t.includes("welche") && (t.includes("pdf") || t.includes("paper"))
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type StepStatus = "waiting" | "active" | "done";

function StageRow({
  stage,
  status,
  index,
}: {
  stage: Stage;
  status: StepStatus;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
      className="flex items-start gap-3"
    >
      {/* Status icon */}
      <div className="mt-0.5 w-5 h-5 shrink-0 flex items-center justify-center">
        {status === "done" ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            <CheckCircle2 size={16} className="text-emerald-400" />
          </motion.div>
        ) : status === "active" ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          >
            <Loader2 size={16} style={{ color: "var(--primary)" }} />
          </motion.div>
        ) : (
          <Circle size={16} style={{ color: "rgba(255,255,255,0.15)" }} />
        )}
      </div>

      {/* Label */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-medium"
            style={{
              color:
                status === "done"
                  ? "rgba(52,211,153,0.9)"
                  : status === "active"
                  ? "var(--text)"
                  : "rgba(255,255,255,0.3)",
              transition: "color 0.3s",
            }}
          >
            {stage.label}
          </span>
          {status === "active" && (
            <motion.div className="flex gap-0.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1 h-1 rounded-full"
                  style={{ background: "var(--primary)" }}
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </motion.div>
          )}
        </div>
        {stage.sublabel && (
          <p
            className="text-[10px] mt-0.5"
            style={{
              color:
                status === "done"
                  ? "rgba(52,211,153,0.5)"
                  : status === "active"
                  ? "rgba(255,255,255,0.45)"
                  : "rgba(255,255,255,0.15)",
              transition: "color 0.3s",
            }}
          >
            {stage.sublabel}
          </p>
        )}
      </div>

      {/* Active stage icon glow */}
      {status === "active" && (
        <motion.div
          className="shrink-0 mt-0.5"
          style={{ color: "var(--primary)" }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          {stage.icon}
        </motion.div>
      )}
    </motion.div>
  );
}

function ElapsedTimer() {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return (
    <span className="text-[10px] font-mono tabular-nums" style={{ color: "rgba(255,255,255,0.3)" }}>
      {m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AgentThinkingCardProps {
  /** The last user message — used to detect whether it's a paper search */
  lastUserMessage?: string;
}

export function AgentThinkingCard({ lastUserMessage = "" }: AgentThinkingCardProps) {
  const isSearch = isPaperSearchMessage(lastUserMessage);
  const stages = buildStages(isSearch);
  const [activeIndex, setActiveIndex] = useState(0);
  const elapsedRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let ms = 0;
    tickRef.current = setInterval(() => {
      ms += 50;
      elapsedRef.current = ms;
      // Advance to the next stage based on startsAt
      setActiveIndex((prev) => {
        for (let i = prev + 1; i < stages.length; i++) {
          if (ms >= stages[i].startsAt) return i;
        }
        return prev;
      });
    }, 50);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [stages.length]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex gap-3"
    >
      {/* Avatar */}
      <div className="shrink-0 mt-1">
        <motion.div
          className="w-8 h-8 rounded-full flex items-center justify-center relative"
          style={{
            background: "linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)",
            border: "1px solid rgba(99,102,241,0.35)",
          }}
        >
          {/* Pulsing ring */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ border: "1px solid rgba(99,102,241,0.4)" }}
            animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ border: "1px solid rgba(139,92,246,0.3)" }}
            animate={{ scale: [1, 1.7, 1], opacity: [0.4, 0, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
          />
          <Zap size={13} className="text-indigo-400 relative z-10" />
        </motion.div>
      </div>

      {/* Card */}
      <div
        className="flex-1 rounded-2xl rounded-tl-sm overflow-hidden"
        style={{
          background: "var(--surface-2)",
          border: "1px solid rgba(99,102,241,0.2)",
          boxShadow: "0 0 20px rgba(99,102,241,0.06), 0 0 0 1px rgba(99,102,241,0.08)",
        }}
      >
        {/* Animated gradient top bar */}
        <div className="relative h-0.5 overflow-hidden">
          <motion.div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(90deg, transparent, #6366f1, #8b5cf6, #6366f1, transparent)",
            }}
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
        </div>

        <div className="px-4 py-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <motion.div
                className="w-1.5 h-1.5 rounded-full bg-indigo-400"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>
                {isSearch ? "Research Agent" : "ClawScholar Agent"}
              </span>
            </div>
            <ElapsedTimer />
          </div>

          {/* Stage list */}
          <div className="flex flex-col gap-2.5">
            <AnimatePresence>
              {stages.map((stage, i) => (
                <StageRow
                  key={stage.id}
                  stage={stage}
                  status={i < activeIndex ? "done" : i === activeIndex ? "active" : "waiting"}
                  index={i}
                />
              ))}
            </AnimatePresence>
          </div>

          {/* Bottom activity bar */}
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
                    width: `${Math.round(((activeIndex + 1) / stages.length) * 100)}%`,
                  }}
                  animate={{ width: `${Math.round(((activeIndex + 1) / stages.length) * 100)}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
              <span className="text-[10px] tabular-nums shrink-0" style={{ color: "rgba(255,255,255,0.3)" }}>
                {Math.round(((activeIndex + 1) / stages.length) * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
