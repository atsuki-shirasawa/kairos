import type { LiveSession, LiveUsage } from "@shared/api.ts";
import { MINUTE } from "@shared/dates.ts";
import { liveMessages } from "@/i18n/messages/live.ts";
import { durationLabel } from "@/lib/dates.ts";
import { modelLabel, tokensLabel, tokensPerHourLabel, windowLabel } from "@/lib/format.ts";
import {
  CONTEXT_FULL_SHARE,
  cacheState,
  columnOf,
  contextShare,
  type LiveDisplay,
} from "@/lib/live.ts";
import { cn } from "@/lib/utils.ts";

/**
 * The card's footer, under a rule: the context against its window and the model, then the current
 * block's tokens, with the rate at the right while working and the prompt cache's state when not.
 * These are a gauge rather than the news, so they sit apart from what the session is doing.
 * Nothing when there is nothing to gauge yet.
 */
export function CardFooter({
  session: s,
  display,
  now,
}: {
  session: LiveSession;
  display: LiveDisplay;
  now: number;
}) {
  const m = liveMessages();
  const usage = s.usage;
  // A session not in the log yet says so in the card's body instead
  if (s.section === null || (!usage && s.contextTokens === null)) return null;
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 border-t pt-2 text-muted-foreground text-xs",
        // `line` barely differs from the `muted` fill an On you card sits on
        columnOf(display) === "attention" && "border-input",
      )}
    >
      <p className="flex items-center gap-x-1.5">
        {s.contextTokens !== null && (
          <ContextGauge tokens={s.contextTokens} usage={usage} display={display} />
        )}
        {usage && <span className="ml-auto">{modelLabel(usage.model)}</span>}
        {usage?.fast && <span className="rounded-md border px-1 leading-4">{m.fast}</span>}
      </p>
      {usage && (
        <p className="flex items-baseline gap-x-1.5">
          <span className="font-num">{m.blockTokens(tokensLabel(usage.blockTokens))}</span>
          {display === "working" ? (
            <span className="ml-auto font-num">{tokensPerHourLabel(usage.perHourTokens)}</span>
          ) : (
            <CacheState usage={usage} warnSoon={columnOf(display) === "attention"} now={now} />
          )}
        </p>
      )}
    </div>
  );
}

/**
 * The context against the model's window, as words and a short 4px bar after them: short and
 * neutral, so it doesn't read as the tasks' bar, which spans the card in the project color. It
 * turns `warn` once it fills most of the window on a session waiting on you: every request rereads
 * it, and before the next prompt is when to compact or clear. Without a known window (no response
 * yet) it is the size alone.
 */
function ContextGauge({
  tokens,
  usage,
  display,
}: {
  tokens: number;
  usage: LiveUsage | null;
  display: LiveDisplay;
}) {
  const m = liveMessages();
  if (!usage) return <span className="font-num">{m.context(tokensLabel(tokens))}</span>;
  const share = contextShare(tokens, usage.contextWindow);
  const full = columnOf(display) === "attention" && share >= CONTEXT_FULL_SHARE;
  return (
    <span className={cn("flex items-center gap-1.5", full && "text-warn")}>
      <span className="font-num">
        {m.contextOf(tokensLabel(tokens), windowLabel(usage.contextWindow))}
      </span>
      <span aria-hidden className="h-1 w-12 overflow-hidden rounded-full bg-input">
        <span
          className={cn("block h-full rounded-full", full ? "bg-warn" : "bg-muted-foreground")}
          style={{ width: `${share * 100}%` }}
        />
      </span>
    </span>
  );
}

/**
 * The prompt cache of a session not working, at the right of its line: how long it stays warm, or
 * that it lapsed, when a reply rewrites the whole context. With `warnSoon` (On you) its countdown
 * turns `warn` when little is left: answering now is when the cache still holds. Nothing when the
 * log holds no cache write.
 */
function CacheState({
  usage,
  warnSoon,
  now,
}: {
  usage: LiveUsage;
  warnSoon: boolean;
  now: number;
}) {
  const m = liveMessages();
  const cache = cacheState(usage, now);
  if (!cache) return null;
  return (
    <span
      className={cn(
        "ml-auto shrink-0 font-num",
        warnSoon && cache.warm && cache.soon && "text-warn",
      )}
    >
      {cache.warm ? m.cacheLeft(cacheLeftLabel(cache.leftMs)) : m.cacheExpired}
    </span>
  );
}

/** The cache's state for an idle row, at the right of its place line, never in `warn`. */
export function RowCache({ session: s, now }: { session: LiveSession; now: number }) {
  return s.usage ? <CacheState usage={s.usage} warnSoon={false} now={now} /> : null;
}

/** Time left on the cache, rounded up to the minute so the last seconds don't read "0m". */
function cacheLeftLabel(ms: number): string {
  return durationLabel(Math.ceil(ms / MINUTE) * MINUTE);
}
