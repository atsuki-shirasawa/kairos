import type { CalendarSession, Project } from "@shared/api.ts";
import { ArrowDown, ArrowUp, GitCommitHorizontal, GitPullRequest } from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { projectColor } from "@/lib/colors.ts";
import { DAY, dateLabel, durationLabel, HOUR, hhmm, isSameDay, weekday } from "@/lib/dates.ts";
import type { SegmentMatch } from "@/lib/filter.ts";
import { costLabel, tokensLabel, troubleCount } from "@/lib/format.ts";
import { busyMs, layoutDay, MIN_BLOCK_MS, type PlacedBlock } from "@/lib/layout.ts";
import { selectedSegment } from "@/lib/navigation.ts";
import { reveal } from "@/lib/reveal.ts";
import { counted, totalsOf } from "@/lib/totals.ts";
import { cn } from "@/lib/utils.ts";

/** 1 時間の最小の高さ。これより低いと短いブロックの見出しが読めない。 */
const MIN_HOUR_PX = 48;
/** 開いたときに見せる時間帯（時）。画面の高さにこの範囲が収まるよう 1 時間の高さを決め、中央に置く。 */
const VIEW_START = 8;
const VIEW_END = 20;
const GUTTER = "3.5rem";
const GUTTER_PX = 56;
/**
 * 作業のある日の列がこれより細くなるときは、選んだ日とその前後だけを広げる。
 * ドロワーを開くと週の 7 列が 60px ほどになり、見出しが 2〜5 文字しか読めなくなるため。
 */
const FOCUS_BELOW_PX = 150;
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
  /** 絞り込みの条件に合うか。合わないブロックは、日の流れが分かるよう消さずに薄く描く。 */
  matches: SegmentMatch;
  onSelect: (id: string, at: number) => void;
  onOpenDay: (day: number) => void;
}

/** 画面の外（上下）にあるブロックの案内。 */
interface Edge {
  count: number;
  /** いちばん近いブロックの時刻（表示用）と、そこへ動かすときのスクロール位置。 */
  time: number;
  scrollTo: number;
}

