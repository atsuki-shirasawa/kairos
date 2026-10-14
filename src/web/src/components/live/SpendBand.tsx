import type { LiveSpend, Project } from "@shared/api.ts";
import { SPEND_BUCKET_MS, SPEND_BUCKETS } from "@shared/constants.ts";
import { HOUR } from "@shared/dates.ts";
import { useState } from "react";
import { liveMessages } from "@/i18n/messages/live.ts";
import { projectColor } from "@/lib/colors.ts";
import { hhmm } from "@/lib/dates.ts";
import { costLabel, costPerHourLabel } from "@/lib/format.ts";
import { hourTicks, type SpendBar, spendBars } from "@/lib/live.ts";
import { projectOf } from "@/lib/selection.ts";
import { cn } from "@/lib/utils.ts";

/** Pixels a bar with any spend keeps, taller than an empty slot's stub so it reads as spent. */
const MIN_BAR_PX = 4;
/** Hour labels closer than this share of the width to "Now" or the left end would collide. */
const TICK_CLEARANCE = 0.08;
/** The time the bars span: whole buckets, the last one still in progress. */
const SPAN_MS = SPEND_BUCKETS * SPEND_BUCKET_MS;

/**
 * The page's money at a glance, above the columns: today's spend and the current rate, then the
 * last three hours as slots of 5 minutes, each a bar stacked in project colors so a spike says
 * whose it was, with the indigo now mark the calendar uses in the slot in progress. Pointing at a
 * slot (or tapping it) puts its time and split by project above the bars; screen readers get the
 * same as a list. It counts every visible session, not only the running ones, and carries the
 * page's one caveat that amounts are list-price estimates. Times come from the data, not the
 * clock, so the axis always matches the bars it labels.
 */
