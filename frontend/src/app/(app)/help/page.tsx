"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, LayoutDashboard, Code2, Library, Calendar, Settings,
  ChevronDown, ChevronRight, Terminal, ShieldCheck, Cpu,
  BookOpen, AlertTriangle, CheckCircle2, Search, ArrowRight,
} from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { pageVariants, listContainerVariants, listItemVariants } from "@/lib/motion-variants";

// ─── Data ─────────────────────────────────────────────────────────────────────

interface FaqItem {
  q: string;
  a: string;
}

interface Section {
  id: string;
  icon: React.ReactNode;
  color: string;
  title: string;
  summary: string;
  body: React.ReactNode;
  faq?: FaqItem[];
}

const SECTIONS: Section[] = [
  {
    id: "overview",
    icon: <Zap size={18} />,
    color: "#6366f1",
    title: "What is ClawScholar?",
    summary: "A proactive, multi-agent research automation platform.",
    body: (
      <div className="flex flex-col gap-4">
        <p style={{ color: "var(--text-dim)" }}>
          ClawScholar is <strong style={{ color: "var(--text)" }}>not a chatbot</strong>. It is an autonomous research engine
          that decomposes academic goals into verifiable, citation-backed results using three specialised AI agents working in concert.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { name: "Scheduler", desc: "Breaks your goal into atomic tasks, estimates effort, and manages cognitive load.", color: "#6366f1" },
            { name: "Analyst", desc: "Writes and executes Python code in an isolated sandbox to process data and generate charts.", color: "#22c55e" },
            { name: "Librarian", desc: "Searches your knowledge base and validates every claim before it reaches you.", color: "#f59e0b" },
          ].map((a) => (
            <div key={a.name} className="glass-flat p-3 flex flex-col gap-1.5" style={{ borderLeft: `3px solid ${a.color}` }}>
              <span className="text-xs font-semibold" style={{ color: a.color }}>{a.name}</span>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>{a.desc}</p>
            </div>
          ))}
        </div>
        <div className="glass-flat p-3 flex items-start gap-3">
          <ShieldCheck size={16} className="text-green-400 shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>
            <strong style={{ color: "var(--text)" }}>Validation loop:</strong> The Analyst&apos;s output is always reviewed by the Librarian before delivery.
            If evidence is insufficient, the Analyst retries (up to 3 times). You only ever receive verified results.
          </p>
        </div>
      </div>
    ),
    faq: [
      { q: "Can I use ClawScholar without uploading documents?", a: "Yes — the agents can still reason and generate code. The Librarian will mark outputs as PARTIAL when no indexed sources are available." },
      { q: "What file types are supported?", a: "CSV, XLSX, PDF, and plain TXT. Files are chunked, embedded, and stored in a pgvector index automatically." },
    ],
  },
  {
    id: "dashboard",
    icon: <LayoutDashboard size={18} />,
    color: "#6366f1",
    title: "Dashboard",
    summary: "Real-time view of all agent activity and running workflows.",
    body: (
      <div className="flex flex-col gap-4">
        <p style={{ color: "var(--text-dim)" }}>
          The Dashboard is the control room. Everything happening across all agents is visible here in real time.
        </p>
        <div className="flex flex-col gap-2">
          {[
            { title: "Stats Row", desc: "Four KPI cards at the top: active runs, completed today, indexed documents, and average run time." },
            { title: "Agent Live Feed", desc: "A scrolling log of every action taken by every agent. Click an entry to expand its raw payload. The green pulsing dot means the WebSocket stream is live." },
            { title: "Workflow Board", desc: "A Kanban-style board with four columns: Pending, Running, Completed, Failed. Each card shows the responsible agent, a progress bar (for running workflows), and a cognitive weight score (W)." },
            { title: "Agent Load Meter", desc: "Shown in the top bar. Summarizes how many agents are active or waiting so you can see system pressure at a glance." },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <ArrowRight size={14} className="shrink-0 mt-0.5" style={{ color: "var(--primary)" }} />
              <div>
                <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{item.title}: </span>
                <span className="text-xs" style={{ color: "var(--text-dim)" }}>{item.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "workspace",
    icon: <Code2 size={18} />,
    color: "#22c55e",
    title: "Workspace",
    summary: "Submit research goals and inspect agent-generated code.",
    body: (
      <div className="flex flex-col gap-4">
        <p style={{ color: "var(--text-dim)" }}>
          The Workspace is where you interact with the Orchestrator. Describe what you want in plain English and ClawScholar takes care of the rest.
        </p>
        <div className="flex flex-col gap-3">
          <div className="glass-flat p-3 flex flex-col gap-1">
            <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>Research Goal Input</p>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>
              Type your research objective in the text area. Use the example prompts for inspiration. Press <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ background: "var(--surface-3)", color: "var(--muted)" }}>⌘ Enter</kbd> or the Submit button to dispatch to the Orchestrator.
            </p>
          </div>
          <div className="glass-flat p-3 flex flex-col gap-1">
            <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>Code Viewer</p>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>
              The right panel displays Python code generated by the Analyst agent. It is read-only — the code executes in an isolated sandbox, not in your browser. Use the Copy or Export buttons to save it.
            </p>
          </div>
          <div className="glass-flat p-3 flex flex-col gap-1">
            <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>Agent Feed (left panel)</p>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>
              The live feed shows the sequence of agent actions for the active run. Each entry shows which agent acted, what it did, how long it took, and whether it succeeded.
            </p>
          </div>
        </div>
        <div className="glass-flat p-3 flex items-start gap-3">
          <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>
            Results are only delivered after the Librarian validates them. The workflow status card will show <strong style={{ color: "var(--text)" }}>COMPLETED</strong> when the result is ready.
          </p>
        </div>
      </div>
    ),
    faq: [
      { q: "How do I write a good research goal?", a: "Be specific. Include the dataset or domain, the analysis type, and the desired output (e.g. 'Analyse arxiv_2024.csv and produce a line chart of publication counts per ML category from 2020–2024')." },
      { q: "Can I cancel a running workflow?", a: "Not yet via the UI — stop and restart the relevant Docker service. This will be added in a future release." },
    ],
  },
  {
    id: "library",
    icon: <Library size={18} />,
    color: "#f59e0b",
    title: "Knowledge Library",
    summary: "Upload documents, manage the vector index, and track indexing status.",
    body: (
      <div className="flex flex-col gap-4">
        <p style={{ color: "var(--text-dim)" }}>
          The Knowledge Library is your private document store. Everything you upload is chunked, embedded, and stored in a pgvector index that the Librarian searches during validation.
        </p>
        <div className="flex flex-col gap-2">
          {[
            { title: "Upload Zone", desc: "Drag-and-drop or click to upload CSV, XLSX, PDF, or TXT files. Multiple files at once are supported. Each file shows an upload progress bar." },
            { title: "Indexing Pipeline", desc: "After upload, the document enters the background indexing queue: parse → chunk (512 tokens, 50-token overlap) → embed → store in pgvector. Status updates from PENDING → INDEXING → INDEXED." },
            { title: "Index Health Panel", desc: "Shows total chunks, vector dimensions (1,536 for text-embedding-3-large), and time of last sync." },
            { title: "Document Table", desc: "Searchable list of all documents. Filter by filename. Status badge shows INDEXED (green), PENDING (amber), or FAILED (red)." },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <ArrowRight size={14} className="shrink-0 mt-0.5" style={{ color: "#f59e0b" }} />
              <div>
                <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{item.title}: </span>
                <span className="text-xs" style={{ color: "var(--text-dim)" }}>{item.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    faq: [
      { q: "How large can uploaded files be?", a: "The default limit is 50 MB per file. This can be raised in backend/app/config.py (MAX_UPLOAD_SIZE_MB)." },
      { q: "Why does my document show FAILED status?", a: "Common reasons: unsupported encoding (use UTF-8 for TXT/CSV), password-protected PDFs, or corrupted XLSX files. Re-export and re-upload." },
      { q: "Is the knowledge base per-user or shared?", a: "Per-user. Each researcher has an isolated vector index. Documents are not visible to other users." },
    ],
  },
  {
    id: "schedule",
    icon: <Calendar size={18} />,
    color: "#8b5cf6",
    title: "Schedule",
    summary: "Create and manage recurring automated research jobs.",
    body: (
      <div className="flex flex-col gap-4">
        <p style={{ color: "var(--text-dim)" }}>
          The Schedule page lets you define recurring jobs that run automatically — like fetching new ArXiv papers every morning or generating a weekly trend report every Monday.
        </p>
        <div className="glass-flat p-3 flex flex-col gap-2">
          <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>Cron Expression Reference</p>
          <div className="font-mono text-xs flex flex-col gap-1" style={{ color: "var(--text-dim)" }}>
            {[
              ["0 8 * * *", "Daily at 08:00"],
              ["0 9 * * MON", "Every Monday at 09:00"],
              ["0 */6 * * *", "Every 6 hours"],
              ["0 2 1 * *", "1st of every month at 02:00"],
            ].map(([expr, desc]) => (
              <div key={expr} className="flex items-center gap-3">
                <code className="px-2 py-0.5 rounded" style={{ background: "var(--surface-3)", color: "#a5b4fc" }}>{expr}</code>
                <span>{desc}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {[
            { title: "Enable / Pause", desc: "Click the play/pause button on a job card to toggle it. Paused jobs are skipped at their scheduled time but are not deleted." },
            { title: "Upcoming Runs", desc: "The bottom panel shows the next scheduled execution for all active jobs." },
            { title: "Last Status", desc: "Each job card shows the result of its last execution: success (green), failed (red), or pending (amber)." },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <ArrowRight size={14} className="shrink-0 mt-0.5" style={{ color: "#8b5cf6" }} />
              <div>
                <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{item.title}: </span>
                <span className="text-xs" style={{ color: "var(--text-dim)" }}>{item.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "sandbox",
    icon: <Terminal size={18} />,
    color: "#22c55e",
    title: "Code Sandbox",
    summary: "How the Analyst executes code safely.",
    body: (
      <div className="flex flex-col gap-4">
        <p style={{ color: "var(--text-dim)" }}>
          The Analyst agent never executes code in the main backend process. All Python runs in a dedicated, isolated Docker container.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "No internet access", icon: <ShieldCheck size={14} className="text-green-400" /> },
            { label: "Read-only filesystem", icon: <ShieldCheck size={14} className="text-green-400" /> },
            { label: "1 CPU core limit", icon: <Cpu size={14} className="text-indigo-400" /> },
            { label: "512 MB RAM limit", icon: <Cpu size={14} className="text-indigo-400" /> },
            { label: "30-second timeout", icon: <Cpu size={14} className="text-indigo-400" /> },
            { label: "AST import blocker", icon: <ShieldCheck size={14} className="text-green-400" /> },
          ].map(({ label, icon }) => (
            <div key={label} className="glass-flat px-3 py-2 flex items-center gap-2">
              {icon}
              <span className="text-xs" style={{ color: "var(--text-dim)" }}>{label}</span>
            </div>
          ))}
        </div>
        <div className="glass-flat p-3 flex flex-col gap-2">
          <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>Blocked imports</p>
          <p className="text-xs font-mono" style={{ color: "var(--danger)" }}>
            os · sys · subprocess · socket · importlib · ctypes · pathlib (write ops) · shutil
          </p>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>
            Available: pandas, numpy, matplotlib, plotly, scipy, scikit-learn, openpyxl
          </p>
        </div>
        <div className="glass-flat p-3 flex items-start gap-3">
          <CheckCircle2 size={14} className="text-green-400 shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>
            Matplotlib figures are automatically captured, base64-encoded, and returned to the Analyst. You see the rendered chart in the results — no file system access needed.
          </p>
        </div>
      </div>
    ),
    faq: [
      { q: "My code timed out — what can I do?", a: "Reduce the dataset size or break the analysis into smaller steps. The timeout (default 30s) can be raised in .env via SANDBOX_TIMEOUT_SECONDS." },
      { q: "Can I install additional Python packages?", a: "Not at runtime. Add packages to sandbox/requirements.txt and rebuild the sandbox Docker image with: docker compose build sandbox." },
    ],
  },
  {
    id: "settings",
    icon: <Settings size={18} />,
    color: "#94a3b8",
    title: "Settings",
    summary: "Configure your workspace: theme, API keys, account, and agent preferences.",
    body: (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {[
            { title: "Theme", desc: "Switch between Dark, Light, and System modes. The preference is saved locally and applied immediately." },
            { title: "Account", desc: "Update your display name. Email cannot be changed after registration." },
            { title: "Anthropic API Key", desc: "Your key for calling Claude models. Stored encrypted. Never logged. Required for all agent operations." },
            { title: "Auto-index Uploads", desc: "When enabled, documents are automatically embedded after upload. Disable to batch-index manually." },
            { title: "Notifications", desc: "Enable to receive browser alerts when an agent run completes or fails." },
          ].map((item) => (
            <div key={item.title} className="flex gap-3 py-2 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
              <div className="w-32 shrink-0">
                <span className="text-xs font-semibold" style={{ color: "var(--text)" }}>{item.title}</span>
              </div>
              <span className="text-xs" style={{ color: "var(--text-dim)" }}>{item.desc}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "keyboard",
    icon: <BookOpen size={18} />,
    color: "#6366f1",
    title: "Keyboard Shortcuts",
    summary: "Navigate ClawScholar without touching the mouse.",
    body: (
      <div className="flex flex-col gap-3">
        <p style={{ color: "var(--text-dim)" }}>ClawScholar is designed for keyboard-first usage.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            ["⌘ K", "Open Command Palette"],
            ["⌘ Enter", "Submit research goal (in Workspace)"],
            ["ESC", "Close any modal or palette"],
            ["↑ ↓", "Navigate Command Palette items"],
          ].map(([key, desc]) => (
            <div key={key} className="glass-flat flex items-center gap-3 px-3 py-2">
              <kbd className="px-2 py-0.5 rounded font-mono text-xs font-medium shrink-0" style={{ background: "var(--surface-3)", color: "var(--primary)", border: "1px solid var(--border-strong)" }}>
                {key}
              </kbd>
              <span className="text-xs" style={{ color: "var(--text-dim)" }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

// ─── Components ───────────────────────────────────────────────────────────────

function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-1 mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>FAQ</p>
      {items.map((item, i) => (
        <div key={i} className="glass-flat overflow-hidden">
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left"
          >
            <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{item.q}</span>
            <motion.span animate={{ rotate: open === i ? 90 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronRight size={13} style={{ color: "var(--muted)" }} />
            </motion.span>
          </button>
          <AnimatePresence>
            {open === i && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <p className="px-3 pb-3 text-xs" style={{ color: "var(--text-dim)" }}>{item.a}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

function SectionCard({ section }: { section: Section }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div variants={listItemVariants} className="glass overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-4 p-5 text-left"
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${section.color}18`, color: section.color }}
        >
          {section.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{section.title}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>{section.summary}</p>
        </div>
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={16} style={{ color: "var(--muted)" }} />
        </motion.span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="pt-4">{section.body}</div>
              {section.faq && section.faq.length > 0 && <FaqAccordion items={section.faq} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? SECTIONS.filter((s) =>
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.summary.toLowerCase().includes(search.toLowerCase())
      )
    : SECTIONS;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Help & Documentation" subtitle="Learn how ClawScholar works" />
      <div className="flex-1 overflow-auto p-6">
        <motion.div
          variants={pageVariants}
          initial="initial"
          animate="animate"
          className="max-w-3xl mx-auto flex flex-col gap-5"
        >
          {/* Hero */}
          <div className="glass p-6 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Zap size={26} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>ClawScholar Documentation</h1>
              <p className="text-sm mt-1 max-w-sm mx-auto" style={{ color: "var(--text-dim)" }}>
                A proactive multi-agent research engine. Click any section below to learn how it works.
              </p>
            </div>
            {/* Search */}
            <div className="relative w-full max-w-xs mt-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search topics..."
                className="w-full pl-8 pr-3 py-2 text-sm rounded-lg outline-none transition-all"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
                onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
              />
            </div>
          </div>

          {/* Sections */}
          <motion.div
            variants={listContainerVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-3"
          >
            {filtered.length === 0 ? (
              <div className="glass p-8 flex flex-col items-center gap-2" style={{ color: "var(--text-faint)" }}>
                <Search size={28} />
                <p className="text-sm">No topics match &quot;{search}&quot;</p>
              </div>
            ) : (
              filtered.map((section) => <SectionCard key={section.id} section={section} />)
            )}
          </motion.div>

          {/* Footer */}
          <p className="text-center text-xs pb-4" style={{ color: "var(--text-faint)" }}>
            ClawScholar · Research-Grade Multi-Agent Academic Workflow Engine
          </p>
        </motion.div>
      </div>
    </div>
  );
}
