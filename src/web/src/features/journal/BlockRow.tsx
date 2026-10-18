import type { Project } from "@shared/api.ts";
import { Markdown } from "@/components/Markdown.tsx";
import { MomentLabel } from "@/components/MomentLabel.tsx";
import { StatusDot } from "@/components/ui/status-dot.tsx";
import { calendarMessages } from "@/i18n/messages/calendar.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { journalMessages } from "@/i18n/messages/journal.ts";
import { dateLabel, durationLabel } from "@/lib/dates.ts";
import type { DayBlock } from "@/lib/dayBlocks.ts";
import { type RowFacts, rowFacts } from "@/lib/dayRowFacts.ts";
import type { LaneLook, LaneMark } from "@/lib/dayRows.ts";
import { isWorkingHere, projectLabel } from "@/lib/selection.ts";
import { cn } from "@/lib/utils.ts";
import { Lanes } from "./Lanes.tsx";

/**
 * One block of the day page (or a burst of headless runs): its lanes, time, heading, project,
 * what got resolved and the commits and PRs it made. Clicking it opens it in the detail pane.
 */
export function BlockRow({
  runs,
  lead,
  lanes,
  looks,
  project,
  selected,
  faded,
  onSelect,
}: {
  /** The block, or a burst of headless runs shown as one row. */
  runs: DayBlock[];
  /** The run the row opens and describes (`groupLead`). */
  lead: DayBlock;
  lanes: LaneMark[];
  looks: ReadonlyMap<string, LaneLook>;
  project: Project | undefined;
  selected: boolean;
  /** Doesn't match the search or filter. */
  faded: boolean;
  onSelect: (id: string, at: number) => void;
}) {
  const facts = rowFacts(runs, lead);
  const projectName = projectLabel(project);
  return (
    <li
      data-selected={selected || undefined}
      className={cn(
        "group relative flex pr-4 pl-3",
        // Like the calendar, work outside the filter keeps its place but steps back
        faded && !selected && "opacity-30 focus-within:opacity-100 hover:opacity-100",
      )}
    >
      <Lanes marks={lanes} looks={looks} />
      {/* The button covers the row and the content stays outside it: Markdown lists aren't allowed in a button */}
      <button
        type="button"
        onClick={() => onSelect(lead.session.id, lead.segment.start)}
        aria-pressed={selected}
        aria-label={calendarMessages().blockAria(
          facts.label,
          projectName,
          dateLabel(lead.dayStart),
          facts.range,
        )}
        className="peer absolute inset-0 z-[1] outline-none"
      />
      <div
        className={cn(
          "my-0.5 ml-1.5 flex min-w-0 flex-1 gap-3 rounded-md px-2.5 py-2",
          "group-hover:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-ring",
          // Indigo is the app's one mark for "selected", here as everywhere else
          selected && "outline-2 outline-primary",
        )}
      >
        <span className="w-[5.5rem] shrink-0 pt-0.5 font-num text-label text-muted-foreground">
          {facts.range}
        </span>
        <RowText facts={facts} session={lead.session} projectName={projectName} />
        {isWorkingHere(lead) && (
          <StatusDot
            look={{ state: "pulse", tone: "project" }}
            className="mt-1.5 shrink-0"
            title={formatMessages().working}
          />
        )}
      </div>
    </li>
  );
}

/** The row's words: heading, project and length, Resolved, and commits and PRs. */
function RowText({
  facts,
  session,
  projectName,
}: {
  facts: RowFacts;
  session: DayBlock["session"];
  projectName: string;
}) {
  const f = formatMessages();
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <p
        className={cn(
          "text-body [overflow-wrap:anywhere]",
          facts.dim ? "text-muted-foreground" : "font-medium text-foreground",
        )}
      >
        {facts.label}
      </p>
      {/* Only the length is a figure: project names can be Japanese, which the condensed face lacks */}
      <p className="text-meta text-muted-foreground">
        {projectName}
        {session.label ? f.sessionLabel(session.label) : ""}
        {f.separator}
        <span className="font-num">{durationLabel(facts.durationMs)}</span>
      </p>
      {facts.resolved.length > 0 && <Resolved points={facts.resolved} />}
      {facts.artifacts.length > 0 && <Moments facts={facts} />}
    </div>
  );
}

/** The summary's first Resolved points: what came of the block, readable without opening it. */
function Resolved({ points }: { points: string[] }) {
  return (
    <ul aria-label={journalMessages().resolved} className="max-w-[72ch] space-y-0.5">
      {points.map((point) => (
        <li key={point} className="line-clamp-2">
          {/* Markdown sets the body size; a row's Resolved is a step below its heading */}
          <Markdown plain className="text-foreground text-label leading-normal [&_p]:inline">
            {point}
          </Markdown>
        </li>
      ))}
    </ul>
  );
}

/** The block's first commits and PRs, one per line, then how many more. */
function Moments({ facts }: { facts: RowFacts }) {
  return (
    <ul className="space-y-0.5 pt-0.5 font-num text-meta text-muted-foreground">
      {facts.artifacts.map((artifact, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a ref can repeat (a commit amended in place)
        <li key={`${artifact.ref}-${i}`} className="flex min-w-0 items-center gap-2">
          <MomentLabel artifact={artifact} />
        </li>
      ))}
      {facts.moreArtifacts > 0 && (
        // Lined up with the time after the node (7px) and the gap (8px) of the lines above
        <li className="pl-[15px]">{calendarMessages().moreMoments(facts.moreArtifacts)}</li>
      )}
    </ul>
  );
}
