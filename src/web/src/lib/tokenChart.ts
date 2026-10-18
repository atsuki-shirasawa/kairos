// Today's token chart: today's tokens climbing by project, its time axis, the labels at its
// right end, and how a slot is read out.
import type { LiveTokens } from "@shared/api.ts";
import { TOKEN_BUCKET_MS } from "@shared/constants.ts";
import { HOUR } from "@shared/dates.ts";
import { liveMessages } from "@/i18n/messages/live.ts";
import { hhmm, startOfHour } from "./dates.ts";
import { tokensLabel } from "./format.ts";

/**
 * The least the chart spans: early in a quiet day the first use would otherwise fill the width
 * with a few minutes. Clamped to midnight, since the day's figures start there.
 */
export const MIN_SPAN_MS = 3 * HOUR;
/** Hour steps the axis may use, the smallest one that keeps it to `MAX_TICKS` labels. */
const TICK_STEPS = [1, 2, 3, 4, 6];
const MAX_TICKS = 6;
/** Hour labels closer than this share of the width to "Now" or the left end would collide. */
const TICK_CLEARANCE = 0.08;

/** One project's band in the chart: what it had used by each edge of the chart's slots. */
export interface TokenLayer {
  projectId: number | null;
  total: number;
  /** Tokens by `TokenChart.times[i]`, from 0 at the chart's start. */
  cumulative: number[];
}

/** Today's tokens as stacked, rising bands, with the time each point is at. */
export interface TokenChart {
  /** Left end of the chart, on a whole hour (or midnight). */
  start: number;
  /** Right end: now. */
  end: number;
  /** The edges of the 5-minute slots from `start` to `end`, both ends included. */
  times: number[];
  /** Largest first, which the chart draws at the bottom so the biggest band stays steady. */
  layers: TokenLayer[];
  /** Tokens over the chart, the height of its top edge at the right end. */
  total: number;
  /**
   * Each slot's tokens by project, largest first, as the server sent it (`times[i]` to
   * `times[i + 1]`).
   */
  slots: LiveTokens["buckets"];
}

/**
 * The chart for `tokens`: from the whole hour before the day's first use (at least `MIN_SPAN_MS`
 * before now, never before midnight) up to now, each project's tokens added up slot by slot.
 */
export function tokenChart(tokens: Pick<LiveTokens, "from" | "to" | "buckets">): TokenChart {
  const firstUsed = tokens.buckets.findIndex((b) => b.length > 0);
  const start = chartStart(
    tokens.from,
    tokens.to,
    firstUsed < 0 ? null : tokens.from + firstUsed * TOKEN_BUCKET_MS,
  );
  const first = Math.floor((start - tokens.from) / TOKEN_BUCKET_MS);
  const slots = tokens.buckets.slice(first);
  // Edges come from the buckets, not from `start`: a whole hour is a whole bucket from midnight
  // only where the zone's offset is a multiple of the bucket, which every zone in use is
  const edge = (i: number) => Math.min(tokens.from + (first + i + 1) * TOKEN_BUCKET_MS, tokens.to);
  const times = [start, ...slots.map((_, i) => edge(i))];
  const layers = layersOf(slots);
  return {
    start,
    end: tokens.to,
    times,
    layers,
    total: layers.reduce((n, l) => n + l.total, 0),
    slots,
  };
}

/** Where the chart starts: see `tokenChart`. */
function chartStart(midnight: number, now: number, firstUse: number | null): number {
  const earliest = startOfHour(now - MIN_SPAN_MS);
  const start = firstUse === null ? earliest : Math.min(startOfHour(firstUse), earliest);
  return Math.max(midnight, start);
}

/** Each project's running total over `slots`, largest total first. */
function layersOf(slots: LiveTokens["buckets"]): TokenLayer[] {
  const byProject = new Map<number | null, number[]>();
  slots.forEach((slot, i) => {
    for (const { projectId, tokens } of slot) {
      let used = byProject.get(projectId);
      if (!used) {
        used = new Array<number>(slots.length).fill(0);
        byProject.set(projectId, used);
      }
      used[i] = tokens;
    }
  });
  return [...byProject]
    .map(([projectId, used]) => {
      const cumulative = [0];
      for (const tokens of used) cumulative.push((cumulative.at(-1) ?? 0) + tokens);
      return { projectId, total: cumulative.at(-1) ?? 0, cumulative };
    })
    .sort((a, b) => b.total - a.total);
}

