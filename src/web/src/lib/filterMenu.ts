// What the filter menu lists beside its options: how many of the period's blocks each one keeps,
// and which branches there are to choose from.
import type { CalendarSession } from "@shared/api.ts";
import type { SegmentMatch } from "./filter.ts";

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
