import type { PlanLimits } from "@shared/api.ts";
import { liveMessages } from "@/i18n/messages/live.ts";
import { timeOrWeekdayTime } from "@/lib/dates.ts";
import { type PlanWindowShown, planWindows } from "@/lib/planLimits.ts";
import { cn } from "@/lib/utils.ts";
import { ShareBar } from "./ShareBar.tsx";

/**
 * The plan's usage-limit windows after today's tokens, one figure each, laid out as the band's
 * own figures are: what is used, as a share and a short bar, and when it starts over. A group of
 * its own, so it moves under the token figures where the column is narrow. Nothing for a window
 * Claude Code didn't report.
 */
export function PlanLimitFigures({ limits, now }: { limits: PlanLimits; now: number }) {
  const windows = planWindows(limits, now);
  if (windows.length === 0) return null;
  return (
    <dl className="flex gap-x-6">
      {windows.map((w) => (
        <LimitFigure key={w.kind} window={w} now={now} />
      ))}
    </dl>
  );
}

/**
 * One window: its name in 12px `muted-ink`, then its used share in the numeral face with a
 * `ShareBar`, as a live card's context gauge has, and its reset time in `muted-ink`. Share and bar turn `warn`
 * once little is left. Screen readers get it as one sentence.
 */
function LimitFigure({ window: w, now }: { window: PlanWindowShown; now: number }) {
  const m = liveMessages().limits;
  const name = m[w.kind];
  const reset = w.reset ? m.reset : m.resets(timeOrWeekdayTime(w.resetsAt, now));
  return (
    <div className="flex flex-col">
      <dt className="text-label text-muted-foreground">{name}</dt>
      <dd className="flex items-center gap-2 leading-6">
        <span className="sr-only">{m.speech(name, w.usedPercent, reset)}</span>
        <span aria-hidden className={cn("font-medium font-num text-title", w.warn && "text-warn")}>
          {m.used(w.usedPercent)}
        </span>
        <ShareBar share={w.usedPercent / 100} warn={w.warn} />
        <span aria-hidden className="whitespace-nowrap font-num text-label text-muted-foreground">
          {reset}
        </span>
      </dd>
    </div>
  );
}
