import type { LiveTokens, Project } from "@shared/api.ts";
import { TOKEN_BUCKET_MS } from "@shared/constants.ts";
import { MINUTE } from "@shared/dates.ts";
import { useState } from "react";
import { liveMessages } from "@/i18n/messages/live.ts";
import { projectColor } from "@/lib/colors.ts";
import { hhmm } from "@/lib/dates.ts";
import { tokensLabel, tokensPerHourLabel } from "@/lib/format.ts";
import { projectOf } from "@/lib/selection.ts";
import {
  axisTicks,
  type LayerPath,
  labelPositions,
  layerPaths,
  layerSpeech,
  slotAtShare,
  slotBox,
  slotHeading,
  slotSpeech,
  slotTokens,
  type TokenChart,
  tokenChart,
  tokenY,
} from "@/lib/tokenChart.ts";

/** The plot's height in px. The SVG stretches to the width, so only the height is fixed. */
const PLOT_PX = 112;
/** Room kept above the top edge, so its line and the now dot aren't cut off. */
const HEADROOM_PX = 8;
/** The SVG's drawing width; it is scaled to the element, with strokes kept at their own width. */
const VIEW_W = 1000;
/** Height the bands are drawn in, below the headroom. */
const DRAW_PX = PLOT_PX - HEADROOM_PX;
/** The vertical space one label at the right end needs. */
const LABEL_PX = 18;

/**
 * The page's tokens, above the columns: today's total and the current rate, then the day so far as
 * bands of project color rising from the floor, so the height at the right end is today's total
 * and the slope is the pace. Each band is named at its end with what it used; a spike is a steep
 * climb rather than a bar that dwarfs the rest. Pointing at the chart (or tapping it) names a
 * 5-minute slot and what each project added in it; screen readers get each project's share. It
 * counts every visible session, not only the running ones, and notes that cache reads are counted,
 * since they make up most of a total that would otherwise look implausibly large.
 */
export function TokenBand({
  tokens,
  projects,
}: {
  tokens: LiveTokens;
  projects: ReadonlyMap<number, Project>;
}) {
  const m = liveMessages();
  const chart = tokenChart(tokens);
  const paths = layerPaths(chart, VIEW_W, DRAW_PX);
  // Keyed by the slot's start: after a refetch the same index can be another slot
  const [pointed, setPointed] = useState<number | null>(null);
  const slot = pointed === null ? -1 : chart.times.indexOf(pointed);
  const pointSlot = (i: number | null) => setPointed(i === null ? null : (chart.times[i] ?? null));
  const colorOf = (id: number | null) => projectColor(projectOf(projects, id));
  const nameOf = (id: number | null) => projectOf(projects, id)?.name ?? m.tokens.noProject;
  return (
    <section
      aria-label={m.tokens.chart(hhmm(chart.start), hhmm(chart.end))}
      className="border-b px-5 pt-4 pb-3 max-lg:px-3"
    >
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <dl className="flex gap-x-6">
          <Figure label={m.tokens.today} value={tokensLabel(tokens.today)} />
          <Figure label={m.tokens.rate} value={tokensPerHourLabel(tokens.perHour)} />
        </dl>
        <p aria-hidden className="mb-0.5 h-4 min-w-0 flex-1 text-xs">
          {slot >= 0 ? (
            <SlotDetail chart={chart} slot={slot} colorOf={colorOf} nameOf={nameOf} />
          ) : (
            <span className="text-muted-foreground">
              {chart.total > 0 && m.tokens.hint(TOKEN_BUCKET_MS / MINUTE)}
            </span>
          )}
        </p>
      </div>
      <figure className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(6rem,11rem)] gap-x-3">
        <Plot chart={chart} paths={paths} pointed={slot} onPoint={pointSlot} colorOf={colorOf} />
        <EndLabels chart={chart} paths={paths} colorOf={colorOf} nameOf={nameOf} />
        <Axis chart={chart} />
        <ul className="sr-only">
          {chart.layers.map((l) => (
            <li key={l.projectId ?? "none"}>{layerSpeech(l, nameOf)}</li>
          ))}
          {chart.slots.map(
            (parts, i) =>
              parts.length > 0 && <li key={chart.times[i]}>{slotSpeech(chart, i, nameOf)}</li>,
          )}
        </ul>
      </figure>
      <p className="mt-1 text-muted-foreground text-xs">{m.tokens.note}</p>
    </section>
  );
}

/** One figure of the band: its name in 12px `muted-ink` over its amount in the numeral face. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium font-num text-[17px] leading-6">{value}</dd>
    </div>
  );
}

/**
 * The bands, each a block fill under a line in its project color, over a `line` floor, with the
 * pointed slot lit as a `muted` column and the indigo now dot on the top edge at the right end.
 * Pointing picks the slot under the pointer; a tap toggles it, since a touch has no hover to end.
 */
