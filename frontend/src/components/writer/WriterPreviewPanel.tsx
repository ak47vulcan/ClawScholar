"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Download, FileText, FileDown, Check, BookOpen } from "lucide-react";
import { useWriterStore } from "@/stores/writer-store";
import { api } from "@/lib/api-client";
import { useUIStore } from "@/stores/ui-store";
import type { WriterRun } from "@/types/writer";

interface Props {
  run: WriterRun;
}

export function WriterPreviewPanel({ run }: Props) {
  const { addToast } = useUIStore();
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState<"docx" | "pdf" | null>(null);
  const [activeTab, setActiveTab] = useState<"preview" | "markdown">("preview");

  const markdown = run.full_markdown ?? "";
  const wordCount = run.word_count ?? markdown.split(/\s+/).filter(Boolean).length;
  const pageEstimate = run.page_estimate ?? Math.round(wordCount / 500 * 10) / 10;

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const doExport = async (format: "docx" | "pdf") => {
    setExporting(format);
    try {
      const blob = await api.fetchBlob(`/writer/runs/${run.id}/export/${format}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${run.title.replace(/\s+/g, "_").slice(0, 50)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      addToast({ type: "success", message: `${format.toUpperCase()} downloaded successfully` });
    } catch {
      addToast({ type: "error", message: `Export failed. Please try again.` });
    } finally {
      setExporting(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 flex flex-col min-h-0"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: "rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-4">
          <div className="space-y-0.5">
            <h2 className="text-base font-semibold truncate max-w-xs" style={{ color: "var(--text)" }}>
              {run.title}
            </h2>
            <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-faint)" }}>
              <span>{wordCount.toLocaleString()} words</span>
              <span>≈ {pageEstimate} pages</span>
              <span
                className="px-1.5 py-0.5 rounded-md"
                style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}
              >
                ✓ Complete
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Copy */}
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={copyMarkdown}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--text-dim)",
            }}
          >
            {copied ? <Check size={12} style={{ color: "#22c55e" }} /> : <Copy size={12} />}
            {copied ? "Copied!" : "Copy MD"}
          </motion.button>

          {/* Word export */}
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => doExport("docx")}
            disabled={exporting !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all disabled:opacity-50"
            style={{
              background: "rgba(99,102,241,0.12)",
              border: "1px solid rgba(99,102,241,0.25)",
              color: "#a5b4fc",
            }}
          >
            {exporting === "docx" ? (
              <div className="w-3 h-3 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <FileText size={12} />
            )}
            Word
          </motion.button>

          {/* PDF export */}
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => doExport("pdf")}
            disabled={exporting !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all disabled:opacity-50"
            style={{
              background: "rgba(139,92,246,0.12)",
              border: "1px solid rgba(139,92,246,0.25)",
              color: "#c4b5fd",
            }}
          >
            {exporting === "pdf" ? (
              <div className="w-3 h-3 border border-purple-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <FileDown size={12} />
            )}
            PDF
          </motion.button>
        </div>
      </div>

      {/* Tab bar */}
      <div
        className="flex items-center gap-0 px-6 border-b"
        style={{ borderColor: "rgba(255,255,255,0.07)" }}
      >
        {(["preview", "markdown"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="relative px-4 py-3 text-xs font-medium capitalize transition-colors"
            style={{ color: activeTab === tab ? "#a5b4fc" : "var(--text-faint)" }}
          >
            {tab === "preview" ? (
              <span className="flex items-center gap-1.5">
                <BookOpen size={11} /> Rendered Preview
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Copy size={11} /> Raw Markdown
              </span>
            )}
            {activeTab === tab && (
              <motion.div
                layoutId="preview-tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                style={{ background: "#6366f1" }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {activeTab === "markdown" ? (
          <pre
            className="text-xs leading-relaxed whitespace-pre-wrap font-mono"
            style={{ color: "var(--text-dim)" }}
          >
            {markdown}
          </pre>
        ) : (
          <MarkdownPreview markdown={markdown} />
        )}
      </div>
    </motion.div>
  );
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");

  return (
    <div className="prose-writer space-y-4 max-w-none">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-2" />;
        if (line.startsWith("# "))
          return (
            <h1
              key={i}
              className="text-2xl font-bold leading-tight pb-2 border-b"
              style={{
                background: "linear-gradient(135deg, #e2e8f0, #a5b4fc)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                borderColor: "rgba(255,255,255,0.06)",
              }}
            >
              {line.slice(2)}
            </h1>
          );
        if (line.startsWith("## "))
          return (
            <h2
              key={i}
              className="text-lg font-semibold pt-4"
              style={{ color: "#c7d2fe" }}
            >
              {line.slice(3)}
            </h2>
          );
        if (line.startsWith("### "))
          return (
            <h3 key={i} className="text-base font-semibold" style={{ color: "#ddd6fe" }}>
              {line.slice(4)}
            </h3>
          );
        if (line.startsWith("> "))
          return (
            <blockquote
              key={i}
              className="pl-4 border-l-2 italic"
              style={{ color: "var(--text-dim)", borderColor: "#6366f1" }}
            >
              {line.slice(2)}
            </blockquote>
          );
        if (line.startsWith("- ") || line.startsWith("* "))
          return (
            <li key={i} className="ml-4 text-sm" style={{ color: "var(--text-dim)" }}>
              {line.slice(2)}
            </li>
          );
        return (
          <p
            key={i}
            className="text-sm leading-relaxed"
            style={{ color: "var(--text-dim)" }}
            dangerouslySetInnerHTML={{ __html: formatInline(line) }}
          />
        );
      })}
    </div>
  );
}

function formatInline(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--text);font-weight:600">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em style="color:var(--text-dim)">$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:4px;font-size:12px;color:#a5b4fc">$1</code>');
}
