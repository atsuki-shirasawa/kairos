import type { Activity, CalendarSession, Project, Usage } from "@shared/api.ts";
import { ArrowDown, ArrowUp, GitCommitHorizontal, GitPullRequest } from "lucide-react";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { ListSort } from "@/hooks/useUrlState.ts";
import { projectColor } from "@/lib/colors.ts";
import { dateLabel, durationLabel, hhmm, isSameDay, relativeDay, startOfDay } from "@/lib/dates.ts";
import type { SegmentMatch } from "@/lib/filter.ts";
import {
  cacheRate,
  costLabel,
  modelLabel,
  tokensLabel,
  troubleCount,
  troubleDetail,
} from "@/lib/format.ts";
import { blocksOfDay, busyMs, type DayBlock } from "@/lib/layout.ts";
import { reveal } from "@/lib/reveal.ts";
import { activityOf, counted, type Totals, totalsOf, usageOf } from "@/lib/totals.ts";
import { cn } from "@/lib/utils.ts";
import { Hint } from "./Hint.tsx";

interface Props {
  days: number[];
  sessions: CalendarSession[];
  projects: Map<number, Project>;
  selectedId: string | null;
  /** 選んだセクションの開始時刻。null ならそのセッションの行をすべて選択表示にする。 */
  selectedAt: number | null;
  now: number;
  /** 絞り込みの条件に合うか。表は合計と並べ替えで読むので、合わない行は出さない。 */
  matches: SegmentMatch;
  onSelect: (id: string, at: number) => void;
  onOpenDay: (day: number) => void;
  /** 並べ替え。URL に保存し、戻るボタンやリロードでも保つ。 */
  sort: ListSort;
  onSort: (sort: ListSort) => void;
}

const COST_NOTE = "API の料金表で換算した目安（サブスクリプションでの支払いとは一致しない）";

/** 表の数の列。狭いとき（ドロワーを開いたときなど）は横にスクロールする。 */
interface Column {
  key: string;
  label: string;
  /** 列の幅（rem）。 */
  width: number;
  title?: string;
  /** 並べ替えに使う値。ないものは並べ替えない。 */
  sort?: (b: DayBlock) => number;
  cell: (b: DayBlock) => React.ReactNode;
  total: (t: Totals) => React.ReactNode;
  align?: "left";
}

const dash = <span className="text-muted-foreground/60">—</span>;

const COLUMNS: Column[] = [
  {
    key: "duration",
    label: "長さ",
    width: 5,
    sort: (b) => b.end - b.start,
    cell: (b) => durationLabel(b.end - b.start),
    total: (t) => durationLabel(busyMs(t.blocks)),
  },
  {
    key: "claude",
    label: "Claude",
    width: 5,
    title:
      "Claude がターンを進めていた時間（考える・ツールを動かす）。残りは人が読む・考える時間。日の合計は並行したセッションの分も足した延べ",
    sort: (b) => activityOf(b)?.claudeMs ?? -1,
    cell: (b) => {
      const ms = activityOf(b)?.claudeMs;
      return ms ? durationLabel(ms) : dash;
    },
    total: (t) => (t.activity?.claudeMs ? durationLabel(t.activity.claudeMs) : dash),
  },
  {
    key: "prompts",
    label: "発言",
    width: 3,
    sort: (b) => (counted(b) ? b.segment.promptCount : -1),
    cell: (b) => (counted(b) ? b.segment.promptCount : ""),
    total: (t) => t.blocks.reduce((n, b) => n + (counted(b) ? b.segment.promptCount : 0), 0),
  },
  {
    key: "tokens",
    label: "トークン",
    width: 4,
    sort: (b) => usageOf(b)?.tokens ?? -1,
    cell: (b) => <TokensCell usage={usageOf(b)} />,
    total: (t) => <TokensCell usage={t.usage} />,
  },
  {
    key: "cost",
    label: "コスト",
    width: 4,
    title: COST_NOTE,
    sort: (b) => usageOf(b)?.costUsd ?? -1,
    cell: (b) => <CostCell usage={usageOf(b)} />,
    total: (t) => <CostCell usage={t.usage} />,
  },
  {
    key: "cache",
    label: "キャッシュ",
    width: 5,
    title: "入力のうちキャッシュから読んだ割合",
    sort: (b) => {
      const u = usageOf(b);
      return u ? (cacheRate(u) ?? -1) : -1;
    },
    cell: (b) => <CacheCell usage={usageOf(b)} />,
    total: (t) => <CacheCell usage={t.usage} />,
  },
  {
    key: "outcomes",
    label: "成果",
    width: 5,
    title: "コミットと PR の数",
    sort: (b) => {
      const a = activityOf(b);
      return a ? a.prs * 1000 + a.commits : -1;
    },
    cell: (b) => <OutcomesCell activity={activityOf(b)} />,
    total: (t) => <OutcomesCell activity={t.activity} />,
  },
  {
    key: "files",
    label: "編集",
    width: 3.5,
    title: "書き換えたファイルの数",
    sort: (b) => activityOf(b)?.filesEdited ?? -1,
    cell: (b) => <FilesCell activity={activityOf(b)} />,
    // 日をまたいで同じファイルを触ることもあるので、合計は「延べ」になる
    total: (t) => <FilesCell activity={t.activity} />,
  },
  {
    key: "trouble",
    label: "つまずき",
    width: 4.5,
    title: "ツールのエラー・中断・API のエラーの合計",
    sort: (b) => {
      const a = activityOf(b);
      return a ? troubleCount(a) : -1;
    },
    cell: (b) => <TroubleCell activity={activityOf(b)} />,
    total: (t) => <TroubleCell activity={t.activity} />,
  },
  {
    key: "model",
    label: "モデル",
    width: 6,
    align: "left",
    cell: (b) => <ModelCell usage={usageOf(b)} activity={activityOf(b)} />,
    total: () => null,
  },
];

