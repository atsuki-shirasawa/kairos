// The shape of a section summary body: the prompt asks for it, and the drawer reads it back.

/** Item labels of a summary body, per summary language. The prompt writes them; the UI finds them. */
export const SUMMARY_LABELS = {
  en: { goal: "Goal", done: "Done", outcome: "Outcome" },
  ja: { goal: "目的", done: "やったこと", outcome: "結果" },
} as const;

/** A summary body split into its three items, each still Markdown. */
export interface SummaryParts {
  goal: string;
  outcome: string;
  /** One entry per point of work; a Done written inline is a single entry. */
  done: string[];
}

type Part = keyof typeof SUMMARY_LABELS.en;

/**
 * Which item a label names. Both languages are recognized in either UI language: a summary keeps
 * the language it was written in until it is regenerated.
 */
const PART_OF_LABEL = new Map<string, Part>(
  Object.values(SUMMARY_LABELS).flatMap((labels) =>
    Object.entries(labels).map(([part, label]) => [label.toLowerCase(), part as Part]),
  ),
);

/** A top-level item "- Label: text". The model sometimes bolds the label or uses a full-width colon. */
const ITEM_LINE = /^[-*+]\s+\**([^:：*]+?)\**\s*[:：]\s*\**\s*(.*)$/;

/**
 * The body's lines with CRLF endings and tab indents normalized, so indentation can be compared
 * by length: a tab counted as one column would leave a space-indented sibling bullet nested.
 */
function linesOf(body: string): string[] {
  return body
    .trim()
    .split(/\r?\n/)
    .map((l) => l.replace(/^[ \t]+/, (indent) => indent.replaceAll("\t", "  ")));
}

/**
 * An item's text without the closing "**" of a line bolded whole ("- **Goal: text**"). Only an
 * unpaired one is dropped, so text that ends in its own bold phrase keeps it.
 */
function unbold(text: string): string {
  const pairs = text.split("**").length - 1;
  return (pairs % 2 === 1 ? text.replace(/\*\*$/, "") : text).trim();
}

/** Lines indented under an item, dedented by the item's own nesting so they read as a list again. */
function dedent(lines: string[]): string[] {
  const indents = lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)?.[0].length ?? 0);
  const cut = Math.min(...indents);
  return lines.map((l) => l.slice(cut));
}

/** Splits nested list lines into one entry per bullet, keeping each bullet's continuation lines. */
function splitBullets(lines: string[]): string[] | null {
  const entries: string[][] = [];
  for (const line of dedent(lines)) {
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (bullet) entries.push([bullet[1] ?? ""]);
    else if (entries.length > 0) entries.at(-1)?.push(line);
    else return null;
  }
  return entries.map((e) => e.join("\n").trim()).filter(Boolean);
}

/**
 * Reads a body written to the summary prompt's format: exactly the three top-level items, each
 * once. Returns null for anything else (an older format, a model that wandered off), so the caller
 * can show the body as plain Markdown instead of guessing at its structure.
 */
export function parseSummaryBody(body: string): SummaryParts | null {
  const items = new Map<Part, { text: string; children: string[] }>();
  let current: { text: string; children: string[] } | null = null;
  let preamble = 0;
  for (const line of linesOf(body)) {
    const item = ITEM_LINE.exec(line);
    const part = item && PART_OF_LABEL.get((item[1] ?? "").trim().toLowerCase());
    if (part) {
      if (items.has(part)) return null;
      current = { text: unbold(item[2] ?? ""), children: [] };
      items.set(part, current);
    } else if (current && (line.trim() === "" || /^\s/.test(line))) {
      current.children.push(line);
    } else if (current !== null || /^\s*[-*+]\s/.test(line)) {
      return null;
    } else if (line.trim() && ++preamble > 1) {
      // One line before the items is the headline repeated (as a heading or with a "Headline:"
      // label), which the drawer already shows. More than that is content of its own, which a
      // structured view would drop
      return null;
    }
  }
  const goal = items.get("goal");
  const done = items.get("done");
  const outcome = items.get("outcome");
  if (!goal || !done || !outcome) return null;
  const parts = { goal: joinItem(goal), outcome: joinItem(outcome), done: doneItems(done) };
  return parts.goal && parts.outcome && parts.done?.length ? (parts as SummaryParts) : null;
}

/** An item's text with any lines under it (continuations, or a nested list in place of text). */
function joinItem(item: { text: string; children: string[] }): string {
  const rest = item.children.filter((l) => l.trim());
  return [item.text, ...dedent(rest)].join("\n").trim();
}

/** Done's points: its nested bullets, or its inline text as a single point. */
function doneItems(item: { text: string; children: string[] }): string[] | null {
  const rest = item.children.filter((l) => l.trim());
  if (rest.length === 0) return item.text ? [item.text] : [];
  const bullets = splitBullets(rest);
  if (!bullets) return null;
  return item.text ? [item.text, ...bullets] : bullets;
}
