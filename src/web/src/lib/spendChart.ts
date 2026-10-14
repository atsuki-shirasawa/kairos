// The live page's spend chart: today's spend climbing by project, its time axis, the labels at its
// right end, and how a slot is read out.
import type { LiveSpend } from "@shared/api.ts";
import { SPEND_BUCKET_MS } from "@shared/constants.ts";
import { HOUR } from "@shared/dates.ts";
import { liveMessages } from "@/i18n/messages/live.ts";
import { hhmm, startOfHour } from "./dates.ts";
import { costLabel } from "./format.ts";

/**
 * The least the chart spans: early in a quiet day the first spend would otherwise fill the width
 * with a few minutes. Clamped to midnight, since the day's figures start there.
 */
export const MIN_SPAN_MS = 3 * HOUR;
/** Hour steps the axis may use, the smallest one that keeps it to `MAX_TICKS` labels. */
const TICK_STEPS = [1, 2, 3, 4, 6];
const MAX_TICKS = 6;
/** Hour labels closer than this share of the width to "Now" or the left end would collide. */
const TICK_CLEARANCE = 0.08;

/** One project's band in the chart: what it had spent by each edge of the chart's slots. */
export interface SpendLayer {
  projectId: number | null;
  total: number;
  /** Spend by `SpendChart.times[i]`, from 0 at the chart's start. */
  cumulative: number[];
}

/** Today's spend as stacked, rising bands, with the time each point is at. */
export interface SpendChart {
  /** Left end of the chart, on a whole hour (or midnight). */
  start: number;
  /** Right end: now. */
  end: number;
  /** The edges of the 5-minute slots from `start` to `end`, both ends included. */
  times: number[];
  /** Largest first, which the chart draws at the bottom so the biggest band stays steady. */
  layers: SpendLayer[];
  /** Spend over the chart, the height of its top edge at the right end. */
  total: number;
  /** Each slot's spend by project, largest first, as the server sent it (`times[i]` to `[i + 1]`). */
  slots: LiveSpend["buckets"];
}

/**
 * The chart for `spend`: from the whole hour before the day's first spend (at least `MIN_SPAN_MS`
 * before now, never before midnight) up to now, each project's spend added up slot by slot.
 */
export function spendChart(spend: Pick<LiveSpend, "from" | "to" | "buckets">): SpendChart {
  const firstSpent = spend.buckets.findIndex((b) => b.length > 0);
  const start = chartStart(
    spend.from,
    spend.to,
    firstSpent < 0 ? null : spend.from + firstSpent * SPEND_BUCKET_MS,
  );
  const first = Math.floor((start - spend.from) / SPEND_BUCKET_MS);
  const slots = spend.buckets.slice(first);
  // Edges come from the buckets, not from `start`: a whole hour is a whole bucket from midnight
  // only where the zone's offset is a multiple of the bucket, which every zone in use is
  const edge = (i: number) => Math.min(spend.from + (first + i + 1) * SPEND_BUCKET_MS, spend.to);
  const times = [start, ...slots.map((_, i) => edge(i))];
  const layers = layersOf(slots);
  return {
    start,
    end: spend.to,
    times,
    layers,
    total: layers.reduce((n, l) => n + l.total, 0),
    slots,
  };
}

/** Where the chart starts: see `spendChart`. */
function chartStart(midnight: number, now: number, firstSpend: number | null): number {
  const earliest = startOfHour(now - MIN_SPAN_MS);
  const start = firstSpend === null ? earliest : Math.min(startOfHour(firstSpend), earliest);
  return Math.max(midnight, start);
}

/** Each project's running total over `slots`, largest total first. */
function layersOf(slots: LiveSpend["buckets"]): SpendLayer[] {
  const byProject = new Map<number | null, number[]>();
  slots.forEach((slot, i) => {
    for (const { projectId, usd } of slot) {
      let spent = byProject.get(projectId);
      if (!spent) {
        spent = new Array<number>(slots.length).fill(0);
        byProject.set(projectId, spent);
      }
      spent[i] = usd;
    }
  });
  return [...byProject]
    .map(([projectId, spent]) => {
      const cumulative = [0];
      for (const usd of spent) cumulative.push((cumulative.at(-1) ?? 0) + usd);
      return { projectId, total: cumulative.at(-1) ?? 0, cumulative };
    })
    .sort((a, b) => b.total - a.total);
}

/**
 * The hour labels the axis shows, each at its share of the width: whole hours inside the chart,
 * every 1–6 hours so there are few enough, without those that would collide with the start's label
 * at the left end or with "Now" at the right.
 */
export function axisTicks(start: number, end: number): { t: number; at: number }[] {
  const span = end - start;
  if (span <= 0) return [];
  const step = TICK_STEPS.find((h) => span / (h * HOUR) <= MAX_TICKS) ?? TICK_STEPS.at(-1) ?? 1;
  const ticks: { t: number; at: number }[] = [];
  for (let t = startOfHour(start) + HOUR; t < end; t += HOUR) {
    if (new Date(t).getHours() % step === 0) ticks.push({ t, at: (t - start) / span });
  }
  return ticks.filter(({ at }) => at > TICK_CLEARANCE && 1 - at > TICK_CLEARANCE);
}

/**
 * The y of a spend in px from the top of a chart `height` tall whose top is `max`: the floor when
 * nothing was spent, so an empty chart is a flat line rather than a division by zero.
 */