type SortKey = "start" | string;

/** 時刻の列の幅（rem）。作業の列はこの右に固定する。 */
const TIME_REM = 7;
/** 作業の列に最低限残す幅（rem）。表全体がこれより狭くなるときは横にスクロールする。 */
const WORK_MIN_REM = 18;
const TABLE_MIN_REM = TIME_REM + WORK_MIN_REM + COLUMNS.reduce((n, c) => n + c.width, 0);

/**
 * 時刻と作業の列は左に固定し、横にスクロールしてもどの行か分かるようにする。
 * 固定した列は下が透けないよう、行の地色（--row）で塗る。
 */
const STICKY_TIME = "sticky left-0 z-[1] bg-[var(--row)]";
const STICKY_WORK = "sticky left-28 z-[1] bg-[var(--row)] shadow-[1px_0_0_var(--border)]";

/**
 * 期間の作業ブロックを表で並べる。時刻順のときは日ごとにまとめて日の合計を出し、
 * ほかの列で並べ替えたときは期間全体を 1 つの表にする（どの作業が重かったかを探すため）。
 */
export function SessionList({
  days,
  sessions,
  projects,
  selectedId,
  selectedAt,
  now,
  matches,
  onSelect,
  onOpenDay,
  sort,
  onSort: setSort,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const groups = useMemo(
    () =>
      days
        .map((day) => ({
          day,
          blocks: blocksOfDay(sessions, day).filter((b) => matches(b.session, b.segment)),
        }))
        // 今日より後の空の日は並べても読むものがない。過去の空の日は、休んだ日として残す
        .filter((g) => g.blocks.length > 0 || startOfDay(now) >= g.day),
    [days, sessions, now, matches],
  );
  const all = useMemo(() => groups.flatMap((g) => g.blocks), [groups]);
  const sorted = useMemo(() => {
    const value = COLUMNS.find((c) => c.key === sort.key)?.sort;
    if (!value) return all;
    return [...all].sort((a, b) => (value(a) - value(b)) * (sort.desc ? -1 : 1));
  }, [all, sort]);
  const firstDay = days[0] ?? 0;

  // 期間を移ったら先頭から見せる
  // biome-ignore lint/correctness/useExhaustiveDependencies: 期間（firstDay）が変わったときだけ動かす
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [firstDay]);

  // 選んだ行が画面の外なら見える位置まで動かす（カレンダーから切り替えたとき、j / k で移ったときなど）。
  // 期間を移ったときも、先頭へ戻した後で選んだ行を探す
  // biome-ignore lint/correctness/useExhaustiveDependencies: 選択と期間が変わったときだけ動かす
  useLayoutEffect(() => {
    const el = scrollRef.current?.querySelector("tr[data-selected]") ?? null;
    reveal(scrollRef.current, el, theadRef.current?.offsetHeight ?? 0);
  }, [selectedId, selectedAt, firstDay]);

  // 記録がまったくないときは、空の表を出さず案内（App の EmptyNotice）だけを見せる
  if (all.length === 0) return <div className="min-h-0 flex-1 bg-card" />;

  const onSort = (key: SortKey) =>
    setSort(
      key === "start"
        ? { key, desc: false }
        : // 数の列は大きい順から。同じ列をもう一度押すと逆にする
          { key, desc: sort.key === key ? !sort.desc : true },
    );
  const rowProps = { projects, selectedId, selectedAt, onSelect };
  const span = COLUMNS.length + 2;

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-card">
      <PeriodSummary blocks={all} days={days.length} />
      <table
        className="w-full table-fixed border-collapse text-sm"
        style={{ minWidth: `${TABLE_MIN_REM}rem` }}
      >
        <colgroup>
          <col style={{ width: `${TIME_REM}rem` }} />
          <col />
          {COLUMNS.map((c) => (
            <col key={c.key} style={{ width: `${c.width}rem` }} />
          ))}
        </colgroup>
        <thead ref={theadRef} className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]">
          <tr className="text-muted-foreground text-xs [--row:var(--card)]">
            <SortHeader
              label="時刻"
              sortKey="start"
              sort={sort}
              onSort={onSort}
              align="left"
              className={STICKY_TIME}
            />
            <th className={cn("px-2 py-2 text-left font-normal", STICKY_WORK)}>作業</th>
            {COLUMNS.map((c) =>
              c.sort ? (
                <SortHeader
                  key={c.key}
                  label={c.label}
                  sortKey={c.key}
                  sort={sort}
                  onSort={onSort}
                  title={c.title}
                />
              ) : (
                <th key={c.key} className="px-2 py-2 text-left font-normal">
                  <Hint text={c.title}>{c.label}</Hint>
                </th>
              ),
            )}
          </tr>
        </thead>
        {sort.key === "start" ? (
          groups.map(({ day, blocks }) => (
            <tbody key={day}>
              <DayRow
                day={day}
                blocks={blocks}
                today={isSameDay(day, now)}
                now={now}
                onOpen={() => onOpenDay(day)}
              />
              {blocks.length === 0 ? (
                <tr className="border-b">
                  <td colSpan={span} className="px-4 py-2 text-muted-foreground text-xs">
                    {/* 横にスクロールしても見えるよう、文言だけ左に固定する */}
                    <span className="sticky left-4">記録なし</span>
                  </td>
                </tr>
              ) : (
                blocks.map((b) => (
                  <Row key={`${b.session.id}-${b.segment.start}`} block={b} {...rowProps} />
                ))
              )}
            </tbody>
          ))
        ) : (
          <tbody>
            {sorted.map((b) => (
              <Row
                key={`${b.session.id}-${b.segment.start}-${b.dayStart}`}
                block={b}
                withDate
                {...rowProps}
              />
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "right",
  className,
  title,
}: {
  label: string;
  sortKey: SortKey;
  sort: ListSort;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
  className?: string | undefined;
  title?: string | undefined;
}) {
  const active = sort.key === sortKey;
  const Arrow = sort.desc ? ArrowDown : ArrowUp;
  return (
    <th
      className={cn("p-0 font-normal", className)}
      aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}
    >
      <Hint text={title} className="block">
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          aria-label={`${label}で並べ替え`}
          className={cn(
            "flex w-full items-center gap-0.5 whitespace-nowrap px-2 py-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
            align === "right" ? "justify-end" : "justify-start pl-4",
            active && "font-medium text-foreground",
          )}
        >
          {label}
          {active && sortKey !== "start" && <Arrow className="size-3" />}
        </button>
      </Hint>
    </th>
  );
}

/** 期間全体の合計。表の上に 1 行で出す。 */
function PeriodSummary({ blocks, days }: { blocks: DayBlock[]; days: number }) {
  const { usage, activity } = totalsOf(blocks);
  // 日ごとに切ったブロックなので、日ごとに重なりを除いて足す
  const byDay = Map.groupBy(blocks, (b) => b.dayStart);
  const busy = [...byDay.values()].reduce((sum, list) => sum + busyMs(list), 0);
  return (
    <p className="sticky left-0 flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 pt-3 pb-2 text-muted-foreground text-xs">
      <span>
        {days === 1 ? "この日" : "この週"}: <Strong>{blocks.length}</Strong> 件・作業{" "}
        <Strong>{durationLabel(busy)}</Strong>
        {activity?.claudeMs ? (
          <>
            （
            <Hint text="並行して進めたセッションの分も足すので、作業時間より長くなることがある">
              Claude 延べ <Strong>{durationLabel(activity.claudeMs)}</Strong>
            </Hint>
            ）
          </>
        ) : null}
      </span>
      {usage && (
        <Hint text={COST_NOTE}>
          <Strong>{tokensLabel(usage.tokens)}</Strong> トークン・API 料金換算{" "}
          <Strong>
            {usage.unpriced ? "~" : ""}
            {costLabel(usage.costUsd)}
          </Strong>
        </Hint>
      )}
      {activity && (activity.commits > 0 || activity.prs > 0) && (
        <span>
          コミット <Strong>{activity.commits}</Strong>・PR <Strong>{activity.prs}</Strong>
        </span>
      )}
    </p>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-medium font-num text-foreground">{children}</span>;
}

function DayRow({
  day,
  blocks,
  today,
  now,
  onOpen,
}: {
  day: number;
  blocks: DayBlock[];
  today: boolean;
  now: number;
  onOpen: () => void;
}) {
  const totals = totalsOf(blocks);
  return (
    <tr className="border-b bg-[var(--row)] text-xs [--row:color-mix(in_srgb,var(--muted)_40%,var(--card))]">
      <th
        colSpan={2}
        scope="rowgroup"
        className={cn(
          "py-1.5 pl-4 text-left font-normal",
          STICKY_TIME,
          "shadow-[1px_0_0_var(--border)]",
        )}
      >
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "rounded-sm font-medium text-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring",
            today ? "text-primary" : "text-foreground",
          )}
          title="この日を表示"
        >
          <span className="font-num">{dateLabel(day)}</span>
        </button>
        {relativeDay(day, now) && (
          <span
            className={cn(
              "ml-2 rounded-full px-1.5 text-[11px] leading-4",
              today ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {relativeDay(day, now)}
          </span>
        )}
        {blocks.length > 0 && (
          <span className="ml-2 font-num text-muted-foreground">{blocks.length} 件</span>
        )}
      </th>
      {COLUMNS.map((c) => (
        <Cell key={c.key} column={c}>
          {blocks.length > 0 && c.total(totals)}
        </Cell>
      ))}
    </tr>
  );
}

function Row({
  block,
  projects,
  selectedId,
  selectedAt,
  onSelect,
  withDate = false,
}: {
  block: DayBlock;
  projects: Map<number, Project>;
  selectedId: string | null;
  selectedAt: number | null;
  onSelect: (id: string, at: number) => void;
  withDate?: boolean;
}) {
  const { session, segment, dayStart, start, end } = block;
  const project = session.projectId !== null ? projects.get(session.projectId) : undefined;
  const selected =
    session.id === selectedId && (selectedAt === null || segment.start === selectedAt);
  const isLast = segment.end >= Math.max(...session.segments.map((g) => g.end));
  // 要約前の見出しは最初の発言そのままなので控えめにする（カレンダーと同じ扱い）
  const dim = !segment.summarized && !(session.active && isLast);

  return (
    <tr
      // 行のどこを押しても開く。キーボードでは見出しのボタンから開け、そのクリックもここに届く
      onClick={() => onSelect(session.id, segment.start)}
      data-selected={selected || undefined}
      // 地色は --row で持ち、固定した列も同じ色で塗る（ホバー・選択の色も揃う）
      className={cn(
        "cursor-pointer border-b bg-[var(--row)] align-top",
        selected
          ? "[--row:color-mix(in_srgb,var(--c)_20%,var(--card))]"
          : "[--row:var(--card)] hover:[--row:color-mix(in_srgb,var(--c)_10%,var(--card))]",
      )}
      style={{ "--c": projectColor(project) } as React.CSSProperties}
    >
      <td className={cn("py-2 pl-4 font-num text-xs leading-5", STICKY_TIME)}>
        {withDate && <span className="block text-muted-foreground">{dateLabel(dayStart)}</span>}
        {hhmm(dayStart + start)}–{hhmm(dayStart + end)}
        {(block.continuesBefore || block.continuesAfter) && (
          <span className="block text-muted-foreground">
            {block.continuesBefore ? "前日から" : "翌日へ"}
          </span>
        )}
      </td>
      <td className={cn("min-w-0 py-2 pr-2 pl-2", STICKY_WORK)}>
        <div className="flex min-w-0 gap-2.5">
          <span className="w-[3px] shrink-0 self-stretch rounded-full bg-[var(--c)]" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <button
              type="button"
              aria-pressed={selected}
              className={cn(
                "rounded-sm text-left leading-snug focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                dim ? "font-normal text-muted-foreground" : "font-medium",
              )}
            >
              {segment.headline}
              {session.active && isLast && (
                <span
                  className="ml-1.5 inline-block size-1.5 animate-pulse rounded-full bg-[var(--c)] align-middle motion-reduce:animate-none"
                  title="作業中"
                />
              )}
            </button>
            <span className="truncate text-muted-foreground text-xs">
              {project?.name ?? "プロジェクト不明"}
              {session.label ? `（${session.label}）` : ""}
              {session.title !== segment.headline && ` · ${session.title}`}
            </span>
          </div>
        </div>
      </td>
      {COLUMNS.map((c) => (
        <Cell key={c.key} column={c}>
          {c.cell(block)}
        </Cell>
      ))}
    </tr>
  );
}

function Cell({ column: c, children }: { column: Column; children: React.ReactNode }) {
  return (
    <td
      className={cn(
        "px-2 py-2 font-num text-xs tabular-nums leading-5",
        c.align === "left" ? "text-left" : "whitespace-nowrap text-right",
      )}
    >
      {children}
    </td>
  );
}

function TokensCell({ usage: u }: { usage: Usage | null }) {
  if (!u) return dash;
  const detail = [
    `入力 ${u.input.toLocaleString()}`,
    `出力 ${u.output.toLocaleString()}`,
    `キャッシュ読み込み ${u.cacheRead.toLocaleString()}`,
    `キャッシュ書き込み ${u.cacheWrite.toLocaleString()}`,
  ].join(" / ");
  return <Hint text={detail}>{tokensLabel(u.tokens)}</Hint>;
}

function CostCell({ usage: u }: { usage: Usage | null }) {
  if (!u) return dash;
  return (
    <Hint text={u.unpriced ? `${COST_NOTE}。料金の分からないモデルの分を含まない` : COST_NOTE}>
      {u.unpriced ? "~" : ""}
      {costLabel(u.costUsd)}
    </Hint>
  );
}

function CacheCell({ usage: u }: { usage: Usage | null }) {
  const rate = u ? cacheRate(u) : null;
  return rate === null ? dash : `${Math.round(rate * 100)}%`;
}

function OutcomesCell({ activity: a }: { activity: Activity | null }) {
  if (!a || (a.commits === 0 && a.prs === 0)) return null;
  return (
    <Hint
      className="inline-flex items-center justify-end gap-2"
      text={`コミット ${a.commits}・PR ${a.prs}`}
    >
      {a.commits > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <GitCommitHorizontal className="size-3.5 text-muted-foreground" />
          {a.commits}
        </span>
      )}
      {a.prs > 0 && (
        <span className="inline-flex items-center gap-0.5 text-primary">
          <GitPullRequest className="size-3.5" />
          {a.prs}
        </span>
      )}
    </Hint>
  );
}

function FilesCell({ activity: a }: { activity: Activity | null }) {
  if (!a || a.filesEdited === 0) return null;
  return (
    <Hint text={`ツール呼び出し ${a.toolCalls} 回・サブエージェント ${a.subagents}`}>
      {a.filesEdited}
    </Hint>
  );
}

function TroubleCell({ activity: a }: { activity: Activity | null }) {
  const n = a ? troubleCount(a) : 0;
  if (!a || n === 0) return null;
  return (
    <Hint className="text-warn" text={troubleDetail(a)}>
      {n}
    </Hint>
  );
}

function ModelCell({ usage, activity }: { usage: Usage | null; activity: Activity | null }) {
  if (!usage?.model) return null;
  return (
    <span className="block text-muted-foreground">
      {modelLabel(usage.model)}
      {activity?.effort && <span className="block text-[11px]">{activity.effort}</span>}
    </span>
  );
}
