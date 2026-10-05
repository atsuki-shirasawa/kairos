import type { CalendarSession, Project } from "@shared/api.ts";
import { Funnel } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { useUpdateProject } from "@/hooks/queries.ts";
import { useLocale } from "@/i18n/index.ts";
import { filterMessages } from "@/i18n/messages/filter.ts";
import { PALETTE, projectColor } from "@/lib/colors.ts";
import { BRIEF_PROMPTS, type Filter } from "@/lib/filter.ts";
import { cn } from "@/lib/utils.ts";

/** Above this many projects, show a field to filter them by name. */
const SEARCH_FROM = 8;

const INPUT =
  "h-7 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:border-ring";

/**
 * Filtering. Keywords belong to the search field in the header. The top part holds temporary
 * conditions (kept in the URL); the bottom part holds project visibility and colors (saved in the DB).
 * Projects used in the shown period are listed first.
 */
export function FilterMenu({
  projects,
  sessions,
  filter,
  onFilter,
}: {
  projects: Project[];
  sessions: CalendarSession[];
  filter: Filter;
  onFilter: (filter: Filter) => void;
}) {
  const m = filterMessages();
  const locale = useLocale();
  const update = useUpdateProject();
  const [editing, setEditing] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const counts = new Map<number, number>();
    for (const s of sessions)
      if (s.projectId !== null) counts.set(s.projectId, (counts.get(s.projectId) ?? 0) + 1);
    return projects
      .map((p) => ({ project: p, count: counts.get(p.id) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.project.name.localeCompare(b.project.name, locale));
  }, [projects, sessions, locale]);
  const hidden = projects.filter((p) => p.hidden).length;
  // Keywords are already visible in the header search field, so they aren't counted here
  const conditions = [filter.outcome, filter.hideBrief].filter(Boolean).length;
  const q = query.trim().toLowerCase();
  const shown = q
    ? rows.filter(({ project: p }) =>
        `${p.name} ${p.repo ?? ""} ${p.path}`.toLowerCase().includes(q),
      )
    : rows;
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
          size="icon-sm"
          className={cn("relative", active > 0 && "text-primary")}
          aria-label={badge ? m.buttonWith(badge) : m.button}
          title={badge ? m.buttonWith(badge) : m.button}
        >
          <Funnel className={cn(active > 0 && "fill-primary/20")} />
          {active > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 font-num text-[10px] text-primary-foreground leading-none"
              aria-hidden
            >
              {active}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex flex-col gap-2 border-b p-3">
          <div className="flex h-6 items-center justify-between">
            <span className="font-medium text-muted-foreground text-xs">{m.conditions}</span>
            {(filter.outcome || filter.hideBrief) && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onFilter({ ...filter, outcome: false, hideBrief: false })}
              >
                {m.clear}
              </Button>
            )}
          </div>
          <label htmlFor="filter-outcome" className="flex items-center gap-2.5 text-sm">
            <Checkbox
              id="filter-outcome"
              checked={filter.outcome}
              onCheckedChange={(v) => onFilter({ ...filter, outcome: v === true })}
            />
            {m.outcomeOnly}
          </label>
          <div className="flex items-start gap-2.5 text-sm">
            <Checkbox
              id="filter-brief"
              className="mt-0.5"
              checked={filter.hideBrief}
              onCheckedChange={(v) => onFilter({ ...filter, hideBrief: v === true })}
              aria-describedby="filter-brief-note"
            />
            <div className="flex flex-col">
              <label htmlFor="filter-brief">{m.hideBrief}</label>
              <span id="filter-brief-note" className="text-muted-foreground text-xs">
                {m.hideBriefNote(BRIEF_PROMPTS)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex h-10 items-center gap-2 border-b px-3">
          <span className="font-medium text-muted-foreground text-xs">{m.projects}</span>
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
        <ul className="max-h-[60vh] overflow-y-auto py-1">
          {shown.length === 0 && (
            <li className="px-4 py-2 text-muted-foreground text-sm">{m.notFound}</li>
          )}
          {shown.map(({ project, count }) => (
            <li key={project.id} className="px-2">
              <div className="flex items-center gap-2.5 rounded-md px-2 py-1 hover:bg-accent">
                <Checkbox
                  id={`project-${project.id}`}
                  checked={!project.hidden}
                  onCheckedChange={(v) =>
                    update.mutate({ id: project.id, update: { hidden: v !== true } })
                  }
                />
                <label
                  htmlFor={`project-${project.id}`}
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    project.hidden && "text-muted-foreground",
                  )}
                  title={project.repo ? `${project.repo}\n${project.path}` : project.path}
                >
                  {project.name}
                </label>
                <span className="font-num text-muted-foreground text-xs">{count || ""}</span>
                {/* The color button sits at the row's right end with a larger hit area: next to the checkbox it was easy to mis-click */}
                <button
                  type="button"
                  className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-background focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => setEditing(editing === project.id ? null : project.id)}
                  aria-label={m.changeColorOf(project.name)}
                  aria-expanded={editing === project.id}
                  title={m.changeColor}
                >
                  <span
                    className="size-3.5 rounded-sm"
                    style={{ background: projectColor(project) }}
                  />
                </button>
              </div>
              {editing === project.id && (
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
                      onClick={() => {
                        update.mutate({ id: project.id, update: { color: c.key } });
                        setEditing(null);
                      }}
                    />
                  ))}
                </fieldset>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