export function spendY(max: number, height: number): (usd: number) => number {
  return (usd) => (max > 0 ? height - (usd / max) * height : height);
}

/**
 * Where each label at the chart's right end goes, as the y of its center in px from the top: at
 * the middle of its band's end, pushed apart to `gap` px and kept within `height`. Takes the bands'
 * [bottom, top] spends at the right end, largest first, and the chart's top spend. Bands past what
 * `height` can hold, the smallest, get no label (`null`); only a pointed slot's caption and the
 * screen reader list name them, which is fine for the few minor projects of a busy day.
 */
export function labelPositions(
  bands: { bottom: number; top: number }[],
  max: number,
  height: number,
  gap: number,
): (number | null)[] {
  const room = Math.max(1, Math.floor(height / gap));
  const y = spendY(max, height);
  // Bands come largest first, so the labelled ones are the first `room`
  const placed = bands.slice(0, room).map((b, i) => ({ i, y: (y(b.bottom) + y(b.top)) / 2 }));
  placed.sort((a, b) => a.y - b.y);
  const half = gap / 2;
  for (let k = 0; k < placed.length; k++) {
    const p = placed[k];
    const above = placed[k - 1];
    if (p) p.y = Math.max(p.y, above ? above.y + gap : half);
  }
  for (let k = placed.length - 1; k >= 0; k--) {
    const p = placed[k];
    const below = placed[k + 1];
    if (p) p.y = Math.min(p.y, below ? below.y - gap : height - half);
  }
  const out: (number | null)[] = bands.map(() => null);
  for (const p of placed) out[p.i] = p.y;
  return out;
}

/**
 * The slot under a point `share` of the chart's width in, as its index; null off the chart. The
 * last edge is now and starts no slot.
 */
export function slotAtShare(chart: SpendChart, share: number): number | null {
  const t = chart.start + share * (chart.end - chart.start);
  const i = chart.times.findLastIndex((s, k) => s <= t && k < chart.times.length - 1);
  return i < 0 ? null : i;
}

/** Where slot `i` sits, as shares of the chart's width; null for a slot it doesn't have. */
export function slotBox(chart: SpendChart, i: number): { left: number; width: number } | null {
  const span = chart.end - chart.start;
  const from = chart.times[i];
  const to = chart.times[i + 1];
  if (from === undefined || to === undefined || span <= 0) return null;
  return { left: (from - chart.start) / span, width: (to - from) / span };
}

/** Slot `i`'s spend: its total, then each project's, largest first. */
export function slotSpend(chart: SpendChart, i: number) {
  const parts = chart.slots[i] ?? [];
  return { total: parts.reduce((n, p) => n + p.usd, 0), parts };
}

/**
 * Slot `i`'s time range and what it added, which both its caption and its spoken form start with.
 * The slot in progress ends at now, not five minutes on.
 */
export function slotHeading(chart: SpendChart, i: number): string {
  const from = chart.times[i] ?? chart.start;
  const to = chart.times[i + 1] ?? chart.end;
  return liveMessages().spend.slot(hhmm(from), hhmm(to), costLabel(slotSpend(chart, i).total));
}

/** Slot `i` for screen readers: its heading, then each project's name and amount. */
export function slotSpeech(
  chart: SpendChart,
  i: number,
  nameOf: (projectId: number | null) => string,
): string {
  return liveMessages().spend.slotSplit(
    slotHeading(chart, i),
    slotSpend(chart, i).parts.map((p) =>
      liveMessages().spend.layer(nameOf(p.projectId), costLabel(p.usd)),
    ),
  );
}

/** A project's share of the chart for screen readers: its name and what it spent. */
export function layerSpeech(layer: SpendLayer, nameOf: (projectId: number | null) => string) {
  return liveMessages().spend.layer(nameOf(layer.projectId), costLabel(layer.total));
}

/** One band drawn in a `width` × `height` box: its filled area and the line along its top. */
export interface LayerPath {
  projectId: number | null;
  area: string;
  edge: string;
  /** The band's [bottom, top] spend at the right end, for its label. */
  end: { bottom: number; top: number };
}

/**
 * The chart's bands as SVG paths, the largest at the bottom, each on top of the ones below it.
 * Between two slot edges a band rises in a straight line: the slot's spend came in over its five
 * minutes, and a step would claim it all landed at once.
 */
export function layerPaths(chart: SpendChart, width: number, height: number): LayerPath[] {
  const span = chart.end - chart.start;
  const x = (t: number) => (span > 0 ? ((t - chart.start) / span) * width : width);
  const y = spendY(chart.total, height);
  const base = chart.times.map(() => 0);
  return chart.layers.map((layer) => {
    const bottom = [...base];
    const top = bottom.map((b, i) => b + (layer.cumulative[i] ?? 0));
    top.forEach((v, i) => {
      base[i] = v;
    });
    const along = (values: number[]) =>
      chart.times.map((t, i) => `${x(t).toFixed(2)},${y(values[i] ?? 0).toFixed(2)}`);
    const edge = along(top);
    return {
      projectId: layer.projectId,
      area: `M${edge.join("L")}L${along(bottom).reverse().join("L")}Z`,
      edge: `M${edge.join("L")}`,
      end: { bottom: bottom.at(-1) ?? 0, top: top.at(-1) ?? 0 },
    };
  });
}
