import type { Activity, CalendarSession, Project, Usage } from "@shared/api.ts";
import { ArrowDown, ArrowUp, GitCommitHorizontal, GitPullRequest } from "lucide-react";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { ListSort } from "@/hooks/useUrlState.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { type ColumnKey, listMessages } from "@/i18n/messages/list.tsx";
import { projectColor } from "@/lib/colors.ts";
import { dateLabel, durationLabel, hhmm, isSameDay, relativeDay, startOfDay } from "@/lib/dates.ts";
import type { SegmentMatch } from "@/lib/filter.ts";
import {
  cacheRate,
  costLabel,
  modelLabel,
  numberLabel,
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
  /** Start of the selected section. When null, every row of that session shows as selected. */
  selectedAt: number | null;
  now: number;
  /** Whether a row matches the filter. The table is read through totals and sorting, so non-matching rows are left out. */
  matches: SegmentMatch;
  onSelect: (id: string, at: number) => void;
  onOpenDay: (day: number) => void;
  /** Sort order. Kept in the URL so it survives Back and reloads. */
  sort: ListSort;
  onSort: (sort: ListSort) => void;
}

/**
 * Number columns of the table. When narrow (e.g. with the drawer open) the table scrolls sideways.
 * Labels and tooltips come from `listMessages().columns`, looked up by `key` at render time.
 */
interface Column {
  key: ColumnKey;
  /** Column width (rem). */
  width: number;
  /** Value to sort by. Columns without one are not sortable. */
  sort?: (b: DayBlock) => number;
  cell: (b: DayBlock) => React.ReactNode;
  total: (t: Totals) => React.ReactNode;
  align?: "left";
}

const dash = <span className="text-muted-foreground/60">—</span>;

const COLUMNS: Column[] = [
  {
    key: "duration",
    width: 5,
    sort: (b) => b.end - b.start,
    cell: (b) => durationLabel(b.end - b.start),
    total: (t) => durationLabel(busyMs(t.blocks)),
  },
  {
    key: "claude",
    width: 5,
    sort: (b) => activityOf(b)?.claudeMs ?? -1,
    cell: (b) => {
      const ms = activityOf(b)?.claudeMs;
      return ms ? durationLabel(ms) : dash;
    },
    total: (t) => (t.activity?.claudeMs ? durationLabel(t.activity.claudeMs) : dash),
  },
  {
    key: "prompts",
    width: 4.5,
    sort: (b) => (counted(b) ? b.segment.promptCount : -1),
    cell: (b) => (counted(b) ? b.segment.promptCount : ""),
    total: (t) => t.blocks.reduce((n, b) => n + (counted(b) ? b.segment.promptCount : 0), 0),
  },
  {
    key: "tokens",
    width: 4,
    sort: (b) => usageOf(b)?.tokens ?? -1,
    cell: (b) => <TokensCell usage={usageOf(b)} />,
    total: (t) => <TokensCell usage={t.usage} />,
  },
  {
    key: "cost",
    width: 4,
    sort: (b) => usageOf(b)?.costUsd ?? -1,
    cell: (b) => <CostCell usage={usageOf(b)} />,
    total: (t) => <CostCell usage={t.usage} />,
  },
  {
    key: "cache",
    width: 5,
    sort: (b) => {
      const u = usageOf(b);
      return u ? (cacheRate(u) ?? -1) : -1;
    },
    cell: (b) => <CacheCell usage={usageOf(b)} />,
    total: (t) => <CacheCell usage={t.usage} />,
  },
  {
    key: "outcomes",
    width: 5,
    sort: (b) => {
      const a = activityOf(b);
      return a ? a.prs * 1000 + a.commits : -1;
    },
    cell: (b) => <OutcomesCell activity={activityOf(b)} />,
    total: (t) => <OutcomesCell activity={t.activity} />,
  },
  {
    key: "files",
    width: 3.5,
    sort: (b) => activityOf(b)?.filesEdited ?? -1,
    cell: (b) => <FilesCell activity={activityOf(b)} />,
    // The same file may be edited on several days, so the total is a running count
    total: (t) => <FilesCell activity={t.activity} />,
  },
  {
    key: "trouble",
    width: 4.5,
    sort: (b) => {
      const a = activityOf(b);
      return a ? troubleCount(a) : -1;
    },
    cell: (b) => <TroubleCell activity={activityOf(b)} />,
    total: (t) => <TroubleCell activity={t.activity} />,
  },
  {
    key: "model",
    width: 6,
    align: "left",
    cell: (b) => <ModelCell usage={usageOf(b)} activity={activityOf(b)} />,
    total: () => null,
  },
];

type SortKey = "start" | string;

/** Width of the time column (rem). The work column is pinned right next to it. */
const TIME_REM = 7;
/** Minimum width kept for the work column (rem). The table scrolls sideways below that. */
const WORK_MIN_REM = 18;
const TABLE_MIN_REM = TIME_REM + WORK_MIN_REM + COLUMNS.reduce((n, c) => n + c.width, 0);

/**
 * The time and work columns stay pinned left, so the row stays identifiable while scrolling sideways.
 * Pinned cells are painted with the row background (--row) so nothing shows through.
 */
const STICKY_TIME = "sticky left-0 z-[1] bg-[var(--row)]";
const STICKY_WORK = "sticky left-28 z-[1] bg-[var(--row)] shadow-[1px_0_0_var(--border)]";

