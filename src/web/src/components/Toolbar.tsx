import type { CalendarSession, Project } from "@shared/api.ts";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  List,
  Monitor,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import type { Theme } from "@/hooks/useTheme.ts";
import type { Layout, View } from "@/lib/dates.ts";
import type { Filter } from "@/lib/filter.ts";
import { cn } from "@/lib/utils.ts";
import { DatePicker } from "./DatePicker.tsx";
import { FilterMenu } from "./FilterMenu.tsx";

interface Props {
  view: View;
  layout: Layout;
  anchor: number;
  now: number;
  projects: Project[];
  sessions: CalendarSession[];
  filter: Filter;
  onFilter: (filter: Filter) => void;
  progress: { done: number; total: number } | null;
  onView: (view: View) => void;
  onLayout: (layout: Layout) => void;
  onMove: (dir: -1 | 1) => void;
  onToday: () => void;
  onJump: (day: number) => void;
  /** 検索欄。`/` キーでフォーカスするので、App が参照を持つ。 */
  searchRef: React.RefObject<HTMLInputElement | null>;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  /** 「⋯」メニュー（テーマとキーボード操作）。`?` キーでも開くので、開閉は App が持つ。 */
  menuOpen: boolean;
  onMenuOpen: (open: boolean) => void;
}

/** 切り替えの見た目。地の上に選んだものだけを面として浮かせる（iOS・macOS のセグメント風）。 */
const SEGMENTED = "rounded-lg bg-muted p-0.5";
const SEGMENT =
  "h-7 rounded-md px-3 text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm";

const THEMES: [Theme, string, typeof Sun][] = [
  ["system", "OS の設定に合わせる", Monitor],
  ["light", "ライト", Sun],
  ["dark", "ダーク", Moon],
];

/** キーボード操作の一覧。キーの処理は App.tsx の keydown にある。 */
const SHORTCUTS: [string[], string][] = [
  [["←", "→"], "前・次の期間"],
  [["t"], "今日"],
  [["w", "d"], "週・日の表示"],
  [["c", "l"], "カレンダー・リスト"],
  [["j", "k"], "次・前の作業を開く"],
  [["/"], "検索"],
  [["Esc"], "詳細を閉じる"],
  [["?"], "このメニュー"],
];

export function Toolbar({
  view,
  layout,
  anchor,
  now,
  projects,
  sessions,
  filter,
  onFilter,
  progress,
  onView,
  onLayout,
  onMove,
  onToday,
  onJump,
  searchRef,
  theme,
  onTheme,
  menuOpen,
  onMenuOpen,
}: Props) {
  const unit = view === "week" ? "週" : "日";
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
      <span className="flex shrink-0 items-center gap-2">
        <Logo progress={progress} />
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

      <h1 className="flex min-w-0">
        <DatePicker view={view} anchor={anchor} now={now} projects={projects} onJump={onJump} />
      </h1>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <SearchField
          inputRef={searchRef}
          value={filter.q}
          period={view === "week" ? "この週" : "この日"}
          onChange={(q) => onFilter({ ...filter, q })}
        />
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
        <Popover open={menuOpen} onOpenChange={onMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="表示の設定とキーボード操作"
              title="表示の設定とキーボード操作（?）"
            >
              <Ellipsis />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 gap-0 p-0">
            <div className="flex items-center justify-between gap-2 border-b p-3">
              <span className="font-medium text-sm">テーマ</span>
              <ToggleGroup
                type="single"
                size="sm"
                spacing={0.5}
                className={SEGMENTED}
                value={theme}
                onValueChange={(v) => v && onTheme(v as Theme)}
                aria-label="テーマ"
              >
                {THEMES.map(([value, label, Icon]) => (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    className={cn(SEGMENT, "px-2")}
                    aria-label={label}
                    title={label}
                  >
                    <Icon />
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="p-3">
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
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}

/**
 * アプリの印。時刻の列と同じ「夜明け → 夕方 → 夜」の色で、アプリの主題（時間帯）を小さく示す。
 * 取り込み中は周りに進み具合のリングを描く。文字で出すとヘッダーの幅が動き、ボタンの位置がずれるため。
 */
function Logo({ progress }: { progress: { done: number; total: number } | null }) {
  const rate = progress ? Math.min(progress.done / Math.max(progress.total, 1), 1) : 0;
  const label = progress ? `取り込み中 ${Math.floor(rate * 100)}%` : undefined;
  // 半径 9 の円周。stroke-dasharray で進んだ分だけ描く
  const length = 2 * Math.PI * 9;
  return (
    <span className="relative flex size-5 items-center justify-center" title={label}>
      {/* 読み上げには、以前の文字の表示と同じく割合を伝える */}
      <span className="sr-only" aria-live="polite">
        {label}
      </span>
      {/* ダークのトークンは暗く濁るので、どちらのテーマでもライトの値で描く */}
      <span
        className="size-4 rounded-full ring-1 ring-border"
        style={{
          background: "linear-gradient(160deg, #c4d0ea 0%, #efc98a 55%, #3a4a7c 100%)",
        }}
        aria-hidden
      />
      {progress && (
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 20 20" aria-hidden>
          <circle cx="10" cy="10" r="9" fill="none" strokeWidth="1.5" className="stroke-border" />
          <circle
            cx="10"
            cy="10"
            r="9"
            fill="none"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray={`${rate * length} ${length}`}
            className="stroke-primary transition-[stroke-dasharray] duration-300"
          />
        </svg>
      )}
    </span>
  );
}

/**
 * 見出し・タイトルで探す欄。普段は狭く置き、使うときだけ広げる。
 * 探すのは表示中の期間の中だけなので、そのことを placeholder で示す。
 */
function SearchField({
  inputRef,
  value,
  period,
  onChange,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  period: string;
  onChange: (q: string) => void;
}) {
  return (
    <div className="relative flex items-center">
      <Search className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Esc は入力を消し、空なら欄を離れる。Enter で離れれば、続けて j / k で結果をたどれる
          if (e.key === "Escape") {
            if (value) onChange("");
            else e.currentTarget.blur();
          } else if (e.key === "Enter") e.currentTarget.blur();
          else return;
          e.preventDefault();
        }}
        placeholder={`${period}で探す`}
        aria-label={`${period}の作業を見出し・タイトル・プロジェクト名で探す`}
        className={cn(
          "peer h-7 w-36 rounded-md border bg-card pr-7 pl-7 text-sm outline-none transition-[width] duration-150 placeholder:text-muted-foreground focus:w-56 focus-visible:border-ring",
          value && "w-56 border-primary/50",
        )}
      />
      {value ? (
        <button
          type="button"
          className="absolute right-1 flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          aria-label="検索を消す"
          title="検索を消す（Esc）"
        >
          <X className="size-3.5" />
        </button>
      ) : (
        <kbd
          className="pointer-events-none absolute right-1.5 rounded border bg-muted px-1 font-num text-[10px] text-muted-foreground leading-4 peer-focus:hidden"
          aria-hidden
        >
          /
        </kbd>
      )}
    </div>
  );
}
