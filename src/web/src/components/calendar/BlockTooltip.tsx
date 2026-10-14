import { MomentNode } from "@/components/MomentNode.tsx";
import { TooltipContent } from "@/components/ui/tooltip.tsx";
import { calendarMessages } from "@/i18n/messages/calendar.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { artifactRef } from "@/lib/artifacts.ts";
import type { TooltipFacts } from "@/lib/blockFacts.ts";
import { durationLabel, hhmm } from "@/lib/dates.ts";
import { openItemsLine } from "@/lib/format.ts";
import type { Moment } from "@/lib/moments.ts";
import { cn } from "@/lib/utils.ts";

/** Commits and PRs the tooltip lists before summing the rest as "+n more". */
const TOOLTIP_MOMENTS = 6;

/**
 * The block's tooltip: heading, project, time and results, and why it looks dashed, faded or
 * dim. Cards, month lines and marks (short work drawn on the column's edge) share it; for marks it
 * is the only text shown. Build its facts with `tooltipFacts` or `markFacts`.
 */
export function BlockTooltip({
  label,
  projectName,
  session,
  range,
  durationMs,
  commits,
  prs,
  moments,
  open,
  note,
  faded,
  dim,
}: TooltipFacts) {
  const m = calendarMessages();
  const f = formatMessages();
  const openLine = openItemsLine(open);
  return (
    <TooltipContent side="right" className="max-w-72 flex-col items-start gap-0.5">
      <p className="font-medium">{label}</p>
      <p className="opacity-70">
        {projectName}
        {session.label ? f.sessionLabel(session.label) : ""}
      </p>
      <p className="font-num opacity-70">{m.rangeDuration(range, durationLabel(durationMs))}</p>
      {moments.length > 0 ? (
        <TooltipMoments moments={moments} />
      ) : (
        (commits > 0 || prs > 0) && <p className="opacity-70">{f.commitsPrs(commits, prs)}</p>
      )}
      {openLine && <p className="opacity-70">{openLine}</p>}
      {session.headless && <p className="opacity-70">{m.headless}</p>}
      {note && <p className="opacity-70">{note}</p>}
      {faded && <p className="opacity-70">{m.notMatching}</p>}
      {dim && <p className="opacity-70">{m.notSummarized}</p>}
    </TooltipContent>
  );
}

/**
 * The block's commits and PRs in the tooltip, one per line. In the week view this is the only
 * place their titles show without opening the drawer.
 */
function TooltipMoments({ moments }: { moments: Moment[] }) {
  const shown = moments.slice(0, TOOLTIP_MOMENTS);
  const more = moments.length - shown.length;
  return (
    // The tooltip inverts the theme, so the nodes take its colors instead of the page's
    <ul className="mt-1 w-full space-y-0.5 font-num [--card:var(--popover-foreground)] [--foreground:var(--background)]">
      {shown.map((moment, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a ref can repeat (a commit amended in place)
        <li key={i} className="flex min-w-0 items-center gap-1.5">
          <MomentLabel moment={moment} />
        </li>
      ))}
      {more > 0 && <li className="opacity-70">{calendarMessages().moreMoments(more)}</li>}
    </ul>
  );
}

/**
 * One commit or PR in the day view's lane or the tooltip: its node, time, short SHA or PR number,
 * and title.
 */
export function MomentLabel({ moment: { artifact } }: { moment: Moment }) {
  const pr = artifact.kind === "pr";
  const ref = artifactRef(artifact);
  return (
    <>
      <MomentNode pr={pr} />
      <span className="shrink-0">{artifact.ts !== null ? hhmm(artifact.ts) : ""}</span>
      {ref && <span className={cn("shrink-0", pr && "font-medium text-foreground")}>{ref}</span>}
      {artifact.title && (
        <span className="truncate font-sans text-foreground">{artifact.title}</span>
      )}
    </>
  );
}
