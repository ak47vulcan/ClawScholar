"use client";

import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";

type Verdict = "APPROVED" | "REJECTED" | "PARTIAL" | "PENDING";

interface ValidationBadgeProps {
  verdict: Verdict;
  confidence?: number;
  runId?: string;
}

const META: Record<Verdict, { label: string; icon: React.ReactNode; bg: string; border: string; color: string }> = {
  APPROVED: {
    label: "Librarian Verified",
    icon: <CheckCircle2 size={14} />,
    bg: "rgba(34,197,94,0.12)",
    border: "rgba(34,197,94,0.3)",
    color: "#22c55e",
  },
  REJECTED: {
    label: "Validation Failed",
    icon: <XCircle size={14} />,
    bg: "rgba(239,68,68,0.12)",
    border: "rgba(239,68,68,0.3)",
    color: "#ef4444",
  },
  PARTIAL: {
    label: "Partially Verified",
    icon: <AlertTriangle size={14} />,
    bg: "rgba(245,158,11,0.12)",
    border: "rgba(245,158,11,0.3)",
    color: "#f59e0b",
  },
  PENDING: {
    label: "Awaiting Validation",
    icon: <Clock size={14} />,
    bg: "rgba(100,116,139,0.12)",
    border: "rgba(100,116,139,0.3)",
    color: "#64748b",
  },
};

export function ValidationBadge({ verdict, confidence, runId }: ValidationBadgeProps) {
  const meta = META[verdict];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
      style={{
        background: meta.bg,
        border: `1px solid ${meta.border}`,
      }}
    >
      <span style={{ color: meta.color }}>{meta.icon}</span>
      <div className="flex flex-col">
        <span className="text-xs font-semibold leading-tight" style={{ color: meta.color }}>
          {meta.label}
        </span>
        {confidence !== undefined && (
          <span className="text-[10px]" style={{ color: meta.color, opacity: 0.8 }}>
            Confidence: {Math.round(confidence * 100)}%
          </span>
        )}
      </div>
      {verdict === "PENDING" && (
        <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: meta.color }} />
      )}
    </motion.div>
  );
}
