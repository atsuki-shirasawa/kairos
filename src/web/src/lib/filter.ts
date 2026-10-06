// Filtering the blocks in a period. Separate from hiding projects (saved in the DB, for things
// you never want to see), these are "just for now" conditions kept in the URL.
import type { CalendarSegment, CalendarSession, Project } from "@shared/api.ts";

/** Outcomes a block can be narrowed to. A block passes when it has any of the chosen ones. */
export const OUTCOMES = ["commit", "pr", "merge"] as const;
/** Something a block made: a commit, an opened PR or a merged PR. */
export type Outcome = (typeof OUTCOMES)[number];

/** States a block can be narrowed to. A block passes only when it has every chosen one. */
export const STATES = ["active", "loop", "continued", "subagent", "snag"] as const;
/**
 * `active`: in progress. `loop`: the session has `/loop` or scheduled runs. `continued`: continued
 * from or into another session. `subagent`: the block launched subagents. `snag`: the block hit a
 * tool error, an interrupt or an API error.
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
  /** Hide quick-question sessions (`isBrief`). */
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

/** Sessions with at most this many prompts and no hands-on work count as "quick questions". */
export const BRIEF_PROMPTS = 2;

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
  if (segment.end - segment.start < filter.minMinutes * 60_000) return false;
  return filter.branch === null || session.branch === filter.branch;
}

/**
 * The filter from URL parameters. Unknown values are dropped, so an edited or old link still
 * opens. `outcome=1` is the old "commit or PR" switch.
 */
export function readFilter(q: URLSearchParams): Filter {
  const list = <T extends string>(key: string, allowed: readonly T[]): T[] =>
    (q.get(key) ?? "").split(",").filter((v): v is T => (allowed as readonly string[]).includes(v));
  const outcome = q.get("outcome");
  const minMinutes = Number(q.get("len"));
  return {
    q: q.get("q") ?? "",
    qFiles: q.get("in") === "files",
    outcomes: outcome === "1" ? ["commit", "pr"] : list("outcome", OUTCOMES),
    states: list("state", STATES),
    minMinutes: (MIN_LENGTHS as readonly number[]).includes(minMinutes) ? minMinutes : 0,
    branch: q.get("branch") || null,
    hideBrief: q.get("brief") === "hide",
  };
}

/** Writes the filter's set conditions into URL parameters (unset ones are left out). */
export function writeFilter(f: Filter, q: URLSearchParams): void {
  if (f.q) q.set("q", f.q);
  if (f.qFiles) q.set("in", "files");
  if (f.outcomes.length) q.set("outcome", OUTCOMES.filter((o) => f.outcomes.includes(o)).join(","));
  if (f.states.length) q.set("state", STATES.filter((s) => f.states.includes(s)).join(","));
  if (f.minMinutes) q.set("len", String(f.minMinutes));
  if (f.branch) q.set("branch", f.branch);
  if (f.hideBrief) q.set("brief", "hide");
}

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

/**
 * Why a period with sessions shows none of them: every one is in a hidden project, or the rest
 * are quick questions being hidden. null when there are no sessions at all.
 */
export function hiddenReason(
  sessions: CalendarSession[],
  projects: Map<number, Project>,
): "project" | "brief" | null {
  if (sessions.length === 0) return null;
  return hideSessions(sessions, projects, NO_FILTER).length === 0 ? "project" : "brief";
}

/**
 * `projects` plus those in `extra` it doesn't know yet. Sessions from another period may belong to
 * projects not seen in this one, and those still need their hidden flag.
 */
export function withProjects(
  projects: Map<number, Project>,
  extra: Project[],
): Map<number, Project> {
  const all = new Map(projects);
  for (const p of extra) if (!all.has(p.id)) all.set(p.id, p);
  return all;
}

/** Whether a block (a section of a session) passes the current filter. */
export type SegmentMatch = (session: CalendarSession, segment: CalendarSegment) => boolean;

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

/** Number of blocks across the sessions that pass `test`, for the counts beside the menu's options. */
export function countBlocks(sessions: CalendarSession[], test: SegmentMatch): number {
  let n = 0;
  for (const s of sessions) for (const g of s.segments) if (test(s, g)) n++;
  return n;
}

/** A branch offered in the menu, with how many of the period's blocks were on it. */
export interface BranchOption {
  name: string;
  blocks: number;
}

/**
 * Branches the period's sessions ran on, busiest first. The chosen branch stays listed even when
 * the period has none of it (after moving to another week), so the menu can still show and clear it.
 */
export function branchOptions(sessions: CalendarSession[], chosen: string | null): BranchOption[] {
  const counts = new Map<string, number>();
  for (const s of sessions)
    if (s.branch) counts.set(s.branch, (counts.get(s.branch) ?? 0) + s.segments.length);
  if (chosen !== null && !counts.has(chosen)) counts.set(chosen, 0);
  return [...counts]
    .map(([name, blocks]) => ({ name, blocks }))
    .sort((a, b) => b.blocks - a.blocks || a.name.localeCompare(b.name));
}
