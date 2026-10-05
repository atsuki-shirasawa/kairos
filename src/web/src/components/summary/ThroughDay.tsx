import type { Project } from "@shared/api.ts";
import { summaryMessages } from "@/i18n/messages/summary.ts";
import { type HourAxis, hourAxis } from "@/lib/charts.ts";
import { projectColor } from "@/lib/colors.ts";
import { HOUR, hhmm } from "@/lib/dates.ts";
import type { DayBlock } from "@/lib/layout.ts";
import type { PeriodSummary } from "@/lib/summary.ts";
import { Heading, projectName, projectOf } from "./shared.tsx";

/** The day's blocks on one line per project, between the first and last hour with work. */
export function ThroughDay({
  day,
  summary,
  projects,
  onSelect,
}: {
  day: number;
  summary: PeriodSummary;
  projects: Map<number, Project>;
  onSelect: (id: string, at: number) => void;
}) {
  const m = summaryMessages();
  const axis = hourAxis(summary.projects.flatMap((p) => p.clipped));
  if (!axis) return null;
  return (
    <div>
      <Heading>{m.throughDay}</Heading>
      <div className="grid grid-cols-[minmax(6rem,10rem)_1fr] items-center gap-x-3 gap-y-1.5">
        {summary.projects.map((p) => (
          <div key={p.projectId ?? "none"} className="contents">
            <span className="truncate text-sm">{projectName(projects, p.projectId)}</span>
            <ProjectLane
              blocks={p.clipped}
              color={projectColor(projectOf(projects, p.projectId))}
              axis={axis}
              onSelect={onSelect}
            />
          </div>
        ))}
        <span />
        <div className="relative h-4">
          {axis.hours.map((h) => (
            <span
              key={h}
              className="absolute -translate-x-1/2 font-num text-[11px] text-muted-foreground"
              style={{ left: `${axis.at(h * HOUR)}%` }}
            >
              {hhmm(day + h * HOUR)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** One project's blocks placed along the axis. Each opens its block when clicked. */
function ProjectLane({
  blocks,
  color,
  axis,
  onSelect,
}: {
  blocks: DayBlock[];
  color: string;
  axis: HourAxis;
  onSelect: (id: string, at: number) => void;
}) {
  const left = (t: number) => `${axis.at(t)}%`;
  return (
    <div className="relative h-5 rounded-sm bg-muted/60">
      {blocks.map((b) => (
        <button
          key={`${b.session.id}:${b.segment.start}`}
          type="button"
          onClick={() => onSelect(b.session.id, b.segment.start)}
          title={`${hhmm(b.dayStart + b.start)}–${hhmm(b.segment.end)} ${b.segment.headline}`}
          className="absolute inset-y-0 min-w-1 rounded-sm opacity-90 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
          style={{
            left: left(b.start),
            width: `calc(${left(b.end)} - ${left(b.start)})`,
            background: color,
          }}
        />
      ))}
    </div>
  );
}
