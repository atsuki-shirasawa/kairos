// What one row of the Journal's day page says about its block: heading, time, what got resolved
// and the commits and PRs it made. Enough to read the day without opening each block.
import type { Artifact } from "@shared/api.ts";
import { parseSummaryBody } from "@shared/summaryBody.ts";
import { burstSpan, timeRange } from "./blockFacts.ts";
import type { DayBlock } from "./dayBlocks.ts";
import { blockArtifacts } from "./moments.ts";
import { isDim } from "./selection.ts";

/** Resolved points a row shows; the drawer beside it has the rest. */
export const ROW_RESOLVED = 2;
/** Commits and PRs a row lists before counting the rest. */
export const ROW_MOMENTS = 3;

/** What a row of the day page shows. */
export interface RowFacts {
  label: string;
  range: string;
  durationMs: number;
  /**
   * The heading is a first prompt waiting for a summary (`isDim`). Never for a burst, whose
   * heading is its count.
   */
  dim: boolean;
  /** The summary's first Resolved points (or an older body's Outcome), Markdown. */
  resolved: string[];
  /** The first commits and PRs, and how many more there are. */
  artifacts: Artifact[];
  moreArtifacts: number;
}

/**
 * What the summary says got resolved: its first Resolved points, or the single Outcome of a body
 * written before Resolved and Open were split. Nothing for a body in neither format.
 */
export function resolvedPoints(body: string | null): string[] {
  const parts = body ? parseSummaryBody(body) : null;
  if (!parts) return [];
  const points = parts.resolved.length > 0 ? parts.resolved : parts.outcome ? [parts.outcome] : [];
  return points.slice(0, ROW_RESOLVED);
}

/**
 * The facts of a row standing for `runs`: one block, or a burst of headless runs, which reads as
 * the burst's count and span like its mark on the calendar. `lead` is the run the row opens.
 */
export function rowFacts(runs: readonly DayBlock[], lead: DayBlock): RowFacts {
  if (runs.length > 1) {
    return { ...burstSpan(runs), dim: false, resolved: [], artifacts: [], moreArtifacts: 0 };
  }
  const all = blockArtifacts(lead);
  return {
    label: lead.segment.headline,
    range: timeRange(lead),
    durationMs: lead.end - lead.start,
    dim: isDim(lead),
    resolved: resolvedPoints(lead.segment.body),
    artifacts: all.slice(0, ROW_MOMENTS),
    moreArtifacts: Math.max(0, all.length - ROW_MOMENTS),
  };
}
