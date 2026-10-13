// Walks blocks in time order (j / k and the drawer's ‹ ›). Calendar and list use the same order.
import type { CalendarSegment, CalendarSession } from "@shared/api.ts";
import { startOfDay } from "./dates.ts";
import { isMark, runGroups } from "./layout.ts";

/** How a block is addressed. Matches `session` and `at` in the URL. */
export interface BlockRef {
  id: string;
  at: number;
}

/** Blocks overlapping [from, to), sorted by start. */
export function orderedBlocks(sessions: CalendarSession[], from: number, to: number): BlockRef[] {
  return sessions
    .flatMap((s) =>
      s.segments
        // Same test as blocksOfDay, so only blocks on screen are visited
        .filter((g) => g.end >= from && g.start < to)
        .map((g) => ({ id: s.id, at: g.start })),
    )
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

/** The selected block. A null `at` means the session's last block (as the drawer reads it). */
export function selectedSegment(
  sessions: CalendarSession[],
  id: string | null,
  at: number | null,
): CalendarSegment | null {
  if (!id) return null;
  const segments = sessions.find((s) => s.id === id)?.segments ?? [];
  return (at === null ? segments.at(-1) : segments.find((g) => g.start === at)) ?? null;
}

/**
 * The previous/next block. With nothing selected, next returns the first and previous the last.
 * If the selection is outside the period (e.g. after jumping to a continued session from another
 * week), returns the nearest by time.
 */
export function stepBlock(
  list: BlockRef[],
  current: BlockRef | null,
  dir: -1 | 1,
): BlockRef | null {
  if (!current) return (dir === 1 ? list[0] : list.at(-1)) ?? null;
  const i = list.findIndex((b) => b.id === current.id && b.at === current.at);
  if (i !== -1) return list[i + dir] ?? null;
  return (
    (dir === 1 ? list.find((b) => b.at > current.at) : list.findLast((b) => b.at < current.at)) ??
    null
  );
}

/** Where a block sits in a burst of headless runs drawn as one mark: its index, and every run. */
export interface RunPosition {
  index: number;
  runs: BlockRef[];
}

/**
 * Every burst of two or more headless runs (see `runGroups`) in `sessions`, as the calendar draws
 * them: grouped within each day, since each day column groups its own marks.
 */
export function burstsOf(sessions: CalendarSession[]): BlockRef[][] {
  const byDay = new Map<number, { session: CalendarSession; segment: CalendarSegment }[]>();
  for (const session of sessions)
    for (const segment of session.segments) {
      const mark = { session, segment };
      if (!session.headless || !isMark(mark)) continue;
      const day = startOfDay(segment.start);
      byDay.set(day, [...(byDay.get(day) ?? []), mark]);
    }
  return [...byDay.values()]
    .flatMap((marks) => runGroups(marks.sort((a, b) => a.segment.start - b.segment.start)))
    .filter((g) => g.length > 1)
    .map((g) => g.map((m) => ({ id: m.session.id, at: m.segment.start })));
}

/**
 * The burst (from `burstsOf`) holding the block at `ref`, so the drawer can step through the runs
 * one mark stands for. null when the block is not part of a burst.
 */
export function runOf(bursts: BlockRef[][], ref: BlockRef | null): RunPosition | null {
  if (!ref) return null;
  for (const runs of bursts) {
    const index = runs.findIndex((r) => r.id === ref.id && r.at === ref.at);
    if (index !== -1) return { index, runs };
  }
  return null;
}
