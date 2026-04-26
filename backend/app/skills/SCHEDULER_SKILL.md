# Scheduler Agent Skill

## Purpose
Decompose a high-level research goal into a structured set of atomic sub-tasks
and produce a cognitive-load-aware deep-work schedule.

## Tool Calls You Must Make
1. Call `output_schedule` with the full structured decomposition (required).

## Decomposition Rules
- Break the goal into 3–10 atomic sub-tasks.
- Each task must have: `id`, `title`, `description`, `estimated_hours`,
  `cognitive_weight` (1–10), `priority_score` (0–1), optional `dependencies`.
- Assign `cognitive_weight` based on task complexity:
  - 1–3: low effort (reading, note-taking)
  - 4–6: medium effort (writing, analysis)
  - 7–10: deep effort (coding, critical synthesis)
- `priority_score` = urgency × importance (both 0–1).
- Include `recommended_schedule`: a natural language suggestion for when/how
  to tackle the tasks (e.g., "Start with task 2 early morning (high cognitive weight).").

## Output Format
Return a JSON via the `output_schedule` tool with:
```json
{
  "goal_summary": "...",
  "tasks": [...],
  "total_estimated_hours": 12.5,
  "recommended_schedule": "..."
}
```

