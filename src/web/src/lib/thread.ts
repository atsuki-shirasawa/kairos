// What a thread's page reads off the thread: what the work was for, the days it ran on, and how
// its items stand. Pure, so the page only renders.
import type { CalendarSession, LedgerEntry, ThreadLink } from "@shared/api.ts";
import { startOfDay } from "@shared/dates.ts";
import { parseSummaryBody } from "@shared/summaryBody.ts";
import { threadMessages } from "@/i18n/messages/thread.ts";
import { dateLabel } from "./dates.ts";
import { overlaps } from "./dayBlocks.ts";

/**
 * What the thread set out to do: the Goal of its earliest summarized block. Null while none is
 * summarized, or when no summary is in the format that has a Goal.
 */
export function threadGoal(sessions: readonly CalendarSession[]): string | null {
  const blocks = sessions.flatMap((s) => s.segments).sort((a, b) => a.start - b.start);
  for (const block of blocks) {
    const goal = block.body ? parseSummaryBody(block.body)?.goal.trim() : null;
    if (goal) return goal;
  }
  return null;
}

/**
 * The days (midnight) the thread's blocks ran on, oldest first; a block past midnight counts on
 * both. Decided by the day page's own overlap test, so every day listed has rows.
 */
export function threadDays(sessions: readonly CalendarSession[]): number[] {
  const days = new Set<number>();
  for (const block of sessions.flatMap((s) => s.segments)) {
    for (let day = startOfDay(block.start); overlaps(block, day, startOfDay(day, 1)); ) {
      days.add(day);
      day = startOfDay(day, 1);
    }
  }
  return [...days].sort((a, b) => a - b);
}

/** How many blocks the thread's sessions have between them. */
export function threadBlockCount(sessions: readonly CalendarSession[]): number {
  return sessions.reduce((n, s) => n + s.segments.length, 0);
}

/** When the thread's work began and last ended; null for a thread with no blocks. */
export function threadSpan(
  sessions: readonly CalendarSession[],
): { from: number; to: number } | null {
  const blocks = sessions.flatMap((s) => s.segments);
  if (blocks.length === 0) return null;
  return {
    from: Math.min(...blocks.map((b) => b.start)),
    to: Math.max(...blocks.map((b) => b.end)),
  };
}

/** The thread's items, those still open apart from those settled since. */
export function threadItems(items: readonly LedgerEntry[]): {
  open: LedgerEntry[];
  closed: LedgerEntry[];
} {
  return {
    open: items.filter((i) => i.closedAt === null),
    closed: items.filter((i) => i.closedAt !== null),
  };
}

/** How each session came into the thread, by session; the seed has none. */
export function linksBySession(links: readonly ThreadLink[]): ReadonlyMap<string, ThreadLink> {
  return new Map(links.map((l) => [l.sessionId, l]));
}

/** When the thread ran, as a date or a range of dates. */
export function spanLabel(span: { from: number; to: number }, now: number): string {
  const from = dateLabel(span.from, now);
  const to = dateLabel(span.to, now);
  return from === to ? from : threadMessages().range(from, to);
}
