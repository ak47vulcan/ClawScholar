"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Search, Loader2, LayoutGrid, Zap, CheckCircle2, FileText, FolderOpen, ArrowRight,
} from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { AgentLogFeed } from "@/components/dashboard/AgentLogFeed";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { ProjectDetailPanel } from "@/components/dashboard/ProjectDetailPanel";
import { useProjectStore } from "@/stores/project-store";
import { useWorkflowStore } from "@/stores/workflow-store";
import { useDocumentStore } from "@/stores/document-store";
import { useRouter } from "next/navigation";

function StatsCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass p-4 flex items-center gap-4 rounded-xl"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}20`, color }}
      >
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold" style={{ color: "var(--text)" }}>{value}</p>
        <p className="text-[11px]" style={{ color: "var(--text-dim)" }}>{label}</p>
        {sub && <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>{sub}</p>}
      </div>
    </motion.div>
  );
}

export default function DashboardPage() {
  const { projects, selectedProjectId, loadProjects, setSelectedProject, isLoading } = useProjectStore();
  const { workflows } = useWorkflowStore();
  const { documents } = useDocumentStore();
  const router = useRouter();

  const [search, setSearch] = useState("");

  useEffect(() => {
    loadProjects();
  }, []);

  const filtered = projects.filter((p) =>
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    (p.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const activeWorkflows = workflows.filter((w) => w.status === "RUNNING").length;
  const completedWorkflows = workflows.filter((w) => w.status === "COMPLETED").length;

  return (
    <div className="flex flex-col h-full overflow-hidden page-mesh">
      <Topbar
        title="Dashboard"
        subtitle="Projects and agent workflows at a glance"
        action={
          <button
            onClick={() => router.push("/workspace")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              color: "white",
              boxShadow: "0 2px 8px rgba(99,102,241,0.3)",
            }}
          >
            <Zap size={13} />
            New Project
          </button>
        }
      />

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Stats row */}
        <div className="px-6 pt-5 pb-3 grid grid-cols-2 xl:grid-cols-4 gap-3 shrink-0">
          <StatsCard icon={<FolderOpen size={18} />} label="Projects" value={projects.length} sub="active research goals" color="#6366f1" />
          <StatsCard icon={<Zap size={18} />} label="Active Workflows" value={activeWorkflows} sub="currently running" color="#8b5cf6" />
          <StatsCard icon={<CheckCircle2 size={18} />} label="Completed" value={completedWorkflows} sub="validated results" color="#22c55e" />
          <StatsCard icon={<FileText size={18} />} label="Documents" value={documents.length} sub="indexed papers" color="#f59e0b" />
        </div>

        {/* Main content: project list + detail panel */}
        <div className="flex-1 overflow-hidden flex gap-0 px-6 pb-5">
          {/* Left: project list */}
          <div
            className="w-72 shrink-0 flex flex-col overflow-hidden rounded-xl mr-4"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
          >
            {/* Search */}
            <div className="p-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects…"
                  className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg outline-none"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
                />
              </div>
            </div>

            {/* Project list */}
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin" style={{ color: "var(--primary)" }} />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
                  <LayoutGrid size={28} style={{ color: "var(--border)" }} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--text-dim)" }}>
                      {search ? "No projects found" : "No projects yet"}
                    </p>
                    {!search && (
                      <button
                        onClick={() => router.push("/workspace")}
                        className="mt-2 text-xs underline"
                        style={{ color: "#818cf8" }}
                      >
                        Create first project →
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                filtered.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    isSelected={project.id === selectedProjectId}
                    onClick={() => setSelectedProject(project.id === selectedProjectId ? null : project.id)}
                  />
                ))
              )}
            </div>

            {/* Footer: go to workspace to create */}
            <div className="p-2 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
              <button
                onClick={() => router.push("/workspace")}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs transition-colors"
                style={{ color: "var(--text-dim)", border: "1px dashed var(--border)" }}
              >
                <ArrowRight size={13} />
                Go to Workspace to create a project
              </button>
            </div>
          </div>

          {/* Right: detail panel */}
          <div
            className="flex-1 overflow-hidden rounded-xl"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
          >
            {selectedProjectId ? (
              <ProjectDetailPanel key={selectedProjectId} projectId={selectedProjectId} />
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center gap-6 p-8"
              >
                <div className="text-center">
                  <div
                    className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                  >
                    <FolderOpen size={28} style={{ color: "var(--border)" }} />
                  </div>
                  <h3 className="text-base font-semibold mb-1" style={{ color: "var(--text-dim)" }}>
                    Select a project
                  </h3>
                  <p className="text-sm" style={{ color: "var(--text-faint)" }}>
                    Choose a project on the left to see its details and workflows.
                  </p>
                </div>

                {/* Live agent feed in empty state */}
                <div className="w-full max-w-lg">
                  <AgentLogFeed compact />
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
