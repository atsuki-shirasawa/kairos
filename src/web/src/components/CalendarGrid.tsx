import type { CalendarSession, Project } from "@shared/api.ts";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { projectColor } from "@/lib/colors.ts";
import { DAY, durationLabel, HOUR, hhmm, isSameDay, weekday } from "@/lib/dates.ts";
import { layoutDay, MIN_BLOCK_MS, type PlacedBlock } from "@/lib/layout.ts";
import { cn } from "@/lib/utils.ts";

/** 1 時間の最小の高さ。これより低いと短いブロックの見出しが読めない。 */
const MIN_HOUR_PX = 48;
/** 開いたときに見せる時間帯（時）。画面の高さにこの範囲が収まるよう 1 時間の高さを決め、中央に置く。 */
const VIEW_START = 8;
const VIEW_END = 20;
const GUTTER = "3.5rem";
/** 同じ列で重ねたブロックを右にずらす幅。下のブロックの左端の色が見えるようにする。 */
const INDENT_PX = 8;
/** Tailwind がクラス名を拾えるよう、行数ごとのクラスを書き下しておく。 */
const LINE_CLAMP = ["", "line-clamp-1", "line-clamp-2", "line-clamp-3"] as const;

/**
 * 時刻の列の地色。夜（藍）→ 夜明け → 昼（地色）→ 夕方（琥珀）→ 夜。
 * 位置は 24 時間に対する割合で指定する。
 */
const SKY = `linear-gradient(to bottom,
  var(--night) 0%, var(--night) ${(4.5 / 24) * 100}%,
  var(--dawn) ${(6.5 / 24) * 100}%,
  color-mix(in srgb, var(--dawn) 25%, transparent) ${(9 / 24) * 100}%,
  transparent ${(11 / 24) * 100}%, transparent ${(15 / 24) * 100}%,
  color-mix(in srgb, var(--dusk) 60%, transparent) ${(17 / 24) * 100}%,
  var(--dusk) ${(18 / 24) * 100}%,
  var(--night) ${(20 / 24) * 100}%, var(--night) 100%)`;

const isNightHour = (h: number) => h < 6 || h >= 20;

interface Props {
  days: number[];
  sessions: CalendarSession[];
  projects: Map<number, Project>;
  selectedId: string | null;
  /** 選んだセクションの開始時刻。null ならそのセッションのブロックをすべて選択表示にする。 */
  selectedAt: number | null;
  now: number;
  onSelect: (id: string, at: number) => void;
  onOpenDay: (day: number) => void;
}

