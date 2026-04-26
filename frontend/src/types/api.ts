// Generic API response wrappers

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

// Auth
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    isActive: boolean;
    createdAt: string;
  };
}

// Research Goals
export interface ResearchGoalCreate {
  title: string;
  description?: string;
  deadline?: string;
}

export interface ResearchGoalResponse {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
}

// Workflow
export interface WorkflowRunResponse {
  id: string;
  goalId: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  agentStates: Record<string, unknown>;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

// Documents
export interface DocumentUploadResponse {
  id: string;
  filename: string;
  fileType: string;
  embeddingStatus: "PENDING" | "INDEXING" | "INDEXED" | "FAILED";
  chunkCount: number;
  createdAt: string;
}

// Agent Logs
export interface AgentLogResponse {
  id: string;
  runId: string;
  agentType: "SCHEDULER" | "ANALYST" | "LIBRARIAN" | "ORCHESTRATOR";
  action: string;
  inputData: Record<string, unknown> | null;
  outputData: Record<string, unknown> | null;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
}

// Validation
export interface ValidationResultResponse {
  id: string;
  runId: string;
  analystOutput: Record<string, unknown>;
  librarianVerdict: "APPROVED" | "REJECTED" | "PARTIAL";
  confidenceScore: number;
  evidenceSources: Array<{ text: string; source: string; score: number }>;
  rejectionReason: string | null;
  createdAt: string;
}
