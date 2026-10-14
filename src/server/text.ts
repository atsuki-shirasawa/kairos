// Text helpers shared by the server features that quote log text in a line (facts, tasks, the
// live page).

/** Default cap for `oneLine`: enough for a task subject or a command, short of a paragraph. */
const LINE_CHARS = 160;

/** Text on one line, whitespace collapsed, cut to `limit` characters with an ellipsis. */
export function oneLine(text: string, limit = LINE_CHARS): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= limit ? t : `${t.slice(0, limit)}…`;
}
