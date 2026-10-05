// The table's optional number columns: what each shows, totals and sorts by.

import type { ColumnKey } from "@/i18n/messages/list.tsx";
import { durationLabel } from "@/lib/dates.ts";
import { cacheRate, troubleCount } from "@/lib/format.ts";
import { busyMs, type DayBlock } from "@/lib/layout.ts";
import { activityOf, counted, type Totals, usageOf } from "@/lib/totals.ts";
import {
  CacheCell,
  CostCell,
  dash,
  FilesCell,
  ModelCell,
  OutcomesCell,
  TokensCell,
  TroubleCell,
} from "./cells.tsx";

/**
 * Number columns of the table. When narrow (e.g. with the drawer open) the table scrolls sideways.
 * Labels and tooltips come from `listMessages().columns`, looked up by `key` at render time.
 */
export interface Column {
  key: ColumnKey;
  /** Column width (rem). */
  width: number;
  /** Value to sort by. Columns without one are not sortable. */
  sort?: (b: DayBlock) => number;
  cell: (b: DayBlock) => React.ReactNode;
  total: (t: Totals) => React.ReactNode;
  align?: "left";
}

/** Every optional column, in display order. */
export const COLUMNS: Column[] = [
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

/** Column keys in display order. */
export const COLUMN_ORDER: ColumnKey[] = COLUMNS.map((c) => c.key);

/**
 * Columns shown until the user picks others. Looking back is about what was done, so the default
 * stops at duration and results; usage and cost are one click away in the column picker.
 */
export const DEFAULT_COLUMNS: ColumnKey[] = ["duration", "outcomes"];

/** Width of the time column (rem). The work column is pinned right next to it. */
export const TIME_REM = 7;
/** Minimum width kept for the work column (rem). The table scrolls sideways below that. */
export const WORK_MIN_REM = 18;

/**
 * The time and work columns stay pinned left, so the row stays identifiable while scrolling sideways.
 * Pinned cells are painted with the row background (--row) so nothing shows through.
 */
export const STICKY_TIME = "sticky left-0 z-[1] bg-[var(--row)]";
/** See `STICKY_TIME`. The shadow draws the edge the other columns scroll under. */
export const STICKY_WORK = "sticky left-28 z-[1] bg-[var(--row)] shadow-[1px_0_0_var(--border)]";

/** Minimum table width (rem) for the shown columns. */
export function tableMinRem(columns: Column[]): number {
  return TIME_REM + WORK_MIN_REM + columns.reduce((n, c) => n + c.width, 0);
}