export function CalendarGrid({
  days,
  sessions,
  projects,
  selectedId,
  selectedAt,
  now,
  matches,
  onSelect,
  onOpenDay,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { hourPx, viewportPx, widthPx } = useGridSize(scrollRef);
  const columns = useMemo(() => days.map((day) => layoutDay(sessions, day)), [days, sessions]);
  const firstDay = days[0] ?? 0;

  // 選んだブロックが画面の外なら見える位置まで動かす（リストから切り替えたとき、j / k で移ったときなど）
  const revealSelected = useCallback(() => {
    const el = scrollRef.current?.querySelector("[data-selected]");
    reveal(scrollRef.current, el ?? null);
  }, []);

  // 期間が変わったら、見せる時間帯の真ん中が画面の中央に来るようにスクロールする。
  // 高さが変わったときも合わせ直す（測る前の仮の高さで一度スクロールしてしまうため）
  // biome-ignore lint/correctness/useExhaustiveDependencies: 期間（firstDay）が変わったときにも動かす
  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    const center = ((VIEW_START + VIEW_END) / 2) * hourPx;
    scrollRef.current.scrollTop = Math.max(0, center - viewportPx / 2);
    revealSelected();
  }, [firstDay, hourPx, viewportPx, revealSelected]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 選択が変わったときだけ動かす
  useLayoutEffect(revealSelected, [selectedId, selectedAt, revealSelected]);

  // 見せる時間帯の外（夜遅く・朝早く）の作業は、そのままでは気づけないので上下の端に案内を出す
  const [edges, setEdges] = useState<{ above: Edge | null; below: Edge | null }>({
    above: null,
    below: null,
  });
  const measureEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop;
    const bottom = top + el.clientHeight;
    const y0 = (b: PlacedBlock) => (b.start / HOUR) * hourPx;
    const y1 = (b: PlacedBlock) =>
      y0(b) + (Math.max(b.end - b.start, MIN_BLOCK_MS) / HOUR) * hourPx;
    const all = columns.flat();
    // 日をまたいで比べるので、時刻は日の 0 時からの値で比べる。いちばん画面に近いものへ動かす
    const above = all.filter((b) => y1(b) <= top + 4).sort((a, b) => b.end - a.end);
    const below = all.filter((b) => y0(b) >= bottom - 4).sort((a, b) => a.start - b.start);
    const a = above[0];
    const b = below[0];
    const next = {
      above: a ? { count: above.length, time: a.dayStart + a.end, scrollTo: y0(a) - 24 } : null,
      below: b
        ? { count: below.length, time: b.dayStart + b.start, scrollTo: y0(b) - el.clientHeight / 4 }
        : null,
    };
    setEdges((prev) =>
      sameEdge(prev.above, next.above) && sameEdge(prev.below, next.below) ? prev : next,
    );
  }, [columns, hourPx]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 高さが変わったときも測り直す
  useLayoutEffect(measureEdges, [measureEdges, viewportPx]);

  // 作業のない日（今日より後の日など）は細くし、作業のある日に幅を回す。
  // すべて空なら均等にする（fr の合計が 1 未満だと余白が残るため）
  const anyBusy = columns.some((c) => c.length > 0);
  const busyCount = columns.filter((c) => c.length > 0).length;
  const focusIndex = useMemo(() => {
    const seg = selectedSegment(sessions, selectedId, selectedAt);
    if (!seg || days.length <= 3) return -1;
    const t = Math.max(seg.start, firstDay);
    return days.findIndex((d) => isSameDay(d, t));
  }, [sessions, selectedId, selectedAt, days, firstDay]);
  const narrow = busyCount > 0 && (widthPx - GUTTER_PX) / busyCount < FOCUS_BELOW_PX;
  const tracks = columns.map((c, i) => {
    if (anyBusy && c.length === 0) return "minmax(2.5rem, 0.15fr)";
    if (narrow && focusIndex !== -1 && Math.abs(i - focusIndex) > 1) return "minmax(2.5rem, 0.3fr)";
    return "minmax(0, 1fr)";
  });
  const template = { gridTemplateColumns: `${GUTTER} ${tracks.join(" ")}` };
  // 列の幅が変わるときは動きで見せ、どの日が広がったかを追えるようにする
  const animate = "transition-[grid-template-columns] duration-200 motion-reduce:transition-none";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card">
      <div className={cn("grid border-b", animate)} style={template}>
        <div />
        {days.map((day, i) => (
          <DayHeader
            key={day}
            day={day}
            // 日の合計は、絞り込みに合う作業だけで数える
            blocks={(columns[i] ?? []).filter((b) => matches(b.session, b.segment))}
            today={isSameDay(day, now)}
            onOpen={() => onOpenDay(day)}
          />
        ))}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" onScroll={measureEdges}>
          <div className={cn("grid", animate)} style={{ ...template, height: 24 * hourPx }}>
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
                matches={matches}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
        {edges.above && (
          <EdgeButton
            edge={edges.above}
            where="above"
            onClick={(top) => scrollRef.current?.scrollTo({ top, behavior: "smooth" })}
          />
        )}
        {edges.below && (
          <EdgeButton
            edge={edges.below}
            where="below"
            onClick={(top) => scrollRef.current?.scrollTo({ top, behavior: "smooth" })}
          />
        )}
      </div>
    </div>
  );
}

/**
 * 日の見出し。日付の下に、その日の作業時間と成果だけを 1 行で添える（リストの日の合計の簡略版）。
 * ほかの数字（件数・Claude の稼働・トークン・コスト・つまずき）はツールチップに回し、
 * カレンダーが数字で埋まらないようにする。列が細いとき（ドロワーを開いたときなど）は 1 行目だけにする。
 */
