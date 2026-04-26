"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Zap } from "lucide-react";
import { useChatStore, type ChatAttachment } from "@/stores/chat-store";
import { useScheduleStore } from "@/stores/schedule-store";
import { useUIStore } from "@/stores/ui-store";
import { MessageBubble } from "./MessageBubble";
import { AgentThinkingCard } from "./AgentThinkingCard";
import { ChatInput } from "./ChatInput";

interface Props {
  conversationId: string;
}

type CalendarIntent =
  | { kind: "delete_all" }
  | { kind: "delete_date"; date: string };

function parseCalendarIntent(msg: string): CalendarIntent | null {
  const text = msg.toLowerCase().trim();

  const deleteAllPattern =
    /\b(delete|remove|clear|lösche|entferne|entfernen|alle löschen)\b.{0,30}\b(all|alle|every|every|sämtliche)?\b.{0,20}\b(events?|einträge?|eintraege?|termine?|ereignisse?|kalender|calendar|everything|alles|insgesamt|zusammen)\b/i;
  const deleteAllSimple =
    /\b(delete|remove|clear|lösche|entferne)\b.{0,20}\b(all|alle)\b/i;
  const clearAll = /\b(clear|leeren|leere|alles löschen|alles entfernen|remove all|delete all)\b/i;

  if (deleteAllPattern.test(text) || deleteAllSimple.test(text) || clearAll.test(text)) {
    return { kind: "delete_all" };
  }

  const tomorrowPattern =
    /\b(delete|remove|clear|lösche|entferne)\b.{0,30}\b(tomorrow|morgen)\b|\b(tomorrow|morgen)\b.{0,30}\b(delete|remove|clear|lösche|entferne)\b/i;
  if (tomorrowPattern.test(text)) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { kind: "delete_date", date: tomorrow.toISOString().slice(0, 10) };
  }

  return null;
}

export function ChatThread({ conversationId }: Props) {
  const { conversations, sendMessage, loadConversation, typingRunId, isSending } = useChatStore();
  const { loadEvents, deleteEvent } = useScheduleStore();
  const addToast = useUIStore((s) => s.addToast);
  const appendAssistantMessage = useChatStore((s) => s.appendAssistantMessage);
  const bottomRef = useRef<HTMLDivElement>(null);

  const conv = conversations.find((c) => c.id === conversationId);

  // Load messages if not yet loaded
  useEffect(() => {
    if (conv && conv.messages.length === 0) {
      loadConversation(conversationId).catch(() => null);
    }
  }, [conversationId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv?.messages.length, typingRunId]);

  // Fallback: if WS is down, poll the conversation while "typing"
  useEffect(() => {
    if (!typingRunId) return;
    const t1 = setTimeout(() => {
      loadConversation(conversationId).catch(() => null);
    }, 2500);
    const t2 = setTimeout(() => {
      loadConversation(conversationId).catch(() => null);
    }, 9000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [typingRunId, conversationId, loadConversation]);

  const handleCalendarIntent = async (intent: CalendarIntent): Promise<string> => {
    await loadEvents().catch(() => null);
    const currentEvents = useScheduleStore.getState().events;

    if (intent.kind === "delete_all") {
      if (currentEvents.length === 0) return "Your calendar is already empty — nothing to delete.";
      await Promise.all(currentEvents.map((e) => deleteEvent(e.id)));
      return `Done. Deleted all ${currentEvents.length} calendar event${currentEvents.length !== 1 ? "s" : ""}.`;
    }

    if (intent.kind === "delete_date") {
      const matching = currentEvents.filter((e) => e.start_at.slice(0, 10) === intent.date);
      if (matching.length === 0) return `No events found for ${intent.date}.`;
      await Promise.all(matching.map((e) => deleteEvent(e.id)));
      return `Done. Deleted ${matching.length} event${matching.length !== 1 ? "s" : ""} on ${intent.date}.`;
    }

    return "Done.";
  };

  const handleSend = async (message: string, attachments: ChatAttachment[]) => {
    const intent = parseCalendarIntent(message);
    if (intent) {
      // Optimistically add user message to the conversation view
      useChatStore.setState((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  {
                    id: `opt-${crypto.randomUUID()}`,
                    conversation_id: conversationId,
                    role: "user" as const,
                    content: message,
                    run_id: null,
                    attachments,
                    created_at: new Date().toISOString(),
                  },
                ],
              }
            : c
        ),
      }));

      try {
        const reply = await handleCalendarIntent(intent);
        appendAssistantMessage(conversationId, reply);
      } catch {
        appendAssistantMessage(conversationId, "Sorry, I couldn't complete that calendar operation. Please try again.");
      }
      return;
    }

    try {
      await sendMessage(conversationId, message, attachments);
    } catch (err: unknown) {
      addToast({ type: "error", message: err instanceof Error ? err.message : "Failed to send" });
    }
  };

  if (!conv) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Loading…
        </p>
      </div>
    );
  }

  const isTyping = isSending || !!typingRunId;

  // Track the last user message for AgentThinkingCard context detection
  const lastUserMessage = conv?.messages
    ? [...conv.messages].reverse().find((m) => m.role === "user")?.content ?? ""
    : "";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Thread header */}
      <div
        className="px-5 py-3 shrink-0 flex items-center gap-2 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <Zap size={15} className="text-indigo-400" />
        <h3 className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
          {conv.title}
        </h3>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
        {conv.messages.length === 0 && !isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center h-full gap-4"
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}
            >
              <MessageSquare size={28} className="text-indigo-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                Start your research
              </p>
              <p className="text-xs mt-1 max-w-xs" style={{ color: "var(--text-dim)" }}>
                Chat naturally with your assistant. You can ask things like “List all PDFs in my Library” or “Summarize
                PDF `id`”, or “Create a meeting on Friday at 17:00”.
              </p>
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {conv.messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}

          {isTyping && (
            <AgentThinkingCard key="thinking" lastUserMessage={lastUserMessage} />
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-3 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="max-w-2xl mx-auto">
          <ChatInput onSend={handleSend} disabled={isTyping} />
        </div>
      </div>
    </div>
  );
}