export function SpendBand({
  spend,
  projects,
}: {
  spend: LiveSpend;
  projects: ReadonlyMap<number, Project>;
}) {
  const m = liveMessages();
  const bars = spendBars(spend, SPEND_BUCKET_MS);
  // Keyed by the slot's start: after a refetch the same index can be another slot
  const [pointed, setPointed] = useState<number | null>(null);
  const bar = bars.find((b) => b.start === pointed);
  const colorOf = (id: number | null) => projectColor(projectOf(projects, id));
  const nameOf = (id: number | null) => projectOf(projects, id)?.name ?? m.spend.noProject;
  const nowAt = (spend.to - spend.from) / SPAN_MS;
  return (
    <section
      aria-label={m.spend.chart(hhmm(spend.from), hhmm(spend.to))}
      className="flex flex-wrap items-stretch gap-x-8 gap-y-3 border-b px-5 py-4 max-lg:px-3"
    >
      <div className="flex flex-col justify-between gap-2">
        <dl className="flex gap-x-6">
          <Figure label={m.spend.today} value={costLabel(spend.todayUsd)} />
          <Figure label={m.spend.rate} value={costPerHourLabel(spend.perHourUsd)} />
        </dl>
        <p className="max-w-64 text-muted-foreground text-xs">
          {m.spend.note}
          {spend.unpriced && <span className="block">{m.spend.unpriced}</span>}
        </p>
      </div>
      <figure className="ml-auto flex w-full min-w-60 max-w-3xl flex-1 flex-col">
        <figcaption aria-hidden className="h-4 text-xs">
          {bar ? (
            <BarDetail bar={bar} colorOf={colorOf} nameOf={nameOf} />
          ) : (
            <span className="text-muted-foreground">{m.spend.window(SPAN_MS / HOUR)}</span>
          )}
        </figcaption>
        {/* Cleared here rather than per slot, so crossing the gaps between slots doesn't flicker.
            A touch ends with a leave; a tap toggles instead */}
        <div
          aria-hidden
          onPointerLeave={(e) => {
            if (e.pointerType !== "touch") setPointed(null);
          }}
          className="relative mt-1.5 flex h-12 gap-[3px]"
        >
          {bars.map((b) => (
            <Slot
              key={b.start}
              bar={b}
              pointed={b.start === pointed}
              onPoint={(toggle) => setPointed((p) => (toggle && p === b.start ? null : b.start))}
              colorOf={colorOf}
            />
          ))}
          <NowMark at={nowAt} />
        </div>
        <Axis from={spend.from} nowAt={nowAt} />
        <ul className="sr-only">
          {bars
            .filter((b) => b.total > 0)
            .map((b) => (
              <li key={b.start}>
                {m.spend.barSplit(
                  m.spend.bar(hhmm(b.start), hhmm(b.start + SPEND_BUCKET_MS), costLabel(b.total)),
                  b.segments.map((s) => `${nameOf(s.projectId)} ${costLabel(s.usd)}`),
                )}
              </li>
            ))}
        </ul>
      </figure>
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
 * A 5-minute slot: the spend rising from the floor, one rounded block per project, largest
 * lowest, split by 1px of the surface like stacked work blocks. A slot with no spend is a 2px
 * `line` stub, so the eye goes to the bars; the pointed slot is lit as a `muted` column.
 */
function Slot({
  bar,
  pointed,
  onPoint,
  colorOf,
}: {
  bar: SpendBar;
  pointed: boolean;
  /** `toggle` for a tap, which has no hover to end it. */
  onPoint: (toggle: boolean) => void;
  colorOf: (projectId: number | null) => string;
}) {
  // Each block keeps 1px with 1px between them, so a short bar with many projects still fits
  const minPx = Math.max(MIN_BAR_PX, bar.segments.length * 2 - 1);
  return (
    <div
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") onPoint(false);
      }}
      onPointerDown={(e) => {
        if (e.pointerType === "touch") onPoint(true);
      }}
      className={cn(
        "flex flex-1 flex-col justify-end rounded-sm transition-colors motion-reduce:transition-none",
        pointed && "bg-muted",
      )}
    >
      {bar.total === 0 ? (
        <span className="block h-0.5 rounded-full bg-border" />
      ) : (
        <div
          className="flex flex-col-reverse gap-px"
          style={{ height: `max(${bar.height * 100}%, ${minPx}px)` }}
        >
          {bar.segments.map((s) => (
            <span
              key={s.projectId ?? "none"}
              className="block min-h-px rounded-[3px]"
              style={{ flexGrow: s.share, background: colorOf(s.projectId) }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Now, at `at` of the width, as the calendar's indigo line with its dot on top. */
function NowMark({ at }: { at: number }) {
  return (
    <span
      className="pointer-events-none absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 bg-primary"
      style={{ left: `${at * 100}%` }}
    >
      <span className="absolute -top-[3px] -left-[3px] size-2 rounded-full bg-primary" />
    </span>
  );
}

/** Whole hours under the slots, and "Now" in indigo under the now mark. */
function Axis({ from, nowAt }: { from: number; nowAt: number }) {
  const m = liveMessages();
  return (
    <div aria-hidden className="relative mt-1.5 h-4 font-num text-muted-foreground text-xs">
      {hourTicks(from, from + SPAN_MS)
        .map((t) => ({ t, at: (t - from) / SPAN_MS }))
        .filter(({ at }) => at > TICK_CLEARANCE / 2 && Math.abs(nowAt - at) > TICK_CLEARANCE)
        .map(({ t, at }) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: `${at * 100}%` }}>
            {hhmm(t)}
          </span>
        ))}
      <span className="absolute -translate-x-1/2 text-primary" style={{ left: `${nowAt * 100}%` }}>
        {m.spend.now}
      </span>
    </div>
  );
}

/** The pointed slot: its time, total, and each project's share with its color. */
function BarDetail({
  bar,
  colorOf,
  nameOf,
}: {
  bar: SpendBar;
  colorOf: (projectId: number | null) => string;
  nameOf: (projectId: number | null) => string;
}) {
  const m = liveMessages();
  return (
    <span className="flex items-baseline gap-x-3 overflow-hidden whitespace-nowrap">
      <span className="font-num">
        {m.spend.bar(hhmm(bar.start), hhmm(bar.start + SPEND_BUCKET_MS), costLabel(bar.total))}
      </span>
      {bar.segments.map((s) => (
        <span key={s.projectId ?? "none"} className="flex items-center gap-1 text-muted-foreground">
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: colorOf(s.projectId) }}
          />
          {nameOf(s.projectId)}
          <span className="font-num">{costLabel(s.usd)}</span>
        </span>
      ))}
    </span>
  );
}