function DayHeader({
  day,
  blocks,
  today,
  onOpen,
}: {
  day: number;
  blocks: PlacedBlock[];
  today: boolean;
  onOpen: () => void;
}) {
  const d = new Date(day);
  const busy = busyMs(blocks);
  const { usage, activity } = totalsOf(blocks);
  const commits = activity?.commits ?? 0;
  const prs = activity?.prs ?? 0;
  const trouble = activity ? troubleCount(activity) : 0;

  const button = (
    <button
      type="button"
      onClick={onOpen}
      className="@container flex min-h-14 min-w-0 flex-col justify-center overflow-hidden border-l px-2.5 py-1 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      aria-label={`${dateLabel(day)}を日表示で開く`}
    >
      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
        {/* 月の初日だけ月を添え、週の途中で月が変わったことが分かるようにする */}
        {d.getDate() === 1 && (
          <span className="font-num text-muted-foreground text-xs">{d.getMonth() + 1}月</span>
        )}
        {/* 今日は数字を藍の丸で囲む（カレンダーアプリで見慣れた印） */}
        <span
          className={cn(
            "font-num font-semibold text-lg leading-7",
            today
              ? "inline-flex size-7 items-center justify-center self-center rounded-full bg-primary text-primary-foreground"
              : "text-foreground",
          )}
        >
          {d.getDate()}
        </span>
        <span className={cn("text-xs", today ? "text-primary" : "text-muted-foreground")}>
          {weekday(day)}
        </span>
      </span>
      {blocks.length > 0 && (
        <span className="@min-[6.5rem]:flex hidden items-center gap-2 whitespace-nowrap font-num text-[11px] text-muted-foreground leading-4">
          <span className="text-foreground/80">{durationLabel(busy)}</span>
          {commits > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <GitCommitHorizontal className="size-3" />
              {commits}
            </span>
          )}
          {prs > 0 && (
            <span className="inline-flex items-center gap-0.5 text-primary">
              <GitPullRequest className="size-3" />
              {prs}
            </span>
          )}
          {/* 日表示のように広いときだけ、件数とコストも並べる */}
          <span className="@min-[20rem]:inline-flex hidden gap-2">
            <span>{blocks.filter(counted).length} 件</span>
            {usage && (
              <span>
                {usage.unpriced ? "~" : ""}
                {costLabel(usage.costUsd)}
              </span>
            )}
          </span>
        </span>
      )}
    </button>
  );
  if (blocks.length === 0) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom" className="flex-col items-start gap-0.5 font-num">
        <p className="font-medium">{dateLabel(day)}</p>
        <p className="opacity-80">
          {blocks.filter(counted).length} 件・作業 {durationLabel(busy)}
          {activity?.claudeMs ? `（Claude 延べ ${durationLabel(activity.claudeMs)}）` : ""}
        </p>
        {usage && (
          <p className="opacity-80">
            {tokensLabel(usage.tokens)} トークン・API 料金換算 {usage.unpriced ? "~" : ""}
            {costLabel(usage.costUsd)}
          </p>
        )}
        {(commits > 0 || prs > 0 || trouble > 0) && (
          <p className="opacity-80">
            コミット {commits}・PR {prs}
            {trouble > 0 && `・つまずき ${trouble}`}
          </p>
        )}
        <p className="opacity-60">クリックで日表示</p>
      </TooltipContent>
    </Tooltip>
  );
}

const sameEdge = (a: Edge | null, b: Edge | null) =>
  a === b || (a !== null && b !== null && a.count === b.count && a.time === b.time);

function EdgeButton({
  edge,
  where,
  onClick,
}: {
  edge: Edge;
  where: "above" | "below";
  onClick: (top: number) => void;
}) {
  const Icon = where === "above" ? ArrowUp : ArrowDown;
  const text =
    where === "above"
      ? `${hhmm(edge.time)} までに ${edge.count} 件`
      : `${hhmm(edge.time)} から ${edge.count} 件`;
  return (
    <button
      type="button"
      onClick={() => onClick(Math.max(0, edge.scrollTo))}
      className={cn(
        "absolute left-1/2 z-20 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border bg-popover px-3 py-1 font-num text-muted-foreground text-xs shadow-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
        where === "above" ? "top-2" : "bottom-2",
      )}
      aria-label={`画面の${where === "above" ? "上" : "下"}にある作業へ移る（${text}）`}
    >
      <Icon className="size-3" />
      {text}
    </button>
  );
}

/**
 * スクロール領域の大きさから 1 時間の高さを決める。見せる時間帯がちょうど収まる高さにし、
 * 低い画面では最小の高さで止める。ウィンドウの大きさが変わったら測り直す。
 * 幅は、ドロワーを開いて列が細くなったかを判断するのに使う。
 */
function useGridSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ hourPx: MIN_HOUR_PX, viewportPx: 0, widthPx: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const viewportPx = el.clientHeight;
      const widthPx = el.clientWidth;
      const hourPx = Math.max(MIN_HOUR_PX, viewportPx / (VIEW_END - VIEW_START));
      setSize((prev) =>
        prev.hourPx === hourPx && prev.viewportPx === viewportPx && prev.widthPx === widthPx
          ? prev
          : { hourPx, viewportPx, widthPx },
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
  matches,
  onSelect,
}: {
  day: number;
  blocks: PlacedBlock[];
  hourPx: number;
  projects: Map<number, Project>;
  selectedId: string | null;
  selectedAt: number | null;
  now: number;
  matches: SegmentMatch;
  onSelect: (id: string, at: number) => void;
}) {
  const today = now >= day && now < day + DAY;
  return (
    <div
      className={cn("relative min-w-0 border-l", today && "bg-primary/[0.04]")}
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
          faded={!matches(b.session, b.segment)}
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
  faded,
  onSelect,
}: {
  block: PlacedBlock;
  hourPx: number;
  project: Project | undefined;
  selected: boolean;
  faded: boolean;
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
  const working = session.active && isLastSegment(block);
  // 要約前のブロックは最初の発言（「ごめん、別セッション宛てでした」など）がそのまま見出しになり、
  // 要約のある作業と並ぶと雑音になる。地と文字を控えめにする。作業中のものは要約を待っているだけなので除く
  const dim = !block.segment.summarized && !working;
  const projectName = project?.name ?? "プロジェクト不明";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onSelect(session.id, block.segment.start)}
          aria-pressed={selected}
          data-selected={selected || undefined}
          aria-label={`${label}、${projectName}、${dateLabel(block.dayStart)} ${range}`}
          className={cn(
            // 地は淡い色、左端だけ濃い色。時刻列のグラデーションより目立たせない
            "absolute flex flex-col gap-0.5 overflow-hidden rounded-r-md rounded-l-[3px] border-l-[3px] pr-1.5 pl-1.5 text-left",
            short ? "py-px" : "py-1",
            // 重ねたブロックは地色の縁で下のブロックと分ける
            depth > 0 && "shadow-[0_0_0_1px_var(--card)]",
            // oklab で混ぜると、紺の地でも色味が灰色に濁りにくい
            dim
              ? "bg-[color-mix(in_oklab,var(--c)_var(--mix-block-dim),var(--card))] text-muted-foreground"
              : "bg-[color-mix(in_oklab,var(--c)_var(--mix-block),var(--card))] text-foreground",
            "hover:bg-[color-mix(in_oklab,var(--c)_var(--mix-block-hover),var(--card))]",
            selected &&
              "bg-[color-mix(in_oklab,var(--c)_var(--mix-block-selected),var(--card))] text-foreground",
            "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1",
            selected && "outline-2 outline-foreground outline-offset-1",
            block.continuesBefore && "rounded-t-none",
            block.continuesAfter && "rounded-b-none",
            // 絞り込みに合わないものは形だけ残す。触れたときと選んだときは元に戻して読めるようにする
            faded &&
              !selected &&
              "opacity-30 transition-opacity hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none",
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
              "text-xs",
              dim && !selected ? "font-normal" : "font-medium",
              short ? "leading-4" : "leading-snug",
              LINE_CLAMP[short ? 1 : lines],
            )}
          >
            {label}
          </span>
          {height >= 52 && visible >= 52 && (
            <span className="font-num text-[11px] text-muted-foreground">{range}</span>
          )}
          {working && (
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
          {projectName}
          {session.label ? `（${session.label}）` : ""}
        </p>
        <p className="font-num opacity-80">
          {range}（{durationLabel(block.end - block.start)}）
        </p>
        {faded && <p className="opacity-60">絞り込みの条件に合いません</p>}
        {dim && <p className="opacity-60">要約前のため、最初の発言を見出しにしています</p>}
      </TooltipContent>
    </Tooltip>
  );
}

/** セッションの最後の作業ブロック（「作業中」の印はここにだけ付ける）。 */
function isLastSegment(block: PlacedBlock): boolean {
  const last = Math.max(...block.session.segments.map((g) => g.end));
  return block.segment.end >= last && block.dayStart + block.end >= block.segment.end;
}
