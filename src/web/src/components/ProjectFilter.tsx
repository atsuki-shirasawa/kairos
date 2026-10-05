import type { CalendarSession, Project } from "@shared/api.ts";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { useUpdateProject } from "@/hooks/queries.ts";
import { PALETTE, projectColor } from "@/lib/colors.ts";
import { cn } from "@/lib/utils.ts";

/** プロジェクトの表示・非表示と色を切り替える。表示中の期間で使ったプロジェクトを上に並べる。 */
export function ProjectFilter({
  projects,
  sessions,
}: {
  projects: Project[];
  sessions: CalendarSession[];
}) {
  const update = useUpdateProject();
  const [editing, setEditing] = useState<number | null>(null);

  const rows = useMemo(() => {
    const counts = new Map<number, number>();
    for (const s of sessions)
      if (s.projectId !== null) counts.set(s.projectId, (counts.get(s.projectId) ?? 0) + 1);
    return projects
      .map((p) => ({ project: p, count: counts.get(p.id) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.project.name.localeCompare(b.project.name, "ja"));
  }, [projects, sessions]);
  const hidden = projects.filter((p) => p.hidden).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          プロジェクト
          {hidden > 0 && <span className="text-muted-foreground">（{hidden} 件を非表示）</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <ul className="max-h-[60vh] overflow-y-auto py-1">
          {rows.map(({ project, count }) => (
            <li key={project.id} className="px-2">
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
                <Checkbox
                  id={`project-${project.id}`}
                  checked={!project.hidden}
                  onCheckedChange={(v) =>
                    update.mutate({ id: project.id, update: { hidden: v !== true } })
                  }
                />
                <button
                  type="button"
                  className="size-3.5 shrink-0 rounded-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
                  style={{ background: projectColor(project) }}
                  onClick={() => setEditing(editing === project.id ? null : project.id)}
                  aria-label={`${project.name} の色を変える`}
                  aria-expanded={editing === project.id}
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
              </div>
              {editing === project.id && (
                <fieldset className="flex gap-1.5 px-9 pt-1 pb-2">
                  <legend className="sr-only">{project.name} の色</legend>
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
