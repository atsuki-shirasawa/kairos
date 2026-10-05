import type { CalendarSession, Project } from "@shared/api.ts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { rangeLabel, type View } from "@/lib/dates.ts";
import { ProjectFilter } from "./ProjectFilter.tsx";

interface Props {
  view: View;
  anchor: number;
  projects: Project[];
  sessions: CalendarSession[];
  progress: { done: number; total: number } | null;
  onView: (view: View) => void;
  onMove: (dir: -1 | 1) => void;
  onToday: () => void;
}

export function Toolbar({
  view,
  anchor,
  projects,
  sessions,
  progress,
  onView,
  onMove,
  onToday,
}: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4">
      <span className="font-semibold text-[15px] tracking-wide">Kairos</span>

      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={view}
        onValueChange={(v) => v && onView(v as View)}
        aria-label="表示の切り替え"
      >
        <ToggleGroupItem value="week" className="px-3">
          週
        </ToggleGroupItem>
        <ToggleGroupItem value="day" className="px-3">
          日
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onMove(-1)}
          aria-label={view === "week" ? "前の週" : "前の日"}
        >
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="sm" onClick={onToday}>
          今日
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onMove(1)}
          aria-label={view === "week" ? "次の週" : "次の日"}
        >
          <ChevronRight />
        </Button>
      </div>

      <h1 className="truncate font-medium text-base">{rangeLabel(view, anchor)}</h1>

      <div className="ml-auto flex items-center gap-3">
        {progress && (
          <span className="font-num text-muted-foreground text-xs" aria-live="polite">
            ログを取り込み中 {Math.floor((progress.done / Math.max(progress.total, 1)) * 100)}%
          </span>
        )}
        <ProjectFilter projects={projects} sessions={sessions} />
      </div>
    </header>
  );
}
