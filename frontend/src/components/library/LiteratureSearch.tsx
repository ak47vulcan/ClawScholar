"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Download, ExternalLink, BookOpen, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/shared/Button";
import { Badge } from "@/components/shared/Badge";
import { api } from "@/lib/api-client";
import { useDocumentStore } from "@/stores/document-store";
import { useUIStore } from "@/stores/ui-store";

interface SearchResult {
  title: string;
  authors: string[];
  abstract: string;
  url: string;
  pdf_url?: string | null;
  source: string;
  year?: number | null;
  doi?: string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  arxiv: "arXiv",
  semantic_scholar: "Semantic Scholar",
  pubmed: "PubMed",
};

const SOURCE_COLORS: Record<string, "info" | "success" | "warning"> = {
  arxiv: "info",
  semantic_scholar: "success",
  pubmed: "warning",
};

interface LiteratureSearchProps {
  projectId?: string | null;
}

export function LiteratureSearch({ projectId }: LiteratureSearchProps = {}) {
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<string[]>(["arxiv", "semantic_scholar"]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savedUrls] = useState(() => new Set<string>());
  const [savedSummaries, setSavedSummaries] = useState<Map<string, string>>(new Map());
  const [, forceUpdate] = useState(0);

  const { addDocument, loadDocuments } = useDocumentStore();
  const addToast = useUIStore((s) => s.addToast);

  const toggleSource = (s: string) =>
    setSources((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const handleSearch = async () => {
    if (!query.trim() || searching) return;
    setSearching(true);
    setResults([]);
    try {
      const data = await api.post<SearchResult[]>("/documents/search", {
        query: query.trim(),
        sources,
        max_per_source: 15,
        goal: query.trim(),
      });
      setResults(data);
      if (data.length === 0) {
        addToast({ type: "info", message: "No results found. Try a different query." });
      }
    } catch (err: unknown) {
      addToast({ type: "error", message: err instanceof Error ? err.message : "Search failed" });
    } finally {
      setSearching(false);
    }
  };

  const handleDownload = async (result: SearchResult) => {
    if (!result.pdf_url) return;
    const url = result.pdf_url;
    setDownloading(url);
    try {
      interface DocRes {
        id: string;
        filename: string;
        file_type: string;
        embedding_status: string;
        chunk_count: number;
        created_at: string;
        summary?: string | null;
        source_url?: string | null;
        source_type?: string | null;
      }
      const doc = await api.post<DocRes>("/documents/download", {
        url,
        source_type: result.source,
        title: result.title,
        ...(projectId ? { project_id: projectId } : {}),
      });
      addDocument({
        id: doc.id,
        filename: doc.filename,
        fileType: doc.file_type,
        embeddingStatus: doc.embedding_status as "PENDING",
        chunkCount: doc.chunk_count,
        createdAt: doc.created_at,
        sourceUrl: doc.source_url,
        sourceType: doc.source_type,
        summary: doc.summary,
      });

      savedUrls.add(url);
      if (doc.summary) {
        setSavedSummaries((prev) => new Map(prev).set(url, doc.summary!));
      }
      forceUpdate((n) => n + 1);

      loadDocuments().catch(() => null);
      addToast({ type: "success", message: `"${result.title.slice(0, 60)}" saved to library.` });
    } catch (err: unknown) {
      addToast({ type: "error", message: err instanceof Error ? err.message : "Download failed" });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Search bar */}
      <div className="glass p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <BookOpen size={15} className="text-indigo-400" />
          <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            Literature Search
          </h3>
        </div>

        {/* Source toggles */}
        <div className="flex gap-2 flex-wrap">
          {["arxiv", "semantic_scholar", "pubmed"].map((s) => (
            <button
              key={s}
              onClick={() => toggleSource(s)}
              className="text-[11px] px-3 py-1 rounded-full transition-all"
              style={{
                background: sources.includes(s) ? "rgba(99,102,241,0.15)" : "var(--surface-3)",
                color: sources.includes(s) ? "var(--primary)" : "var(--muted)",
                border: `1px solid ${sources.includes(s) ? "rgba(99,102,241,0.3)" : "transparent"}`,
              }}
            >
              {SOURCE_LABELS[s]}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="e.g. electric vehicle battery management deep learning"
            className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--primary)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
          />
          <Button
            variant="primary"
            size="sm"
            icon={searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            loading={searching}
            disabled={!query.trim() || sources.length === 0}
            onClick={handleSearch}
          >
            Search
          </Button>
        </div>
      </div>

      {/* Results */}
      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col gap-2"
          >
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {results.length} results
            </p>
            {results.map((r, i) => {
              const key = r.pdf_url ?? r.url;
              const cardKey = r.url + i;
              const isExpanded = expanded === cardKey;
              const isSaved = savedUrls.has(key);
              const summary = savedSummaries.get(key);

              return (
                <motion.div
                  key={cardKey}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="glass-flat rounded-xl overflow-hidden"
                >
                  <div className="p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant={SOURCE_COLORS[r.source] ?? "muted"}>{SOURCE_LABELS[r.source] ?? r.source}</Badge>
                        {r.year && <span className="text-[10px]" style={{ color: "var(--muted)" }}>{r.year}</span>}
                        {isSaved && (
                          <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--success)" }}>
                            <CheckCircle2 size={10} /> Saved
                          </span>
                        )}
                      </div>
                      <button onClick={() => setExpanded(isExpanded ? null : cardKey)} className="text-left">
                        <p className="text-xs font-semibold leading-snug" style={{ color: "var(--text)" }}>
                          {r.title}
                        </p>
                      </button>
                      {r.authors.length > 0 && (
                        <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--text-dim)" }}>
                          {r.authors.slice(0, 4).join(", ")}
                          {r.authors.length > 4 ? ` +${r.authors.length - 4}` : ""}
                        </p>
                      )}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.p
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="text-[11px] mt-2 leading-relaxed overflow-hidden"
                            style={{ color: "var(--text-dim)" }}
                          >
                            {r.abstract}
                          </motion.p>
                        )}
                      </AnimatePresence>

                      {/* AI Summary reveal after save */}
                      <AnimatePresence>
                        {summary && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="mt-2 overflow-hidden"
                          >
                            <div
                              className="p-2.5 rounded-lg"
                              style={{
                                background: "rgba(34,197,94,0.08)",
                                border: "1px solid rgba(34,197,94,0.2)",
                              }}
                            >
                              <div className="flex items-center gap-1 mb-1.5">
                                <Sparkles size={10} className="text-green-400" />
                                <span className="text-[9px] font-semibold uppercase tracking-wider text-green-400">
                                  AI Summary
                                </span>
                              </div>
                              <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-dim)" }}>
                                {summary}
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-1 shrink-0">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                        style={{ color: "var(--muted)" }}
                        title="Open landing page"
                      >
                        <ExternalLink size={12} />
                      </a>
                      {/* Only show download button when a direct PDF URL is available */}
                      {r.pdf_url ? (
                        <button
                          onClick={() => !isSaved && handleDownload(r)}
                          disabled={!!downloading || isSaved}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-indigo-500/10 disabled:cursor-default"
                          style={{ color: isSaved ? "var(--success)" : "var(--primary)" }}
                          title={isSaved ? "Already saved" : "Download PDF & save to library"}
                        >
                          {downloading === key ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : isSaved ? (
                            <CheckCircle2 size={12} />
                          ) : (
                            <Download size={12} />
                          )}
                        </button>
                      ) : (
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center opacity-30 cursor-not-allowed"
                          style={{ color: "var(--muted)" }}
                          title="No open-access PDF available"
                        >
                          <Download size={12} />
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
