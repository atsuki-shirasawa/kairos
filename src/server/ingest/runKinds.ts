// What kind of run a headless session is, decided over every headless run of its launch directory:
// an automated loop comes back day after day and leaves commits and PRs, while a probe or a quick
// check runs a few times in one sitting and leaves nothing.
import { HOUR, isoDay } from "../../shared/dates.ts";
import type { RunKind } from "../runKinds.ts";

/**
 * Least time between a directory's first and last run for runs on two days to count as coming
 * back: a sitting of probes that crosses midnight is still one sitting.
 */
export const RETURN_GAP_MS = 12 * HOUR;

/** A headless run as the rule sees it. */
export interface HeadlessRun {
  startedAt: number | null;
  /** Whether the run recorded a commit, PR or merge. */
  made: boolean;
}

/**
 * The kind of every headless run of one launch directory: automation when they ran on more than
 * one local day, at least `RETURN_GAP_MS` apart, or any of them made a commit or PR, else trial.
 * On real logs (2026-10-16) this picked out exactly the one loop (35 runs over 5 days, 14 with a
 * PR) from 21 directories of probes, each used on a single day with nothing made.
 */
export function runKindOf(runs: readonly HeadlessRun[]): RunKind {
  if (runs.some((r) => r.made)) return "automation";
  const starts = runs.flatMap((r) => (r.startedAt === null ? [] : [r.startedAt]));
  const days = new Set(starts.map(isoDay));
  const span = starts.length ? Math.max(...starts) - Math.min(...starts) : 0;
  return days.size > 1 && span >= RETURN_GAP_MS ? "automation" : "trial";
}
