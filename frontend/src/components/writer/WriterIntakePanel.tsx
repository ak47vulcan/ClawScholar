"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FileText, Newspaper, AlignLeft, PenLine, ArrowRight, Library } from "lucide-react";
import { useWriterStore } from "@/stores/writer-store";
import { useDocumentStore } from "@/stores/document-store";
import { pageVariants } from "@/lib/motion-variants";
import type { DocType } from "@/types/writer";

const DOC_TYPES: Array<{
  type: DocType;
  icon: React.ElementType;
  label: string;
  description: string;
  color: string;
}> = [
  {
    type: "paper",
    icon: FileText,
    label: "Academic Paper",
    description: "Full research paper with abstract, methods & citations",
    color: "#6366f1",
  },
  {
    type: "article",
    icon: Newspaper,
    label: "Article",
    description: "Accessible writeup for a broader academic audience",
    color: "#06b6d4",
  },
  {
    type: "summary",
    icon: AlignLeft,
    label: "Summary",
    description: "Concise executive summary of your library sources",
    color: "#22c55e",
  },
  {
    type: "draft",
    icon: PenLine,
    label: "Draft",
    description: "Exploratory first draft — ideas over polish",
    color: "#f59e0b",
  },
];

export function WriterIntakePanel() {
  const { createRun, setActiveRun } = useWriterStore();
  const { documents } = useDocumentStore();
  const [selectedType, setSelectedType] = useState<DocType>("summary");
  const [title, setTitle] = useState("");
  const [request, setRequest] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const indexedCount = documents.filter((d) => d.embeddingStatus === "INDEXED").length;

  const handleStart = async () => {
    if (!request.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const runId = await createRun(selectedType, title, request);
      setActiveRun(runId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start writer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-5xl mx-auto w-full"
    >
      <div 
        className="w-full space-y-8 px-8 py-10 rounded-[2rem] relative overflow-hidden group transition-all duration-700 hover:shadow-xl"
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
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>
            New Document
          </h2>
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            Compose a document from your research library
          </p>
          {indexedCount > 0 && (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs"
              style={{
                background: "rgba(34,197,94,0.1)",
                border: "1px solid rgba(34,197,94,0.2)",
                color: "#22c55e",
              }}
            >
              <Library size={11} />
              {indexedCount} indexed source{indexedCount !== 1 ? "s" : ""} available
            </div>
          )}
        </div>

        {/* Document type selector */}
        <div className="grid grid-cols-2 gap-3">
          {DOC_TYPES.map(({ type, icon: Icon, label, description, color }) => (
            <motion.button
              key={type}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedType(type)}
              className="relative flex flex-col gap-2 p-4 rounded-2xl text-left transition-all"
              style={{
                background:
                  selectedType === type
                    ? `linear-gradient(135deg, ${color}20, ${color}10)`
                    : "rgba(255,255,255,0.03)",
                border: "1px solid",
                borderColor: selectedType === type ? `${color}50` : "rgba(255,255,255,0.07)",
                boxShadow:
                  selectedType === type ? `0 4px 20px ${color}15` : "none",
              }}
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: `${color}20`, color }}
              >
                <Icon size={16} />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                  {label}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-faint)" }}>
                  {description}
                </p>
              </div>
              {selectedType === type && (
                <motion.div
                  layoutId="type-indicator"
                  className="absolute top-3 right-3 w-2 h-2 rounded-full"
                  style={{ background: color }}
                />
              )}
            </motion.button>
          ))}
        </div>

        {/* Title */}
        <div className="space-y-2">
          <label className="text-xs font-medium" style={{ color: "var(--text-dim)" }}>
            Title <span style={{ color: "var(--text-faint)" }}>(optional)</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title…"
            className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--text)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "rgba(99,102,241,0.5)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
          />
        </div>

        {/* Request */}
        <div className="space-y-2">
          <label className="text-xs font-medium" style={{ color: "var(--text-dim)" }}>
            What would you like to compose?
          </label>
          <textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            rows={4}
            placeholder="Describe what you want to write — e.g. 'A 10-page literature review on transformer architectures in NLP, focusing on attention mechanisms and BERT variants.'"
            className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none transition-all"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--text)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "rgba(99,102,241,0.5)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleStart();
            }}
          />
          <p className="text-xs" style={{ color: "var(--text-faint)" }}>
            ⌘↵ to start
          </p>
        </div>

        {error && (
          <p className="text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <motion.button
          whileHover={{ scale: 1.01, y: -1 }}
          whileTap={{ scale: 0.99 }}
          onClick={handleStart}
          disabled={!request.trim() || loading}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
          style={{
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
            color: "#fff",
          }}
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              Start with AI →
              <ArrowRight size={14} />
            </>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}
