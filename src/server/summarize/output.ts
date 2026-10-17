// The answer a section summary asks the model for: the JSON schema `claude -p` holds it to, reading
// it back (the schema shapes the answer, but it still comes from the model), and rendering it as
// the Markdown body the drawer and the ledger read. Free Markdown let the model write a headline
// that talked about the task, or a body no parser could read.
import {
  formatSummaryBody,
  isOpenKind,
  OPEN_KINDS,
  type OpenItem,
  saysNothingText,
} from "../../shared/summaryBody.ts";
import type { SummaryLang } from "../../shared/summaryLang.ts";
import { asRecord } from "../json.ts";
import { oneLine } from "../text.ts";

/** Cap on the evidence the model gives for closing an earlier item. */
const NOTE_CHARS = 300;
/** Cap on a headline, as the calendar has room for it. */
const HEADLINE_CHARS = 80;
/** Cap on the short title: a few words, with room for a ticket number. */
const SHORT_CHARS = 40;
/** Cap on any other entry: a point is a line, and a runaway answer shouldn't bloat every response. */
const ENTRY_CHARS = 300;
/** Cap on a list's entries, well past what the prompt asks for (up to 5 points of work). */
const MAX_ENTRIES = 10;

/**
 * The most open items a summary keeps, the most important first. About 50 were written a day and
 * few were closed, so a longer list buried the ones that mattered. The prompt states it, and
 * `readSummary` keeps the first ones when the model writes more.
 */
export const MAX_OPEN = 3;

/** An earlier item the model said the section settled, by its label, with the evidence it gave. */
export interface Closure {
  label: string;
  note: string;
}

/** A section's titles: the headline and the short form a week block has room for. */
export interface TitleAnswer {
  headline: string;
  /** Null when the model left it empty. */
  short: string | null;
}

/** A full summary as the model answered it, checked and trimmed. */
export interface SummaryAnswer extends TitleAnswer {
  goal: string;
  done: string[];
  resolved: { text: string; evidence: string }[];
  open: OpenItem[];
  next: string | null;
  closed: Closure[];
}

const text = { type: "string" } as const;
const list = (items: object) => ({ type: "array", items }) as const;
const record = (fields: Record<string, object>, optional: string[] = []) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(fields).filter((f) => !optional.includes(f)),
  properties: fields,
});

/** The schema for a headline-only answer (short sections). */
export const TITLE_SCHEMA = record({ headline: text, short: text });

/** The schema for a full summary. `next` is left out when no step was about to happen. */
export const SUMMARY_SCHEMA = record(
  {
    headline: text,
    short: text,
    goal: text,
    done: { ...list(text), minItems: 1 },
    resolved: list(record({ text, evidence: text })),
    open: list(record({ kind: { enum: [...OPEN_KINDS] }, text })),
    next: text,
    closed: list(record({ label: text, evidence: text })),
  },
  ["next"],
);

/**
 * A field's text on one line, cut to `limit`, or "" when it isn't text or only says there is
 * nothing ("None", "なし"), so a placeholder never becomes an item. Lines in the body hold one
 * point each, so the model can't add items or labels of its own.
 */
function line(value: unknown, limit = ENTRY_CHARS): string {
  const text = typeof value === "string" ? oneLine(value, limit) : "";
  return saysNothingText(text) ? "" : text;
}

/** The labels a closure names: "O1", "[O1]", "o1." or "O1, O3", each as the prompt wrote it. */
function labelsIn(label: string): string[] {
  return [...label.matchAll(/\bO(\d+)\b/gi)].map((m) => `O${m[1]}`);
}

/** A list field's first entries; none when it isn't a list. */
function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value.slice(0, MAX_ENTRIES) : [];
}

/** A list field's entries that are objects, for reading their own fields. */
function entries(value: unknown): Record<string, unknown>[] {
  return listOf(value)
    .map(asRecord)
    .filter((v) => v !== null);
}

/** A headline-only answer, or null when it has no headline. */
export function readTitle(value: unknown): TitleAnswer | null {
  const o = asRecord(value);
  const headline = line(o?.headline, HEADLINE_CHARS);
  if (!o || !headline) return null;
  return { headline, short: line(o.short, SHORT_CHARS) || null };
}

/**
 * A full summary, or null when it lacks what every summary has: a headline, a goal and at least
 * one point of work. Entries left empty are dropped rather than costing the whole summary.
 */
export function readSummary(value: unknown): SummaryAnswer | null {
  const title = readTitle(value);
  const o = asRecord(value);
  if (!title || !o) return null;
  const goal = line(o.goal);
  const done = listOf(o.done)
    .map((d) => line(d))
    .filter(Boolean);
  if (!goal || done.length === 0) return null;
  return {
    ...title,
    goal,
    done,
    resolved: entries(o.resolved)
      .map((r) => ({ text: line(r.text), evidence: line(r.evidence) }))
      .filter((r) => r.text),
    open: entries(o.open)
      .map((i) => ({ kind: isOpenKind(i.kind) ? i.kind : null, text: line(i.text) }))
      .filter((i) => i.text)
      .slice(0, MAX_OPEN),
    next: line(o.next) || null,
    closed: entries(o.closed).flatMap((c) =>
      labelsIn(line(c.label)).map((label) => ({ label, note: line(c.evidence, NOTE_CHARS) })),
    ),
  };
}

/**
 * The summary as the Markdown body that has always been stored, in the labels of its language, so
 * the drawer, search and the ledger read old and new summaries alike. A resolved item's evidence
 * follows its text, as the free-Markdown summaries wrote it.
 */
export function renderBody(s: SummaryAnswer, lang: SummaryLang): string {
  return formatSummaryBody(
    {
      goal: s.goal,
      done: s.done,
      resolved: s.resolved.map((r) => (r.evidence ? `${r.text}: ${r.evidence}` : r.text)),
      open: s.open,
      next: s.next,
    },
    lang,
  );
}
