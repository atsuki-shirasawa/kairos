import type { CalendarSession, Project } from "@shared/api.ts";
import { Funnel } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { useUpdateProject } from "@/hooks/queries.ts";
import { PALETTE, projectColor } from "@/lib/colors.ts";
import { BRIEF_PROMPTS, type Filter, isFiltered, NO_FILTER } from "@/lib/filter.ts";
import { cn } from "@/lib/utils.ts";

/** これより多いときは、プロジェクトを名前で絞り込む欄を出す。 */
const SEARCH_FROM = 8;

const INPUT =
  "h-7 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:border-ring";

/**
 * 絞り込み。上は今だけの条件（URL に持たせる）、下はプロジェクトの表示・非表示と色（DB に保存する）。
 * プロジェクトは表示中の期間で使ったものを上に並べる。
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
  const update = useUpdateProject();
  const [editing, setEditing] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const counts = new Map<number, number>();
    for (const s of sessions)
      if (s.projectId !== null) counts.set(s.projectId, (counts.get(s.projectId) ?? 0) + 1);
    return projects
      .map((p) => ({ project: p, count: counts.get(p.id) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.project.name.localeCompare(b.project.name, "ja"));
  }, [projects, sessions]);
  const hidden = projects.filter((p) => p.hidden).length;
  const conditions = [filter.q.trim() !== "", filter.outcome, filter.hideBrief].filter(
    Boolean,
  ).length;
  const q = query.trim().toLowerCase();
  const shown = q
    ? rows.filter(({ project: p }) =>
        `${p.name} ${p.repo ?? ""} ${p.path}`.toLowerCase().includes(q),
      )
    : rows;
  const showAll = () => {
    for (const p of projects) if (p.hidden) update.mutate({ id: p.id, update: { hidden: false } });
  };
  const badge = [conditions > 0 && `${conditions} 条件`, hidden > 0 && `${hidden} 件非表示`]
    .filter(Boolean)
    .join("・");
  const active = conditions + hidden;

  return (
    <Popover onOpenChange={(open) => !open && setQuery("")}>
      <PopoverTrigger asChild>
        {/* アイコンだけにし、効いている条件があるときは色と数で知らせる。内訳はツールチップで出す */}
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("relative", active > 0 && "text-primary")}
          aria-label={badge ? `絞り込み（${badge}）` : "絞り込み"}
          title={badge ? `絞り込み（${badge}）` : "絞り込み"}
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
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={filter.q}
              onChange={(e) => onFilter({ ...filter, q: e.target.value })}
              placeholder="見出し・タイトルで探す"
              aria-label="作業を見出し・タイトル・プロジェクト名で探す"
              className={INPUT}
            />
            {isFiltered(filter) && (
              <Button variant="ghost" size="xs" onClick={() => onFilter(NO_FILTER)}>
                解除
              </Button>
            )}
          </div>
          <label htmlFor="filter-outcome" className="flex items-center gap-2.5 text-sm">
            <Checkbox
              id="filter-outcome"
              checked={filter.outcome}
              onCheckedChange={(v) => onFilter({ ...filter, outcome: v === true })}
            />
            コミットか PR のある作業だけ
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
              <label htmlFor="filter-brief">ちょっとした質問を隠す</label>
              <span id="filter-brief-note" className="text-muted-foreground text-xs">
                発言 {BRIEF_PROMPTS} 件以下で、ファイルを書き換えていないセッション
              </span>
            </div>
          </div>
        </div>
        <div className="flex h-10 items-center gap-2 border-b px-3">
          <span className="font-medium text-muted-foreground text-xs">プロジェクト</span>
          {projects.length > SEARCH_FROM && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="名前で絞り込む"
              aria-label="プロジェクトを名前で絞り込む"
              className={INPUT}
            />
          )}
          {hidden > 0 && (
            <Button variant="ghost" size="xs" className="ml-auto" onClick={showAll}>
              すべて表示
            </Button>
          )}
        </div>
        <ul className="max-h-[60vh] overflow-y-auto py-1">
          {shown.length === 0 && (
            <li className="px-4 py-2 text-muted-foreground text-sm">見つかりません</li>
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
                {/* 色は行の右端で変える。チェックボックスの隣だと押し間違えやすいため、押せる範囲も広げる */}
                <button
                  type="button"
                  className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-background focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => setEditing(editing === project.id ? null : project.id)}
                  aria-label={`${project.name} の色を変える`}
                  aria-expanded={editing === project.id}
                  title="色を変える"
                >
                  <span
                    className="size-3.5 rounded-sm"
                    style={{ background: projectColor(project) }}
                  />
                </button>
              </div>
              {editing === project.id && (
                <fieldset className="flex justify-end gap-1.5 px-2 pt-1 pb-2">
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
