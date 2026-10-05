// Walks blocks in time order (j / k and the drawer's ‹ ›). Calendar and list use the same order.
import type { CalendarSegment, CalendarSession } from "@shared/api.ts";

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
