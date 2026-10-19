// Walks blocks in time order (j / k and the drawer's ‹ ›). Calendar and list use the same order.
import type { CalendarSegment, CalendarSession } from "@shared/api.ts";
import { startOfDay } from "@shared/dates.ts";
import { overlaps } from "./dayBlocks.ts";
import { isMark, runGroups } from "./marks.ts";
import { unitGroups, unitRef } from "./runUnits.ts";

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
        .filter((g) => overlaps(g, from, to))
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

/**
 * Runs the drawer steps through: a burst of headless runs drawn as one mark, or the runs of one
 * unit of work, with the number that tied them (null for a burst).
 */
export interface RunBurst {
  ref: number | null;
  runs: BlockRef[];
}

/** Where a block sits among the runs it is stepped through with (see `RunBurst`): its index too. */
export interface RunPosition extends RunBurst {
  index: number;
}

/** A headless run's block as `runGroups` reads it. */
type RunMark = { session: CalendarSession; segment: CalendarSegment };

/**
 * Every set of two or more runs the drawer steps through in `sessions`: each unit of work's runs
 * (see `runGroups`) across days, long ones too, in time order, each at its first block; then every
 * burst of other headless runs as the calendar draws them, grouped within each day, since each day
 * column groups its own marks.
 */
export function burstsOf(sessions: CalendarSession[]): RunBurst[] {
  return [...unitRuns(sessions), ...markBursts(sessions)];
}

/**
 * Each unit of work's runs in time order, when it has two or more, each at its first block: the
 * stepper counts runs, and ↑ ↓ reach a run's other blocks.
 */
function unitRuns(sessions: CalendarSession[]): RunBurst[] {
  const firsts = sessions.flatMap((session) => {
    const [segment] = session.segments;
    return segment ? [{ session, segment }] : [];
  });
  return [...unitGroups(firsts).values()]
    .filter((runs) => runs.length > 1)
    .map((runs) => ({
      ref: unitRef(runs),
      runs: refsOf(runs.sort((a, b) => a.segment.start - b.segment.start)),
    }));
}

/** The bursts of headless runs outside any unit that the calendar draws as one mark, per day. */
function markBursts(sessions: CalendarSession[]): RunBurst[] {
  const byDay = new Map<number, RunMark[]>();
  for (const session of sessions)
    for (const segment of session.segments) {
      const mark = { session, segment };
      if (!session.headless || session.unit || !isMark(mark)) continue;
      const day = startOfDay(segment.start);
      byDay.set(day, [...(byDay.get(day) ?? []), mark]);
    }
  return [...byDay.values()]
    .flatMap((marks) => runGroups(marks.sort((a, b) => a.segment.start - b.segment.start)))
    .filter((g) => g.length > 1)
    .map((g) => ({ ref: null, runs: refsOf(g) }));
}

/** The blocks of runs as the refs the drawer opens. */
function refsOf(marks: RunMark[]): BlockRef[] {
  return marks.map((m) => ({ id: m.session.id, at: m.segment.start }));
}

/**
 * The runs (from `burstsOf`) holding the block at `ref`, so the drawer can step through the runs
 * one mark or one unit of work stands for. null when the block is not among any.
 */
export function runOf(bursts: RunBurst[], ref: BlockRef | null): RunPosition | null {
  if (!ref) return null;
  for (const burst of bursts) {
    const index = burst.runs.findIndex((r) => r.id === ref.id && r.at === ref.at);
    if (index !== -1) return { ...burst, index };
  }
  return null;
}

/** The blocks either side of the selection, and how to open one. */
export interface BlockStepping {
  prev: BlockRef | null;
  next: BlockRef | null;
  /** Opens a block without pushing history; does nothing for null. */
  goTo: (block: BlockRef | null) => void;
  /** The burst of headless runs the selection belongs to, which the drawer steps through. */
  run: RunPosition | null;
}
