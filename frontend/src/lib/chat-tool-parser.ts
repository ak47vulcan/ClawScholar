export type ToolHintType = "list_library_pdfs" | "summarize_pdf" | "create_calendar_event" | "list_calendar_events";

export interface ToolHint {
  type: ToolHintType;
  label: string;
}

export function parseToolHints(content: string): ToolHint[] {
  const hints: ToolHint[] = [];
  const lower = content.toLowerCase();

  if (
    (lower.includes("pdf") || lower.includes("bibliothek") || lower.includes("library") || lower.includes("dokument")) &&
    (lower.includes("gefunden") || lower.includes("liste") || lower.includes("gefunden") || lower.includes("here are") || lower.includes("found"))
  ) {
    hints.push({ type: "list_library_pdfs", label: "Library accessed" });
  }

  if (
    lower.includes("zusammenfassung") || lower.includes("zusammengefasst") ||
    lower.includes("summary") || lower.includes("summarized") || lower.includes("zusammenfasse")
  ) {
    hints.push({ type: "summarize_pdf", label: "PDF summarized" });
  }

  if (
    (lower.includes("termin") || lower.includes("event") || lower.includes("calendar")) &&
    (lower.includes("erstellt") || lower.includes("created") || lower.includes("scheduled") || lower.includes("hinzugefügt"))
  ) {
    hints.push({ type: "create_calendar_event", label: "Calendar event created" });
  }

  if (
    (lower.includes("kalender") || lower.includes("calendar") || lower.includes("schedule")) &&
    (lower.includes("ereignisse") || lower.includes("events") || lower.includes("termine") || lower.includes("einträge") || lower.includes("gefunden"))
  ) {
    if (!hints.some((h) => h.type === "create_calendar_event")) {
      hints.push({ type: "list_calendar_events", label: "Calendar checked" });
    }
  }

  return hints;
}
