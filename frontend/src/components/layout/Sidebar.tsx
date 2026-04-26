"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Code2, Library, Calendar, Settings,
  ChevronLeft, Zap, LogOut, HelpCircle, MessageSquare, PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { useAgentStore } from "@/stores/agent-store";
import { AGENT_COLORS } from "@/lib/constants";
import type { AgentType } from "@/lib/constants";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare, highlight: true },
  { href: "/workspace", label: "Workspace", icon: Code2 },
  { href: "/writer", label: "Writer", icon: PenLine },
  { href: "/library", label: "Knowledge Library", icon: Library },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help & Docs", icon: HelpCircle },
];

const AGENT_LABELS: Record<AgentType, string> = {
  ORCHESTRATOR: "Orchestrator",
  SCHEDULER: "Scheduler",
  ANALYST: "Analyst",
  LIBRARIAN: "Librarian",
  WRITER: "Writer",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  WAITING: "Waiting",
  IDLE: "Idle",
  ERROR: "Error",
};

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { user, logout } = useAuthStore();
  const { agentStatuses } = useAgentStore();

  const width = sidebarOpen ? 240 : 64;

  return (
    <motion.aside
      animate={{ width }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="relative h-screen flex-shrink-0 flex flex-col border-r sidebar-bg"
      style={{ borderColor: "var(--border)" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 shrink-0" style={{ height: "var(--topbar-height)" }}>
        <div className="relative w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/30">
          <Zap size={16} className="text-white" />
          {Object.values(agentStatuses).some((s) => s === "ACTIVE") && (
            <span className="logo-orbit-dot" />
          )}
        </div>
        <AnimatePresence>
          {sidebarOpen && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="font-semibold text-sm whitespace-nowrap"
              style={{ color: "var(--text)" }}
            >
              ClawScholar
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon, highlight }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn("nav-item", active && "nav-item-active")}
              title={!sidebarOpen ? label : undefined}
            >
              <Icon size={18} className={cn("shrink-0", !active && highlight && "text-indigo-400")} />
              <AnimatePresence>
                {sidebarOpen && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="whitespace-nowrap text-sm"
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      {/* Agent status panel */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mx-2 mb-3 p-3 rounded-lg"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: "var(--muted)" }}>
              Agent Status
            </p>
            <div className="flex flex-col gap-2">
              {(Object.entries(agentStatuses) as [AgentType, string][]).map(([agent, status]) => {
                const isActive = status === "ACTIVE";
                const color = AGENT_COLORS[agent];
                return (
                  <div key={agent} className="flex items-center gap-2">
                    <div
                      className="h-1.5 rounded-full flex-1 overflow-hidden"
                      style={{ background: "var(--surface-3)" }}
                    >
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: isActive ? color : "var(--border)" }}
                        animate={{ width: isActive ? "100%" : status === "WAITING" ? "50%" : "0%" }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    <span className="text-[10px] w-16 truncate" style={{ color: isActive ? color : "var(--text-faint)" }}>
                      {AGENT_LABELS[agent]}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* User + Logout */}
      <div className="px-2 pb-3 flex flex-col gap-1 shrink-0">
        {sidebarOpen && user && (
          <div
            className="px-3 py-2 rounded-lg glass"
            style={{ background: "rgba(255,255,255,0.04)" }}
          >
            <p className="text-xs font-medium truncate gradient-text">
              {user.fullName ?? user.email}
            </p>
            <p className="text-[10px] truncate" style={{ color: "var(--muted)" }}>{user.email}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="nav-item w-full"
          title={!sidebarOpen ? "Sign out" : undefined}
        >
          <LogOut size={16} className="shrink-0" />
          <AnimatePresence>
            {sidebarOpen && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm">
                Sign out
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="absolute top-4 -right-3 w-6 h-6 rounded-full border flex items-center justify-center z-20 transition-colors hover:bg-indigo-500 hover:border-indigo-500 hover:text-white"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-strong)", color: "var(--text-dim)", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}
        aria-label="Toggle sidebar"
      >
        <motion.span animate={{ rotate: sidebarOpen ? 0 : 180 }} transition={{ duration: 0.2 }}>
          <ChevronLeft size={12} />
        </motion.span>
      </button>
    </motion.aside>
  );
}
