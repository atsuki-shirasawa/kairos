// What the filter menu lists: how many of the period's blocks each option keeps, which branches
// there are to choose from, the projects in the order they are offered, and the button's counts.
import type { CalendarSession, Project } from "@shared/api.ts";
import {
  type BlockState,
  conditionCount,
  type Filter,
  hasOutcome,
  inState,
  OUTCOMES,
  type Outcome,
  type SegmentMatch,
  STATES,
} from "./filter.ts";

/** Number of blocks across the sessions that pass `test`, for the counts beside the menu's options. */
export function countBlocks(sessions: CalendarSession[], test: SegmentMatch): number {
  let n = 0;
  for (const s of sessions) for (const g of s.segments) if (test(s, g)) n++;
  return n;
}

/** How many of the period's blocks each outcome and each state would keep on its own. */
export interface ConditionCounts {
  outcome: Record<Outcome, number>;
  state: Record<BlockState, number>;
}

/** The count beside every outcome and state option, from the period's (unhidden) sessions. */
export function conditionCounts(sessions: CalendarSession[]): ConditionCounts {
  return {
    outcome: Object.fromEntries(
      OUTCOMES.map((o) => [o, countBlocks(sessions, (_, g) => hasOutcome(g, [o]))]),
    ) as Record<Outcome, number>,
    state: Object.fromEntries(
      STATES.map((st) => [st, countBlocks(sessions, (s, g) => inState(s, g, st))]),
    ) as Record<BlockState, number>,
  };
}

/** A project offered in the menu, with how many of the period's sessions it has. */
export interface ProjectRow {
  project: Project;
  count: number;
}

/**
 * Every project with its session count in the period, used ones first (busiest first), then by
 * name in the UI language's order, so the projects the period is about are at the top.
 */
export function projectRows(
  projects: Project[],
  sessions: CalendarSession[],
  locale: string,
): ProjectRow[] {
  const counts = new Map<number, number>();
  for (const s of sessions)
    if (s.projectId !== null) counts.set(s.projectId, (counts.get(s.projectId) ?? 0) + 1);
  return projects
    .map((p) => ({ project: p, count: counts.get(p.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.project.name.localeCompare(b.project.name, locale));
}

/**
 * The rows whose project name, repository or path contains the typed text, ignoring case and
 * surrounding spaces. All rows when nothing is typed.
 */
export function matchingProjectRows(rows: ProjectRow[], query: string): ProjectRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(({ project: p }) =>
    `${p.name} ${p.repo ?? ""} ${p.path}`.toLowerCase().includes(q),
  );
}

/** What the filter button counts as active: the menu's conditions and the hidden projects. */
export interface FilterBadge {
  /** Conditions set from the menu, hiding quick questions included. */
  conditions: number;
  hidden: number;
}

/**
 * The counts the filter button shows. Keywords are left out: the header's search field already
 * shows them.
 */
export function filterBadge(filter: Filter, projects: Project[]): FilterBadge {
  return {
    conditions: conditionCount(filter) + (filter.hideBrief ? 1 : 0),
    hidden: projects.filter((p) => p.hidden).length,
  };
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
