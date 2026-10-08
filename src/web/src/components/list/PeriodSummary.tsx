import { listMessages } from "@/i18n/messages/list.tsx";
import { durationLabel, type View } from "@/lib/dates.ts";
import { costLabel, tokensLabel } from "@/lib/format.ts";
import type { DayBlock } from "@/lib/layout.ts";
import { busyByDay } from "@/lib/summary.ts";
import { totalsOf } from "@/lib/totals.ts";
import { Hint } from "../Hint.tsx";

/**
 * Totals for the whole period, as one line above the table. Tokens and cost appear only while one
 * of their columns is shown, so the default view isn't led by spending.
 */
export function PeriodSummary({
  blocks,
  view,
  showUsage,
}: {
  blocks: DayBlock[];
  view: View;
  showUsage: boolean;
}) {
  const { usage, activity } = totalsOf(blocks);
  const m = listMessages();
  return (
    <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 pt-3 pb-2 text-muted-foreground text-xs">
      <span>
        {m.period(
          view,
          blocks.length,
          <Strong>{blocks.length}</Strong>,
          <Strong>{durationLabel(busyByDay(blocks))}</Strong>,
        )}
        {activity?.claudeMs ? (
          <Hint text={m.claudeTotalNote}>
            {m.claudeTotal(<Strong>{durationLabel(activity.claudeMs)}</Strong>)}
          </Hint>
        ) : null}
      </span>
      {showUsage && usage && (
        <Hint text={m.costNote}>
          {m.tokensCost(
            <Strong>{tokensLabel(usage.tokens)}</Strong>,
            <Strong>
              {usage.unpriced ? "~" : ""}
              {costLabel(usage.costUsd)}
            </Strong>,
          )}
        </Hint>
      )}
      {activity && (activity.commits > 0 || activity.prs > 0) && (
        <span>
          {m.commitsPrs(<Strong>{activity.commits}</Strong>, <Strong>{activity.prs}</Strong>)}
        </span>
      )}
    </p>
  );
}

/** A figure within the summary line, set in the foreground color. */
function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-medium font-num text-foreground">{children}</span>;
}