export function CalendarGrid({
  days,
  sessions,
  projects,
  selectedId,
  selectedAt,
  now,
  onSelect,
  onOpenDay,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { hourPx, viewportPx } = useHourPx(scrollRef);
  const columns = useMemo(() => days.map((day) => layoutDay(sessions, day)), [days, sessions]);
  const firstDay = days[0] ?? 0;

  // 期間が変わったら、見せる時間帯の真ん中が画面の中央に来るようにスクロールする。
  // 高さが変わったときも合わせ直す（測る前の仮の高さで一度スクロールしてしまうため）
  // biome-ignore lint/correctness/useExhaustiveDependencies: 期間（firstDay）が変わったときにも動かす
  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    const center = ((VIEW_START + VIEW_END) / 2) * hourPx;
    scrollRef.current.scrollTop = Math.max(0, center - viewportPx / 2);
  }, [firstDay, hourPx, viewportPx]);

  // 作業のない日（今日より後の日など）は細くし、作業のある日に幅を回す。
  // すべて空なら均等にする（fr の合計が 1 未満だと余白が残るため）
  const anyBusy = columns.some((c) => c.length > 0);
  const tracks = columns.map((c) =>
    anyBusy && c.length === 0 ? "minmax(2.5rem, 0.15fr)" : "minmax(0, 1fr)",
  );
  const template = { gridTemplateColumns: `${GUTTER} ${tracks.join(" ")}` };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <div className="grid border-b" style={template}>
        <div />
        {days.map((day) => {
          const today = isSameDay(day, now);
          return (
            <button
              key={day}
              type="button"
              onClick={() => onOpenDay(day)}
              className="flex min-w-0 items-baseline gap-1.5 overflow-hidden whitespace-nowrap border-l px-2.5 py-2 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              title="この日を表示"
            >
              <span
                className={cn(
                  "font-num font-semibold text-xl",
                  today ? "text-primary" : "text-foreground",
                )}
              >
                {new Date(day).getDate()}
              </span>
              <span className={cn("text-xs", today ? "text-primary" : "text-muted-foreground")}>
                {weekday(day)}
              </span>
            </button>
          );
        })}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid" style={{ ...template, height: 24 * hourPx }}>
          <div className="relative" style={{ background: SKY }} aria-hidden>
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <span
                key={h}
                className={cn(
                  "absolute right-2 -translate-y-1/2 font-num text-[11px]",
                  isNightHour(h) ? "text-white/80" : "text-foreground/60",
                )}
                style={{ top: h * hourPx }}
              >
                {h}:00
              </span>
            ))}
          </div>

          {days.map((day, i) => (
            <DayColumn
              key={day}
              day={day}
              blocks={columns[i] ?? []}
              hourPx={hourPx}
              projects={projects}
              selectedId={selectedId}
              selectedAt={selectedAt}
              now={now}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * スクロール領域の高さから 1 時間の高さを決める。見せる時間帯がちょうど収まる高さにし、
 * 低い画面では最小の高さで止める。ウィンドウの大きさが変わったら測り直す。
 */
function useHourPx(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ hourPx: MIN_HOUR_PX, viewportPx: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const viewportPx = el.clientHeight;
      const hourPx = Math.max(MIN_HOUR_PX, viewportPx / (VIEW_END - VIEW_START));
      setSize((prev) =>
        prev.hourPx === hourPx && prev.viewportPx === viewportPx ? prev : { hourPx, viewportPx },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function DayColumn({
  day,
  blocks,
  hourPx,
  projects,
  selectedId,
  selectedAt,
  now,
  onSelect,
}: {
  day: number;
  blocks: PlacedBlock[];
  hourPx: number;
  projects: Map<number, Project>;
  selectedId: string | null;
  selectedAt: number | null;
  now: number;
  onSelect: (id: string, at: number) => void;
}) {
  const today = now >= day && now < day + DAY;
  return (
    <div
      className={cn("relative border-l", today && "bg-primary/[0.04]")}
      style={{
        backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${hourPx}px)`,
      }}
    >
      {/* 現在時刻の線はブロックの下に描く。直前の短いブロックを隠さないため */}
      {today && (
        <div
          className="pointer-events-none absolute inset-x-0 h-0.5 bg-primary"
          style={{ top: ((now - day) / HOUR) * hourPx }}
          aria-hidden
        >
          <span className="absolute -top-[3px] -left-1 size-2 rounded-full bg-primary" />
        </div>
      )}
      {blocks.map((b) => (
        <Block
          key={`${b.session.id}-${b.start}`}
          block={b}
          hourPx={hourPx}
          project={b.session.projectId !== null ? projects.get(b.session.projectId) : undefined}
          selected={
            b.session.id === selectedId && (selectedAt === null || b.segment.start === selectedAt)
          }
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function Block({
  block,
  hourPx,
  project,
  selected,
  onSelect,
}: {
  block: PlacedBlock;
  hourPx: number;
  project: Project | undefined;
  selected: boolean;
  onSelect: (id: string, at: number) => void;
}) {
  const { session, start, end, col, cols, span, depth } = block;
  const height = (Math.max(end - start, MIN_BLOCK_MS) / HOUR) * hourPx - 2;
  // 最低限の高さ（MIN_BLOCK_MS）でも 1 行は入るよう、短いときは余白を詰める
  const short = height < 34;
  // 上に別のブロックが重なるなら、見出しはそこまでに見えている高さに収める
  const visible =
    block.coveredFrom === null ? height : ((block.coveredFrom - start) / HOUR) * hourPx;
  const lines = Math.max(1, Math.min(3, Math.floor((visible - 8) / 16.5)));
  const label = block.segment.headline;
  const range = `${hhmm(block.dayStart + start)}–${hhmm(block.dayStart + end)}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onSelect(session.id, block.segment.start)}
          aria-pressed={selected}
          aria-label={`${label}（${range}）`}
          className={cn(
            // 地は淡い色、左端だけ濃い色。時刻列のグラデーションより目立たせない
            "absolute flex flex-col gap-0.5 overflow-hidden rounded-r-md rounded-l-[3px] border-l-[3px] pr-1.5 pl-1.5 text-left text-foreground",
            short ? "py-px" : "py-1",
            // 重ねたブロックは地色の縁で下のブロックと分ける
            depth > 0 && "shadow-[0_0_0_1px_var(--card)]",
            "bg-[color-mix(in_srgb,var(--c)_20%,var(--card))] hover:bg-[color-mix(in_srgb,var(--c)_32%,var(--card))]",
            selected && "bg-[color-mix(in_srgb,var(--c)_42%,var(--card))]",
            "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1",
            selected && "outline-2 outline-foreground outline-offset-1",
            block.continuesBefore && "rounded-t-none",
            block.continuesAfter && "rounded-b-none",
          )}
          style={
            {
              top: (start / HOUR) * hourPx + 1,
              height,
              left: `calc(${(col / cols) * 100}% + ${2 + depth * INDENT_PX}px)`,
              width: `calc(${(span / cols) * 100}% - ${4 + depth * INDENT_PX}px)`,
              // 後から始まったものほど上に描く。選択中も、上に重なったブロックは隠さない
              zIndex: 1 + depth * 2 + (selected ? 1 : 0),
              borderLeftColor: "var(--c)",
              "--c": projectColor(project),
            } as React.CSSProperties
          }
        >
          <span
            className={cn(
              "font-medium text-xs",
              short ? "leading-4" : "leading-snug",
              LINE_CLAMP[short ? 1 : lines],
            )}
          >
            {label}
          </span>
          {height >= 52 && visible >= 52 && (
            <span className="font-num text-[11px] text-muted-foreground">{range}</span>
          )}
          {session.active && isLastSegment(block) && (
            <span
              className="absolute right-1.5 bottom-1.5 size-1.5 animate-pulse rounded-full bg-[var(--c)] motion-reduce:animate-none"
              title="作業中"
            />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-72 flex-col items-start gap-0.5">
        <p className="font-medium">{label}</p>
        <p className="opacity-80">
          {project?.name ?? "プロジェクト不明"}
          {session.label ? `（${session.label}）` : ""}
        </p>
        <p className="font-num opacity-80">
          {range}（{durationLabel(block.end - block.start)}）
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

/** セッションの最後の作業ブロック（「作業中」の印はここにだけ付ける）。 */
function isLastSegment(block: PlacedBlock): boolean {
  const last = Math.max(...block.session.segments.map((g) => g.end));
  return block.segment.end >= last && block.dayStart + block.end >= block.segment.end;
}
