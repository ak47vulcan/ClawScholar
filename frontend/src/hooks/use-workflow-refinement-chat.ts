"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentStore } from "@/stores/agent-store";
import { useProjectStore } from "@/stores/project-store";
import { useWorkflowWritingIntent } from "@/hooks/use-workflow-writing-intent";
import { api } from "@/lib/api-client";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isLoading?: boolean;
}

interface UseWorkflowRefinementChatProps {
  projectId: string;
  workflowRunId?: string | null;
  goalTitle?: string;
  onWorkflowStarted: (runId: string, goalTitle?: string) => void;
}

export function useWorkflowRefinementChat({ projectId, workflowRunId, goalTitle, onWorkflowStarted }: UseWorkflowRefinementChatProps) {
  const { startProjectWorkflow } = useProjectStore();
  const { clearLogs, setActiveRunId, setStreaming } = useAgentStore();
  const queueWritingIntent = useWorkflowWritingIntent(projectId, workflowRunId);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isStartingWorkflow, setIsStartingWorkflow] = useState(false);
  const conversationRef = useRef<{ id: string } | null>(null);
  const prevProjectId = useRef<string | null>(null);

  useEffect(() => {
    if (prevProjectId.current !== projectId) {
      prevProjectId.current = projectId;
      conversationRef.current = null;
      setMessages([]);
      setInput("");
      setShowSuggestions(false);
    }
  }, [projectId]);

  const ensureConversation = async (): Promise<string> => {
    if (conversationRef.current) return conversationRef.current.id;

    const title = goalTitle ? `Refinement: ${goalTitle}` : "Workflow Refinement";
    const conv = await api.post<{ id: string }>("/chat/conversations", {
      title,
      goal_id: null,
    });
    conversationRef.current = { id: conv.id };
    return conv.id;
  };

  const appendAssistantError = useCallback((content: string) => {
    setMessages((prev) =>
      prev
        .filter((m) => !m.isLoading)
        .concat({
          id: crypto.randomUUID(),
          role: "assistant",
          content,
          timestamp: new Date().toISOString(),
        })
    );
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;

    const text = input.trim();
    const isFirstMessage = messages.length === 0;
    setInput("");
    setShowSuggestions(false);
    setIsOpen(true);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    const loadingMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setIsSending(true);

    try {
      const queuedWriting = await queueWritingIntent(text);
      if (queuedWriting) {
        setMessages((prev) =>
          prev.filter((m) => !m.isLoading).concat({
            id: crypto.randomUUID(),
            role: "assistant",
            content: queuedWriting.message,
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      const convId = await ensureConversation();
      const context = `[Context: project_id=${projectId}${
        workflowRunId ? `, current_run_id=${workflowRunId}` : ""
      }]`;
      const message = isFirstMessage ? `${context}\n\n${text}` : text;

      const resp = await api.post<{
        assistant_message: { id: string; content: string; created_at: string };
      }>(`/chat/conversations/${convId}/messages`, {
        message,
        attachments: [],
      });

      setMessages((prev) =>
        prev.filter((m) => !m.isLoading).concat({
          id: resp.assistant_message.id,
          role: "assistant",
          content: resp.assistant_message.content,
          timestamp: resp.assistant_message.created_at,
        })
      );
    } catch {
      appendAssistantError("Sorry, something went wrong. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleStartWorkflow = async (description?: string) => {
    const text = description ?? input.trim();
    if (!text || isStartingWorkflow) return;

    if (!description) setInput("");
    setShowSuggestions(false);
    setIsOpen(true);
    setIsStartingWorkflow(true);

    try {
      const result = await startProjectWorkflow(projectId, {
        task_description: text,
        answers: {},
      });
      clearLogs();
      setActiveRunId(result.run_id);
      setStreaming(true);
      onWorkflowStarted(result.run_id, text);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `New workflow started for: "${text}". Watch the Agent Pipeline for live progress.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch {
      appendAssistantError("I could not start that workflow. Please try again.");
    } finally {
      setIsStartingWorkflow(false);
    }
  };

  const clearHistory = () => {
    conversationRef.current = null;
    setMessages([]);
  };

  return {
    messages,
    input,
    setInput,
    isOpen,
    setIsOpen,
    isSending,
    showSuggestions,
    setShowSuggestions,
    isStartingWorkflow,
    handleSend,
    handleStartWorkflow,
    clearHistory,
  };
}

export type WorkflowRefinementChatState = ReturnType<typeof useWorkflowRefinementChat>;
