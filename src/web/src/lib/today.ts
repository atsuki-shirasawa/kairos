// What the home page says about the last workday: which day it was and its work by project, from
// the summaries already written (no model call).
import type { CalendarSession, Project, Span } from "@shared/api.ts";
import { startOfDay } from "@shared/dates.ts";
import { isProjectShown } from "@shared/projects.ts";
import { addDays } from "./dates.ts";
import { blocksOfDay } from "./dayBlocks.ts";
import { isMark, MARK_MAX_MS } from "./marks.ts";

/** How far back the home page looks for the last workday. */
export const WORKDAY_LOOKBACK_DAYS = 28;

/** The days the home page searches for the last workday: the weeks before today. */
export function workdaySearchRange(today: number): { from: number; to: number } {
  return { from: addDays(startOfDay(today), -WORKDAY_LOOKBACK_DAYS), to: startOfDay(today) };
}

/**
 * The last day before today with work the home page would list: the day a block started on (work
 * running past midnight belongs to the day it began), leaving out quick questions and hidden
 * projects, as `workdayByProject` does. Null when the spans hold none.
 */
export function lastWorkday(
  spans: readonly Span[],
  today: number,
  projects: ReadonlyMap<number, Project>,
): number | null {
  const starts = spans
    .filter((s) => s.start < startOfDay(today) && s.end - s.start >= MARK_MAX_MS)
    .filter((s) => isProjectShown(projects, s.projectId))
    .map((s) => s.start);
  return starts.length ? startOfDay(Math.max(...starts)) : null;
}

/** One block of the last workday as the home page lists it. */
export interface WorkdayBlock {
  sessionId: string;
  /** The block's start, which opens it in the drawer. */
  start: number;
  headline: string;
  commits: number;
  prs: number;
}

/** A project's work on the last workday. */
export interface WorkdayProject {
  projectId: number | null;
  /** Blocks in time order. */
  blocks: WorkdayBlock[];
  /** Working time on the day, which orders the projects. */
  ms: number;
}

/** The end of the day starting at `day`: the next midnight, an hour off 24h when DST changes. */
export function dayEnd(day: number): number {
  return addDays(day, 1);
}

/**
 * The day's work by project, the busiest first. Quick questions (the calendar's marks) and hidden
 * projects are left out: the list is for remembering what the day was about. Work that began the
 * evening before belongs to that day, as in `lastWorkday`.
 */
export function workdayByProject(
  sessions: CalendarSession[],
  day: number,
  projects: ReadonlyMap<number, Project>,
): WorkdayProject[] {
  const byProject = new Map<number | null, WorkdayProject>();
  for (const block of blocksOfDay(sessions, day, dayEnd(day))) {
    const { session, segment } = block;
    if (block.continuesBefore || isMark(block)) continue;
    if (!isProjectShown(projects, session.projectId)) continue;
    const group = byProject.get(session.projectId) ?? {
      projectId: session.projectId,
      blocks: [],
      ms: 0,
    };
    group.blocks.push({
      sessionId: session.id,
      start: segment.start,
      headline: segment.headline,
      commits: segment.commits.length,
      prs: segment.prs.length,
    });
    group.ms += block.end - block.start;
    byProject.set(session.projectId, group);
  }
  return [...byProject.values()].sort((a, b) => b.ms - a.ms);
}