function Plot({
  chart,
  paths,
  pointed,
  onPoint,
  colorOf,
}: {
  chart: TokenChart;
  paths: LayerPath[];
  pointed: number;
  onPoint: (slot: number | null) => void;
  colorOf: (projectId: number | null) => string;
}) {
  const slotAt = (e: React.PointerEvent<HTMLDivElement>): number | null => {
    const box = e.currentTarget.getBoundingClientRect();
    return slotAtShare(chart, (e.clientX - box.left) / box.width);
  };
  const lit = slotBox(chart, pointed);
  return (
    <div
      aria-hidden
      onPointerMove={(e) => {
        if (e.pointerType !== "touch") onPoint(slotAt(e));
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") onPoint(null);
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== "touch") return;
        const at = slotAt(e);
        onPoint(at === pointed ? null : at);
      }}
      className="relative"
      style={{ height: PLOT_PX }}
    >
      {lit && (
        <span
          className="absolute inset-y-0 min-w-0.5 rounded-sm bg-muted"
          style={{ left: `${lit.left * 100}%`, width: `${lit.width * 100}%` }}
        />
      )}
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${VIEW_W} ${DRAW_PX}`}
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 w-full overflow-visible"
        style={{ height: DRAW_PX }}
      >
        {paths.map((p) => (
          <Band key={p.projectId ?? "none"} path={p} color={colorOf(p.projectId)} />
        ))}
        <line
          x1={0}
          x2={VIEW_W}
          y1={DRAW_PX}
          y2={DRAW_PX}
          vectorEffect="non-scaling-stroke"
          className="stroke-border"
        />
      </svg>
      <NowDot top={HEADROOM_PX + tokenY(chart.total, DRAW_PX)(chart.total)} />
    </div>
  );
}

/**
 * A project's band: the block fill (its color mixed into `block-base`, as on the calendar) and a
 * 1.5px line in the full color along its top, so stacked bands stay apart where fills meet.
 */
function Band({ path, color }: { path: LayerPath; color: string }) {
  return (
    <g style={{ "--c": color } as React.CSSProperties}>
      <path
        d={path.area}
        className="[fill:color-mix(in_oklch,var(--c)_var(--mix-block),var(--block-base))]"
      />
      <path
        d={path.edge}
        fill="none"
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="stroke-[var(--c)]"
      />
    </g>
  );
}

/** Now, where the top edge meets the right end: the calendar's indigo dot, ringed by the surface. */
function NowDot({ top }: { top: number }) {
  return (
    <span
      className="pointer-events-none absolute right-0 size-2 translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-card"
      style={{ top }}
    />
  );
}

/**
 * Each band's name and tokens beside its end, in its color's swatch, `ink` amount and `muted-ink`
 * name. Labels are pushed apart where bands are thin; the smallest bands get none when they
 * don't fit (`labelPositions`).
 */
function EndLabels({
  chart,
  paths,
  colorOf,
  nameOf,
}: {
  chart: TokenChart;
  paths: LayerPath[];
  colorOf: (projectId: number | null) => string;
  nameOf: (projectId: number | null) => string;
}) {
  const ys = labelPositions(
    paths.map((p) => p.end),
    chart.total,
    DRAW_PX,
    LABEL_PX,
  );
  return (
    <ul aria-hidden className="relative text-xs" style={{ height: PLOT_PX }}>
      {paths.map((p, i) => {
        const y = ys[i];
        if (y === null || y === undefined) return null;
        const layer = chart.layers[i];
        return (
          <li
            key={p.projectId ?? "none"}
            className="absolute inset-x-0 flex -translate-y-1/2 items-center gap-1.5 leading-4"
            style={{ top: HEADROOM_PX + y }}
          >
            <span
              className="h-2.5 w-1 shrink-0 rounded-full"
              style={{ background: colorOf(p.projectId) }}
            />
            <span className="min-w-0 truncate text-muted-foreground">{nameOf(p.projectId)}</span>
            <span className="ml-auto font-num">{tokensLabel(layer?.total ?? 0)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Hours under the plot, every 1–6 hours as the span needs, and "Now" in indigo at the right. */
function Axis({ chart }: { chart: TokenChart }) {
  const m = liveMessages();
  return (
    <div aria-hidden className="relative mt-1.5 h-4 font-num text-muted-foreground text-xs">
      {axisTicks(chart.start, chart.end).map(({ t, at }) => (
        <span key={t} className="absolute -translate-x-1/2" style={{ left: `${at * 100}%` }}>
          {hhmm(t)}
        </span>
      ))}
      {/* The left end names where the chart starts, which moves with the day's first use */}
      <span className="absolute left-0">{hhmm(chart.start)}</span>
      <span className="absolute right-0 translate-x-1/2 text-primary">{m.tokens.now}</span>
    </div>
  );
}

/** The pointed slot: its time and what it added, then each project's share with its color. */
function SlotDetail({
  chart,
  slot,
  colorOf,
  nameOf,
}: {
  chart: TokenChart;
  slot: number;
  colorOf: (projectId: number | null) => string;
  nameOf: (projectId: number | null) => string;
}) {
  return (
    <span className="flex items-baseline gap-x-3 overflow-hidden whitespace-nowrap">
      <span className="font-num">{slotHeading(chart, slot)}</span>
      {slotTokens(chart, slot).parts.map((s) => (
        <span key={s.projectId ?? "none"} className="flex items-center gap-1 text-muted-foreground">
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: colorOf(s.projectId) }}
          />
          {nameOf(s.projectId)}
          <span className="font-num">{tokensLabel(s.tokens)}</span>
        </span>
      ))}
    </span>
  );
}
