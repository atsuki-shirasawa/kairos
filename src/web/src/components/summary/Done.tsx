import type { Artifact, Project, Recap } from "@shared/api.ts";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { summaryMessages } from "@/i18n/messages/summary.ts";
import { projectColor } from "@/lib/colors.ts";
import { durationLabel, hhmm, type View, weekday } from "@/lib/dates.ts";
import { issueBaseUrl } from "@/lib/issueLinks.ts";
import type { DayBlock } from "@/lib/layout.ts";
import type { ProjectOpenItems } from "@/lib/openItems.ts";
import { isSelected, projectName, projectOf } from "@/lib/selection.ts";
import type { PeriodSummary, ProjectSummary } from "@/lib/summary.ts";
import { prLabel, startsNewDay, unwrittenRecaps } from "@/lib/summaryDone.ts";
import { cn } from "@/lib/utils.ts";
import { OpenItems } from "./OpenItems.tsx";
import { RecapBlock } from "./RecapBlock.tsx";
import type { useProjectOpenItems } from "./useProjectOpenItems.ts";

/** The period's open items and what can be done with them. */
type Open = ReturnType<typeof useProjectOpenItems>;

/** The failed update's message, when the item is one of this project's. */
function failureIn(items: ProjectOpenItems, failure: Open["failure"]): string | null {
  if (!failure) return null;
  const all = [...items.open, ...items.old, ...items.closed];
  return all.some((i) => i.id === failure.id) ? failure.message : null;
}

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
  open,
  ...selection
}: Selection & {
  view: View;
  summary: PeriodSummary;
  projects: Map<number, Project>;
  recaps: Map<number, Recap>;
  onRecap: (projectId: number) => void;
  /** Why the latest request was refused (e.g. the queue is full). */
  requestError: string | null;
  open: Open;
}) {
  const m = summaryMessages();
  const shown = summary.projects.filter((p) => p.blocks.length > 0);
  const idle = idleWithOpenItems(shown, open.openItems);
  if (shown.length === 0 && idle.length === 0) return null;
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
            open={open}
            {...selection}
          />
        ))}
        {idle.map((id) => (
          <IdleProject
            key={id}
            view={view}
            projectId={id}
            projects={projects}
            open={open}
            onSelect={selection.onSelect}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Projects with no work in the period that still have items open at its end, so leftovers of a
 * project set aside don't drop out of view the week nothing happens on it.
 */
function idleWithOpenItems(
  shown: ProjectSummary[],
  openItems: Map<number, ProjectOpenItems>,
): number[] {
  const busy = new Set(shown.map((p) => p.projectId));
  return [...openItems]
    .filter(([id, g]) => !busy.has(id) && g.open.length + g.old.length > 0)
    .map(([id]) => id);
}

/** A project without work in the period: its name and its open items, under its colored rule. */
function IdleProject({
  view,
  projectId,
  projects,
  open,
  onSelect,
}: {
  view: View;
  projectId: number;
  projects: Map<number, Project>;
  open: Open;
  onSelect: (id: string, at: number) => void;
}) {
  const items = open.openItems.get(projectId);
  if (!items) return null;
  const project = projectOf(projects, projectId);
  return (
    <div className="border-l-2 pl-4" style={{ borderColor: projectColor(project) }}>
      <h3 className="mb-1.5 font-medium text-sm">{projectName(projects, projectId)}</h3>
      <ProjectOpenItemsSection
        view={view}
        items={items}
        open={open}
        onSelect={onSelect}
        baseUrl={issueBaseUrl(project?.repo)}
      />
    </div>
  );
}

/**
 * One project's open items, wired to the period's open-item state: when they are counted from,
 * which one is being updated, and the last failed update when it was one of these.
 */
function ProjectOpenItemsSection({
  view,
  items,
  open,
  onSelect,
  baseUrl,
}: {
  view: View;
  items: ProjectOpenItems;
  open: Open;
  onSelect: (id: string, at: number) => void;
  baseUrl: string | null;
}) {
  return (
    <OpenItems
      view={view}
      items={items}
      at={open.at}
      error={failureIn(items, open.failure)}
      onSelect={onSelect}
      onUpdate={open.onUpdate}
      busyId={open.busyId}
      baseUrl={baseUrl}
    />
  );
}

/** One project's section: name and time, its recap, then its blocks in time order. */
function ProjectDone({
  view,
  project: p,
  projects,
  recap,
  onRecap,
  open,
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
  open: Open;
}) {
  const color = projectColor(projectOf(projects, p.projectId));
  const baseUrl = issueBaseUrl(projectOf(projects, p.projectId)?.repo);
  const items = p.projectId !== null ? open.openItems.get(p.projectId) : undefined;
  return (
    <div className="border-l-2 pl-4" style={{ borderColor: color }}>
      <h3 className="mb-1.5 flex items-baseline gap-2 font-medium text-sm">
        {projectName(projects, p.projectId)}
        <span className="font-normal font-num text-muted-foreground text-xs">
          {durationLabel(p.busyMs)}
        </span>
      </h3>
      {recap && (
        <RecapBlock recap={recap} baseUrl={baseUrl} onRecap={() => onRecap(recap.projectId)} />
      )}
      {items && (
        <ProjectOpenItemsSection
          view={view}
          items={items}
          open={open}
          onSelect={onSelect}
          baseUrl={baseUrl}
        />
      )}
      <ul className="flex flex-col">
        {p.blocks.map((b, i) => (
          <DoneItem
            key={`${b.session.id}:${b.segment.start}`}
            // Over several days, name the day only where it changes, so the column reads as a timeline
            showDay={view !== "day" && startsNewDay(p.blocks, i)}
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
        "relative -mx-2 flex items-baseline gap-3 rounded-sm px-2 py-1 hover:bg-accent",
        selected && "bg-accent",
      )}
      data-selected={selected || undefined}
    >
      <span className="flex w-28 shrink-0 gap-1.5 font-num text-muted-foreground text-xs tabular-nums">
        <span className="w-7 shrink-0 text-foreground">{showDay && weekday(start)}</span>
        {hhmm(start)}–{hhmm(b.segment.end)}
      </span>
      {/* Sized to the headline so the PR numbers sit right after it; its ::after covers the row,
          so the whole highlighted row still opens the block */}
      <button
        type="button"
        onClick={() => onSelect(b.session.id, start)}
        className="min-w-0 text-left text-sm after:absolute after:inset-0 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        {b.segment.headline}
      </button>
      {b.segment.prs.length > 0 && (
        <span className="relative flex shrink-0 gap-2">
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
