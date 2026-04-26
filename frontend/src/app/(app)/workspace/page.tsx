"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  FolderOpen, ChevronRight, CheckCircle2, AlertCircle, Loader,
  Circle, GitBranch, Clock, Zap, Loader2, Trash2,
} from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { useProjectStore } from "@/stores/project-store";
import { useAgentStore } from "@/stores/agent-store";
import { useWorkflowStore } from "@/stores/workflow-store";
import { NewProjectFlow } from "@/components/workspace/NewProjectFlow";
import { WorkflowPipeline } from "@/components/dashboard/WorkflowPipeline";
import { WorkflowRefinementChat } from "@/components/workspace/WorkflowRefinementChat";
import { LiteratureProgressPanel } from "@/components/workspace/LiteratureProgressPanel";
import { formatRelative } from "@/lib/utils";
import type { ProjectDetail, ProjectWorkflowItem } from "@/types/project";

const WF_STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  COMPLETED: { icon: <CheckCircle2 size={12} />, color: "#22c55e", label: "Completed" },
  RUNNING: { icon: <Loader size={12} className="animate-spin" />, color: "#6366f1", label: "Running…" },
  FAILED: { icon: <AlertCircle size={12} />, color: "#ef4444", label: "Failed" },
  PENDING: { icon: <Circle size={12} />, color: "#f59e0b", label: "Pending" },
};

function WorkflowSidebarItem({
  wf,
  index,
  isSelected,
  onClick,
}: {
  wf: ProjectWorkflowItem;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const cfg = WF_STATUS_CONFIG[wf.status] ?? WF_STATUS_CONFIG.PENDING;

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2.5 transition-all duration-150 group"
      style={{
        background: isSelected ? "rgba(99,102,241,0.1)" : "transparent",
        border: `1px solid ${isSelected ? "rgba(99,102,241,0.3)" : "transparent"}`,
      }}
    >
      <div
        className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-mono font-bold shrink-0"
        style={{
          background: isSelected ? "rgba(99,102,241,0.25)" : "var(--surface-3)",
          color: isSelected ? "#818cf8" : "var(--muted)",
        }}
      >
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium truncate leading-snug" style={{ color: isSelected ? "var(--text)" : "var(--text-dim)" }}>
          {wf.goal_title}
        </p>
        <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>
          {formatRelative(wf.created_at)}
        </p>
      </div>
      <span style={{ color: cfg.color }} className="shrink-0">{cfg.icon}</span>
    </button>
  );
}

