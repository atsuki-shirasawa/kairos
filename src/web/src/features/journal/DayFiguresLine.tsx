import { Hint } from "@/components/Hint.tsx";
import { drawerMessages } from "@/i18n/messages/drawer.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { durationLabel } from "@/lib/dates.ts";
import { interleave, usageText } from "@/lib/format.ts";
import type { DayFigures } from "@/lib/totals.ts";

/**
 * Every figure of a day on one line, without the date: the day page's header, where the toolbar
 * already names the date.
 */
export function DayFiguresLine({ figures }: { figures: DayFigures }) {
  const { busy, activity, commits, prs, trouble, usage } = figures;
  const f = formatMessages();
  // One separator throughout: commitsPrs and usageText already join their parts with it
  const details = [
    <span key="blocks">{f.blocks(figures.counted)}</span>,
    activity?.claudeMs ? (
      <span key="claude">{drawerMessages().claudeShort(durationLabel(activity.claudeMs))}</span>
    ) : null,
    commits > 0 || prs > 0 ? <span key="outcomes">{f.commitsPrs(commits, prs)}</span> : null,
    trouble > 0 ? (
      // Shown in the warn color, so it says on hover what kind of snags they were
      <Hint key="trouble" text={figures.troubleDetail} focusable className="text-warn">
        {f.trouble(trouble)}
      </Hint>
    ) : null,
    usage ? <span key="usage">{usageText(usage)}</span> : null,
  ].filter((d) => d !== null);
  return (
    <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-1.5 font-num text-label text-muted-foreground">
      {figures.shown > 0 && (
        <>
          {/* Working time leads, set apart by weight; the rest is detail */}
          <span className="font-semibold text-body text-foreground">{durationLabel(busy)}</span>
          <span className="[&>span]:whitespace-nowrap">{interleave(details, f.separator)}</span>
        </>
      )}
    </div>
  );
}
