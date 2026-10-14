import type { LiveSession, LiveUsage } from "@shared/api.ts";
import { MINUTE } from "@shared/dates.ts";
import { liveMessages } from "@/i18n/messages/live.ts";
import { durationLabel } from "@/lib/dates.ts";
import { costLabel, costPerHourLabel, modelLabel, tokensLabel, windowLabel } from "@/lib/format.ts";
import {
  CONTEXT_FULL_SHARE,
  cacheState,
  columnOf,
  contextShare,
  type LiveDisplay,
} from "@/lib/live.ts";
import { cn } from "@/lib/utils.ts";

/**
 * The context against the model's window, as a line and a 4px bar beside it. It turns `warn` once
 * it fills most of the window on a session waiting on you: every request rereads it, and before
 * the next prompt is when to compact or clear. Elsewhere the bar's length says it. Without a known
 * window (no response yet) it is the size alone.
 */
export function ContextGauge({
  tokens,
  usage,
  display,
}: {
  tokens: number;
  usage: LiveUsage | null;
  display: LiveDisplay;
}) {
  const m = liveMessages();
  if (!usage)
    return <p className="font-num text-muted-foreground">{m.context(tokensLabel(tokens))}</p>;
  const share = contextShare(tokens, usage.contextWindow);
  const full = columnOf(display) === "attention" && share >= CONTEXT_FULL_SHARE;
  return (
    <div className="flex items-center gap-2">
      <span className={cn("shrink-0 font-num", full ? "text-warn" : "text-muted-foreground")}>
        {m.contextOf(tokensLabel(tokens), windowLabel(usage.contextWindow))}
      </span>
      <span aria-hidden className="h-1 flex-1 overflow-hidden rounded-full bg-input">
        <span
          className={cn("block h-full rounded-full", full ? "bg-warn" : "bg-muted-foreground")}
          style={{ width: `${share * 100}%` }}
        />
      </span>
    </div>
  );
}

/**
 * What the session costs: the current block so far, the model (and fast mode, which multiplies
 * it), and at the right what the next moment costs. While working that is the rate of spend; while
 * waiting it is the prompt cache, since a reply inside its TTL pays a cache read and one after it
 * rewrites the whole context, often forty times as much.
 */
export function CardCost({
  usage,
  display,
  now,
}: {
  usage: LiveUsage;
  display: LiveDisplay;
  now: number;
}) {
  const m = liveMessages();
  const cost = usage.cost;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="flex flex-wrap items-baseline gap-x-1.5 text-muted-foreground">
        {cost && <span className="font-num">{m.blockCost(costLabel(cost.blockUsd))}</span>}
        <span>{modelLabel(usage.model)}</span>
        {usage.fast && <span className="rounded-md border px-1 leading-4">{m.fast}</span>}
        {cost && display === "working" && (
          <span className="ml-auto font-num">{costPerHourLabel(cost.perHourUsd)}</span>
        )}
      </p>
      {display !== "working" && <CacheLine usage={usage} display={display} now={now} />}
    </div>
  );
}

/**
 * The prompt cache of a session not working: how long it stays warm and what the next request
 * costs before and after, or that it lapsed and what resuming costs. Its countdown turns `warn`
 * in On you when little is left: answering now is the cheap way.
 */
function CacheLine({
  usage,
  display,
  now,
}: {
  usage: LiveUsage;
  display: LiveDisplay;
  now: number;
}) {
  const m = liveMessages();
  const cache = cacheState(usage, now);
  const cost = usage.cost;
  if (!cache) return null;
  if (!cache.warm)
    return (
      <p className="flex flex-wrap items-baseline gap-x-1.5 text-muted-foreground">
        <span>{m.cacheExpired}</span>
        {cost && (
          <span className="ml-auto font-num">{m.resumeCost(costLabel(cost.coldRequestUsd))}</span>
        )}
      </p>
    );
  const soon = columnOf(display) === "attention" && cache.soon;
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5 text-muted-foreground">
      <span className={cn("font-num", soon && "text-warn")}>
        {m.cacheLeft(cacheLeftLabel(cache.leftMs))}
      </span>
      {cost && (
        <span className="ml-auto font-num">
          {m.nextCost(costLabel(cost.warmRequestUsd), costLabel(cost.coldRequestUsd))}
        </span>
      )}
    </p>
  );
}

/**
 * The cache's state for an idle row, at the right of its place line: how long it stays warm, or
 * what resuming costs once it lapsed. Nothing when the log holds no cache write.
 */
export function RowCache({ session: s, now }: { session: LiveSession; now: number }) {
  const m = liveMessages();
  const cache = s.usage && cacheState(s.usage, now);
  if (!cache) return null;
  const cold = s.usage?.cost?.coldRequestUsd;
  const text = cache.warm
    ? m.cacheLeft(cacheLeftLabel(cache.leftMs))
    : cold === undefined
      ? m.cacheExpired
      : m.resumeCost(costLabel(cold));
  return <span className="ml-auto shrink-0 font-num">{text}</span>;
}

/** Time left on the cache, rounded up to the minute so the last seconds don't read "0m". */
function cacheLeftLabel(ms: number): string {
  return durationLabel(Math.ceil(ms / MINUTE) * MINUTE);
}
