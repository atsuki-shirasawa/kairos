// Filtering the blocks in a period. Separate from hiding projects (saved in the DB, for things
// you never want to see), these are "just for now" conditions kept in the URL.
import type { CalendarSegment, CalendarSession, Project } from "@shared/api.ts";
import { MINUTE } from "@shared/dates.ts";
import { openItemsOf } from "@shared/summaryBody.ts";
import { projectOf } from "./selection.ts";

/** Outcomes a block can be narrowed to. A block passes when it has any of the chosen ones. */
export const OUTCOMES = ["commit", "pr", "merge"] as const;
/** Something a block made: a commit, an opened PR or a merged PR. */
export type Outcome = (typeof OUTCOMES)[number];

/** States a block can be narrowed to. A block passes only when it has every chosen one. */
export const STATES = ["active", "loop", "continued", "subagent", "snag", "open"] as const;
/**
 * `active`: in progress. `loop`: the session has `/loop` or scheduled runs. `continued`: continued
 * from or into another session. `subagent`: the block launched subagents. `snag`: the block hit a
 * tool error, an interrupt or an API error. `open`: its summary lists something left open.
 */
export type BlockState = (typeof STATES)[number];

/** Minimum block lengths offered, in minutes. */
export const MIN_LENGTHS = [30, 60, 120] as const;

/** Temporary conditions narrowing what the period shows. Kept in the URL. */
export interface Filter {
  /** Substring match on headline, title, worktree name and project name. Every space-separated word must match. */
  q: string;
  /** The keyword names edited files: every word is searched as `file:<word>` (the button in the search field). */
  qFiles: boolean;
  /** Only blocks with any of these outcomes. Empty means no condition. */
  outcomes: Outcome[];
  /** Only blocks in every one of these states. */
  states: BlockState[];
  /** Only blocks at least this many minutes long; 0 means any length. */
  minMinutes: number;
  /** Only sessions on this git branch. */
  branch: string | null;
  /** Hide quick-question sessions (`isBrief` in projectVisibility.ts). */
  hideBrief: boolean;
}

/** No conditions: everything not in a hidden project shows. */
export const NO_FILTER: Filter = {
  q: "",
  qFiles: false,
  outcomes: [],
  states: [],
  minMinutes: 0,
  branch: null,
  hideBrief: false,
};

/** Number of narrowing conditions set from the filter menu (the keyword and hiding aren't counted). */
export function conditionCount(f: Filter): number {
  return (
    (f.outcomes.length > 0 ? 1 : 0) +
    f.states.length +
    (f.minMinutes > 0 ? 1 : 0) +
    (f.branch !== null ? 1 : 0)
  );
}

/** Whether a temporary filter (keyword or a narrowing condition) is active. Hiding conditions don't count. */
export const isFocused = (f: Filter) => f.q.trim() !== "" || conditionCount(f) > 0;

/** The filter without the menu's narrowing conditions; the keyword and hiding stay. */
export const withoutConditions = (f: Filter): Filter => ({
  ...NO_FILTER,
  q: f.q,
  qFiles: f.qFiles,
  hideBrief: f.hideBrief,
});

/** Whether "clear all" has anything to clear: a narrowing condition, or quick questions hidden. */
export const isFiltered = (f: Filter): boolean => conditionCount(f) > 0 || f.hideBrief;

/** The filter after "clear all": no narrowing conditions and quick questions shown; the keyword stays. */
export const clearedFilter = (f: Filter): Filter => ({ ...withoutConditions(f), hideBrief: false });

/** Prefix the server reads as "match edited file paths only". */
const FILE_PREFIX = "file:";

/**
 * The keyword as the search API takes it. With the file button on, each word becomes a `file:`
 * term, so typing a path needs no prefix; words already written as `file:…` stay as they are.
 */
export function searchQuery(f: Filter): string {
  if (!f.qFiles) return f.q;
  return f.q
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.toLowerCase().startsWith(FILE_PREFIX) ? w : `${FILE_PREFIX}${w}`))
    .join(" ");
}

/** Whether a block made any of the outcomes. */
export function hasOutcome(segment: CalendarSegment, outcomes: readonly Outcome[]): boolean {
  const a = segment.activity;
  const counts: Record<Outcome, number> = { commit: a.commits, pr: a.prs, merge: a.merges };
  return outcomes.some((o) => counts[o] > 0);
}

/** Whether a block is in the state. Session-wide states (in progress, loop, continued) apply to all its blocks. */
export function inState(
  session: CalendarSession,
  segment: CalendarSegment,
  state: BlockState,
): boolean {
  const a = segment.activity;
  switch (state) {
    case "active":
      return session.active;
    case "loop":
      return session.scheduledRuns > 0;
    case "continued":
      return session.continued;
    case "subagent":
      return a.subagents > 0;
    case "snag":
      return a.toolErrors + a.interrupts + a.apiErrors > 0;
    case "open":
      return openItemsOf(segment.body).length > 0;
  }
}

/** Whether a block passes the menu's conditions (not the keyword). */
export function meetsConditions(
  filter: Filter,
  session: CalendarSession,
  segment: CalendarSegment,
): boolean {
  if (filter.outcomes.length > 0 && !hasOutcome(segment, filter.outcomes)) return false;
  if (!filter.states.every((s) => inState(session, segment, s))) return false;
  if (segment.end - segment.start < filter.minMinutes * MINUTE) return false;
  return filter.branch === null || session.branch === filter.branch;
}

/** Whether a block (a section of a session) passes the current filter. */
export type SegmentMatch = (session: CalendarSession, segment: CalendarSegment) => boolean;

/** Every block passes: for what has no filter (a thread) or counts work regardless of it. */
export const MATCH_ALL: SegmentMatch = () => true;

/** Key of a block in the server's search hits. */
export const hitKey = (sessionId: string, start: number) => `${sessionId}:${start}`;

/**
 * Whether a block matches the keyword and the menu's conditions. Everything matches when there are none.
 * `hits` are blocks the server found for the keyword in places the calendar doesn't hold (summary
 * body, prompts, PRs, commits, branch), so the period filter agrees with the search results.
 */
export function segmentMatcher(
  filter: Filter,
  projects: Map<number, Project>,
  hits: ReadonlySet<string> = new Set(),
): SegmentMatch {
  // `file:` terms never appear in the calendar's own text, so only the server's hits match them
  const terms = searchQuery(filter).toLowerCase().split(/\s+/).filter(Boolean);
  return (session, segment) => {
    if (!meetsConditions(filter, session, segment)) return false;
    if (terms.length === 0) return true;
    if (hits.has(hitKey(session.id, segment.start))) return true;
    const project = projectOf(projects, session.projectId);
    const text = [segment.headline, session.title, session.label, project?.name]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    return terms.every((t) => text.includes(t));
  };
}

/** Keeps only matching blocks. Sessions with no matching block are dropped. */
export function narrowSessions(
  sessions: CalendarSession[],
  match: SegmentMatch,
): CalendarSession[] {
  return sessions.flatMap((s) => {
    const segments = s.segments.filter((g) => match(s, g));
    if (segments.length === 0) return [];
    return segments.length === s.segments.length ? [s] : [{ ...s, segments }];
  });
}
