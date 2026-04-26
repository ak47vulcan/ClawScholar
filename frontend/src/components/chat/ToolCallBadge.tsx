"use client";

import { motion } from "framer-motion";
import { BookOpen, FileText, CalendarPlus, Calendar } from "lucide-react";
import type { ToolHint, ToolHintType } from "@/lib/chat-tool-parser";

const ICONS: Record<ToolHintType, React.ReactNode> = {
  list_library_pdfs: <BookOpen size={10} />,
  summarize_pdf: <FileText size={10} />,
  create_calendar_event: <CalendarPlus size={10} />,
  list_calendar_events: <Calendar size={10} />,
};

interface Props {
  hints: ToolHint[];
}

export function ToolCallBadge({ hints }: Props) {
  if (hints.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mb-2">
      {hints.map((hint, i) => (
        <motion.span
          key={hint.type}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.05 }}
          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
          style={{
            background: "rgba(99,102,241,0.1)",
            border: "1px solid rgba(99,102,241,0.2)",
            color: "var(--primary)",
          }}
        >
          {ICONS[hint.type]}
          {hint.label}
        </motion.span>
      ))}
    </div>
  );
}
