"use client";

import { useRouter } from "next/navigation";
import { useProjectStore } from "@/stores/project-store";
import { useWriterStore } from "@/stores/writer-store";
import type { ProjectWorkflowWritingIntentResponse } from "@/types/project";

const WRITING_PATTERNS = [
  /\b(write|draft|compose|create|generate|prepare)\b.{0,60}\b(paper|article|draft|document|report|literature review)\b/i,
  /\b(paper|article|document|report|literature review)\b.{0,60}\b(write|draft|compose|create|generate|prepare)\b/i,
  /\b(schreib|schreibe|verfass|verfasse|erstelle|generiere|mach)\b.{0,60}\b(paper|artikel|bericht|dokument|literaturreview|review|arbeit)\b/i,
  /\b(paper|artikel|bericht|dokument|literaturreview|review|arbeit)\b.{0,60}\b(schreib|verfass|erstell|generier|mach)\b/i,
];

export function isWorkflowWritingRequest(text: string): boolean {
  return WRITING_PATTERNS.some((pattern) => pattern.test(text));
}

export function inferWorkflowDocType(text: string): "paper" | "summary" | "article" | "draft" {
  const lower = text.toLowerCase();
  if (/\b(article|artikel)\b/.test(lower)) return "article";
  if (/\b(draft|entwurf)\b/.test(lower)) return "draft";
  if (/\b(summary|zusammenfassung)\b/.test(lower)) return "summary";
  return "paper";
}

export function useWorkflowWritingIntent(projectId: string, workflowRunId?: string | null) {
  const router = useRouter();
  const queueWorkflowWritingIntent = useProjectStore((s) => s.queueWorkflowWritingIntent);

  return async (text: string): Promise<ProjectWorkflowWritingIntentResponse | null> => {
    if (!workflowRunId || !isWorkflowWritingRequest(text)) return null;
    const result = await queueWorkflowWritingIntent(projectId, workflowRunId, {
      initial_request: text,
      writing_mode: "manual",
      doc_type: inferWorkflowDocType(text),
      title_hint: text,
    });
    if (result.status === "created" && result.writer_run_id) {
      const writerStore = useWriterStore.getState();
      await writerStore.loadRun(result.writer_run_id).catch(() => null);
      writerStore.setActiveRun(result.writer_run_id);
      router.push(`/writer?run=${result.writer_run_id}`);
    }
    return result;
  };
}
