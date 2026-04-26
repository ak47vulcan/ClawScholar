"use client";

import { motion } from "framer-motion";
import { Bot, User, ExternalLink } from "lucide-react";
import type { ChatMsg } from "@/stores/chat-store";
import { parseToolHints } from "@/lib/chat-tool-parser";
import { ToolCallBadge } from "@/components/chat/ToolCallBadge";
import { WriterRunCard } from "@/components/chat/WriterRunCard";

interface Props {
  msg: ChatMsg;
}

function FormattedContent({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="px-1.5 py-0.5 rounded text-[11px] font-mono"
              style={{ background: "var(--surface-3)", color: "var(--primary)" }}
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

function SendingDots() {
  return (
    <div className="flex gap-0.5 mt-1.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1 h-1 rounded-full bg-current opacity-60"
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  );
}

export function MessageBubble({ msg }: Props) {
  const isUser = msg.role === "user";
  const isOptimistic = msg.id.startsWith("opt-");
  const toolHints = !isUser && !isOptimistic ? parseToolHints(msg.content) : [];
  const writerRunPayload = msg.attachments?.find((a) => a.writer_run)?.writer_run;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{
          background: isUser
            ? "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)"
            : "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          border: "1px solid var(--border)",
        }}
      >
        {isUser ? <User size={14} className="text-white" /> : <Bot size={14} className="text-indigo-400" />}
      </div>

      {/* Bubble */}
      <div
        className={`group relative max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser ? "rounded-tr-sm" : "rounded-tl-sm"
        } ${isOptimistic ? "send-flash" : ""}`}
        style={{
          background: isUser
            ? "linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(139,92,246,0.15) 100%)"
            : "var(--surface-2)",
          border: `1px solid ${isUser ? "rgba(99,102,241,0.3)" : "var(--border)"}`,
          color: "var(--text)",
          opacity: isOptimistic ? 0.8 : 1,
        }}
      >
        {toolHints.length > 0 && <ToolCallBadge hints={toolHints} />}
        <FormattedContent text={msg.content} />
        {/* Writer run card — rendered when assistant triggers the Writer Agent */}
        {writerRunPayload && <WriterRunCard payload={writerRunPayload} />}

        {/* Attachments */}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {msg.attachments.map((att, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(99,102,241,0.15)",
                  color: "var(--primary)",
                  border: "1px solid rgba(99,102,241,0.25)",
                }}
              >
                <ExternalLink size={10} />
                {att.filename ?? att.doc_id ?? "Attachment"}
              </span>
            ))}
          </div>
        )}

        {/* Timestamp or sending indicator */}
        {isOptimistic ? (
          <SendingDots />
        ) : (
          <p
            className="mt-1.5 text-[10px] opacity-0 group-hover:opacity-60 transition-opacity"
            style={{ color: "var(--muted)" }}
          >
            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    </motion.div>
  );
}
