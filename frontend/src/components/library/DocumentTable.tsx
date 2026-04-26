"use client";

import { Fragment, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  ChevronDown,
  Trash2,
  ExternalLink,
  Eye,
  FolderPlus,
  FolderMinus,
  FolderOpen,
  Check,
  X,
} from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import { useProjectStore } from "@/stores/project-store";
import { useUIStore } from "@/stores/ui-store";
import { api } from "@/lib/api-client";
import { formatDate, fileTypeIcon } from "@/lib/utils";
import type { EmbeddingStatus } from "@/lib/constants";
import { PDFViewerModal } from "./PDFViewerModal";

const STATUS_META: Record<EmbeddingStatus, { label: string; icon: React.ReactNode; class: string }> = {
  INDEXED: { label: "Indexed", icon: <CheckCircle2 size={12} />, class: "badge-approved" },
  PENDING: { label: "Pending", icon: <Clock size={12} />, class: "badge-unverified" },
  INDEXING: { label: "Indexing", icon: <Loader2 size={12} className="animate-spin" />, class: "badge-unverified" },
  FAILED: { label: "Failed", icon: <AlertCircle size={12} />, class: "badge-rejected" },
};

const SOURCE_BADGE: Record<string, string> = {
  arxiv: "arXiv",
  semantic_scholar: "S2",
  pubmed: "PubMed",
  upload: "Upload",
};

interface ViewingPdf {
  id: string;
  filename: string;
  sourceUrl?: string | null;
}

interface ProjectPickerProps {
  docId: string;
  currentProjectId: string | null | undefined;
  onClose: () => void;
}

