// Summarizes every section that still lacks a summary, for `kairos summarize`. Automatic runs only
// reach back a week, so older sections otherwise wait for someone to open them in the drawer.
import type { Database } from "bun:sqlite";
import { loadHeadline, type NamedTarget } from "./store.ts";
import { NO_CONVERSATION, type Summarizer } from "./summarizer.ts";

/**
 * Stops after this many failures in a row. A logged-out or missing `claude` fails every section
 * the same way, so carrying on would only repeat the error hundreds of times.
 */
export const MAX_CONSECUTIVE_FAILURES = 3;

/** How one section went: a full summary, a headline only, nothing to summarize, or an error. */
export type BackfillStatus = "summary" | "title" | "skipped" | "failed";

/** Progress after each section, for printing. */
export interface BackfillProgress {
  /** 1-based position among `total`. */
  index: number;
  total: number;
  target: NamedTarget;
  status: BackfillStatus;
  /** The saved headline when it succeeded, otherwise the failure message. */
  detail: string | null;
}

/** Counts per status, and why the run stopped early if it did. */
export interface BackfillResult {
  counts: Record<BackfillStatus, number>;
  /** Set when the run gave up after `MAX_CONSECUTIVE_FAILURES` failures in a row. */
  abortedBy: string | null;
}

/**
 * Summarizes the given sections (from `findTargets`) one at a time (one `claude -p` at a time, like the server does).
 * Each summary is saved as soon as it is written, so an interrupted run resumes where it stopped.
 */
export async function backfill(
  db: Database,
  summarizer: Summarizer,
  targets: NamedTarget[],
  hooks: {
    /** Before each section, with its 0-based position. */
    onStart?: (target: NamedTarget, index: number) => void;
    /** After each section. */
    onProgress?: (p: BackfillProgress) => void;
  } = {},
): Promise<BackfillResult> {
  const counts: Record<BackfillStatus, number> = { summary: 0, title: 0, skipped: 0, failed: 0 };
  let streak = 0;
  for (const [i, target] of targets.entries()) {
    hooks.onStart?.(target, i);
    const ok = await summarizer.summarize(target);
    const error = ok ? null : summarizer.errorOf(target.sessionId, target.start);
    const status: BackfillStatus = ok
      ? target.mode
      : error === NO_CONVERSATION
        ? "skipped"
        : "failed";
    counts[status]++;
    hooks.onProgress?.({
      index: i + 1,
      total: targets.length,
      target,
      status,
      detail: ok ? loadHeadline(db, target) : error,
    });
    streak = status === "failed" ? streak + 1 : 0;
    if (streak >= MAX_CONSECUTIVE_FAILURES) return { counts, abortedBy: error };
  }
  return { counts, abortedBy: null };
}
