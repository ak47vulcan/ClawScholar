"use client";

import { useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, MessageSquare, RotateCcw, Sparkles, X } from "lucide-react";
import { WorkflowChatComposer } from "./WorkflowChatComposer";
import { WorkflowChatMessages } from "./WorkflowChatMessages";
import { REFINEMENT_SUGGESTIONS } from "./workflow-refinement-suggestions";
import { type WorkflowRefinementChatState } from "@/hooks/use-workflow-refinement-chat";

interface WorkflowFloatingChatPanelProps {
  goalTitle?: string;
  chat: WorkflowRefinementChatState;
}

export function WorkflowFloatingChatPanel({ goalTitle, chat }: WorkflowFloatingChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageCount = chat.messages.filter((m) => !m.isLoading).length;
  const busy = chat.isSending || chat.isStartingWorkflow;

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [chat.messages, chat.isOpen, scrollToBottom]);

  return (
    <>
      <AnimatePresence>
        {chat.isOpen && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, transparent 35%, rgba(15,23,42,0.08))",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {chat.isOpen && (
          <motion.section
            initial={{ opacity: 0, y: 22, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="glass-elevated fixed bottom-20 left-4 right-4 z-50 flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-2xl sm:bottom-24 sm:left-auto sm:right-6 sm:w-[430px]"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} className="text-indigo-400" />
                  <h3 className="text-xs font-semibold" style={{ color: "var(--text)" }}>Project Chat</h3>
                  {messageCount > 0 && (
                    <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: "var(--surface-3)", color: "var(--text-faint)" }}>
                      {messageCount}
                    </span>
                  )}
                </div>
                {goalTitle && (
                  <p className="mt-0.5 truncate text-[10px]" style={{ color: "var(--text-faint)" }}>
                    {goalTitle}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => chat.setShowSuggestions(!chat.showSuggestions)}
                  className="flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] transition-colors hover:bg-[var(--surface-2)]"
                  style={{ color: "var(--text-dim)" }}
                  title="Ideas"
                >
                  <Sparkles size={12} className="text-indigo-400" />
                  <ChevronDown size={11} className="transition-transform" style={{ transform: chat.showSuggestions ? "rotate(180deg)" : "none" }} />
                </button>
                {messageCount > 0 && (
                  <button onClick={chat.clearHistory} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--surface-2)]" title="Clear chat">
                    <RotateCcw size={13} style={{ color: "var(--text-faint)" }} />
                  </button>
                )}
                <button onClick={() => chat.setIsOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--surface-2)]" title="Close">
                  <X size={14} style={{ color: "var(--text-dim)" }} />
                </button>
              </div>
            </div>

            <AnimatePresence>
              {chat.showSuggestions && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex shrink-0 flex-wrap gap-1.5 overflow-hidden px-4 py-2"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  {REFINEMENT_SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        chat.setInput(suggestion);
                        chat.setShowSuggestions(false);
                      }}
                      className="rounded-lg px-2 py-1 text-left text-[10px] transition-colors hover:border-indigo-400/50"
                      style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <WorkflowChatMessages messages={chat.messages} scrollRef={scrollRef} />
            <WorkflowChatComposer chat={chat} busy={busy} />
          </motion.section>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => chat.setIsOpen(!chat.isOpen)}
        whileHover={{ y: -2, scale: 1.03 }}
        whileTap={{ scale: 0.96 }}
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full sm:bottom-6 sm:right-6"
        style={{ background: "linear-gradient(135deg, #6366f1, #7c3aed)", boxShadow: "0 18px 42px rgba(99,102,241,0.38)" }}
        aria-label={chat.isOpen ? "Close project chat" : "Open project chat"}
        aria-expanded={chat.isOpen}
        title={chat.isOpen ? "Close project chat" : "Open project chat"}
      >
        {busy && (
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ border: "1px solid rgba(255,255,255,0.45)" }}
            animate={{ scale: [1, 1.25, 1], opacity: [0.8, 0, 0.8] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
        )}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={chat.isOpen ? "close" : "open"}
            initial={{ opacity: 0, rotate: -35, scale: 0.7 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 35, scale: 0.7 }}
            transition={{ duration: 0.18 }}
          >
            {chat.isOpen ? <X size={22} className="text-white" /> : <MessageSquare size={23} className="text-white" />}
          </motion.span>
        </AnimatePresence>
        {messageCount > 0 && !chat.isOpen && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: "#22c55e" }}>
            {messageCount}
          </span>
        )}
      </motion.button>
    </>
  );
}
