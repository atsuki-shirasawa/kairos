import type { Artifact, Project, Recap } from "@shared/api.ts";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { summaryMessages } from "@/i18n/messages/summary.ts";
import { projectColor } from "@/lib/colors.ts";
import { durationLabel, hhmm, type View, weekday } from "@/lib/dates.ts";
import { issueBaseUrl } from "@/lib/issueLinks.ts";
import type { DayBlock } from "@/lib/layout.ts";
import { isSelected } from "@/lib/selection.ts";
import type { PeriodSummary, ProjectSummary } from "@/lib/summary.ts";
import { prLabel, startsNewDay, unwrittenRecaps } from "@/lib/summaryDone.ts";
import { cn } from "@/lib/utils.ts";
import { RecapBlock } from "./RecapBlock.tsx";
import { projectName, projectOf } from "./shared.tsx";

/** Shared by the "done" list and its project sections. */
interface Selection {
  selectedId: string | null;
  selectedAt: number | null;
  onSelect: (id: string, at: number) => void;
}

/** What was done, per project: its recap and its blocks, with a button to write missing recaps. */
export function Done({
  view,
  summary,
  projects,
  recaps,
  onRecap,
  requestError,
  ...selection
}: Selection & {
  view: View;
  summary: PeriodSummary;
  projects: Map<number, Project>;
  recaps: Map<number, Recap>;
  onRecap: (projectId: number) => void;
  /** Why the latest request was refused (e.g. the queue is full). */
  requestError: string | null;
}) {
  const m = summaryMessages();
  const shown = summary.projects.filter((p) => p.blocks.length > 0);
  if (shown.length === 0) return null;
  const unwritten = unwrittenRecaps(shown, recaps);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-medium text-muted-foreground text-xs">{m.done}</h2>
        {unwritten.length > 1 && (
          <Button variant="ghost" size="xs" onClick={() => unwritten.forEach(onRecap)}>
            <Sparkles />
            {m.recapWriteAll}
          </Button>
        )}
      </div>
      {requestError && (
        <p className="mb-3 text-destructive text-xs" role="alert">
          {m.recapFailed(requestError)}
        </p>
      )}
      <div className="flex flex-col gap-6">
        {shown.map((p) => (
          <ProjectDone
            key={p.projectId ?? "none"}
            view={view}
            project={p}
            projects={projects}
            recap={p.projectId !== null ? recaps.get(p.projectId) : undefined}
            onRecap={onRecap}
            {...selection}
          />
        ))}
      </div>
    </div>
  );
}

/** One project's section: name and time, its recap, then its blocks in time order. */
function ProjectDone({
  view,
  project: p,
  projects,
  recap,
  onRecap,
  selectedId,
  selectedAt,
  onSelect,
}: Selection & {
  view: View;
  project: ProjectSummary;
  projects: Map<number, Project>;
  /** Missing for work outside a known project, or when the period's work all started before it. */
  recap: Recap | undefined;
  onRecap: (projectId: number) => void;
}) {
  const color = projectColor(projectOf(projects, p.projectId));
  return (
    <div className="border-l-2 pl-4" style={{ borderColor: color }}>
      <h3 className="mb-1.5 flex items-baseline gap-2 font-medium text-sm">
        {projectName(projects, p.projectId)}
        <span className="font-normal font-num text-muted-foreground text-xs">
          {durationLabel(p.busyMs)}
        </span>
      </h3>
      {recap && (
        <RecapBlock
          recap={recap}
          baseUrl={issueBaseUrl(projectOf(projects, p.projectId)?.repo)}
          onRecap={() => onRecap(recap.projectId)}
        />
      )}
      <ul className="flex flex-col">
        {p.blocks.map((b, i) => (
          <DoneItem
            key={`${b.session.id}:${b.segment.start}`}
            // In the week, name the day only where it changes, so the column reads as a timeline
            showDay={view === "week" && startsNewDay(p.blocks, i)}
            block={b}
            selected={isSelected(b, selectedId, selectedAt)}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </div>
  );
}

/** A block as its time and headline (opens it), with the PRs it opened. */
function DoneItem({
  showDay,
  block: b,
  selected,
  onSelect,
}: {
  showDay: boolean;
  block: DayBlock;
  selected: boolean;
  onSelect: (id: string, at: number) => void;
}) {
  const start = b.segment.start;
  return (
    <li
      className={cn(
        "-mx-2 flex items-baseline gap-3 rounded-sm px-2 py-1 hover:bg-accent",
        selected && "bg-accent",
      )}
      data-selected={selected || undefined}
    >
      <span className="flex w-28 shrink-0 gap-1.5 font-num text-muted-foreground text-xs tabular-nums">
        <span className="w-7 shrink-0 text-foreground">{showDay && weekday(start)}</span>
        {hhmm(start)}–{hhmm(b.segment.end)}
      </span>
      <button
        type="button"
        onClick={() => onSelect(b.session.id, start)}
        className="min-w-0 flex-1 text-left text-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        {b.segment.headline}
      </button>
      {b.segment.prs.length > 0 && (
        <span className="flex shrink-0 gap-2">
          {b.segment.prs.map((a) => (
            <PrNumber key={a.ref} artifact={a} />
          ))}
        </span>
      )}
    </li>
  );
}

/** Just the number, since the headline beside it already says what the PR was about. */
function PrNumber({ artifact: a }: { artifact: Artifact }) {
  return (
    <a
      href={a.ref}
      target="_blank"
      rel="noreferrer"
      title={a.title ?? a.ref}
      className="font-medium font-num text-primary text-xs hover:underline"
    >
      {prLabel(a)}
    </a>
  );
}
