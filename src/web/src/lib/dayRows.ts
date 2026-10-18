// The Journal's day page as rows: its blocks in time order, quiet stretches between them, and a
// lane per session drawn like a git graph, so sessions that ran at the same time read as parallel
// lines beside the list.
import type { CalendarSession, Project } from "@shared/api.ts";
import { MINUTE } from "@shared/dates.ts";
import { projectColor } from "./colors.ts";
import type { DayBlock } from "./dayBlocks.ts";
import { runGroups } from "./marks.ts";
import { projectOf } from "./selection.ts";

/** A gap with no work at least this long becomes a "quiet" row instead of empty space. */
export const QUIET_MS = 30 * MINUTE;

/**
 * What a lane draws in one row. `node` is the row's own session (with the line coming in from
 * above and going on below as flags); `through` is another session in that lane still going on.
 */
export type LaneMark =
  | { kind: "none" }
  | { kind: "through"; sessionId: string }
  /** The session's work ends during this row's block: its line stops level with the row's node. */
  | { kind: "end"; sessionId: string }
  | { kind: "node"; sessionId: string; above: boolean; below: boolean };

/** One row of the day page. */
export type DayRow =
  | {
      kind: "block";
      /** The block, or a burst of headless runs drawn as one row. */
      blocks: DayBlock[];
      lanes: LaneMark[];
    }
  | {
      kind: "quiet";
      ms: number;
      /** When the work after it starts (ms since midnight). */
      until: number;
      lanes: LaneMark[];
    };

type BlockGroup = DayBlock[];

/** The first block of a group, which stands for it (a burst opens at its first run). */
const lead = (group: BlockGroup): DayBlock => group[0] as DayBlock;
const sessionOf = (group: BlockGroup): string => lead(group).session.id;

/**
 * Where each session's work lies in the list: its first and last group, its time span, and
 * whether it runs in from the previous day or on into the next.
 */
interface SessionSpan {
  first: number;
  last: number;
  start: number;
  end: number;
  before: boolean;
  after: boolean;
}

/** Each session's span, in one pass over the groups. */
function sessionSpans(groups: BlockGroup[]): Map<string, SessionSpan> {
  const spans = new Map<string, SessionSpan>();
  groups.forEach((group, i) => {
    const id = sessionOf(group);
    const end = Math.max(...group.map((b) => b.end));
    const before = group.some((b) => b.continuesBefore);
    const after = group.some((b) => b.continuesAfter);
    const span = spans.get(id);
    if (!span) {
      spans.set(id, { first: i, last: i, start: lead(group).start, end, before, after });
      return;
    }
    span.last = i;
    span.end = Math.max(span.end, end);
    span.before ||= before;
    span.after ||= after;
  });
  return spans;
}

/**
 * A lane for each session: the lowest one free when its first block starts, so sessions that ran
 * at the same time sit side by side and a lane is reused once its session is done for the day.
 */
export function assignLanes(spans: ReadonlyMap<string, { start: number; end: number }>): {
  lanes: Map<string, number>;
  count: number;
} {
  const ends: number[] = [];
  const lanes = new Map<string, number>();
  const byStart = [...spans].sort(([, a], [, b]) => a.start - b.start);
  for (const [id, { start, end }] of byStart) {
    let lane = ends.findIndex((e) => e <= start);
    if (lane === -1) lane = ends.length;
    ends[lane] = end;
    lanes.set(id, lane);
  }
  return { lanes, count: ends.length };
}

/** Which lane a session's line is in, and the list positions it runs between. */
interface LaneRange {
  lane: number;
  from: number;
  to: number;
}

/**
 * Where each session's line runs in the list, by group index: from its first group to the last
 * group starting before its work ends, so a long block's line runs past the work that happened while it
 * did. Open-ended on a side where it runs in from the previous day or on into the next.
 */
function laneRanges(
  groups: BlockGroup[],
  spans: Map<string, SessionSpan>,
  lanes: Map<string, number>,
): Map<string, LaneRange> {
  const ranges = new Map<string, LaneRange>();
  for (const [id, span] of spans) {
    const during = groups.findLastIndex((g) => lead(g).start < span.end);
    ranges.set(id, {
      lane: lanes.get(id) ?? 0,
      from: span.before ? Number.NEGATIVE_INFINITY : span.first,
      to: span.after ? Number.POSITIVE_INFINITY : Math.max(span.last, during),
    });
  }
  return ranges;
}

/**
 * What every lane draws at list position `at` (a group's index, or a half step between two for a
 * quiet row). `own` is the session of the row's block, null for a quiet row.
 */
function laneMarks(
  at: number,
  own: string | null,
  ranges: ReadonlyMap<string, LaneRange>,
  count: number,
): LaneMark[] {
  const marks: LaneMark[] = Array.from({ length: count }, () => ({ kind: "none" }));
  for (const [id, { lane, from, to }] of ranges) {
    if (id === own) marks[lane] = { kind: "node", sessionId: id, above: at > from, below: at < to };
    else if (at > from && at < to) marks[lane] = { kind: "through", sessionId: id };
    else if (at === to) marks[lane] = { kind: "end", sessionId: id };
  }
  return marks;
}

/**
 * Lays out a day's blocks (`blocksOfDay`, sorted by start) as the day page's rows. A burst of
 * headless runs is one row, as it is one mark on the calendar; a gap of `QUIET_MS` or more with
 * no work becomes a quiet row, so an empty afternoon takes a line instead of a screen.
 */
export function dayRows(blocks: DayBlock[]): DayRow[] {
  const groups = runGroups(blocks);
  const spans = sessionSpans(groups);
  const { lanes, count } = assignLanes(spans);
  const ranges = laneRanges(groups, spans, lanes);
  const rows: DayRow[] = [];
  // Quiet rows only go between work: the day before its first block is not a gap
  let busyUntil: number | null = null;
  groups.forEach((group, i) => {
    const { start } = lead(group);
    if (busyUntil !== null && start - busyUntil >= QUIET_MS) {
      rows.push({
        kind: "quiet",
        ms: start - busyUntil,
        until: start,
        lanes: laneMarks(i - 0.5, null, ranges, count),
      });
    }
    busyUntil = Math.max(busyUntil ?? start, ...group.map((b) => b.end));
    const id = sessionOf(group);
    rows.push({ kind: "block", blocks: group, lanes: laneMarks(i, id, ranges, count) });
  });
  return rows;
}

/** How a session's lane is drawn: its project color, and dashed for a headless run. */
export interface LaneLook {
  color: string;
  headless: boolean;
}

/** Each session's lane look, from its project and whether it ran headless. */
export function laneLooks(
  sessions: readonly CalendarSession[],
  projects: ReadonlyMap<number, Project>,
): Map<string, LaneLook> {
  return new Map(
    sessions.map((s) => [
      s.id,
      { color: projectColor(projectOf(projects, s.projectId)), headless: s.headless },
    ]),
  );
}
