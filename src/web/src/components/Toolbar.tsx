import type { CalendarSession, Project } from "@shared/api.ts";
import { CalendarDays, ChevronLeft, ChevronRight, Keyboard, List } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { type Layout, rangeTitle, type View } from "@/lib/dates.ts";
import type { Filter } from "@/lib/filter.ts";
import { FilterMenu } from "./FilterMenu.tsx";

interface Props {
  view: View;
  layout: Layout;
  anchor: number;
  projects: Project[];
  sessions: CalendarSession[];
  filter: Filter;
  onFilter: (filter: Filter) => void;
  progress: { done: number; total: number } | null;
  onView: (view: View) => void;
  onLayout: (layout: Layout) => void;
  onMove: (dir: -1 | 1) => void;
  onToday: () => void;
  /** キーボード操作の一覧。`?` キーでも開くので、開閉は App が持つ。 */
  helpOpen: boolean;
  onHelpOpen: (open: boolean) => void;
}

/** 切り替えの見た目。地の上に選んだものだけを面として浮かせる（iOS・macOS のセグメント風）。 */
const SEGMENTED = "rounded-lg bg-muted p-0.5";
const SEGMENT =
  "h-7 rounded-md px-3 text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm";

/** キーボード操作の一覧。キーの処理は App.tsx の keydown にある。 */
const SHORTCUTS: [string[], string][] = [
  [["←", "→"], "前・次の期間"],
  [["t"], "今日"],
  [["w", "d"], "週・日の表示"],
  [["c", "l"], "カレンダー・リスト"],
  [["j", "k"], "次・前の作業を開く"],
  [["Esc"], "詳細を閉じる"],
  [["?"], "この一覧"],
];

export function Toolbar({
  view,
  layout,
  anchor,
  projects,
  sessions,
  filter,
  onFilter,
  progress,
  onView,
  onLayout,
  onMove,
  onToday,
  helpOpen,
  onHelpOpen,
}: Props) {
  const unit = view === "week" ? "週" : "日";
  const range = rangeTitle(view, anchor);
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      {/* 印は時刻の列と同じ「夜明け → 夕方 → 夜」の色。アプリの主題（時間帯）を小さく示す。
          ダークのトークンは暗く濁るので、どちらのテーマでもライトの値で描く */}
      <span className="flex shrink-0 items-center gap-2">
        <span
          className="size-4 rounded-full ring-1 ring-border"
          style={{
            background: "linear-gradient(160deg, #c4d0ea 0%, #efc98a 55%, #3a4a7c 100%)",
          }}
          aria-hidden
        />
        <span className="font-semibold text-[15px] tracking-wide">Kairos</span>
      </span>
      <span className="h-5 w-px shrink-0 bg-border" aria-hidden />

      {/* 移動のボタンは 1 つの塊にまとめ、見出しの左に置く（カレンダーアプリの定番の並び） */}
      <div className="flex shrink-0 items-center rounded-md border bg-card">
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-r-none"
          onClick={() => onMove(-1)}
          aria-label={`前の${unit}`}
          title={`前の${unit}（←）`}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-none border-x px-3"
          onClick={onToday}
          title="今日（t）"
        >
          今日
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-l-none"
          onClick={() => onMove(1)}
          aria-label={`次の${unit}`}
          title={`次の${unit}（→）`}
        >
          <ChevronRight />
        </Button>
      </div>

      <h1 className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
        <span className="truncate font-num font-semibold text-lg tracking-tight">
          {range.title}
        </span>
        {range.sub && <span className="text-muted-foreground text-sm">{range.sub}</span>}
        <span className="font-num text-muted-foreground text-sm">{range.year}</span>
        {range.week && (
          <span
            className="rounded border px-1.5 font-num text-[11px] text-muted-foreground leading-5"
            title={`ISO 週番号（第 ${range.week.slice(1)} 週）`}
          >
            {range.week}
          </span>
        )}
      </h1>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {progress && (
          <span className="mr-1 font-num text-muted-foreground text-xs" aria-live="polite">
            取り込み中 {Math.floor((progress.done / Math.max(progress.total, 1)) * 100)}%
          </span>
        )}
        <ToggleGroup
          type="single"
          size="sm"
          spacing={0.5}
          className={SEGMENTED}
          value={view}
          onValueChange={(v) => v && onView(v as View)}
          aria-label="表示の切り替え"
        >
          <ToggleGroupItem value="week" className={SEGMENT} title="週の表示（w）">
            週
          </ToggleGroupItem>
          <ToggleGroupItem value="day" className={SEGMENT} title="日の表示（d）">
            日
          </ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup
          type="single"
          size="sm"
          spacing={0.5}
          className={SEGMENTED}
          value={layout}
          onValueChange={(v) => v && onLayout(v as Layout)}
          aria-label="カレンダーとリストの切り替え"
        >
          <ToggleGroupItem
            value="calendar"
            className={SEGMENT}
            aria-label="カレンダー"
            title="カレンダー（c）"
          >
            <CalendarDays />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" className={SEGMENT} aria-label="リスト" title="リスト（l）">
            <List />
          </ToggleGroupItem>
        </ToggleGroup>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <FilterMenu projects={projects} sessions={sessions} filter={filter} onFilter={onFilter} />
        <Popover open={helpOpen} onOpenChange={onHelpOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="キーボード操作"
              title="キーボード操作（?）"
            >
              <Keyboard />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <p className="mb-2 font-medium text-sm">キーボード操作</p>
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-sm">
              {SHORTCUTS.map(([keys, label]) => (
                <div key={label} className="contents">
                  <dt className="flex gap-1">
                    {keys.map((k) => (
                      <kbd
                        key={k}
                        className="min-w-6 rounded border bg-muted px-1.5 text-center font-num text-xs leading-5"
                      >
                        {k}
                      </kbd>
                    ))}
                  </dt>
                  <dd className="text-muted-foreground">{label}</dd>
                </div>
              ))}
            </dl>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
