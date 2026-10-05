// Rows of the table: a day's heading with its totals, and one row per work block.
import type { Project } from "@shared/api.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { listMessages } from "@/i18n/messages/list.tsx";
import { projectColor } from "@/lib/colors.ts";
import { dateLabel, hhmm, relativeDay } from "@/lib/dates.ts";
import type { DayBlock } from "@/lib/layout.ts";
import { isSelected, isWorking } from "@/lib/selection.ts";
import { totalsOf } from "@/lib/totals.ts";
import { cn } from "@/lib/utils.ts";
import { type Column, STICKY_TIME, STICKY_WORK } from "./columns.tsx";

/** A day's heading row: the date (opens the day), how many blocks it had, and its totals. */
export function DayRow({
  day,
  columns,
  blocks,
  today,
  now,
  onOpen,
}: {
  day: number;
  columns: Column[];
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
      {columns.map((c) => (
        <Cell key={c.key} column={c}>
          {blocks.length > 0 && c.total(totals)}
        </Cell>
      ))}
    </tr>
  );
}

/** Stands in for the blocks of a day without any. */
export function NoRecordsRow({ span }: { span: number }) {
  return (
    <tr className="border-b">
      <td colSpan={span} className="px-4 py-2 text-muted-foreground text-xs">
        {/* Pin just the text left so it stays visible while scrolling sideways */}
        <span className="sticky left-4">{listMessages().noRecords}</span>
      </td>
    </tr>
  );
}

/** Props a block row takes from the table, the same for every row. */
export interface RowContext {
  columns: Column[];
  projects: Map<number, Project>;
  selectedId: string | null;
  selectedAt: number | null;
  onSelect: (id: string, at: number) => void;
}

/** One work block: its time, headline and project, then the shown number columns. */
export function Row({
  block,
  projects,
  selectedId,
  selectedAt,
  onSelect,
  columns,
  withDate = false,
}: RowContext & {
  block: DayBlock;
  /** Name the day above the time, for orders where rows of different days mix. */
  withDate?: boolean;
}) {
  const { session, segment } = block;
  const project = session.projectId !== null ? projects.get(session.projectId) : undefined;
  const selected = isSelected(block, selectedId, selectedAt);

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
      <TimeCell block={block} withDate={withDate} />
      <WorkCell block={block} project={project} selected={selected} />
      {columns.map((c) => (
        <Cell key={c.key} column={c}>
          {c.cell(block)}
        </Cell>
      ))}
    </tr>
  );
}

/** The block's time range, noting when it continues across midnight. */
function TimeCell({ block, withDate }: { block: DayBlock; withDate: boolean }) {
  const { dayStart, start, end } = block;
  const m = listMessages();
  return (
    <td className={cn("py-2 pl-4 font-num text-xs leading-5", STICKY_TIME)}>
      {withDate && <span className="block text-muted-foreground">{dateLabel(dayStart)}</span>}
      {hhmm(dayStart + start)}–{hhmm(dayStart + end)}
      {(block.continuesBefore || block.continuesAfter) && (
        <span className="block text-muted-foreground">
          {block.continuesBefore ? m.fromPreviousDay : m.toNextDay}
        </span>
      )}
    </td>
  );
}

/** The block's headline (the row's keyboard target) over its project and session. */
function WorkCell({
  block,
  project,
  selected,
}: {
  block: DayBlock;
  project: Project | undefined;
  selected: boolean;
}) {
  const { session, segment } = block;
  const working = isWorking(block);
  // Before summarizing, the heading is just the first prompt, so tone it down (same as the calendar)
  const dim = !segment.summarized && !working;
  const f = formatMessages();
  return (
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
            {working && (
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
  );
}

/** A number cell, right-aligned unless the column says otherwise. */
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
