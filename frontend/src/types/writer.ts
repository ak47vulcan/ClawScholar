export type WriterPhase =
  | "CLARIFYING"
  | "OUTLINING"
  | "VALIDATING"
  | "ALLOCATING"
  | "MAPPING_SOURCES"
  | "WRITING"
  | "ASSEMBLING"
  | "DONE"
  | "FAILED";

export type DocType = "paper" | "summary" | "article" | "draft";

export interface ClarifyQuestion {
  id: string;
  question: string;
  input_type: "text" | "choice" | "multiselect" | "scale";
  options?: string[];
  scale_min?: number;
  scale_max?: number;
  hint?: string;
  required?: boolean;
}

export interface Chapter {
  index: number;
  title: string;
  description: string;
  key_points: string[];
  target_pages: number;
}

export interface OutlineData {
  document_title: string;
  abstract: string;
  chapters: Chapter[];
  total_suggested_pages: number;
}

export interface ChapterCoverage {
  chapter_index: number;
  coverage_score: number;
  relevant_doc_ids: string[];
  relevant_filenames: string[];
  rationale?: string;
  missing_topics?: string[];
  suggested_queries?: string[];
  warning?: string | null;
}

export interface CoverageData {
  chapters: ChapterCoverage[];
  overall_score: number;
  status?: "SUFFICIENT" | "PARTIAL" | "INSUFFICIENT";
  summary?: string;
  missing_topics?: string[];
  suggested_queries?: string[];
  needs_sources?: boolean;
}

export interface WritingSection {
  id: string;
  chapter_index: number;
  title: string;
  target_pages: number;
  status: "PENDING" | "WRITING" | "DONE" | "FAILED";
  content_md?: string | null;
  sources_used?: Array<{ citation?: string; doc_id?: string; filename?: string }>;
}

export interface ChapterAllocation {
  chapter_index: number;
  target_pages: number;
}

export interface WriterSource {
  key: string;
  doc_id: string;
  filename: string;
  source_url?: string | null;
  authors?: string[];
  year?: number | null;
  doi?: string | null;
  score?: number;
  best_score?: number;
  fingerprint?: string;
  summary?: string | null;
  matched_chapters?: Array<{ chapter_index: number; title?: string; score?: number }>;
  excerpts?: string[];
}

export interface WriterSourcePlanItem {
  chapter_index: number;
  title: string;
  query: string;
  sources: WriterSource[];
  source_inventory?: WriterSource[];
}

export interface WriterRun {
  id: string;
  title: string;
  doc_type: DocType;
  project_id?: string | null;
  source_workflow_id?: string | null;
  target_pages?: number | null;
  status: WriterPhase;
  created_at: string;
  updated_at: string;
  questions?: ClarifyQuestion[] | null;
  outline?: OutlineData | null;
  coverage?: CoverageData | null;
  source_plan?: WriterSourcePlanItem[] | null;
  allocations?: ChapterAllocation[] | null;
  sections?: WritingSection[];
  full_markdown?: string | null;
  word_count?: number | null;
  page_estimate?: number | null;
  progress?: number;
  activity?: {
    step: string;
    detail: string;
    items?: Array<{ label: string; value: string }>;
  };
  source_search?: {
    status: "READY" | "RUNNING" | "DONE" | "FAILED";
    workflow_run_id?: string;
    goal_id?: string;
    project_id?: string;
    goal_title?: string;
    saved_count?: number;
    missing_topics?: string[];
    suggested_queries?: string[];
    message?: string;
  } | null;
  sourceSearchRecommended?: boolean;
  sourceSearchActive?: boolean;
}
