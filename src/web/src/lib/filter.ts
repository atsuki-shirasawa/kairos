// Filtering the blocks in a period. Separate from hiding projects (saved in the DB, for things
// you never want to see), these are "just for now" conditions kept in the URL.
import type { CalendarSegment, CalendarSession, Project } from "@shared/api.ts";

/** Temporary conditions narrowing what the period shows. Kept in the URL. */
export interface Filter {
  /** Substring match on headline, title, worktree name and project name. Every space-separated word must match. */
  q: string;
  /** Only blocks with a commit or PR. */
  outcome: boolean;
  /** Hide quick-question sessions (`isBrief`). */
  hideBrief: boolean;
}

/** No conditions: everything not in a hidden project shows. */
export const NO_FILTER: Filter = { q: "", outcome: false, hideBrief: false };

/** Sessions with at most this many prompts and no hands-on work count as "quick questions". */
export const BRIEF_PROMPTS = 2;

/** Whether a temporary filter (keyword, outcome) is active. Hiding conditions don't count. */
export const isFocused = (f: Filter) => f.q.trim() !== "" || f.outcome;

/** Whether any condition, including hiding quick questions, is active. */
export const isFiltered = (f: Filter) => isFocused(f) || f.hideBrief;

/**
 * Sessions with few prompts and no file edits, commits or PRs.
 * A single request that delegated a large task still has edits, so it stays.
 */
export function isBrief(session: CalendarSession): boolean {
  if (session.promptCount > BRIEF_PROMPTS) return false;
  return session.segments.every(
    (g) => g.activity.filesEdited === 0 && g.activity.commits === 0 && g.activity.prs === 0,
  );
}

/** Drops sessions kept off screen (hidden projects, and quick questions when hidden). */
export function hideSessions(
  sessions: CalendarSession[],
  projects: Map<number, Project>,
  filter: Filter,
): CalendarSession[] {
  return sessions.filter(
    (s) =>
      (s.projectId === null || !projects.get(s.projectId)?.hidden) &&
      !(filter.hideBrief && isBrief(s)),
  );
}

/** Whether a block (a section of a session) passes the current filter. */
export type SegmentMatch = (session: CalendarSession, segment: CalendarSegment) => boolean;

/** Key of a block in the server's search hits. */
export const hitKey = (sessionId: string, start: number) => `${sessionId}:${start}`;

/**
 * Whether a block matches the keyword and outcome conditions. Everything matches when there are none.
 * `hits` are blocks the server found for the keyword in places the calendar doesn't hold (summary
 * body, prompts, PRs, commits, branch), so the period filter agrees with the search results.
 */
export function segmentMatcher(
  filter: Filter,
  projects: Map<number, Project>,
  hits: ReadonlySet<string> = new Set(),
): SegmentMatch {
  const terms = filter.q.toLowerCase().split(/\s+/).filter(Boolean);
  return (session, segment) => {
    if (filter.outcome && segment.activity.commits + segment.activity.prs === 0) return false;
    if (terms.length === 0) return true;
    if (hits.has(hitKey(session.id, segment.start))) return true;
    const project = session.projectId !== null ? projects.get(session.projectId) : undefined;
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
