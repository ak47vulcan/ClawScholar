import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/lib/api-client";

export interface WriterRunPayload {
  run_id: string;
  title: string;
  doc_type: string;
  status: string;
}

export interface ChatAttachment {
  doc_id?: string;
  filename?: string;
  writer_run?: WriterRunPayload;
}

export interface ChatMsg {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  run_id?: string | null;
  attachments: ChatAttachment[];
  created_at: string;
  tool_events?: Array<{ tool_name: string; display_label: string }> | null;
}

export interface Conversation {
  id: string;
  title: string;
  goal_id?: string | null;
  created_at: string;
  updated_at: string;
  last_message?: string | null;
  messages: ChatMsg[];
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoadingConversations: boolean;
  isSending: boolean;
  typingRunId: string | null;

  // Actions
  loadConversations: () => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  createConversation: (title?: string) => Promise<Conversation>;
  sendMessage: (
    conversationId: string,
    message: string,
    attachments?: ChatAttachment[]
  ) => Promise<{ assistant_message: ChatMsg }>;
  deleteConversation: (id: string) => Promise<void>;
  setActiveConversation: (id: string | null) => void;
  appendAssistantMessage: (conversationId: string, content: string, runId?: string) => void;
  setTypingRunId: (runId: string | null) => void;
}

export const useChatStore = create<ChatState>()(
  persist<ChatState, [], [], Pick<ChatState, "conversations" | "activeConversationId">>((set, get) => ({
      conversations: [],
      activeConversationId: null,
      isLoadingConversations: false,
      isSending: false,
      typingRunId: null,

      loadConversations: async () => {
        set({ isLoadingConversations: true });
        try {
          const list = await api.get<Conversation[]>("/chat/conversations");
          set((s) => ({
            conversations: list.map((c) => {
              const existing = s.conversations.find((e) => e.id === c.id);
              return existing ? { ...existing, ...c } : { ...c, messages: [] };
            }),
          }));
        } finally {
          set({ isLoadingConversations: false });
        }
      },

      loadConversation: async (id: string) => {
        const full = await api.get<Conversation>(`/chat/conversations/${id}`);
        set((s) => ({
          conversations: s.conversations.map((c) => (c.id === id ? { ...c, ...full } : c)),
        }));
      },

      createConversation: async (title = "New Conversation") => {
        const conv = await api.post<Conversation>("/chat/conversations", { title });
        set((s) => ({ conversations: [{ ...conv, messages: [] }, ...s.conversations] }));
        return conv;
      },

      sendMessage: async (
        conversationId: string,
        message: string,
        attachments: ChatAttachment[] = []
      ) => {
        set({ isSending: true });

        // Optimistic insert: show user message immediately
        const optimisticId = `opt-${crypto.randomUUID()}`;
        const optimisticMsg: ChatMsg = {
          id: optimisticId,
          conversation_id: conversationId,
          role: "user",
          content: message,
          run_id: null,
          attachments,
          created_at: new Date().toISOString(),
        };
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId
              ? { ...c, messages: [...c.messages, optimisticMsg], last_message: message.slice(0, 120) }
              : c
          ),
        }));

        try {
          interface SendRes {
            user_message: ChatMsg;
            assistant_message: ChatMsg;
          }
          const res = await api.post<SendRes>(`/chat/conversations/${conversationId}/messages`, {
            message,
            attachments,
          });

          // Replace optimistic message with real messages from server
          set((s) => ({
            conversations: s.conversations.map((c) =>
              c.id === conversationId
                ? {
                    ...c,
                    messages: [
                      ...c.messages.filter((m) => m.id !== optimisticId),
                      res.user_message,
                      res.assistant_message,
                    ],
                    last_message: message.slice(0, 120),
                    title: c.title === "New Conversation" ? message.slice(0, 60) : c.title,
                  }
                : c
            ),
            typingRunId: null,
          }));
          return { assistant_message: res.assistant_message };
        } finally {
          set({ isSending: false });
        }
      },

      deleteConversation: async (id: string) => {
        await api.delete(`/chat/conversations/${id}`);
        set((s) => ({
          conversations: s.conversations.filter((c) => c.id !== id),
          activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
        }));
      },

      setActiveConversation: (id: string | null) => set({ activeConversationId: id }),

      appendAssistantMessage: (conversationId: string, content: string, runId?: string) => {
        const msg: ChatMsg = {
          id: crypto.randomUUID(),
          conversation_id: conversationId,
          role: "assistant",
          content,
          run_id: runId ?? null,
          attachments: [],
          created_at: new Date().toISOString(),
        };
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === conversationId
              ? { ...c, messages: [...c.messages, msg], last_message: content.slice(0, 120) }
              : c
          ),
          typingRunId: null,
        }));
      },

      setTypingRunId: (runId: string | null) => set({ typingRunId: runId }),
    }), {
    name: "clawscholar-chat",
    partialize: (state: ChatState) => ({
      conversations: state.conversations,
      activeConversationId: state.activeConversationId,
    }),
  })
);
