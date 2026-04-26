"use client";

import { motion } from "framer-motion";
import { Bot } from "lucide-react";

export function TypingIndicator({ label = "Agent is thinking…" }: { label?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="flex gap-3"
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          border: "1px solid var(--border)",
        }}
      >
        <Bot size={14} className="text-indigo-400" />
      </div>
      <div
        className="flex items-center gap-2 rounded-2xl rounded-tl-sm px-4 py-3"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      >
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
          {label}
        </span>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--primary)" }}
              animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
