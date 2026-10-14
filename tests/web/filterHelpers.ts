// Sessions and projects shared by the filter tests.
import type { Activity, CalendarSession, Project } from "../../src/shared/api.ts";

/** An activity with nothing in it. */
export const NONE: Activity = {
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
};

/** A calendar session for the filter tests, one block per entry in `segments`. */
export function session(
  id: string,
  opts: {
    projectId?: number | null;
    label?: string | null;
    promptCount?: number;
    segments?: {
      headline: string;
      activity?: Partial<Activity>;
      minutes?: number;
      body?: string;
    }[];
    /** Session-wide fields the conditions read (branch, active, ...). */
    fields?: Partial<CalendarSession>;
  } = {},
): CalendarSession {
  const segments = (opts.segments ?? [{ headline: id }]).map((g, i) => ({
    start: i * HOUR * 3,
    end: i * HOUR * 3 + (g.minutes ?? 1) * 60_000,
    headline: g.headline,
    summarized: true,
    body: g.body ?? null,
    prs: [],
    commits: [],
    promptCount: 1,
    usage: null,
    activity: { ...NONE, ...g.activity },
  }));
  return {
    id,
    projectId: opts.projectId === undefined ? 1 : opts.projectId,
    label: opts.label ?? null,
    branch: null,
    scheduledRuns: 0,
    headless: false,
    continued: false,
    title: `${id} title`,
    startedAt: 0,
    endedAt: segments.length * 1000,
    promptCount: opts.promptCount ?? 5,
    active: false,
    segments,
    ...opts.fields,
  };
}

/** One hour in milliseconds. */
export const HOUR = 60 * 60_000;

/** A project, shown unless `hidden`. */
export const project = (id: number, name: string, hidden = false): Project => ({
  id,
  path: `/Users/me/dev/${name}`,
  name,
  repo: null,
  color: null,
  hidden,
});
/** Two projects: "app" shown, "blog" hidden. */
export const projects = new Map([
  [1, project(1, "app")],
  [2, project(2, "blog", true)],
]);