function ProjectWorkspaceView({ projectId }: { projectId: string }) {
  const {
    projects, loadProjectDetail, deleteProject, invalidateDetail,
    setSelectedProject,
  } = useProjectStore();
  const { logs, setActiveRunId, setStreaming } = useAgentStore();
  const { addWorkflow, setSelectedWorkflow } = useWorkflowStore();
  const workflowCount = useWorkflowStore((s) => s.workflows.length);
  const globallySelectedWfId = useWorkflowStore((s) => s.selectedWorkflowId);
  const router = useRouter();

  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [selectedWfId, setSelectedWfId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const project = projects.find((p) => p.id === projectId);

  const selectWorkflowFromDetail = (d: ProjectDetail, preferredId?: string | null) => {
    const preferred = preferredId ? d.workflows.find((w) => w.id === preferredId) : null;
    const current = selectedWfId ? d.workflows.find((w) => w.id === selectedWfId) : null;
    const running = d.workflows.find((w) => w.status === "RUNNING");
    const toSelect = preferred ?? current ?? running ?? d.workflows[0];
    if (toSelect) {
      setSelectedWfId(toSelect.id);
      setSelectedWorkflow(toSelect.id);
      if (toSelect.status === "RUNNING") {
        setActiveRunId(toSelect.id);
        setStreaming(true);
      }
    }
  };

  const refreshDetail = (preferredId?: string | null) => {
    invalidateDetail(projectId);
    loadProjectDetail(projectId).then((d) => {
      setDetail(d);
      selectWorkflowFromDetail(d, preferredId);
    });
  };

  useEffect(() => {
    setIsLoading(true);
    loadProjectDetail(projectId)
      .then((d) => {
        setDetail(d);
        selectWorkflowFromDetail(d, globallySelectedWfId);
      })
      .finally(() => setIsLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (!projectId || isLoading) return;
    refreshDetail(globallySelectedWfId);
  }, [workflowCount]);

  useEffect(() => {
    if (!globallySelectedWfId || !detail) return;
    const exists = detail.workflows.some((w) => w.id === globallySelectedWfId);
    if (exists) {
      setSelectedWfId(globallySelectedWfId);
    } else {
      refreshDetail(globallySelectedWfId);
    }
  }, [globallySelectedWfId]);

  const selectedWf = detail?.workflows.find((w) => w.id === selectedWfId);

  const handleWorkflowStarted = (runId: string, goalTitle?: string) => {
    setSelectedWfId(runId);
    // Also register in WorkflowStore so CodeViewer gets analyst output from WebSocket
    addWorkflow({
      id: runId,
      goalId: "",
      goalTitle: goalTitle ?? project?.title ?? "Project Workflow",
      status: "RUNNING",
      agentAssigned: "ORCHESTRATOR",
      progress: 0,
      startedAt: new Date().toISOString(),
      cognitiveWeight: 5,
    });
    setSelectedWorkflow(runId);
    refreshDetail();
  };

  const handleDeleteProject = async () => {
    if (!confirm(`Really delete project "${project?.title}"?`)) return;
    setIsDeleting(true);
    await deleteProject(projectId);
    setSelectedProject(null);
    router.replace("/workspace");
  };

  if (isLoading || !project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--primary)" }} />
      </div>
    );
  }

  const sortedWorkflows = detail?.workflows ?? [];

  return (
    <div className="flex-1 overflow-hidden flex">
      {/* Left sidebar: workflow list */}
      <div
        className="w-52 shrink-0 flex flex-col overflow-hidden"
        style={{ borderRight: "1px solid var(--border)" }}
      >
        {/* Project header */}
        <div className="p-3 shrink-0 flex flex-col gap-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-start justify-between gap-1">
            <p className="text-xs font-bold leading-snug line-clamp-2" style={{ color: "var(--text)" }}>
              {project.title}
            </p>
            <button
              onClick={handleDeleteProject}
              disabled={isDeleting}
              className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:text-red-400 shrink-0 mt-0.5"
              style={{ color: "var(--muted)" }}
            >
              {isDeleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
            </button>
          </div>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold w-fit"
            style={{
              background: project.status === "ACTIVE" ? "rgba(34,197,94,0.12)" : "var(--surface-3)",
              color: project.status === "ACTIVE" ? "#22c55e" : "var(--muted)",
            }}
          >
            {project.status === "ACTIVE" ? "Active" : "Archived"}
          </span>
        </div>

        {/* Workflow list */}
        <div className="px-1.5 py-1 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <p className="text-[9px] font-semibold uppercase tracking-widest px-2 py-1" style={{ color: "var(--muted)" }}>
            Workflow History
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-0.5">
          {sortedWorkflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center px-2 gap-2">
              <GitBranch size={16} style={{ color: "var(--border)" }} />
              <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>No workflows yet</p>
            </div>
          ) : (
            sortedWorkflows.map((wf, i) => (
              <WorkflowSidebarItem
                key={wf.id}
                wf={wf}
                index={sortedWorkflows.length - 1 - i}
                isSelected={wf.id === selectedWfId}
                onClick={() => {
                  setSelectedWfId(wf.id);
                  setSelectedWorkflow(wf.id);
                  if (wf.status === "RUNNING") {
                    setActiveRunId(wf.id);
                    setStreaming(true);
                  }
                }}
              />
            ))
          )}
        </div>

        {/* Footer: back to all projects */}
        <div className="p-1.5 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
          <button
            onClick={() => {
              setSelectedProject(null);
              router.replace("/workspace");
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] transition-colors hover:bg-[var(--surface-2)]"
            style={{ color: "var(--text-faint)" }}
          >
            <ChevronRight size={12} className="rotate-180" />
            All Projects
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
        <AnimatePresence mode="wait">
          {selectedWf ? (
            <motion.div
              key={selectedWf.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col gap-5"
            >
              {/* Workflow header */}
              <div
                className="rounded-2xl p-4 flex items-start justify-between gap-3"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm leading-snug" style={{ color: "var(--text)" }}>
                    {selectedWf.goal_title}
                  </h3>
                  {selectedWf.goal_description && selectedWf.goal_description !== selectedWf.goal_title && (
                    <p className="text-xs mt-0.5 line-clamp-3 leading-relaxed" style={{ color: "var(--text-dim)" }}>
                      {selectedWf.goal_description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                      <Clock size={11} />
                      Started {formatRelative(selectedWf.created_at)}
                    </span>
                    {selectedWf.completed_at && (
                      <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                        · Done {formatRelative(selectedWf.completed_at)}
                      </span>
                    )}
                  </div>
                </div>
                {(() => {
                  const cfg = WF_STATUS_CONFIG[selectedWf.status] ?? WF_STATUS_CONFIG.PENDING;
                  return (
                    <span
                      className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0"
                      style={{ background: `${cfg.color}18`, color: cfg.color }}
                    >
                      {cfg.icon}
                      {cfg.label}
                    </span>
                  );
                })()}
              </div>

              {/* Agent Pipeline */}
              <div
                className="rounded-2xl p-5"
                style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Zap size={14} className="text-indigo-400" />
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                    Agent Pipeline
                  </h3>
                  {selectedWf.status === "RUNNING" && (
                    <motion.span
                      className="text-[10px] px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8" }}
                      animate={{ opacity: [1, 0.5, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      Live
                    </motion.span>
                  )}
                </div>
                <WorkflowPipeline runId={selectedWf.id} workflowStatus={selectedWf.status} />
              </div>

              {/* Live literature search progress */}
              <div className="min-h-[420px]">
                <LiteratureProgressPanel runId={selectedWf.id} />
              </div>

              {/* Agent log feed for this workflow */}
              <WorkflowLogFeed runId={selectedWf.id} />

              {/* Refinement chat */}
              <WorkflowRefinementChat
                projectId={projectId}
                workflowRunId={selectedWfId}
                goalTitle={selectedWf?.goal_title}
                onWorkflowStarted={handleWorkflowStarted}
              />
            </motion.div>
          ) : (
            <motion.div
              key="no-workflow"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 gap-4"
            >
              <GitBranch size={36} style={{ color: "var(--border)" }} />
              <p className="text-sm" style={{ color: "var(--text-faint)" }}>
                Select a workflow or start a new one below
              </p>
              <WorkflowRefinementChat projectId={projectId} onWorkflowStarted={handleWorkflowStarted} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function WorkflowLogFeed({ runId }: { runId: string }) {
  const { logs } = useAgentStore();
  const runLogs = logs.filter((l) => l.runId === runId);

  if (runLogs.length === 0) return null;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
    >
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
        <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>Agent Logs</span>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full"
          style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}
        >
          {runLogs.length}
        </span>
      </div>
      <div className="divide-y divide-[color:var(--border)] max-h-64 overflow-y-auto">
        {runLogs.map((log) => (
          <div key={log.id} className="flex items-start gap-3 px-4 py-2.5">
            <div
              className="w-0.5 self-stretch rounded-full shrink-0"
              style={{
                background:
                  log.agentType === "ORCHESTRATOR" ? "#8b5cf6"
                  : log.agentType === "SCHEDULER" ? "#6366f1"
                  : log.agentType === "ANALYST" ? "#0ea5e9"
                  : "#22c55e",
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className="text-[10px] font-mono font-bold"
                  style={{
                    color: log.agentType === "ORCHESTRATOR" ? "#8b5cf6"
                    : log.agentType === "SCHEDULER" ? "#6366f1"
                    : log.agentType === "ANALYST" ? "#0ea5e9"
                    : "#22c55e",
                  }}
                >
                  {log.agentType.toLowerCase()}
                </span>
                <span
                  className="text-[9px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded"
                  style={{ background: "var(--surface-2)", color: "var(--muted)" }}
                >
                  {log.action}
                </span>
                {log.durationMs && (
                  <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                    {log.durationMs}ms
                  </span>
                )}
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
                {log.message}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    projects, loadProjects, selectedProjectId, setSelectedProject, isLoading,
  } = useProjectStore();

  const urlProjectId = searchParams.get("project");

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (urlProjectId) {
      setSelectedProject(urlProjectId);
    }
  }, [urlProjectId]);

  const activeProjectId = urlProjectId ?? selectedProjectId;

  const handleProjectCreated = (projectId: string, runId: string) => {
    setSelectedProject(projectId);
    router.replace(`/workspace?project=${projectId}`);
  };

  const handleSelectProject = (id: string) => {
    setSelectedProject(id);
    router.push(`/workspace?project=${id}`);
  };

  // Show project workspace if a project is selected
  if (activeProjectId && projects.some((p) => p.id === activeProjectId)) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <Topbar
          title="Workspace"
          subtitle={projects.find((p) => p.id === activeProjectId)?.title ?? "Project"}
          action={
            <button
              onClick={() => {
                setSelectedProject(null);
                router.replace("/workspace");
              }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: "var(--surface-2)", color: "var(--text-dim)", border: "1px solid var(--border)" }}
            >
              <FolderOpen size={12} />
              All Projects
            </button>
          }
        />
        <ProjectWorkspaceView key={activeProjectId} projectId={activeProjectId} />
      </div>
    );
  }

  // Landing: show new project creation + recent projects
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Workspace" subtitle="Create projects and manage workflows" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-10 flex flex-col gap-10">
          {/* New project creation flow */}
          <NewProjectFlow onCreated={handleProjectCreated} />

          {/* Recent projects */}
          {projects.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <FolderOpen size={15} style={{ color: "var(--text-dim)" }} />
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-dim)" }}>
                  Recent Projects
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {projects.slice(0, 6).map((project) => (
                  <motion.button
                    key={project.id}
                    onClick={() => handleSelectProject(project.id)}
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    className="text-left p-4 rounded-xl flex items-center gap-3 transition-all"
                    style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "var(--surface-2)" }}
                    >
                      <FolderOpen size={15} style={{ color: "var(--text-dim)" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>
                        {project.title}
                      </p>
                      <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                        {project.workflow_count} Workflows · {project.last_run_at ? formatRelative(project.last_run_at) : "No runs yet"}
                      </p>
                    </div>
                    <ChevronRight size={14} style={{ color: "var(--border)" }} />
                  </motion.button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--primary)" }} />
      </div>
    }>
      <WorkspaceContent />
    </Suspense>
  );
}
