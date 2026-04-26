"use client";

import { WorkflowFloatingChatPanel } from "./WorkflowFloatingChatPanel";
import { useWorkflowRefinementChat } from "@/hooks/use-workflow-refinement-chat";

interface WorkflowRefinementChatProps {
  projectId: string;
  workflowRunId?: string | null;
  goalTitle?: string;
  onWorkflowStarted: (runId: string, goalTitle?: string) => void;
}

export function WorkflowRefinementChat(props: WorkflowRefinementChatProps) {
  const chat = useWorkflowRefinementChat(props);

  return <WorkflowFloatingChatPanel goalTitle={props.goalTitle} chat={chat} />;
}