/**
 * The hour labels the axis shows, each at its share of the width: whole hours inside the chart,
 * every 1–6 hours so there are few enough, without those that would collide with the start's
 * label
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
 * The y of a token count in px from the top of a chart `height` tall whose top is `max`: the floor
 * when
 * nothing was used, so an empty chart is a flat line rather than a division by zero.
 */
export function tokenY(max: number, height: number): (tokens: number) => number {
  return (tokens) => (max > 0 ? height - (tokens / max) * height : height);
}

/**
 * Where each label at the chart's right end goes, as the y of its center in px from the top: at
 * the middle of its band's end, pushed apart to `gap` px and kept within `height`. Takes the bands'
 * [bottom, top] tokens at the right end, largest first, and the chart's top. Bands past what
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
  const y = tokenY(max, height);
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
export function slotAtShare(chart: TokenChart, share: number): number | null {
  const t = chart.start + share * (chart.end - chart.start);
  const i = chart.times.findLastIndex((s, k) => s <= t && k < chart.times.length - 1);
  return i < 0 ? null : i;
}

/** Where slot `i` sits, as shares of the chart's width; null for a slot it doesn't have. */
export function slotBox(chart: TokenChart, i: number): { left: number; width: number } | null {
  const span = chart.end - chart.start;
  const from = chart.times[i];
  const to = chart.times[i + 1];
  if (from === undefined || to === undefined || span <= 0) return null;
  return { left: (from - chart.start) / span, width: (to - from) / span };
}

/** Slot `i`'s tokens: its total, then each project's, largest first. */
export function slotTokens(chart: TokenChart, i: number) {
  const parts = chart.slots[i] ?? [];
  return { total: parts.reduce((n, p) => n + p.tokens, 0), parts };
}

/**
 * Slot `i`'s time range and what it added, which both its caption and its spoken form start with.
 * The slot in progress ends at now, not five minutes on.
 */
export function slotHeading(chart: TokenChart, i: number): string {
  const from = chart.times[i] ?? chart.start;
  const to = chart.times[i + 1] ?? chart.end;
  return liveMessages().tokens.slot(hhmm(from), hhmm(to), tokensLabel(slotTokens(chart, i).total));
}

/** Slot `i` for screen readers: its heading, then each project's name and amount. */
export function slotSpeech(
  chart: TokenChart,
  i: number,
  nameOf: (projectId: number | null) => string,
): string {
  return liveMessages().tokens.slotSplit(
    slotHeading(chart, i),
    slotTokens(chart, i).parts.map((p) =>
      liveMessages().tokens.layer(nameOf(p.projectId), tokensLabel(p.tokens)),
    ),
  );
}

/** A project's share of the chart for screen readers: its name and what it used. */
export function layerSpeech(layer: TokenLayer, nameOf: (projectId: number | null) => string) {
  return liveMessages().tokens.layer(nameOf(layer.projectId), tokensLabel(layer.total));
}

/** One band drawn in a `width` × `height` box: its filled area and the line along its top. */
export interface LayerPath {
  projectId: number | null;
  area: string;
  edge: string;
  /** The band's [bottom, top] tokens at the right end, for its label. */
  end: { bottom: number; top: number };
}

/**
 * The chart's bands as SVG paths, the largest at the bottom, each on top of the ones below it.
 * Between two slot edges a band rises in a straight line: the slot's tokens came in over its five
 * minutes, and a step would claim it all landed at once.
 */
export function layerPaths(chart: TokenChart, width: number, height: number): LayerPath[] {
  const span = chart.end - chart.start;
  const x = (t: number) => (span > 0 ? ((t - chart.start) / span) * width : width);
  const y = tokenY(chart.total, height);
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
