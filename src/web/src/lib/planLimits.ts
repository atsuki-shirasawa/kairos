import { PLAN_WINDOW_KINDS, type PlanLimits, type PlanWindowKind } from "@shared/api.ts";
import { MINUTE } from "@shared/dates.ts";

/** Used share at which a window turns `warn`: what is left may not see the work through. */
export const LIMIT_WARN_PERCENT = 80;

/**
 * How old a reading gets before the band says when it was taken. Claude Code reports the limits
 * on every status line update, so an older one means it hasn't run for a while (usage elsewhere,
 * on claude.ai say, may have moved them since).
 */
export const LIMITS_STALE_MS = 10 * MINUTE;

/** A window as Today shows it. */
export interface PlanWindowShown {
  kind: PlanWindowKind;
  /** Whole percent used, 0–100; 0 once the window has reset. */
  usedPercent: number;
  resetsAt: number;
  /** The reset time has passed since the reading, so the window has started over. */
  reset: boolean;
  warn: boolean;
}

/** The windows to show as of `now`, leaving out any Claude Code didn't report. */
export function planWindows(limits: PlanLimits, now: number): PlanWindowShown[] {
  return PLAN_WINDOW_KINDS.flatMap((kind) => {
    const w = limits[kind];
    if (!w) return [];
    const reset = w.resetsAt <= now;
    const usedPercent = reset ? 0 : Math.min(100, Math.max(0, Math.round(w.usedPercent)));
    return [
      { kind, usedPercent, resetsAt: w.resetsAt, reset, warn: usedPercent >= LIMIT_WARN_PERCENT },
    ];
  });
}

/** When the reading was taken, if it is old enough to say so; null while it is current. */
export function staleSince(limits: PlanLimits, now: number): number | null {
  return now - limits.seenAt >= LIMITS_STALE_MS ? limits.seenAt : null;
}
