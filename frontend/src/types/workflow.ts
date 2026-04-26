import type { WorkflowStatus, AgentType } from "@/lib/constants";

export interface SubTask {
  id: string;
  title: string;
  agentAssigned: AgentType;
  priorityScore: number;
  estimatedMinutes: number;
  status: WorkflowStatus;
  dependsOn: string[];
}

export interface WorkflowRun {
  id: string;
  goalId: string;
  goalTitle: string;
  status: WorkflowStatus;
  iteration: number;
  maxIterations: number;
  subTasks: SubTask[];
  validationVerdict: "APPROVED" | "REJECTED" | "PARTIAL" | null;
  confidenceScore: number | null;
  startedAt: string | null;
  completedAt: string | null;
  agentStates: Record<AgentType, "IDLE" | "ACTIVE" | "WAITING" | "ERROR">;
}

export interface CognitiveLoadBreakdown {
  total: number;
  byAgent: Record<AgentType, number>;
  activeWorkflows: number;
  pendingWorkflows: number;
}

export interface DeepWorkBlock {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  taskIds: string[];
  cognitiveWeight: number;
}
