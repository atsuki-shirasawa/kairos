// How running sessions are shown: which ones want you, in what order, and for the tab title.
import type { LiveSession, LiveSpend, LiveUsage, Project } from "@shared/api.ts";

/**
 * After this long waiting for a prompt, a session is idle: left open rather than waiting on you.
 * The same gap that splits work blocks, so an idle session's next prompt starts a new block.
 */
export const IDLE_AFTER_MS = 15 * 60_000;

/** A running session's state as shown: the server's, with long waits turned idle. */
export type LiveDisplay = "asking" | "waiting" | "working" | "idle";

/** The page's columns: what wants an answer, what is running, and what was left open. */
export type LiveColumn = "attention" | "working" | "idle";

/** The page's columns, left to right. */
export const LIVE_COLUMNS: readonly LiveColumn[] = ["attention", "working", "idle"];

/** The column a state belongs in. */
export function columnOf(display: LiveDisplay): LiveColumn {
  return display === "asking" || display === "waiting" ? "attention" : display;
}

/** Display order: what wants an answer first, idle sessions last. */
const ORDER: Record<LiveDisplay, number> = { asking: 0, waiting: 1, working: 2, idle: 3 };

/** The session's state at `now`. */
export function liveDisplay(s: Pick<LiveSession, "state" | "since">, now: number): LiveDisplay {
  return s.state === "waiting" && now - s.since >= IDLE_AFTER_MS ? "idle" : s.state;
}

/**
 * Sessions to show, in display order (most recently changed first within a state), without those
 * of hidden projects, like the calendar.
 */
export function visibleLive(
  sessions: readonly LiveSession[],
  projects: ReadonlyMap<number, Project>,
  now: number,
): LiveSession[] {
  return sessions
    .filter((s) => s.projectId === null || !projects.get(s.projectId)?.hidden)
    .map((s) => ({ s, d: liveDisplay(s, now) }))
    .sort((a, b) => ORDER[a.d] - ORDER[b.d] || b.s.since - a.s.since)
    .map(({ s }) => s);
}

/** How many sessions want your answer: asking, or done with a turn and not idle yet. */
export function attentionCount(sessions: readonly LiveSession[], now: number): number {
  return sessions.filter((s) => columnOf(liveDisplay(s, now)) === "attention").length;
}

/** The tab title, led by the number of sessions that want you so it shows in a background tab. */
export function documentTitle(attention: number): string {
  return attention > 0 ? `(${attention}) Kairos` : "Kairos";
}

/** Last path segment of a directory, to name a session Kairos hasn't ingested yet. */
export function dirName(cwd: string): string {
  return cwd.replace(/\/+$/, "").split("/").at(-1) || cwd;
}

/**
 * A tool's name as shown: an MCP tool's `mcp__<server>__<tool>` becomes "server › tool", since the
 * raw name is an identifier rather than something to read. Other names are left as they are.
 */
export function toolLabel(name: string): string {
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  return m ? `${m[1]} › ${m[2]}` : name;
}

/**
 * From this share of the window on, the context gauge of a session waiting on you turns `warn`:
 * each request now rereads most of a full window, and Claude Code compacts it before long.
 */
export const CONTEXT_FULL_SHARE = 0.8;

/**
 * With this share of its TTL left on the cache of a session waiting on you, its countdown turns
 * `warn`: an answer now costs a cache read, one later rewrites the whole context. A share rather
 * than a time, so a 5-minute cache isn't in `warn` from the start (10 minutes of a 1-hour one).
 */
export const CACHE_WARN_SHARE = 1 / 6;

/** Share of the window the context fills, from 0 to 1. */
export function contextShare(tokens: number, window: number): number {
  return Math.min(Math.max(tokens / Math.max(window, 1), 0), 1);
}

/**
 * The main thread's prompt cache at `now`: how long it stays warm and whether that is nearly up
 * (`CACHE_WARN_SHARE` of its TTL), or expired. null when the session never wrote one.
 */
export function cacheState(
  usage: Pick<LiveUsage, "cacheExpiresAt" | "cacheTtlMs">,
  now: number,
): { warm: true; leftMs: number; soon: boolean } | { warm: false } | null {
  if (usage.cacheExpiresAt === null) return null;
  const leftMs = usage.cacheExpiresAt - now;
  if (leftMs <= 0) return { warm: false };
  return { warm: true, leftMs, soon: leftMs < (usage.cacheTtlMs ?? 0) * CACHE_WARN_SHARE };
}

/** A spend bar's segments, as fractions of the band's height (the tallest bar fills it). */
export interface SpendBar {
  /** Start of the bar's span. */
  start: number;
  total: number;
  segments: { projectId: number | null; usd: number; share: number }[];
}

/** The spend band's bars, each scaled against the tallest. */
export function spendBars(
  spend: Pick<LiveSpend, "from" | "buckets">,
  bucketMs: number,
): SpendBar[] {
  const totals = spend.buckets.map((b) => b.reduce((n, p) => n + p.usd, 0));
  const max = Math.max(...totals, 0);
  return spend.buckets.map((b, i) => ({
    start: spend.from + i * bucketMs,
    total: totals[i] ?? 0,
    segments: b.map((p) => ({ ...p, share: max > 0 ? p.usd / max : 0 })),
  }));
}
