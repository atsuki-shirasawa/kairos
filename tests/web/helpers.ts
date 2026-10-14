// Builders shared by the web lib tests: calendar sessions and times on a fixed Monday.
import type { CalendarSegment, CalendarSession } from "../../src/shared/api.ts";

/** One hour in ms. */
export const H = 3_600_000;
/** 2026-10-05 (Mon) 00:00, local time. */
export const DAY0 = new Date(2026, 9, 5).getTime();
/** `h` hours after DAY0 (fractions allowed, past 24 for the next day). */
export const at = (h: number) => DAY0 + h * H;

/** A section from `start` to `end` with no activity, headed by `headline`. */
export function segment(
  start: number,
  end: number,
  headline: string,
  summarized = false,
): CalendarSegment {
  return {
    start,
    end,
    headline,
    summarized,
    body: null,
    prs: [],
    commits: [],
    promptCount: 1,
    usage: null,
    activity: {
      commits: 0,
      prs: 0,
      merges: 0,
      filesEdited: 0,
      toolCalls: 0,
      subagents: 0,
      toolErrors: 0,
      interrupts: 0,
      apiErrors: 0,
      compactions: 0,
      claudeMs: null,
      effort: null,
    },
  };
}

/** A finished session of project 1 with one section per [start, end] span, headed by its id. */
export function session(id: string, ...spans: [number, number][]): CalendarSession {
  const segments = spans.map(([start, end]) => segment(start, end, id));
  return {
    id,
    projectId: 1,
    label: null,
    branch: null,
    scheduledRuns: 0,
    headless: false,
    continued: false,
    title: id,
    startedAt: segments[0]?.start ?? 0,
    endedAt: segments.at(-1)?.end ?? 0,
    promptCount: 1,
    active: false,
    segments,
  };
}
