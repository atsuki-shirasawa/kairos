// Comparing a period's totals with the period before, as the summary's figures show them.
import type { PeriodSummary } from "./summary.ts";

/** "+2h 10m" / "−3". The minus is U+2212 so it lines up with the plus in tabular figures. */
export function signed(diff: number, label: (n: number) => string): string {
  return `${diff > 0 ? "+" : "−"}${label(Math.abs(diff))}`;
}

/** The figures compared with the period before. */
export interface Comparable {
  busyMs: number;
  prs: number;
  commits: number;
  tokens: number;
  /** Cost in whole cents. */
  cents: number;
}

/**
 * The figures to compare, rounded so noise never reads as a change: working time to the minute
 * and cost to whole cents (float sums of dollars rarely match exactly).
 */
export function comparable(s: PeriodSummary): Comparable {
  return {
    busyMs: Math.round(s.busyMs / 60_000) * 60_000,
    prs: s.prs.length,
    commits: s.commits,
    tokens: s.usage?.tokens ?? 0,
    cents: Math.round((s.usage?.costUsd ?? 0) * 100),
  };
}

/**
 * How far into the period [from, to) `now` is, floored to the minute, or null when the period
 * isn't running. Minutes are enough, and keep the comparison from being redone every time `now`
 * ticks.
 */
export function elapsedInPeriod(now: number, from: number, to: number): number | null {
  return now >= from && now < to ? Math.floor((now - from) / 60_000) * 60_000 : null;
}
