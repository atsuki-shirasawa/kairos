// The live page's spend band: bars for the last hours of spend, its hour axis, and how a bar is
// read out.
import type { LiveSpend } from "@shared/api.ts";
import { SPEND_BUCKET_MS, SPEND_BUCKETS } from "@shared/constants.ts";
import { HOUR } from "@shared/dates.ts";
import { liveMessages } from "@/i18n/messages/live.ts";
import { hhmm } from "./dates.ts";
import { costLabel } from "./format.ts";

/** The time the bars span: whole buckets, the last one still in progress. */
export const SPAN_MS = SPEND_BUCKETS * SPEND_BUCKET_MS;
/** Hour labels closer than this share of the width to "Now" or the left end would collide. */
const TICK_CLEARANCE = 0.08;

/** Whole hours after `from` and before `to`, for the spend band's axis. */
export function hourTicks(from: number, to: number): number[] {
  const first = new Date(from);
  first.setMinutes(0, 0, 0);
  const ticks: number[] = [];
  for (let t = first.getTime() + HOUR; t < to; t += HOUR) ticks.push(t);
  return ticks;
}

/**
 * The hour labels the axis shows, each at its share of the width: whole hours in the band's span
 * from `from`, without those that would collide with the left end or with "Now" at `nowAt`.
 */
export function visibleTicks(from: number, nowAt: number): { t: number; at: number }[] {
  return hourTicks(from, from + SPAN_MS)
    .map((t) => ({ t, at: (t - from) / SPAN_MS }))
    .filter(({ at }) => at > TICK_CLEARANCE / 2 && Math.abs(nowAt - at) > TICK_CLEARANCE);
}

/** A spend bar's segments, as fractions of the band's height (the tallest bar fills it). */
export interface SpendBar {
  /** Start of the bar's span. */
  start: number;
  total: number;
  /** Height as a share of the band's: the bar's total against the tallest. */
  height: number;
  segments: { projectId: number | null; usd: number; share: number }[];
}

/** The spend band's bars, each scaled against the tallest. */
export function spendBars(
  spend: Pick<LiveSpend, "from" | "buckets">,
  bucketMs: number,
): SpendBar[] {
  const totals = spend.buckets.map((b) => b.reduce((n, p) => n + p.usd, 0));
  const max = Math.max(...totals, 0);
  return spend.buckets.map((b, i) => ({
    start: spend.from + i * bucketMs,
    total: totals[i] ?? 0,
    height: max > 0 ? (totals[i] ?? 0) / max : 0,
    segments: b.map((p) => ({ ...p, share: max > 0 ? p.usd / max : 0 })),
  }));
}

/** A bar's slot and total, which both its detail line and its spoken form start with. */
export function spendBarHeading(bar: Pick<SpendBar, "start" | "total">): string {
  return liveMessages().spend.bar(
    hhmm(bar.start),
    hhmm(bar.start + SPEND_BUCKET_MS),
    costLabel(bar.total),
  );
}

/** A bar for screen readers: its slot and total, then each project's name and amount. */
export function spendBarSpeech(
  bar: SpendBar,
  nameOf: (projectId: number | null) => string,
): string {
  return liveMessages().spend.barSplit(
    spendBarHeading(bar),
    bar.segments.map((s) => `${nameOf(s.projectId)} ${costLabel(s.usd)}`),
  );
}
