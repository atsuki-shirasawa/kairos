import type { CalendarSession, Project, ProjectUpdate } from "@shared/api.ts";
import { Funnel } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { useUpdateProject } from "@/hooks/queries.ts";
import { useLocale } from "@/i18n/index.ts";
import { filterMessages } from "@/i18n/messages/filter.ts";
import { PALETTE, projectColor } from "@/lib/colors.ts";
import type { Filter } from "@/lib/filter.ts";
import { filterBadge, matchingProjectRows, projectRows } from "@/lib/filterMenu.ts";
import { inShownProjects } from "@/lib/projectVisibility.ts";
import { cn } from "@/lib/utils.ts";
import { Conditions } from "./filter/Conditions.tsx";

/** Above this many projects, show a field to filter them by name. */
const SEARCH_FROM = 8;

const INPUT =
  "h-7 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-body outline-none focus-visible:border-ring";

/**
 * Filtering. Keywords belong to the search field in the header. The top part holds temporary
 * conditions (kept in the URL, and listed as chips under the toolbar while applied); the bottom part
 * holds project visibility and colors (saved in the DB). Projects used in the shown period are listed first.
 */
export function FilterMenu({
  projects,
  projectMap,
  sessions,
  filter,
  onFilter,
}: {
  projects: Project[];
  /** The same projects by id, to leave hidden projects' sessions out of the conditions. */
  projectMap: Map<number, Project>;
  sessions: CalendarSession[];
  filter: Filter;
  onFilter: (filter: Filter) => void;
}) {
  const m = filterMessages();
  const locale = useLocale();
  const update = useUpdateProject();
  const [editing, setEditing] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => projectRows(projects, sessions, locale), [projects, sessions, locale]);
  const { conditions, hidden } = filterBadge(filter, projects);
  const unhidden = useMemo(() => inShownProjects(sessions, projectMap), [projectMap, sessions]);
  const shown = matchingProjectRows(rows, query);
  const showAll = () => {
    for (const p of projects) if (p.hidden) update.mutate({ id: p.id, update: { hidden: false } });
  };
  const badge = [
    conditions > 0 && m.conditionCount(conditions),
    hidden > 0 && m.hiddenCount(hidden),
  ]
    .filter(Boolean)
    .join(m.separator);
  const active = conditions + hidden;

  return (
    <Popover onOpenChange={(open) => !open && setQuery("")}>
      <PopoverTrigger asChild>
        {/* Icon only; active conditions show as color and a count. The breakdown is in the tooltip */}
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative", active > 0 && "text-primary")}
          aria-label={badge ? m.buttonWith(badge) : m.button}
          title={badge ? m.buttonWith(badge) : m.button}
        >
          <Funnel className={cn(active > 0 && "fill-primary/20")} />
          {active > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 font-num text-badge text-primary-foreground leading-none"
              aria-hidden
            >
              {active}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex max-h-[calc(100vh-5rem)] w-96 flex-col overflow-y-auto p-0"
      >
        <Conditions sessions={unhidden} filter={filter} onFilter={onFilter} />
        <div className="flex h-10 items-center gap-2 border-b px-3">
          <span className="font-medium text-label text-muted-foreground">{m.projects}</span>
          {projects.length > SEARCH_FROM && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={m.projectSearch}
              aria-label={m.projectSearchLabel}
              className={INPUT}
            />
          )}
          {hidden > 0 && (
            <Button variant="ghost" size="xs" className="ml-auto" onClick={showAll}>
              {m.showAll}
            </Button>
          )}
        </div>
        <ul className="py-1">
          {shown.length === 0 && (
            <li className="px-4 py-2 text-body text-muted-foreground">{m.notFound}</li>
          )}
          {shown.map(({ project, count }) => (
            <ProjectRow
              key={project.id}
              project={project}
              count={count}
              editing={editing === project.id}
              onEdit={(on) => setEditing(on ? project.id : null)}
              onUpdate={(change) => update.mutate({ id: project.id, update: change })}
            />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * One project: whether it shows, its session count in the period, and its color, with the colors
 * to pick from below it while `editing`.
 */
function ProjectRow({
  project,
  count,
  editing,
  onEdit,
  onUpdate,
}: {
  project: Project;
  count: number;
  editing: boolean;
  /** Opens (true) or closes (false) this project's colors. */
  onEdit: (editing: boolean) => void;
  /** Saves a change to the project (shown or hidden, its color). */
  onUpdate: (change: ProjectUpdate) => void;
}) {
  const m = filterMessages();
  return (
    <li className="px-2">
      <div className="flex items-center gap-2.5 rounded-md px-2 py-1 hover:bg-accent">
        <Checkbox
          id={`project-${project.id}`}
          checked={!project.hidden}
          onCheckedChange={(v) => onUpdate({ hidden: v !== true })}
        />
        <label
          htmlFor={`project-${project.id}`}
          className={cn(
            "min-w-0 flex-1 truncate text-body",
            project.hidden && "text-muted-foreground",
          )}
          title={project.repo ? `${project.repo}\n${project.path}` : project.path}
        >
          {project.name}
        </label>
        <span className="font-num text-label text-muted-foreground">{count || ""}</span>
        {/* The color button sits at the row's right end with a larger hit area: next to the checkbox it was easy to mis-click */}
        <button
          type="button"
          className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-background focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => onEdit(!editing)}
          aria-label={m.changeColorOf(project.name)}
          aria-expanded={editing}
          title={m.changeColor}
        >
          <span className="size-3.5 rounded-sm" style={{ background: projectColor(project) }} />
        </button>
      </div>
      {editing && (
        <ColorSwatches
          project={project}
          onPick={(color) => {
            onUpdate({ color });
            onEdit(false);
          }}
        />
      )}
    </li>
  );
}

/** The palette for one project, its current color pressed. */
function ColorSwatches({ project, onPick }: { project: Project; onPick: (color: string) => void }) {
  const m = filterMessages();
  return (
    <fieldset className="flex justify-end gap-1.5 px-2 pt-1 pb-2">
      <legend className="sr-only">{m.colorOf(project.name)}</legend>
      {PALETTE.map((c) => (
        <button
          key={c.key}
          type="button"
          title={c.name}
          aria-label={c.name}
          aria-pressed={projectColor(project) === `var(--${c.key})`}
          className="size-5 rounded-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring aria-pressed:outline-2 aria-pressed:outline-foreground"
          style={{ background: `var(--${c.key})` }}
          onClick={() => onPick(c.key)}
        />
      ))}
    </fieldset>
  );
}
