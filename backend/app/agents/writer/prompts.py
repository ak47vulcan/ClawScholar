from __future__ import annotations

import pathlib as _pathlib


def _load_skill(name: str) -> str:
    p = _pathlib.Path(__file__).parent.parent.parent / "skills" / name
    return p.read_text(encoding="utf-8") if p.exists() else ""


_SOUL = _load_skill("SOUL.md")
_WRITER_SKILL = _load_skill("WRITER_SKILL.md")

_BASE = (_SOUL + "\n\n" + _WRITER_SKILL + "\n\n").lstrip()


def build_clarify_prompt(doc_type: str, initial_request: str) -> str:
    return (
        _BASE
        + f"You are the ClawScholar Writer Agent preparing to compose a {doc_type}.\n\n"
        "Generate 4-6 targeted clarifying questions to gather everything needed before writing. "
        "Ask about audience, purpose, required style, and which aspects of the topic to emphasise. "
        "DO NOT ask about the target length, word count, or number of pages, as this will be configured by the user in a later step. "
        "Do NOT ask whether citations are needed; Writer documents must always cite assigned sources. "
        "Do NOT ask whether an abstract is needed; papers and articles receive a final abstract automatically during assembly. "
        "Make questions specific and actionable — not generic. "
        "Use diverse input types: text, choice, multiselect, scale as appropriate.\n\n"
        f"User's initial request: {initial_request}\n\n"
        "Return ONLY valid JSON matching the schema. No prose."
    )


def build_outline_prompt(doc_type: str, clarify_answers: str, library_context: str) -> str:
    return (
        _BASE
        + f"You are the ClawScholar Writer Agent generating a structured outline for a {doc_type}.\n\n"
        "Create a logical, well-structured table of contents with 4-8 chapters (fewer for short documents). "
        "Each chapter must be grounded in the available library sources listed below. "
        "Distribute content so that later chapters build on earlier ones. "
        "The `abstract` field is only a provisional planning abstract; the final abstract is written at assembly time after all sections are complete. "
        "Provide a sensible default for `target_pages` per chapter (the user will adjust this later).\n\n"
        f"User requirements:\n{clarify_answers}\n\n"
        f"Available library sources:\n{library_context}\n\n"
        "Return ONLY valid JSON matching the schema. No prose."
    )


def build_section_prompt(
    chapter_title: str,
    chapter_description: str,
    key_points: list[str],
    doc_type: str,
    target_pages: float,
    style_notes: str,
    retrieved_chunks: str,
    preceding_summary: str,
    citation_style: str = "APA",
) -> str:
    target_words = int(target_pages * 500)
    # Express the range clearly so the model doesn't under-produce
    word_min = int(target_words * 0.85)
    word_max = int(target_words * 1.15)
    key_pts = "\n".join(f"- {kp}" for kp in key_points) if key_points else "- Cover the topic thoroughly"
    preceding = (
        "\n\nPreviously written chapters for continuity. Build on them, avoid repeating their setup, "
        f"and keep terminology consistent:\n{preceding_summary}"
        if preceding_summary else ""
    )
    return (
        _BASE
        + f"You are writing a section of a {doc_type}. Write in an appropriate academic style.\n\n"
        f"Section: {chapter_title}\n"
        f"Description: {chapter_description}\n"
        f"Key points to cover:\n{key_pts}\n"
        f"REQUIRED length: {word_min}–{word_max} words ({target_pages:.1f} pages at 500 words/page). "
        f"You MUST write at least {word_min} words. Expand each point with full explanatory paragraphs, "
        f"concrete examples from the sources, analysis, and synthesis. "
        f"Do not produce a brief overview — write the full, detailed section.\n"
        f"Style notes: {style_notes}\n"
        f"Citation style: {citation_style}. Use the provided source keys exactly in inline citations. "
        "For APA/Harvard citations, write author-year plus the source key, e.g. (Smith, 2024) [S1]. "
        "For IEEE, use the source key directly, e.g. [S1]. "
        "Do not cite a source that is not listed in the source map. If a claim is unsupported, omit or hedge it. "
        "Never output internal coverage markers or bracketed diagnostic placeholders.\n"
        f"{preceding}\n\n"
        f"Assigned source map for this section:\n{retrieved_chunks}\n\n"
        "Write ONLY the section content in Markdown. Start directly with the prose — "
        "do not include the section heading. Every evidential paragraph should include inline citations, "
        "but avoid repeating the same citation mechanically when several adjacent sentences rely on the same source."
    )


def build_assembly_prompt(doc_type: str, all_sections_md: str, outline_title: str, style_notes: str) -> str:
    return (
        _BASE
        + f"You are assembling a complete {doc_type} titled \"{outline_title}\".\n\n"
        "You have all individual sections written. Your job is to:\n"
        "1. Add a proper document title as # Heading\n"
        "2. Write the final abstract now, after reading all completed sections, and place it directly after the title if this is a paper or article\n"
        "3. Ensure smooth transitions between sections\n"
        "4. Do not create a References/Bibliography section; the application appends verified references deterministically\n"
        "5. Ensure consistent terminology throughout\n"
        "6. Do NOT change the factual content of sections\n\n"
        f"Style notes: {style_notes}\n\n"
        f"Sections to assemble:\n\n{all_sections_md}\n\n"
        "Return ONLY valid JSON matching the schema."
    )
