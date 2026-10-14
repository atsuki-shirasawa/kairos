// Labels for token counts, costs, and model names.
import type { Activity, Usage } from "@shared/api.ts";
import { OPEN_KINDS, type OpenItem } from "@shared/summaryBody.ts";
import { getLocale } from "@/i18n/index.ts";
import { formatMessages } from "@/i18n/messages/format.ts";

/** 950 / 24.8k / 893k / 6.0M / 1.55B. Fits large numbers into a table cell ("1548.8M" is hard to read). */
export function tokensLabel(n: number): string {
  if (n < 1_000) return String(n);
  if (n < 100_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1_000)}k`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1_000_000_000).toFixed(2)}B`;
}

/** A context window: "1M" / "200k", without the decimal `tokensLabel` gives a count ("1.0M"). */
export function windowLabel(n: number): string {
  return n % 1_000_000 === 0 ? `${n / 1_000_000}M` : tokensLabel(n);
}

/** Plain number with the locale's digit grouping (1,234). */
export function numberLabel(n: number): string {
  return n.toLocaleString(getLocale() === "ja" ? "ja-JP" : "en-US");
}

/** $0.11 / $12.40 / $123. Anything under a cent is "<$0.01". */
export function costLabel(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return "<$0.01";
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd).toLocaleString("en-US")}`;
}

/** Cost with a leading "~" when part of the usage had no known price. */
export function approxCostLabel(u: Pick<Usage, "costUsd" | "unpriced">): string {
  return `${u.unpriced ? "~" : ""}${costLabel(u.costUsd)}`;
}

/** "$6.20/h": a rate of spend. */
export function costPerHourLabel(usd: number): string {
  return `${costLabel(usd)}/h`;
}

/** Model aliases `--model` accepts. Only these are capitalized; other names pass through. */
const MODEL_ALIASES = new Set(["haiku", "sonnet", "opus", "fable"]);

/**
 * `claude-opus-5-5` → `Opus 5.5`, `claude-haiku-4-5-20251001` → `Haiku 4.5`, and an alias such as
 * `haiku` → `Haiku` (lowercase, it reads as the poem). Unknown shapes pass through.
 */
export function modelLabel(model: string): string {
  if (MODEL_ALIASES.has(model)) return `${model[0]?.toUpperCase()}${model.slice(1)}`;
  const m = /^claude-([a-z]+)-(\d+(?:-\d+)?)(?:-\d{8})?$/.exec(model);
  if (!m?.[1] || !m[2]) return model;
  return `${m[1][0]?.toUpperCase()}${m[1].slice(1)} ${m[2].replace("-", ".")}`;
}

/** Share of input read from the cache (0–1), or null when there was no input. */
export function cacheRate(u: Pick<Usage, "input" | "cacheRead" | "cacheWrite">): number | null {
  const total = u.input + u.cacheRead + u.cacheWrite;
  return total > 0 ? u.cacheRead / total : null;
}

/** Sums usage (per day or period). Totals never show a model, so it is dropped. */
export function sumUsage(list: (Usage | null)[]): Usage | null {
  const used = list.filter((u): u is Usage => u !== null);
  if (used.length === 0) return null;
  return used.reduce((a, b) => ({
    tokens: a.tokens + b.tokens,
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    costUsd: a.costUsd + b.costUsd,
    unpriced: a.unpriced || b.unpriced,
    model: null,
  }));
}

/**
 * A block's open items as one tooltip line: how many, then their kinds in `OPEN_KINDS` order.
 * Null when there are none.
 */
export function openItemsLine(items: OpenItem[]): string | null {
  if (items.length === 0) return null;
  const m = formatMessages();
  const kinds = OPEN_KINDS.filter((k) => items.some((i) => i.kind === k)).map((k) => m.openKind[k]);
  return m.openItems(items.length, kinds.join(m.separator));
}

/** Number of snags: tool errors, interrupts, and API errors. */
export function troubleCount(a: Activity): number {
  return a.toolErrors + a.interrupts + a.apiErrors;
}

/** Breakdown of snags, leaving out the zeros. */
export function troubleDetail(a: Activity): string {
  const m = formatMessages();
  return (
    [
      a.toolErrors && m.toolErrors(a.toolErrors),
      a.interrupts && m.interrupts(a.interrupts),
      a.apiErrors && m.apiErrors(a.apiErrors),
    ]
      .filter(Boolean)
      .join(m.separator) || m.none
  );
}

/**
 * Sums activity (per day or period). Edited files become a running count (the same file can repeat).
 * Claude's time adds only the entries that recorded it (null if none did). Totals never show effort.
 */
export function sumActivity(list: (Activity | null)[]): Activity | null {
  const used = list.filter((a): a is Activity => a !== null);
  if (used.length === 0) return null;
  const withTurns = used.filter((a) => a.claudeMs !== null);
  return {
    commits: used.reduce((n, a) => n + a.commits, 0),
    prs: used.reduce((n, a) => n + a.prs, 0),
    merges: used.reduce((n, a) => n + a.merges, 0),
    filesEdited: used.reduce((n, a) => n + a.filesEdited, 0),
    toolCalls: used.reduce((n, a) => n + a.toolCalls, 0),
    subagents: used.reduce((n, a) => n + a.subagents, 0),
    toolErrors: used.reduce((n, a) => n + a.toolErrors, 0),
    interrupts: used.reduce((n, a) => n + a.interrupts, 0),
    apiErrors: used.reduce((n, a) => n + a.apiErrors, 0),
    compactions: used.reduce((n, a) => n + a.compactions, 0),
    claudeMs: withTurns.length ? withTurns.reduce((n, a) => n + (a.claudeMs ?? 0), 0) : null,
    effort: null,
  };
}

/**
 * The items with the separator between them. A line wraps only at a separator, and only after its
 * dot: a non-breaking space before it keeps " · " from starting a line.
 */
export function interleave<T>(items: T[], separator: string): (T | string)[] {
  const glued = separator.replace(/^ /, "\u00a0");
  return items.flatMap((item, i) => (i === 0 ? [item] : [glued, item]));
}
