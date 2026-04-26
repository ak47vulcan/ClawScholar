"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, AlertCircle, Download, ExternalLink } from "lucide-react";
import { api } from "@/lib/api-client";

interface PDFViewerModalProps {
  docId: string;
  filename: string;
  sourceUrl?: string | null;
  onClose: () => void;
}

export function PDFViewerModal({ docId, filename, sourceUrl, onClose }: PDFViewerModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const blob = await api.fetchBlob(`/documents/${docId}/file`);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setBlobUrl(url);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load PDF");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [docId]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Header bar */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 shrink-0"
        style={{
          background: "var(--surface-1)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span
          className="text-sm font-medium flex-1 truncate"
          style={{ color: "var(--text)" }}
          title={filename}
        >
          {filename}
        </span>

        <div className="flex items-center gap-1 shrink-0">
          {blobUrl && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors hover:bg-white/10"
              style={{ color: "var(--muted)" }}
              title="Download PDF"
            >
              <Download size={13} />
              Download
            </button>
          )}
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors hover:bg-white/10"
              style={{ color: "var(--muted)" }}
              title="Open source page"
            >
              <ExternalLink size={13} />
              Source
            </a>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10"
            style={{ color: "var(--muted)" }}
            title="Close (Esc)"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* PDF content */}
      <div className="flex-1 flex items-center justify-center overflow-hidden min-h-0">
        {loading && (
          <div className="flex flex-col items-center gap-3" style={{ color: "var(--muted)" }}>
            <Loader2 size={28} className="animate-spin" />
            <p className="text-sm">Loading PDF…</p>
          </div>
        )}
        {error && (
          <div
            className="flex flex-col items-center gap-3 p-8 text-center max-w-sm"
            style={{ color: "var(--error, #f87171)" }}
          >
            <AlertCircle size={28} />
            <p className="text-sm font-medium">Could not load PDF</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>{error}</p>
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline underline-offset-2"
                style={{ color: "var(--primary)" }}
              >
                Open source page instead
              </a>
            )}
          </div>
        )}
        {blobUrl && (
          <embed
            src={blobUrl}
            type="application/pdf"
            className="w-full h-full"
            style={{ display: "block", minHeight: 0 }}
          />
        )}
      </div>
    </div>
  );
}
