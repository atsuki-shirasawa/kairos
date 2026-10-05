// Scaling for the summary's bar charts and day timeline, as percentages for inline styles.
import { HOUR } from "./dates.ts";

/**
 * Percent of the largest of `values`, for bars scaled to the longest. The largest counts as at
 * least 1, so an all-zero chart draws empty bars instead of dividing by zero.
 */
export function scaleToMax(values: number[]): (value: number) => number {
  const max = Math.max(...values, 1);
  return (value) => (value / max) * 100;
}

/** Percent of the sum of `values`, for the parts of a stacked bar. An empty stack sums to 1. */
export function scaleToSum(values: number[]): (value: number) => number {
  const sum = values.reduce((n, v) => n + v, 0) || 1;
  return (value) => (value / sum) * 100;
}

/** A day's time axis, from the first to the last hour with work. */
export interface HourAxis {
  /** The whole hours to tick, from the first to the last (hours since midnight). */
  hours: number[];
  /** Where a time of day (ms since midnight) sits along the axis, in percent. */
  at: (t: number) => number;
}

/** The axis spanning `ranges` (ms since midnight), widened to whole hours; null when empty. */
export function hourAxis(ranges: { start: number; end: number }[]): HourAxis | null {
  if (ranges.length === 0) return null;
  const from = Math.floor(Math.min(...ranges.map((r) => r.start)) / HOUR);
  const to = Math.ceil(Math.max(...ranges.map((r) => r.end)) / HOUR);
  const hourCount = Math.max(to - from, 1);
  const span = hourCount * HOUR;
  return {
    hours: Array.from({ length: hourCount + 1 }, (_, i) => from + i),
    at: (t) => ((t - from * HOUR) / span) * 100,
  };
}
