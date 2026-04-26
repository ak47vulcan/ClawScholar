"use client";

import { motion } from "framer-motion";
import { FileText, Newspaper, AlignLeft, PenLine, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { DocType } from "@/types/writer";

interface WriterRunPayload {
  run_id: string;
  doc_type: string;
  title: string;
  status: string;
}

const DOC_TYPE_CONFIG: Record<DocType, { icon: React.ElementType; color: string; label: string }> = {
  paper: { icon: FileText, color: "#6366f1", label: "Paper" },
  article: { icon: Newspaper, color: "#06b6d4", label: "Article" },
  summary: { icon: AlignLeft, color: "#22c55e", label: "Summary" },
  draft: { icon: PenLine, color: "#f59e0b", label: "Draft" },
};

export function WriterRunCard({ payload }: { payload: WriterRunPayload }) {
  const cfg = DOC_TYPE_CONFIG[payload.doc_type as DocType] ?? DOC_TYPE_CONFIG.draft;
  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="my-2 rounded-2xl overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${cfg.color}10, rgba(255,255,255,0.03))`,
        border: `1px solid ${cfg.color}30`,
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${cfg.color}20`, color: cfg.color }}
        >
          <Icon size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>
            {payload.title || `New ${cfg.label}`}
          </p>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>
            {cfg.label} · Clarifying questions ready
          </p>
        </div>
        <Link
          href={`/writer?run=${payload.run_id}`}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-all hover:opacity-90"
          style={{
            background: `${cfg.color}20`,
            border: `1px solid ${cfg.color}40`,
            color: cfg.color,
          }}
        >
          Open
          <ExternalLink size={11} />
        </Link>
      </div>
    </motion.div>
  );
}
