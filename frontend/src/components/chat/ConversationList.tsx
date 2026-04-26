"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Plus, MessageSquare, Trash2, ChevronRight } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { useUIStore } from "@/stores/ui-store";

interface Props {
  onNewChat: () => void;
}

export function ConversationList({ onNewChat }: Props) {
  const { conversations, activeConversationId, setActiveConversation, deleteConversation, isLoadingConversations } =
    useChatStore();
  const addToast = useUIStore((s) => s.addToast);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteConversation(id);
    } catch {
      addToast({ type: "error", message: "Failed to delete conversation" });
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between shrink-0">
        <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          Chats
        </h2>
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={onNewChat}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
          style={{ background: "rgba(99,102,241,0.15)", color: "var(--primary)" }}
          title="New conversation"
        >
          <Plus size={14} />
        </motion.button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 flex flex-col gap-1">
        {isLoadingConversations && (
          <div className="px-3 py-6 text-center text-xs" style={{ color: "var(--muted)" }}>
            Loading…
          </div>
        )}
        <AnimatePresence initial={false}>
          {conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            return (
              <motion.button
                key={conv.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                onClick={() => setActiveConversation(conv.id)}
                className="group w-full text-left rounded-xl px-3 py-2.5 flex items-start gap-2 transition-all"
                style={{
                  background: isActive
                    ? "linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(139,92,246,0.12) 100%)"
                    : "transparent",
                  border: `1px solid ${isActive ? "rgba(99,102,241,0.3)" : "transparent"}`,
                }}
              >
                <MessageSquare
                  size={14}
                  className="shrink-0 mt-0.5"
                  style={{ color: isActive ? "var(--primary)" : "var(--muted)" }}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs font-medium truncate"
                    style={{ color: isActive ? "var(--text)" : "var(--text-dim)" }}
                  >
                    {conv.title}
                  </p>
                  {conv.last_message && (
                    <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--text-faint)" }}>
                      {conv.last_message}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleDelete(e, conv.id)}
                    className="w-5 h-5 rounded flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 transition-colors"
                    style={{ color: "var(--muted)" }}
                  >
                    <Trash2 size={10} />
                  </button>
                  <ChevronRight size={10} style={{ color: "var(--muted)" }} />
                </div>
              </motion.button>
            );
          })}
        </AnimatePresence>

        {!isLoadingConversations && conversations.length === 0 && (
          <div className="px-3 py-8 text-center">
            <MessageSquare size={24} className="mx-auto mb-2 opacity-30" style={{ color: "var(--muted)" }} />
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              No conversations yet
            </p>
            <p className="text-[10px] mt-1" style={{ color: "var(--text-faint)" }}>
              Click + to start
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
