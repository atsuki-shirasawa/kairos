// The summary's "done" list: which recaps are still to write, and how blocks and PRs are labelled.
import type { Artifact, Recap } from "@shared/api.ts";
import { isSameDay } from "./dates.ts";
import type { DayBlock } from "./layout.ts";
import type { ProjectSummary } from "./summary.ts";

/** Projects whose recap is missing or out of date (and not being written), in the order given. */
export function unwrittenRecaps(shown: ProjectSummary[], recaps: Map<number, Recap>): number[] {
  return shown.flatMap((p) => {
    const r = p.projectId !== null ? recaps.get(p.projectId) : undefined;
    return r && !r.pending && (!r.body || r.stale) ? [r.projectId] : [];
  });
}

/** Whether block `i` starts on another day than the one before it (always true for the first). */
export function startsNewDay(blocks: DayBlock[], i: number): boolean {
  const start = blocks[i]?.segment.start ?? Number.NaN;
  return !isSameDay(start, blocks[i - 1]?.segment.start ?? Number.NaN);
}

/** "#123" for a GitHub PR URL; otherwise the PR's title, or its reference when untitled. */
export function prLabel(a: Artifact): string {
  const num = /\/pull\/(\d+)/.exec(a.ref)?.[1];
  return num ? `#${num}` : a.title || a.ref;
}
