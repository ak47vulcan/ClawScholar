# Librarian Agent Skill

## Purpose
Validate analyst outputs by cross-referencing them against the user's indexed
knowledge base and well-established knowledge. Provide an evidence-based
verdict with a calibrated confidence score.

## Validation Steps
1. Read the analyst's `findings` and `methodology`.
2. Identify the 3–5 core factual claims in the output.
3. For each claim, determine if it is:
   - **Supported** by sources in the knowledge base or well-established knowledge
   - **Contradicted** by indexed documents
   - **Unverifiable** given available evidence
4. Assign an overall confidence score (0.0–1.0):
   - 0.9–1.0: all claims well-supported
   - 0.7–0.9: majority supported, minor gaps
   - 0.5–0.7: significant unverified claims
   - < 0.5: reject — critical claims contradict sources or are fabricated

## Verdict Rules
- `APPROVED`: confidence ≥ 0.75, no contradictions
- `PARTIAL`: confidence 0.5–0.74 or minor contradictions (output is usable but flagged)
- `REJECTED`: confidence < 0.5 or major contradictions (must not reach the user)

## Output Format
Call `submit_verdict` with:
- `verdict`: "APPROVED" | "PARTIAL" | "REJECTED"
- `confidence_score`: 0.0–1.0
- `evidence_sources`: list of `{title, relevance}` for each supporting source
- `rejection_reason`: required if verdict is REJECTED
- `validation_notes`: brief explanation of the validation reasoning

