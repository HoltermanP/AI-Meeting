import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

/** AI levert Markdown; na bewerken in TipTap is het HTML. */
export function notesToHtml(content: string): string {
  if (!content?.trim()) return "<p></p>";
  const t = content.trim();
  if (t.startsWith("<")) return content;
  return marked.parse(content) as string;
}

/** Alleen notities — gelijk aan scherm/PDF; geen extra titel, datum of actielijst. */
export function buildNotesOnlyExportHtml(notesHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /></head>
<body style="font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.5; color: #111;">
<div class="notes-body">${notesHtml || "<p></p>"}</div>
</body></html>`;
}

/** @deprecated Gebruik buildNotesOnlyExportHtml als het verslag al volledige structuur bevat. */
export function buildExportBodyHtml(opts: {
  title: string;
  dateLabel: string;
  notesHtml: string;
  actionItems: { title: string; completed: boolean; assignee?: string | null }[];
}): string {
  return buildNotesOnlyExportHtml(opts.notesHtml);
}
