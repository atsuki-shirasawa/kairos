// The shape of a section summary body: the prompt asks for it, and the drawer reads it back.

/**
 * Item labels of a summary body, per summary language. The prompt writes them; the UI finds them.
 * Outcome belongs to the older three-item format, which mixed what finished with what was left;
 * bodies written before the split still use it.
 */
export const SUMMARY_LABELS = {
  en: {
    goal: "Goal",
    done: "Done",
    resolved: "Resolved",
    open: "Open",
    next: "Next",
    outcome: "Outcome",
  },
  ja: {
    goal: "目的",
    done: "やったこと",
    resolved: "解決",
    open: "残課題",
    next: "次の一手",
    outcome: "結果",
  },
} as const;

/**
 * What kind of thing an open item is, written as a "[kind]" tag before it. The tags stay in English
 * in both languages, so the parser and the UI don't depend on the summary language.
 */
export const OPEN_KINDS = ["todo", "issue", "question", "waiting"] as const;
/** One of `OPEN_KINDS`: asked for but not finished, found but not handled, undecided, or blocked. */
export type OpenKind = (typeof OPEN_KINDS)[number];

/** Whether a value is one of `OPEN_KINDS`: a tag in a body, a stored kind, or a model's answer. */
export function isOpenKind(value: unknown): value is OpenKind {
  return (OPEN_KINDS as readonly unknown[]).includes(value);
}

/** One open item. The kind is null when the model left the tag out or wrote an unknown one. */
export interface OpenItem {
  kind: OpenKind | null;
  text: string;
}

/** A summary body split into its items, each still Markdown. */
export interface SummaryParts {
  goal: string;
  /** One entry per point of work; a Done written inline is a single entry. */
  done: string[];
  /** What got settled, each with its evidence. Empty when nothing was, or in an older body. */
  resolved: string[];
  /** What is left open. Empty when nothing is, or in an older body. */
  open: OpenItem[];
  /** What was about to happen next, the cue for resuming; null when not given. */
  next: string | null;
  /** An older body's single Outcome item; null in the current format. */
  outcome: string | null;
}

type Part = keyof typeof SUMMARY_LABELS.en;

/** A top-level item as read: the text after its label and the lines under it. */
type Item = { text: string; children: string[] };

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

/** What `formatSummaryBody` writes: a summary's items, without the older format's Outcome. */
export type BodyFields = Omit<SummaryParts, "outcome">;

/**
 * Writes the items as a body in the format `parseSummaryBody` reads, under the labels of the
 * summary's language: one line per item or point, the optional items left out when empty.
 */
export function formatSummaryBody(f: BodyFields, lang: keyof typeof SUMMARY_LABELS): string {
  const labels = SUMMARY_LABELS[lang];
  const nested = (label: string, points: string[]) =>
    points.length ? [`- ${label}:`, ...points.map((p) => `  - ${p}`)] : [];
  return [
    `- ${labels.goal}: ${f.goal}`,
    ...nested(labels.done, f.done),
    ...nested(labels.resolved, f.resolved),
    ...nested(
      labels.open,
      f.open.map((i) => (i.kind ? `[${i.kind}] ${i.text}` : i.text)),
    ),
    ...(f.next ? [`- ${labels.next}: ${f.next}`] : []),
  ].join("\n");
}

/**
 * Reads a body written to the summary prompt's format, current or older: Goal and Done, then any of
 * Resolved, Open, Next (or the older Outcome), each top-level item at most once. Returns null for
 * anything else (an even older format, a model that wandered off), so the caller can show the body
 * as plain Markdown instead of guessing at its structure.
 */
export function parseSummaryBody(body: string): SummaryParts | null {
  const items = new Map<Part, Item>();
  let current: Item | null = null;
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
  return partsOf(items);
}

/**
 * The items read into their shapes, or null when one can't be: Goal and Done must say something.
 * An optional item left empty reads as absent, so one sloppy line doesn't cost the structured view.
 */
