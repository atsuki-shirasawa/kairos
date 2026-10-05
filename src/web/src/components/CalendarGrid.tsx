import type { CalendarSession, Project } from "@shared/api.ts";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { projectColor } from "@/lib/colors.ts";
import { DAY, durationLabel, HOUR, hhmm, isSameDay, weekday } from "@/lib/dates.ts";
import { layoutDay, MIN_BLOCK_MS, type PlacedBlock } from "@/lib/layout.ts";
import { cn } from "@/lib/utils.ts";

const HOUR_PX = 48;
const GUTTER = "3.5rem";

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
  const columns = useMemo(() => days.map((day) => layoutDay(sessions, day)), [days, sessions]);
  const firstDay = days[0] ?? 0;

  // 期間が変わったら、最初の作業の少し前までスクロールする（なければ 8 時）
  const earliest = Math.min(...columns.flat().map((b) => b.start), 8 * HOUR);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 期間（firstDay）が変わったときだけ動かす
  useLayoutEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = Math.max(0, (earliest / HOUR - 0.75) * HOUR_PX);
  }, [firstDay]);

  const template = { gridTemplateColumns: `${GUTTER} repeat(${days.length}, minmax(0, 1fr))` };

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
              className="flex items-baseline gap-1.5 border-l px-3 py-2 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
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
        <div className="grid" style={{ ...template, height: 24 * HOUR_PX }}>
          <div className="relative" style={{ background: SKY }} aria-hidden>
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <span
                key={h}
                className={cn(
                  "absolute right-2 -translate-y-1/2 font-num text-[11px]",
                  isNightHour(h) ? "text-white/80" : "text-foreground/60",
                )}
                style={{ top: h * HOUR_PX }}
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

function DayColumn({
  day,
  blocks,
  projects,
  selectedId,
  selectedAt,
  now,
  onSelect,
}: {
  day: number;
  blocks: PlacedBlock[];
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
        backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${HOUR_PX}px)`,
      }}
    >
      {blocks.map((b) => (
        <Block
          key={`${b.session.id}-${b.start}`}
          block={b}
          project={b.session.projectId !== null ? projects.get(b.session.projectId) : undefined}
          selected={
            b.session.id === selectedId && (selectedAt === null || b.segment.start === selectedAt)
          }
          onSelect={onSelect}
        />
      ))}
      {today && (
        <div
          className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-primary"
          style={{ top: ((now - day) / HOUR) * HOUR_PX }}
          aria-hidden
        >
          <span className="absolute -top-[3px] -left-1 size-2 rounded-full bg-primary" />
        </div>
      )}
    </div>
  );
}

function Block({
  block,
  project,
  selected,
  onSelect,
}: {
  block: PlacedBlock;
  project: Project | undefined;
  selected: boolean;
  onSelect: (id: string, at: number) => void;
}) {
  const { session, start, end, col, cols } = block;
  const height = (Math.max(end - start, MIN_BLOCK_MS) / HOUR) * HOUR_PX - 2;
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
            "absolute flex flex-col gap-0.5 overflow-hidden rounded-r-md rounded-l-[3px] border-l-[3px] py-1 pr-1.5 pl-1.5 text-left text-foreground",
            "bg-[color-mix(in_srgb,var(--c)_20%,var(--card))] hover:bg-[color-mix(in_srgb,var(--c)_32%,var(--card))]",
            selected && "bg-[color-mix(in_srgb,var(--c)_42%,var(--card))]",
            "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1",
            selected && "z-20 outline-2 outline-foreground outline-offset-1",
            block.continuesBefore && "rounded-t-none",
            block.continuesAfter && "rounded-b-none",
          )}
          style={
            {
              top: (start / HOUR) * HOUR_PX + 1,
              height,
              left: `calc(${(col / cols) * 100}% + 2px)`,
              width: `calc(${100 / cols}% - 4px)`,
              borderLeftColor: "var(--c)",
              "--c": projectColor(project),
            } as React.CSSProperties
          }
        >
          {height >= 18 && (
            <span
              className={cn(
                "font-medium text-xs leading-snug",
                height < 34 ? "line-clamp-1" : "line-clamp-3",
              )}
            >
              {label}
            </span>
          )}
          {height >= 52 && (
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
      <TooltipContent side="right" className="max-w-72">
        <p className="font-medium">{label}</p>
        <p className="mt-0.5 opacity-80">
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
