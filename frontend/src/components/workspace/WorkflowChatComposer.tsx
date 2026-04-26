"use client";

import { Loader2, Play, Send } from "lucide-react";
import type { WorkflowRefinementChatState } from "@/hooks/use-workflow-refinement-chat";

interface WorkflowChatComposerProps {
  chat: WorkflowRefinementChatState;
  busy: boolean;
}

export function WorkflowChatComposer({ chat, busy }: WorkflowChatComposerProps) {
  return (
    <div className="shrink-0 px-4 pb-4 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="flex items-end gap-2">
        <textarea
          value={chat.input}
          onChange={(event) => chat.setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              chat.handleSend();
            }
          }}
          placeholder="Ask or request a change..."
          rows={2}
          disabled={busy}
          className="min-h-[52px] flex-1 resize-none rounded-xl px-3 py-2 text-xs outline-none transition-all focus:border-indigo-400/60"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            opacity: busy ? 0.65 : 1,
          }}
        />
        <div className="flex flex-col gap-1">
          <button
            onClick={chat.handleSend}
            disabled={!chat.input.trim() || busy}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-all disabled:opacity-40"
            style={{
              background: "linear-gradient(135deg, #6366f1, #7c3aed)",
              boxShadow: "0 10px 24px rgba(99,102,241,0.22)",
            }}
            title="Send message"
          >
            {chat.isSending ? (
              <Loader2 size={14} className="animate-spin text-white" />
            ) : (
              <Send size={14} className="text-white" />
            )}
          </button>
          <button
            onClick={() => chat.handleStartWorkflow()}
            disabled={!chat.input.trim() || busy}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-all disabled:opacity-40"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
            title="Start workflow"
          >
            {chat.isStartingWorkflow ? (
              <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-dim)" }} />
            ) : (
              <Play size={14} style={{ color: "var(--text-dim)" }} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
