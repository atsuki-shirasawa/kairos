// The date picker's month table: how each day reads, and where the keyboard moves its cursor.
import { addDays, addMonths, isSameDay } from "./dates.ts";

/** Days moved by the arrow keys. PageUp / PageDown move by a month. */
const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/** The day `key` moves the cursor to, or null when the key doesn't move it. */
export function movedCursor(key: string, cursor: number): number | null {
  const step = STEPS[key];
  if (step !== undefined) return addDays(cursor, step);
  if (key === "PageUp") return addMonths(cursor, -1);
  if (key === "PageDown") return addMonths(cursor, 1);
  return null;
}

/** What the month table needs to know to draw its days. */
export interface MonthTableContext {
  /** Any time in the shown month. */
  month: number;
  /** The shown period [from, to), drawn as a band. */
  from: number;
  to: number;
  /** The day the keyboard is on. */
  cursor: number;
  now: number;
  /** Days with work, which get a dot. */
  recorded: ReadonlySet<number>;
}

/** How one day of the month table reads. */
export interface DayCellState {
  /** Inside the shown period, so part of its band. */
  inRange: boolean;
  /** Where the band's rounded ends fall: the period's ends, or the row's. */
  bandStart: boolean;
  bandEnd: boolean;
  /** A day of the previous or next month, padding the first or last week. */
  outside: boolean;
  /** Has work, so it gets a dot. */
  recorded: boolean;
  /** The keyboard's day, the one in the tab order. */
  cursor: boolean;
  today: boolean;
}

/** How `day`, at `column` (0 to 6) of its week row, reads in the month table. */
export function dayCellState(day: number, column: number, c: MonthTableContext): DayCellState {
  const inRange = day >= c.from && day < c.to;
  return {
    inRange,
    // In week view the whole row becomes one band
    bandStart: inRange && (column === 0 || day === c.from),
    bandEnd: inRange && (column === 6 || addDays(day, 1) === c.to),
    outside: new Date(day).getMonth() !== new Date(c.month).getMonth(),
    recorded: c.recorded.has(day),
    cursor: isSameDay(day, c.cursor),
    today: isSameDay(day, c.now),
  };
}
