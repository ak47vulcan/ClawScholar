"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { ConversationList } from "@/components/chat/ConversationList";
import { ChatThread } from "@/components/chat/ChatThread";
import { useChatStore } from "@/stores/chat-store";
import { useUIStore } from "@/stores/ui-store";

export default function ChatPage() {
  const { conversations, activeConversationId, setActiveConversation, createConversation, loadConversations } =
    useChatStore();
  const addToast = useUIStore((s) => s.addToast);

  useEffect(() => {
    loadConversations().catch(() => null);
  }, []);

  const handleNewChat = async () => {
    try {
      const conv = await createConversation("New Conversation");
      setActiveConversation(conv.id);
    } catch {
      addToast({ type: "error", message: "Failed to create conversation" });
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title="Chat" subtitle="Quick questions about your tasks and papers — no full workflow runs" />

      <div className="flex-1 overflow-hidden grid" style={{ gridTemplateColumns: "260px 1fr" }}>
        {/* Left: conversation list */}
        <div
          className="border-r overflow-hidden"
          style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
        >
          <ConversationList onNewChat={handleNewChat} />
        </div>

        {/* Right: active thread or empty state */}
        <AnimatePresence mode="wait">
          {activeConversationId ? (
            <motion.div
              key={activeConversationId}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col overflow-hidden"
            >
              <ChatThread conversationId={activeConversationId} />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center gap-6 p-8"
            >
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)",
                  border: "1px solid rgba(99,102,241,0.2)",
                }}
              >
                <MessageSquare size={36} className="text-indigo-400" />
              </div>
              <div className="text-center max-w-sm">
                <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--text)" }}>
                  Your ClawScholar Research Assistant
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-dim)" }}>
                  Ask targeted questions and get fast recommendations (e.g. relevant PDFs). Nothing is saved automatically
                  — if you want to store papers, just say “save them”.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
                {[
                  "Which PDFs should I read about solid-state batteries for EVs?",
                  "Recommend recent PDFs on RAG evaluation methods",
                  "Which papers are seminal for transformer architectures?",
                ].map((ex) => (
                  <motion.button
                    key={ex}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={async () => {
                      const conv = await createConversation(ex.slice(0, 60));
                      setActiveConversation(conv.id);
                    }}
                    className="text-left text-xs px-4 py-3 rounded-xl transition-all"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      color: "var(--text-dim)",
                    }}
                  >
                    "{ex}"
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
