"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, LayoutDashboard, Code2, Library, Calendar, Settings } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { paletteOverlayVariants, paletteDialogVariants } from "@/lib/motion-variants";

const COMMANDS = [
  { id: "dashboard", label: "Go to Dashboard", icon: LayoutDashboard, href: "/dashboard", group: "Navigation" },
  { id: "workspace", label: "Go to Workspace", icon: Code2, href: "/workspace", group: "Navigation" },
  { id: "library", label: "Go to Knowledge Library", icon: Library, href: "/library", group: "Navigation" },
  { id: "schedule", label: "Go to Schedule", icon: Calendar, href: "/schedule", group: "Navigation" },
  { id: "settings", label: "Go to Settings", icon: Settings, href: "/settings", group: "Navigation" },
];

export function CommandPalette() {
  const { commandPaletteOpen, closeCommandPalette } = useUIStore();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        useUIStore.getState().openCommandPalette();
      }
      if (e.key === "Escape") closeCommandPalette();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeCommandPalette]);

  useEffect(() => {
    if (commandPaletteOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [commandPaletteOpen]);

  const navigate = (href: string) => {
    router.push(href);
    closeCommandPalette();
  };

  return (
    <AnimatePresence>
      {commandPaletteOpen && (
        <motion.div
          variants={paletteOverlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
          onClick={closeCommandPalette}
        >
          <motion.div
            variants={paletteDialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="glass-elevated w-full max-w-lg mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <Search size={16} style={{ color: "var(--muted)" }} />
              <input
                ref={inputRef}
                placeholder="Search commands, pages..."
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: "var(--text)" }}
              />
              <kbd className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ background: "var(--surface-3)", color: "var(--muted)" }}>
                ESC
              </kbd>
            </div>

            {/* Commands */}
            <div className="py-2 max-h-72 overflow-y-auto">
              <p className="px-4 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--muted)" }}>
                Navigation
              </p>
              {COMMANDS.map(({ id, label, icon: Icon, href }) => (
                <button
                  key={id}
                  onClick={() => navigate(href)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--surface-2)] text-left"
                  style={{ color: "var(--text)" }}
                >
                  <Icon size={16} style={{ color: "var(--muted)" }} />
                  {label}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