function ProjectPicker({ docId, currentProjectId, onClose }: ProjectPickerProps) {
  const { projects } = useProjectStore();
  const { assignToProject } = useDocumentStore();
  const addToast = useUIStore((s) => s.addToast);
  const [assigning, setAssigning] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handleAssign = async (projectId: string | null) => {
    setAssigning(projectId ?? "__none__");
    try {
      await assignToProject(docId, projectId);
      addToast({
        type: "success",
        message: projectId
          ? `Assigned to "${projects.find((p) => p.id === projectId)?.title ?? "project"}"`
          : "Removed from project",
      });
      onClose();
    } catch {
      addToast({ type: "error", message: "Failed to update project" });
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div
      ref={ref}
      className="absolute right-0 top-8 z-50 rounded-xl shadow-lg overflow-hidden min-w-[220px]"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
    >
      <div className="px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Assign to Project
        </p>
      </div>
      <div className="flex flex-col max-h-52 overflow-y-auto py-1">
        {projects.map((project) => {
          const isActive = project.id === currentProjectId;
          const isLoading = assigning === project.id;
          return (
            <button
              key={project.id}
              onClick={() => handleAssign(isActive ? null : project.id)}
              className="flex items-center gap-2 px-3 py-2 text-[11px] text-left transition-colors hover:bg-white/5"
              style={{ color: isActive ? "#818cf8" : "var(--text-dim)" }}
            >
              {isLoading ? (
                <Loader2 size={12} className="animate-spin text-indigo-400 shrink-0" />
              ) : isActive ? (
                <Check size={12} className="text-indigo-400 shrink-0" />
              ) : (
                <FolderOpen size={12} className="shrink-0" style={{ color: "var(--muted)" }} />
              )}
              <span className="truncate">{project.title}</span>
            </button>
          );
        })}
        {currentProjectId && (
          <>
            <div className="border-t my-1" style={{ borderColor: "var(--border)" }} />
            <button
              onClick={() => handleAssign(null)}
              className="flex items-center gap-2 px-3 py-2 text-[11px] text-left transition-colors hover:bg-red-500/10"
              style={{ color: "var(--text-faint)" }}
            >
              {assigning === "__none__" ? (
                <Loader2 size={12} className="animate-spin shrink-0" />
              ) : (
                <FolderMinus size={12} className="shrink-0 text-red-400" />
              )}
              Remove from project
            </button>
          </>
        )}
        {projects.length === 0 && (
          <p className="px-3 py-4 text-[11px] text-center" style={{ color: "var(--text-faint)" }}>
            No projects yet
          </p>
        )}
      </div>
    </div>
  );
}

interface DocumentTableProps {
  selectedProjectId?: string | null;
}

export function DocumentTable({ selectedProjectId }: DocumentTableProps) {
  const { searchQuery, setSearchQuery, filteredDocuments, removeDocument, removeDocuments } = useDocumentStore();
  const addToast = useUIStore((s) => s.addToast);
  const docs = filteredDocuments();
  const [expandedSummary, setExpandedSummary] = useState<string | null>(null);
  const [viewingPdf, setViewingPdf] = useState<ViewingPdf | null>(null);
  const [openPickerDocId, setOpenPickerDocId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const selectionAction = useRef<"select" | "deselect">("select");
  const selectedCount = selectedIds.size;

  useEffect(() => {
    const handleMouseUp = () => setIsDragSelecting(false);
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  useEffect(() => {
    const visibleIds = new Set(docs.map((doc) => doc.id));
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [docs]);

  const updateSelection = (id: string, action: "select" | "deselect") => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (action === "select") {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const isSelectionTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return true;
    return !target.closest("button,a,input,textarea,select,[data-skip-row-select='true']");
  };

  const handleRowMouseDown = (id: string, event: React.MouseEvent<HTMLTableRowElement>) => {
    if (event.button !== 0 || !isSelectionTarget(event.target)) return;
    event.preventDefault();
    const action = selectedIds.has(id) ? "deselect" : "select";
    selectionAction.current = action;
    setIsDragSelecting(true);
    updateSelection(id, action);
  };

  const handleRowMouseEnter = (id: string) => {
    if (!isDragSelecting) return;
    updateSelection(id, selectionAction.current);
  };

  const handleDelete = async (id: string, filename: string) => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await api.delete(`/documents/${id}`);
      removeDocument(id);
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    } catch {
      addToast({ type: "error", message: `Failed to delete "${filename}"` });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || isDeleting) return;
    setIsDeleting(true);
    try {
      await api.post("/documents/bulk-delete", { document_ids: ids });
      removeDocuments(ids);
      setSelectedIds(new Set());
      setExpandedSummary((current) => (current && ids.includes(current) ? null : current));
    } catch {
      addToast({ type: "error", message: "Failed to delete selected documents" });
    } finally {
      setIsDeleting(false);
    }
  };

  const openPdfInNewTab = async (id: string, filename: string) => {
    try {
      const blob = await api.fetchBlob(`/documents/${id}/file`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      addToast({ type: "error", message: "Failed to open file" });
    }
  };

  return (
    <>
      {viewingPdf && (
        <PDFViewerModal
          docId={viewingPdf.id}
          filename={viewingPdf.filename}
          sourceUrl={viewingPdf.sourceUrl}
          onClose={() => setViewingPdf(null)}
        />
      )}

      <div
        className="glass flex flex-col h-full overflow-hidden"
        style={{ userSelect: isDragSelecting ? "none" : undefined }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <span className="text-sm font-semibold flex-1" style={{ color: "var(--text)" }}>
            {selectedProjectId ? "Project Documents" : "All Documents"}
          </span>
          {selectedCount > 0 && (
            <div
              className="flex items-center gap-2 rounded-lg px-2 py-1"
              style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              <span className="text-[11px] tabular-nums" style={{ color: "var(--text-dim)" }}>
                {selectedCount} selected
              </span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10 transition-colors"
                style={{ color: "var(--muted)" }}
                title="Clear selection"
                disabled={isDeleting}
              >
                <X size={11} />
              </button>
              <button
                onClick={handleDeleteSelected}
                className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-500/15 hover:text-red-400 transition-colors disabled:opacity-50"
                style={{ color: "#f87171" }}
                title="Delete selected"
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              </button>
            </div>
          )}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents…"
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg outline-none transition-all"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                width: 200,
              }}
              onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
              onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
            />
          </div>
          <span
            className="text-xs px-2 py-0.5 rounded-badge"
            style={{ background: "var(--surface-3)", color: "var(--text-dim)" }}
          >
            {docs.length} files
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ color: "var(--text-faint)" }}>
              <FileText size={32} />
              <p className="text-sm">
                {selectedProjectId ? "No documents in this project" : "No documents yet"}
              </p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {selectedProjectId
                  ? "Assign documents to this project using the folder button"
                  : "Upload a file or search for literature above"}
              </p>
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Document", "Source", "Project", "Chunks", "Status", "Added", ""].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2 text-left font-semibold uppercase tracking-wider text-[10px]"
                      style={{ color: "var(--muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map((doc, i) => {
                  const meta = STATUS_META[doc.embeddingStatus];
                  const isExpanded = expandedSummary === doc.id;
                  const isSelected = selectedIds.has(doc.id);
                  return (
                    <Fragment key={doc.id}>
                      <motion.tr
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        onMouseDown={(event) => handleRowMouseDown(doc.id, event)}
                        onMouseEnter={() => handleRowMouseEnter(doc.id)}
                        className="border-b hover:bg-white/[0.02] transition-colors cursor-default"
                        style={{
                          borderColor: "var(--border)",
                          background: isSelected ? "rgba(99,102,241,0.14)" : undefined,
                        }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 transition-colors"
                              style={{
                                background: isSelected ? "#818cf8" : "transparent",
                                borderColor: isSelected ? "#818cf8" : "var(--border)",
                              }}
                              aria-hidden
                            >
                              {isSelected && <Check size={9} className="text-white" />}
                            </span>
                            <span className="text-base leading-none">{fileTypeIcon(doc.fileType)}</span>
                            <div className="min-w-0">
                              <p className="font-medium truncate max-w-[200px]" style={{ color: "var(--text)" }}>
                                {doc.filename}
                              </p>
                              {doc.summary && (
                                <button
                                  onClick={() => setExpandedSummary(isExpanded ? null : doc.id)}
                                  className="flex items-center gap-0.5 text-[10px] mt-0.5 hover:opacity-80 transition-opacity"
                                  style={{ color: "var(--primary)" }}
                                >
                                  Summary
                                  <ChevronDown
                                    size={10}
                                    style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
                                  />
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="font-mono px-1.5 py-0.5 rounded text-[10px]"
                            style={{ background: "var(--surface-3)", color: "var(--text-dim)" }}
                          >
                            {SOURCE_BADGE[doc.sourceType ?? ""] ?? doc.fileType}
                          </span>
                        </td>
                        {/* Project column */}
                        <td className="px-4 py-3">
                          <ProjectCell
                            docId={doc.id}
                            projectId={doc.projectId}
                            isPickerOpen={openPickerDocId === doc.id}
                            onOpenPicker={() => setOpenPickerDocId(doc.id)}
                            onClosePicker={() => setOpenPickerDocId(null)}
                          />
                        </td>
                        <td className="px-4 py-3 tabular-nums" style={{ color: "var(--text-dim)" }}>
                          {doc.chunkCount > 0 ? doc.chunkCount.toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={meta.class + " flex items-center gap-1 w-fit"}>
                            {meta.icon}
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ color: "var(--text-dim)" }}>
                          {formatDate(doc.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {doc.fileType === "PDF" && (
                              <button
                                onClick={() => setViewingPdf({ id: doc.id, filename: doc.filename, sourceUrl: doc.sourceUrl })}
                                className="w-6 h-6 rounded flex items-center justify-center hover:bg-indigo-500/15 hover:text-indigo-400 transition-colors"
                                style={{ color: "var(--muted)" }}
                                title="View PDF"
                              >
                                <Eye size={11} />
                              </button>
                            )}
                            <button
                              onClick={() => openPdfInNewTab(doc.id, doc.filename)}
                              className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10 transition-colors"
                              style={{ color: "var(--muted)" }}
                              title="Download file"
                            >
                              <FileText size={11} />
                            </button>
                            {doc.sourceUrl && (
                              <a
                                href={doc.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10 transition-colors"
                                style={{ color: "var(--muted)" }}
                                title="Open source"
                              >
                                <ExternalLink size={11} />
                              </a>
                            )}
                            <button
                              onClick={() => handleDelete(doc.id, doc.filename)}
                              className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-500/15 hover:text-red-400 transition-colors"
                              style={{ color: "var(--muted)" }}
                              title="Delete"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                      <AnimatePresence>
                        {isExpanded && doc.summary && (
                          <motion.tr
                            key={`${doc.id}-summary`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{ borderBottom: `1px solid var(--border)` }}
                          >
                            <td colSpan={7} className="px-8 pb-3 pt-1">
                              <p
                                className="text-[11px] leading-relaxed rounded-lg p-2"
                                style={{
                                  color: "var(--text-dim)",
                                  background: "var(--surface-2)",
                                  border: "1px solid var(--border)",
                                }}
                              >
                                {doc.summary}
                              </p>
                            </td>
                          </motion.tr>
                        )}
                      </AnimatePresence>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

interface ProjectCellProps {
  docId: string;
  projectId: string | null | undefined;
  isPickerOpen: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
}

function ProjectCell({ docId, projectId, isPickerOpen, onOpenPicker, onClosePicker }: ProjectCellProps) {
  const { projects } = useProjectStore();
  const project = projectId ? projects.find((p) => p.id === projectId) : null;

  return (
    <div className="relative">
      <button
        onClick={onOpenPicker}
        className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg transition-all hover:border-indigo-500/30 max-w-[120px]"
        style={{
          background: project ? "rgba(99,102,241,0.08)" : "var(--surface-2)",
          border: `1px solid ${project ? "rgba(99,102,241,0.2)" : "var(--border)"}`,
          color: project ? "#818cf8" : "var(--text-faint)",
        }}
        title={project ? `Assigned to: ${project.title}` : "Assign to project"}
      >
        {project ? (
          <>
            <FolderOpen size={10} className="shrink-0" />
            <span className="truncate">{project.title.length > 12 ? project.title.slice(0, 11) + "…" : project.title}</span>
          </>
        ) : (
          <>
            <FolderPlus size={10} className="shrink-0" />
            <span>Assign</span>
          </>
        )}
      </button>
      <AnimatePresence>
        {isPickerOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.1 }}
          >
            <ProjectPicker
              docId={docId}
              currentProjectId={projectId}
              onClose={onClosePicker}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
