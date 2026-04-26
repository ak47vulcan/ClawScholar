export interface Project {
  id: string;
  title: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  created_at: string;
  updated_at: string;
  workflow_count: number;
  last_run_at: string | null;
  last_run_status: string | null;
}

export interface ProjectWorkflowItem {
  id: string;
  goal_id: string;
  goal_title: string;
  goal_description: string | null;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface ProjectDetail extends Project {
  workflows: ProjectWorkflowItem[];
}

export interface ClarifyQuestion {
  id: string;
  text: string;
  context: string;
}

export interface ClarifyResponse {
  questions: ClarifyQuestion[];
}

export interface ProjectWorkflowStartPayload {
  task_description: string;
  answers: Record<string, boolean>;
  writing_mode?: "manual" | "auto";
  doc_type?: string;
  writing_title_hint?: string;
}

export interface ProjectWorkflowWritingIntentPayload {
  initial_request: string;
  writing_mode?: "manual" | "auto";
  doc_type?: string;
  title_hint?: string;
}

export interface ProjectWorkflowWritingIntentResponse {
  status: "queued" | "created";
  run_id: string;
  writer_run_id?: string;
  message: string;
}
