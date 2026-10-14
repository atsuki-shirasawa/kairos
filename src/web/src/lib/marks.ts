// Short work drawn as marks on a day column's edge (or beside a month cell's date) instead of cards.
import { MINUTE } from "@shared/dates.ts";
import type { DayBlock } from "./dayBlocks.ts";
import { isWorking } from "./selection.ts";

/**
 * Work shorter than this is drawn as a mark on the column's edge rather than as a card. A quick
 * question drawn at the minimum card length took 25 minutes of room, and on busy days those were
 * what pushed parallel work into narrow side-by-side columns (on real logs, 88 of 257 blocks sat
 * three or more abreast; with short work as marks, 7).
 */
export const MARK_MAX_MS = 10 * MINUTE;

/**
 * Whether a block is drawn as a mark: shorter than `MARK_MAX_MS` in its real length (a block
 * crossing midnight is judged whole, not by its part of the day), and not the work still in
 * progress, which would otherwise turn from a mark into a card as it grows.
 */
export function isMark(block: Pick<DayBlock, "session" | "segment">): boolean {
  const { segment } = block;
  if (segment.end - segment.start >= MARK_MAX_MS) return false;
  return !isWorking(block);
}

/**
 * Longest pause between two headless runs of a project that still counts as one burst. Scripts
 * fire `claude -p` seconds apart (on real logs, 1 to 30 s); a loop's iterations come 20 minutes or
 * more apart and stay on their own, at their real times.
 */
export const RUN_GAP_MS = 5 * MINUTE;

/**
 * Longest a burst runs from its first start. Without a cap, a loop firing every few minutes would
 * chain into one mark covering the whole day, leaving nothing at the times the runs happened.
 */
export const RUN_SPAN_MS = 15 * MINUTE;

/** A burst being collected: its runs, and where it started and ends so far. */
interface OpenBurst<T> {
  runs: T[];
  start: number;
  end: number;
}

/**
 * Groups marks (sorted by start) for drawing: headless runs of the same project, each starting
 * within `RUN_GAP_MS` of the burst's latest end and within `RUN_SPAN_MS` of its first start,
 * become one group; every other mark is a group of its own. A burst of runs a few seconds apart
 * drawn one mark each became a ladder, pushed 6px per mark down the strip and far from when it
 * happened. Other marks in between don't break a burst. Runs with no project are never grouped:
 * nothing says two of them come from the same script.
 */
export function runGroups<T extends Pick<DayBlock, "session" | "segment">>(marks: T[]): T[][] {
  const groups: T[][] = [];
  const open = new Map<number, OpenBurst<T>>();
  for (const m of marks) {
    const { projectId, headless } = m.session;
    const { start, end } = m.segment;
    const burst = projectId === null ? undefined : open.get(projectId);
    if (!headless || projectId === null) groups.push([m]);
    else if (burst && start - burst.end <= RUN_GAP_MS && start - burst.start <= RUN_SPAN_MS) {
      burst.runs.push(m);
      burst.end = Math.max(burst.end, end);
    } else {
      const runs = [m];
      groups.push(runs);
      open.set(projectId, { runs, start, end });
    }
  }
  return groups;
}
