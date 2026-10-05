// Period totals for the summary view: what was done, where the time went, and what came out of it.
// Everything is derived from the calendar response, so the summary agrees with the calendar and list.
import type { Artifact, CalendarSession, Usage } from "@shared/api.ts";
import type { SegmentMatch } from "./filter.ts";
import { sumActivity, sumUsage } from "./format.ts";
import { blocksOfDay, busyMs, type DayBlock } from "./layout.ts";
import { activityOf, counted, usageOf } from "./totals.ts";

export interface ProjectSummary {
  projectId: number | null;
  /** Working time on this project. Parallel sessions within the project count once. */
  busyMs: number;
  /** Blocks in time order. A block spanning midnight appears once, on the day it started. */
  blocks: DayBlock[];
  /** Blocks clipped per day, including those continuing from before the period (for timelines). */
  clipped: DayBlock[];
  prs: Artifact[];
  commits: number;
  usage: Usage | null;
}

export interface DaySummary {
  day: number;
  /** Working time on the day (union of all blocks). */
  busyMs: number;
  /** Working time per project, in the order of `PeriodSummary.projects`. */
  projects: { projectId: number | null; busyMs: number }[];
}

export interface PeriodSummary {
  /** Blocks counted once each (not per day they touch). */
  blocks: number;
  busyMs: number;
  /** Time Claude spent on turns; null when no block recorded it. */
  claudeMs: number | null;
  /** PRs opened in the period, oldest first, each once even if several blocks mention it. */
  prs: Artifact[];
  commits: number;
  usage: Usage | null;
  days: DaySummary[];
  /** Projects by working time, longest first. */
  projects: ProjectSummary[];
}

const all: SegmentMatch = () => true;

/** PRs are stored per session, so the same PR can come from two sessions. Keep the first by URL. */
function uniquePrs(blocks: DayBlock[]): Artifact[] {
  const seen = new Map<string, Artifact>();
  for (const b of blocks) for (const a of b.segment.prs) if (!seen.has(a.ref)) seen.set(a.ref, a);
  return [...seen.values()].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
}

/** Busy time per day, summed. Blocks are clipped per day, so overlaps are removed day by day. */
function busyByDay(blocks: DayBlock[]): number {
  let total = 0;
  for (const list of Map.groupBy(blocks, (b) => b.dayStart).values()) total += busyMs(list);
  return total;
}

export function summarize(
  days: number[],
  sessions: CalendarSession[],
  matches: SegmentMatch = all,
): PeriodSummary {
  const perDay = days.map((day) => ({
    day,
    blocks: blocksOfDay(sessions, day).filter((b) => matches(b.session, b.segment)),
  }));
  const clipped = perDay.flatMap((d) => d.blocks);
  const first = clipped.filter(counted);
  const activity = sumActivity(first.map(activityOf));

  const projects: ProjectSummary[] = [
    ...Map.groupBy(clipped, (b) => b.session.projectId).entries(),
  ].map(([projectId, list]) => {
    const own = list.filter(counted);
    return {
      projectId,
      busyMs: busyByDay(list),
      blocks: own.sort((a, b) => a.segment.start - b.segment.start),
      clipped: list,
      prs: uniquePrs(own),
      commits: own.reduce((n, b) => n + b.segment.activity.commits, 0),
      usage: sumUsage(own.map(usageOf)),
    };
  });
  projects.sort((a, b) => b.busyMs - a.busyMs);

  return {
    blocks: first.length,
    busyMs: busyByDay(clipped),
    claudeMs: activity?.claudeMs ?? null,
    prs: uniquePrs(first),
    commits: activity?.commits ?? 0,
    usage: sumUsage(first.map(usageOf)),
    days: perDay.map(({ day, blocks }) => ({
      day,
      busyMs: busyMs(blocks),
      projects: projects
        .map((p) => ({
          projectId: p.projectId,
          busyMs: busyMs(blocks.filter((b) => b.session.projectId === p.projectId)),
        }))
        .filter((p) => p.busyMs > 0),
    })),
    projects,
  };
}

/**
 * Sessions cut at `until`: later sections are dropped and a section running past it is shortened.
 * For comparing a period in progress with the same point of the period before; otherwise a week
 * seen on Monday would always trail the whole of last week. A shortened section keeps all its
 * usage and outcomes, since those aren't recorded by time within a section.
 */
export function sessionsUntil(sessions: CalendarSession[], until: number): CalendarSession[] {
  return sessions.flatMap((s) => {
    const segments = s.segments
      .filter((g) => g.start < until)
      .map((g) => (g.end > until ? { ...g, end: until } : g));
    return segments.length > 0 ? [{ ...s, segments }] : [];
  });
}