/**
 * Work blocks of the period as a table. Sorted by time, they are grouped by day with daily totals;
 * sorted by another column, the whole period is one table (to find which work was heaviest).
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
        // Empty days after today have nothing to read. Empty past days stay, as days off
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

  // Moving to another period starts from the top
  // biome-ignore lint/correctness/useExhaustiveDependencies: run only when the period (firstDay) changes
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [firstDay]);

  // Scroll the selected row into view if it's off screen (after switching from the calendar, moving with j / k, etc.).
  // After a period change too, look for it once scrolled back to the top
  // biome-ignore lint/correctness/useExhaustiveDependencies: run only when the selection or period changes
  useLayoutEffect(() => {
    const el = scrollRef.current?.querySelector("tr[data-selected]") ?? null;
    reveal(scrollRef.current, el, theadRef.current?.offsetHeight ?? 0);
  }, [selectedId, selectedAt, firstDay]);

  // With no records at all, skip the empty table and show only the notice (EmptyNotice in App)
  if (all.length === 0) return <div className="min-h-0 flex-1 bg-card" />;

  const onSort = (key: SortKey) =>
    setSort(
      key === "start"
        ? { key, desc: false }
        : // Number columns start largest first. Clicking the same column again reverses it
          { key, desc: sort.key === key ? !sort.desc : true },
    );
  const rowProps = { projects, selectedId, selectedAt, onSelect };
  const span = COLUMNS.length + 2;
  const m = listMessages();

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
              label={m.time}
              sortKey="start"
              sort={sort}
              onSort={onSort}
              align="left"
              className={STICKY_TIME}
            />
            <th className={cn("px-2 py-2 text-left font-normal", STICKY_WORK)}>{m.work}</th>
            {COLUMNS.map((c) => {
              const { label, title } = m.columns[c.key];
              return c.sort ? (
                <SortHeader
                  key={c.key}
                  label={label}
                  sortKey={c.key}
                  sort={sort}
                  onSort={onSort}
                  title={title}
                />
              ) : (
                <th key={c.key} className="px-2 py-2 text-left font-normal">
                  <Hint text={title}>{label}</Hint>
                </th>
              );
            })}
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
                    {/* Pin just the text left so it stays visible while scrolling sideways */}
                    <span className="sticky left-4">{m.noRecords}</span>
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
          aria-label={listMessages().sortBy(label)}
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

/** Totals for the whole period, as one line above the table. */
function PeriodSummary({ blocks, days }: { blocks: DayBlock[]; days: number }) {
  const { usage, activity } = totalsOf(blocks);
  const m = listMessages();
  // Blocks are clipped per day, so remove overlaps per day before adding up
  const byDay = Map.groupBy(blocks, (b) => b.dayStart);
  const busy = [...byDay.values()].reduce((sum, list) => sum + busyMs(list), 0);
  return (
    <p className="sticky left-0 flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 pt-3 pb-2 text-muted-foreground text-xs">
      <span>
        {m.period(
          days === 1,
          blocks.length,
          <Strong>{blocks.length}</Strong>,
          <Strong>{durationLabel(busy)}</Strong>,
        )}
        {activity?.claudeMs ? (
          <Hint text={m.claudeTotalNote}>
            {m.claudeTotal(<Strong>{durationLabel(activity.claudeMs)}</Strong>)}
          </Hint>
        ) : null}
      </span>
      {usage && (
        <Hint text={m.costNote}>
          {m.tokensCost(
            <Strong>{tokensLabel(usage.tokens)}</Strong>,
            <Strong>
              {usage.unpriced ? "~" : ""}
              {costLabel(usage.costUsd)}
            </Strong>,
          )}
        </Hint>
      )}
      {activity && (activity.commits > 0 || activity.prs > 0) && (
        <span>
          {m.commitsPrs(<Strong>{activity.commits}</Strong>, <Strong>{activity.prs}</Strong>)}
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
          title={listMessages().showDay}
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
          <span className="ml-2 font-num text-muted-foreground">
            {formatMessages().blocks(blocks.length)}
          </span>
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
  // Before summarizing, the heading is just the first prompt, so tone it down (same as the calendar)
  const dim = !segment.summarized && !(session.active && isLast);
  const m = listMessages();
  const f = formatMessages();

  return (
    <tr
      // Clicking anywhere on the row opens it. Keyboard users open it from the heading button, whose click bubbles here
      onClick={() => onSelect(session.id, segment.start)}
      data-selected={selected || undefined}
      // The background lives in --row so pinned cells match it (including hover and selection colors)
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
            {block.continuesBefore ? m.fromPreviousDay : m.toNextDay}
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
                  title={f.working}
                />
              )}
            </button>
            <span className="truncate text-muted-foreground text-xs">
              {project?.name ?? f.unknownProject}
              {session.label ? f.sessionLabel(session.label) : ""}
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
  const detail = listMessages().tokensDetail(
    numberLabel(u.input),
    numberLabel(u.output),
    numberLabel(u.cacheRead),
    numberLabel(u.cacheWrite),
  );
  return <Hint text={detail}>{tokensLabel(u.tokens)}</Hint>;
}

function CostCell({ usage: u }: { usage: Usage | null }) {
  if (!u) return dash;
  const m = listMessages();
  return (
    <Hint text={u.unpriced ? m.costNoteUnpriced : m.costNote}>
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
      text={formatMessages().commitsPrs(a.commits, a.prs)}
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
  return <Hint text={listMessages().filesDetail(a.toolCalls, a.subagents)}>{a.filesEdited}</Hint>;
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