function partsOf(items: Map<Part, Item>): SummaryParts | null {
  const goal = items.get("goal");
  const doneItem = items.get("done");
  const done = doneItem && pointsOf(doneItem);
  if (!goal || !done?.length) return null;
  const resolved = listOf(items.get("resolved"));
  const open = listOf(items.get("open"))?.map(openItem);
  const next = textOf(items.get("next"));
  const outcome = textOf(items.get("outcome"));
  if (!joinItem(goal) || !resolved || !open) return null;
  return { goal: joinItem(goal), done, resolved, open, next, outcome };
}

/**
 * An optional list item's points: none when it is absent, empty or says there is nothing; null
 * when its lines aren't a list.
 */
function listOf(item: Item | undefined): string[] | null {
  if (!item || saysNothing(item)) return [];
  return pointsOf(item);
}

/** An optional item's text: null when it is absent, empty or says there is nothing. */
function textOf(item: Item | undefined): string | null {
  return (item && !saysNothing(item) && joinItem(item)) || null;
}

/** "None" and the like, which the model writes for an item it was told to leave out. */
const NOTHING =
  /^(?:(?:none|nothing)(?: (?:pending|left|open|remaining|further))?(?: (?:in|for) this section)?|not (?:stated|recorded|mentioned|given)(?: in (?:the|this) (?:transcript|section))?|n\/a|-|なし|特になし|記載なし|無し|ありません|特にありません)[.。]?$/i;

/** Whether text only says there is nothing ("none", "なし"), standing in for an entry left out. */
export function saysNothingText(text: string): boolean {
  return NOTHING.test(text.trim());
}

/**
 * Whether an item holds only a "none", inline or as its one nested bullet, so it reads as absent
 * rather than as one point.
 */
function saysNothing(item: Item): boolean {
  return saysNothingText(joinItem(item).replace(/^[-*+]\s+/, ""));
}

/** An item's text with any lines under it (continuations, or a nested list in place of text). */
function joinItem(item: Item): string {
  const rest = item.children.filter((l) => l.trim());
  return [item.text, ...dedent(rest)].join("\n").trim();
}

/** A list item's points: its nested bullets, or its inline text as a single point. */
function pointsOf(item: Item): string[] | null {
  const rest = item.children.filter((l) => l.trim());
  if (rest.length === 0) return item.text ? [item.text] : [];
  const bullets = splitBullets(rest);
  if (!bullets) return null;
  return item.text ? [item.text, ...bullets] : bullets;
}

/** Open items already read, by body. Bodies change only when a summary is rewritten. */
const openCache = new Map<string, OpenItem[]>();
/** Past this many bodies the cache starts over, so it stays small over a long-open tab. */
const OPEN_CACHE_LIMIT = 2_000;

/**
 * A body's open items, none when it has none or isn't in the current format. The calendar asks
 * this of every block on every render and filter keystroke (its tooltip, the "left open" filter
 * and its count), so each body is parsed once.
 */
export function openItemsOf(body: string | null): OpenItem[] {
  if (!body) return [];
  const cached = openCache.get(body);
  if (cached) return cached;
  if (openCache.size >= OPEN_CACHE_LIMIT) openCache.clear();
  const items = parseSummaryBody(body)?.open ?? [];
  openCache.set(body, items);
  return items;
}

/**
 * A "[kind]" tag at the start of an open item, possibly bolded or in a full-width bracket. Not a
 * Markdown link's text: "[Issue](…)" is a link, and taking its text as a tag would break it.
 */
const KIND_TAG = /^\**[[［]\s*([A-Za-z]+)\s*[\]］](?!\()\**\s*/;

/** An open item's text split from its kind tag. An unknown tag stays in the text. */
function openItem(point: string): OpenItem {
  const tag = KIND_TAG.exec(point);
  const kind = (tag?.[1] ?? "").toLowerCase();
  if (!tag || !isOpenKind(kind)) return { kind: null, text: point };
  return { kind, text: point.slice(tag[0].length).trim() };
}
