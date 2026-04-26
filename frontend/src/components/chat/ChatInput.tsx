"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Paperclip, X } from "lucide-react";
import { useDocumentStore } from "@/stores/document-store";
import type { ChatAttachment } from "@/stores/chat-store";

interface Props {
  onSend: (message: string, attachments: ChatAttachment[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder }: Props) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { documents } = useDocumentStore();

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim(), attachments);
    setText("");
    setAttachments([]);
    setShowDocPicker(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleDoc = (doc: { id: string; filename: string }) => {
    setAttachments((prev) => {
      const exists = prev.find((a) => a.doc_id === doc.id);
      if (exists) return prev.filter((a) => a.doc_id !== doc.id);
      return [...prev, { doc_id: doc.id, filename: doc.filename }];
    });
  };

  return (
    <div className="relative">
      {/* Attachment chips */}
      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-1.5 px-3 pt-2"
          >
            {attachments.map((att, idx) => {
              const label = att.filename ?? att.doc_id ?? "Attachment";
              const labelShort = label.length > 30 ? label.slice(0, 30) + "…" : label;
              const key = `${att.doc_id ?? "no-doc"}:${att.filename ?? "no-file"}:${idx}`;
              return (
              <span
                key={key}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(99,102,241,0.15)",
                  color: "var(--primary)",
                  border: "1px solid rgba(99,102,241,0.25)",
                }}
              >
                {labelShort}
                <button onClick={() => setAttachments((p) => p.filter((a, i) => !(i === idx && a === att)))}>
                  <X size={10} />
                </button>
              </span>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main input row */}
      <div
        className="flex items-end gap-2 rounded-2xl p-3"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          transition: "border-color 0.15s",
        }}
        onFocusCapture={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--primary)")}
        onBlurCapture={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--border)")}
      >
        {/* Doc attach button */}
        <button
          type="button"
          onClick={() => setShowDocPicker((p) => !p)}
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mb-0.5 transition-colors"
          style={{
            color: showDocPicker ? "var(--primary)" : "var(--muted)",
            background: showDocPicker ? "rgba(99,102,241,0.15)" : "transparent",
          }}
          title="Attach document from library"
        >
          <Paperclip size={14} />
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            placeholder ??
            'e.g. "Find recent papers on solid-state batteries and schedule a deep-work block for Friday." ⌘+Enter'
          }
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm outline-none disabled:opacity-50 leading-relaxed"
          style={{ color: "var(--text)", minHeight: "24px", maxHeight: "160px" }}
        />

        {/* Send button */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:opacity-40"
          style={{
            background: text.trim() && !disabled ? "var(--primary)" : "var(--surface-3)",
            color: "white",
          }}
        >
          <Send size={14} />
        </motion.button>
      </div>

      {/* Document picker dropdown */}
      <AnimatePresence>
        {showDocPicker && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full mb-2 left-0 right-0 rounded-xl overflow-hidden z-20"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              maxHeight: "200px",
              overflowY: "auto",
            }}
          >
            {documents.length === 0 ? (
              <p className="p-3 text-xs" style={{ color: "var(--muted)" }}>
                No documents in library yet
              </p>
            ) : (
              documents.map((doc) => {
                const selected = attachments.some((a) => a.doc_id === doc.id);
                return (
                  <button
                    key={doc.id}
                    onClick={() => toggleDoc(doc)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
                  >
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                      style={{
                        background: selected ? "var(--primary)" : "var(--surface-3)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {selected && <span className="text-white text-[9px]">✓</span>}
                    </div>
                    <span className="text-xs truncate" style={{ color: "var(--text)" }}>
                      {doc.filename}
                    </span>
                  </button>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
