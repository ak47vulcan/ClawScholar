import type { AgentLogEntry, WorkflowCard, DocumentItem } from "@/types/agent";

export const MOCK_AGENT_LOGS: AgentLogEntry[] = [
  { id: "1", runId: "run-001", agentType: "ORCHESTRATOR", action: "ROUTE", message: "Analyzing goal: Analyze publication trends in ML 2024", timestamp: new Date(Date.now() - 120000).toISOString(), durationMs: 145, isExpanded: false },
  { id: "2", runId: "run-001", agentType: "SCHEDULER", action: "DECOMPOSE", message: "Breaking goal into sub-tasks", timestamp: new Date(Date.now() - 110000).toISOString(), durationMs: 892, isExpanded: false },
  { id: "3", runId: "run-001", agentType: "SCHEDULER", action: "COMPLETE", message: "Decomposed into 7 tasks (28.5h estimated)", timestamp: new Date(Date.now() - 109000).toISOString(), durationMs: 1203, isExpanded: false },
  { id: "4", runId: "run-002", agentType: "ANALYST", action: "ANALYZE", message: "Running data analysis on arxiv_2024.csv", timestamp: new Date(Date.now() - 80000).toISOString(), durationMs: 3200, isExpanded: false },
  { id: "5", runId: "run-002", agentType: "ANALYST", action: "COMPLETE", message: "Analysis complete — 4,832 papers processed, 12 clusters identified", timestamp: new Date(Date.now() - 76000).toISOString(), durationMs: 4100, isExpanded: false },
  { id: "6", runId: "run-002", agentType: "LIBRARIAN", action: "VALIDATE", message: "Validating analyst output against 23 indexed sources", timestamp: new Date(Date.now() - 60000).toISOString(), durationMs: 1800, isExpanded: false },
  { id: "7", runId: "run-002", agentType: "LIBRARIAN", action: "VERDICT", message: "Verdict: APPROVED (confidence: 0.87)", timestamp: new Date(Date.now() - 58000).toISOString(), durationMs: 2100, isExpanded: false },
  { id: "8", runId: "run-003", agentType: "ANALYST", action: "ANALYZE", message: "Generating visualization: LLM benchmark evolution 2020–2024", timestamp: new Date(Date.now() - 30000).toISOString(), durationMs: undefined, isExpanded: false },
  { id: "9", runId: "run-003", agentType: "ORCHESTRATOR", action: "ROUTE", message: "New research goal received: Write literature review on RAG", timestamp: new Date(Date.now() - 10000).toISOString(), durationMs: undefined, isExpanded: false },
];

export const MOCK_WORKFLOWS: WorkflowCard[] = [
  { id: "run-001", goalTitle: "Publication Trend Analysis ML 2024", status: "COMPLETED", agentAssigned: "SCHEDULER", progress: 100, startedAt: new Date(Date.now() - 120000).toISOString(), cognitiveWeight: 3 },
  { id: "run-002", goalTitle: "Arxiv Dataset Deep Dive", status: "COMPLETED", agentAssigned: "ANALYST", progress: 100, startedAt: new Date(Date.now() - 80000).toISOString(), cognitiveWeight: 7 },
  { id: "run-003", goalTitle: "LLM Benchmark Visualization", status: "RUNNING", agentAssigned: "ANALYST", progress: 60, startedAt: new Date(Date.now() - 30000).toISOString(), cognitiveWeight: 6 },
  { id: "run-004", goalTitle: "Literature Review: RAG Systems", status: "PENDING", agentAssigned: "ORCHESTRATOR", progress: 0, startedAt: null, cognitiveWeight: 9 },
  { id: "run-005", goalTitle: "Citation Network Analysis", status: "PENDING", agentAssigned: "ORCHESTRATOR", progress: 0, startedAt: null, cognitiveWeight: 5 },
];

export const MOCK_DOCUMENTS: DocumentItem[] = [
  { id: "doc-001", filename: "arxiv_papers_2024.csv", fileType: "CSV", embeddingStatus: "INDEXED", chunkCount: 847, createdAt: new Date(Date.now() - 86400000 * 3).toISOString() },
  { id: "doc-002", filename: "llm_benchmarks_survey.pdf", fileType: "PDF", embeddingStatus: "INDEXED", chunkCount: 312, createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: "doc-003", filename: "attention_is_all_you_need.pdf", fileType: "PDF", embeddingStatus: "INDEXED", chunkCount: 198, createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: "doc-004", filename: "rag_evaluation_data.xlsx", fileType: "XLSX", embeddingStatus: "PENDING", chunkCount: 0, createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: "doc-005", filename: "research_notes.txt", fileType: "TXT", embeddingStatus: "FAILED", chunkCount: 0, createdAt: new Date(Date.now() - 1800000).toISOString() },
];

export const MOCK_CODE = `import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

# Load dataset
df = pd.read_csv('arxiv_2024.csv')
df['year'] = pd.to_datetime(df['submitted']).dt.year

# Count papers by category
category_counts = df.groupby(['year', 'category']).size().reset_index(name='count')

# Top 10 categories
top_categories = df['category'].value_counts().head(10).index.tolist()
filtered = category_counts[category_counts['category'].isin(top_categories)]

# Visualization
fig, ax = plt.subplots(figsize=(12, 6))
for cat in top_categories:
    data = filtered[filtered['category'] == cat]
    ax.plot(data['year'], data['count'], marker='o', label=cat, linewidth=2)

ax.set_title('ArXiv Paper Count by Category (2020-2024)', fontsize=14, fontweight='bold')
ax.set_xlabel('Year')
ax.set_ylabel('Number of Papers')
ax.legend(bbox_to_anchor=(1.05, 1), loc='upper left')
ax.grid(alpha=0.3)
plt.tight_layout()
plt.savefig('trends.png')

print(f"Total papers analyzed: {len(df):,}")
print(f"Top category: {df['category'].value_counts().index[0]}")
print(f"Growth rate 2023→2024: +{((df[df.year==2024].shape[0] / df[df.year==2023].shape[0]) - 1) * 100:.1f}%")`;

export const MOCK_COGNITIVE_LOAD = 65;
