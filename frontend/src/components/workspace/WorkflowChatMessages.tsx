"use client";

import { Bot, Loader2, Sparkles, User } from "lucide-react";
import type { ChatMessage } from "@/hooks/use-workflow-refinement-chat";

interface WorkflowChatMessagesProps {
  messages: ChatMessage[];
  scrollRef: React.RefObject<HTMLDivElement>;
}

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{
          background: isUser
            ? "linear-gradient(135deg, #6366f1, #7c3aed)"
            : "var(--surface-3)",
        }}
      >
        {isUser ? (
          <User size={12} className="text-white" />
        ) : (
          <Bot size={12} style={{ color: "var(--text-dim)" }} />
        )}
      </div>
      <div
        className="max-w-[82%] rounded-xl px-3 py-2 text-[11px] leading-relaxed"
        style={{
          background: isUser
            ? "linear-gradient(135deg, rgba(99,102,241,0.16), rgba(124,58,237,0.1))"
            : "var(--surface-2)",
          border: `1px solid ${isUser ? "rgba(99,102,241,0.24)" : "var(--border)"}`,
          color: "var(--text-dim)",
        }}
      >
        {msg.isLoading ? (
          <span className="flex items-center gap-1.5">
            <Loader2 size={11} className="animate-spin text-indigo-400" />
            <span style={{ color: "var(--text-faint)" }}>Thinking...</span>
          </span>
        ) : (
          <span className="whitespace-pre-wrap">{msg.content}</span>
        )}
      </div>
    </div>
  );
}

export function WorkflowChatMessages({ messages, scrollRef }: WorkflowChatMessagesProps) {
  return (
    <div ref={scrollRef} className="flex min-h-[220px] flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      {messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            <Sparkles size={17} className="text-indigo-400" />
          </div>
          <p className="max-w-[260px] text-xs leading-relaxed" style={{ color: "var(--text-faint)" }}>
            Ask about this workflow, refine the sources, or launch a follow-up run.
          </p>
        </div>
      ) : (
        messages.map((msg) => <ChatBubble key={msg.id} msg={msg} />)
      )}
    </div>
  );
}
