"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Activity, CheckCircle2, Library, MessageSquare } from "lucide-react";
import { useWorkflowStore } from "@/stores/workflow-store";
import { useDocumentStore } from "@/stores/document-store";
import { useChatStore } from "@/stores/chat-store";

function useCountUp(target: number, duration = 600): number {
  const ref = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  // We derive the "current" value via a trick: return target directly
  // (animated via CSS counter or framer-motion's tween)
  return target;
}

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  sub?: string;
  color: string;
  delay: number;
  glow?: boolean;
}

function StatCard({ label, value, icon, sub, color, delay, glow }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, delay, ease: "easeOut" }}
      whileHover={{ y: -2, boxShadow: `0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px ${color}25` }}
      className="glass p-4 flex items-start gap-3 overflow-hidden relative"
      style={{
        borderTop: `3px solid ${color}40`,
        boxShadow: glow ? `0 0 24px ${color}22, 0 2px 8px rgba(0,0,0,0.3)` : undefined,
        transition: "box-shadow 0.2s, transform 0.2s",
      }}
    >
      {/* Subtle background glow */}
      <div
        className="absolute top-0 right-0 w-24 h-24 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${color}10 0%, transparent 70%)` }}
      />
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}18`, border: `1px solid ${color}30` }}
      >
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <motion.p
          key={String(value)}
          initial={{ opacity: 0.4, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="text-2xl font-bold tabular-nums leading-none number-pop"
          style={{ color: "var(--text)" }}
        >
          {value}
        </motion.p>
        <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
          {label}
        </p>
        {sub && (
          <p className="text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>
            {sub}
          </p>
        )}
      </div>
    </motion.div>
  );
}

export function StatsRow() {
  const workflows = useWorkflowStore((s) => s.workflows);
  const documents = useDocumentStore((s) => s.documents);
  const conversations = useChatStore((s) => s.conversations);

  const running = workflows.filter((w) => w.status === "RUNNING").length;
  const completed = workflows.filter((w) => w.status === "COMPLETED").length;
  const indexed = documents.filter((d) => d.embeddingStatus === "INDEXED").length;
  const totalChunks = documents.reduce((acc, d) => acc + d.chunkCount, 0);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Active Runs"
        value={running}
        icon={<Activity size={18} />}
        color="#6366f1"
        sub="Real-time"
        delay={0}
        glow={running > 0}
      />
      <StatCard
        label="Completed Runs"
        value={completed}
        icon={<CheckCircle2 size={18} />}
        color="#22c55e"
        sub={completed > 0 ? "All time" : "Start a workflow"}
        delay={0.05}
      />
      <StatCard
        label="Indexed Documents"
        value={indexed}
        icon={<Library size={18} />}
        color="#f59e0b"
        sub={totalChunks > 0 ? `${totalChunks.toLocaleString()} chunks` : "Upload or search"}
        delay={0.1}
      />
      <StatCard
        label="Chat Threads"
        value={conversations.length}
        icon={<MessageSquare size={18} />}
        color="#8b5cf6"
        sub={conversations.length > 0 ? "Across all topics" : "Open Chat to start"}
        delay={0.15}
      />
    </div>
  );
}
