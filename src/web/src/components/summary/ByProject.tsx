import type { Project } from "@shared/api.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { summaryMessages } from "@/i18n/messages/summary.ts";
import { scaleToMax } from "@/lib/charts.ts";
import { projectColor } from "@/lib/colors.ts";
import { durationLabel } from "@/lib/dates.ts";
import type { PeriodSummary, ProjectSummary } from "@/lib/summary.ts";
import { costText, Heading, projectName, projectOf } from "./shared.tsx";

/** Working time per project as bars, with each project's outcomes and cost. */
export function ByProject({
  summary,
  projects,
}: {
  summary: PeriodSummary;
  projects: Map<number, Project>;
}) {
  const m = summaryMessages();
  const width = scaleToMax(summary.projects.map((p) => p.busyMs));
  // Rows count parallel work once per project, the total once overall. Say so when they differ
  const overlap = summary.projects.reduce((n, p) => n + p.busyMs, 0) - summary.busyMs >= 60_000;
  return (
    <div>
      <Heading>{m.byProject}</Heading>
      {overlap && (
        <p className="-mt-2 mb-2 text-muted-foreground text-xs">
          {m.overlap(durationLabel(summary.busyMs))}
        </p>
      )}
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>{m.byProject}</th>
            <td />
            <th>{m.working}</th>
            <th>{m.outcomes}</th>
            <th>{m.cost}</th>
          </tr>
        </thead>
        <tbody>
          {summary.projects.map((p) => (
            <ProjectRow
              key={p.projectId ?? "none"}
              project={p}
              projects={projects}
              width={Math.max(width(p.busyMs), 1)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A project's row, its bar `width` percent of the longest. */
function ProjectRow({
  project: p,
  projects,
  width,
}: {
  project: ProjectSummary;
  projects: Map<number, Project>;
  width: number;
}) {
  return (
    <tr className="border-t first:border-t-0">
      <th scope="row" className="w-40 max-w-40 truncate py-1.5 pr-3 text-left font-normal">
        {projectName(projects, p.projectId)}
      </th>
      <td className="w-full py-1.5 pr-4" aria-hidden>
        <span
          className="block h-1.5 rounded-full"
          style={{
            width: `${width}%`,
            background: projectColor(projectOf(projects, p.projectId)),
          }}
        />
      </td>
      <td className="whitespace-nowrap py-1.5 pr-4 text-right font-num tabular-nums">
        {durationLabel(p.busyMs)}
      </td>
      <td className="whitespace-nowrap py-1.5 pr-4 text-right font-num text-muted-foreground tabular-nums">
        {formatMessages().commitsPrs(p.commits, p.prs.length)}
      </td>
      <td className="whitespace-nowrap py-1.5 text-right font-num text-muted-foreground tabular-nums">
        {costText(p.usage)}
      </td>
    </tr>
  );
}
