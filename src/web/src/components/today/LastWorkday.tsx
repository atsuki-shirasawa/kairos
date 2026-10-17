import type { Project } from "@shared/api.ts";
import { OutcomeTally } from "@/components/OutcomeTally.tsx";
import { Button } from "@/components/ui/button.tsx";
import type { LastWorkday as LastWorkdayData } from "@/hooks/useLastWorkday.ts";
import { todayMessages } from "@/i18n/messages/today.ts";
import { projectColor } from "@/lib/colors.ts";
import { dateLabel, daysBetween, relativeDay } from "@/lib/dates.ts";
import { type OpenBlock, projectName, projectOf } from "@/lib/selection.ts";
import { WORKDAY_LOOKBACK_DAYS, type WorkdayProject } from "@/lib/today.ts";
import { cn } from "@/lib/utils.ts";

/**
 * The last day with work before today, by project: each block's headline and the commits and PRs
 * it made, from the summaries already written. The heading names the day, and how long ago it was
 * after a break; its button opens the day on the calendar.
 */
export function LastWorkday({
  workday,
  projects,
  now,
  selectedId,
  selectedAt,
  onSelect,
  onOpenDay,
}: {
  workday: LastWorkdayData;
  projects: ReadonlyMap<number, Project>;
  now: number;
  selectedId: string | null;
  selectedAt: number | null;
  onSelect: OpenBlock;
  onOpenDay: (day: number) => void;
}) {
  const t = todayMessages();
  const day = workday.status === "ready" ? workday.day : null;
  return (
    <section aria-labelledby="today-last" className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="today-last" className="font-semibold text-title tracking-tight">
          {t.lastWorkday}
        </h2>
        {day !== null && <DayLabel day={day} now={now} />}
        {day !== null && (
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2.5 ml-auto"
            onClick={() => onOpenDay(day)}
          >
            {t.openDay}
          </Button>
        )}
      </header>
      {workday.status === "none" && (
        <p className="text-body text-muted-foreground">{t.noWorkYet(WORKDAY_LOOKBACK_DAYS)}</p>
      )}
      {workday.status === "ready" && workday.work.length === 0 && (
        <p className="text-body text-muted-foreground">{t.nothingToList}</p>
      )}
      {workday.status === "ready" && (
        <div className="flex flex-col gap-5">
          {workday.work.map((p) => (
            <ProjectWork
              key={p.projectId ?? "none"}
              work={p}
              projects={projects}
              selectedId={selectedId}
              selectedAt={selectedAt}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** The day ("Yesterday", or its date), and after a longer break how many days ago it was. */
function DayLabel({ day, now }: { day: number; now: number }) {
  const days = daysBetween(day, now);
  return (
    <span className="flex items-baseline gap-2 text-label text-muted-foreground">
      <span className="font-num text-foreground">
        {relativeDay(day, now) ?? dateLabel(day, now)}
      </span>
      {days > 1 && <span>{todayMessages().sinceLastWork(days)}</span>}
    </span>
  );
}

/** One project's blocks on the day, under its name and colored rule, as in the summary view. */
function ProjectWork({
  work,
  projects,
  selectedId,
  selectedAt,
  onSelect,
}: {
  work: WorkdayProject;
  projects: ReadonlyMap<number, Project>;
  selectedId: string | null;
  selectedAt: number | null;
  onSelect: OpenBlock;
}) {
  const name = projectName(projects, work.projectId);
  return (
    <div
      className="border-l-2 pl-4"
      style={{ borderColor: projectColor(projectOf(projects, work.projectId)) }}
    >
      <h3 className="mb-1 font-medium text-body">{name}</h3>
      <ul aria-label={todayMessages().projectWork(name)} className="flex flex-col">
        {work.blocks.map((b) => {
          const selected = b.sessionId === selectedId && b.start === selectedAt;
          return (
            <li
              key={`${b.sessionId}:${b.start}`}
              className={cn(
                "relative -mx-2 flex items-baseline gap-3 rounded-sm px-2 py-1 hover:bg-accent",
                selected && "bg-accent",
              )}
            >
              {/* Its ::after covers the row, so the whole row opens the block */}
              <button
                type="button"
                onClick={() => onSelect(b.sessionId, b.start)}
                aria-pressed={selected}
                className="min-w-0 truncate text-left text-body after:absolute after:inset-0 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                {b.headline}
              </button>
              <OutcomeTally
                commits={b.commits}
                prs={b.prs}
                className="relative ml-auto shrink-0 font-num text-label text-muted-foreground"
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
