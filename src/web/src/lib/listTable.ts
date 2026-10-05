// The summary's table (session list): which blocks it shows, how it sorts them, and which optional
// columns it keeps. Pure, so the rules can be tested without rendering the table.
import type { CalendarSession } from "@shared/api.ts";
import { startOfDay } from "./dates.ts";
import type { SegmentMatch } from "./filter.ts";
import { blocksOfDay, type DayBlock } from "./layout.ts";

/**
 * A sort order: `start` is time order, other keys are column keys. Same shape as the URL state's
 * `ListSort`, declared here so this module stays free of the browser-only hooks.
 */
export interface ListSort {
  key: string;
  desc: boolean;
}

/** One day of the table: its blocks that pass the filter, in time order. */
export interface DayGroup {
  day: number;
  blocks: DayBlock[];
}

/**
 * The period's matching blocks per day. Empty days after today have nothing to read, so they are
 * dropped; empty past days stay, as days off.
 */
export function dayGroups(
  days: number[],
  sessions: CalendarSession[],
  matches: SegmentMatch,
  now: number,
): DayGroup[] {
  return days
    .map((day) => ({
      day,
      blocks: blocksOfDay(sessions, day).filter((b) => matches(b.session, b.segment)),
    }))
    .filter((g) => g.blocks.length > 0 || startOfDay(now) >= g.day);
}

/** `blocks` ordered by `value`, or left in time order when the column has no value to sort by. */
export function sortBlocks(
  blocks: DayBlock[],
  value: ((b: DayBlock) => number) | undefined,
  desc: boolean,
): DayBlock[] {
  if (!value) return blocks;
  return [...blocks].sort((a, b) => (value(a) - value(b)) * (desc ? -1 : 1));
}

/**
 * The sort after clicking `key`'s header. Time always runs oldest first; number columns start
 * largest first, and clicking the same column again reverses it.
 */
export function nextSort(current: ListSort, key: string): ListSort {
  return key === "start"
    ? { key, desc: false }
    : { key, desc: current.key === key ? !current.desc : true };
}

/**
 * `requested`, unless it sorts by a column that was since hidden: that would order rows by
 * something invisible, so `fallback` applies instead.
 */
export function visibleSort(
  requested: ListSort,
  shown: readonly string[],
  fallback: ListSort,
): ListSort {
  return requested.key === "start" || shown.includes(requested.key) ? requested : fallback;
}

/** A saved column choice, in display order. Null when what was saved isn't a list. */
export function parseColumns<K extends string>(saved: unknown, order: readonly K[]): K[] | null {
  return Array.isArray(saved) ? order.filter((k) => saved.includes(k)) : null;
}

/** `keys` with `key` shown or hidden, in display order. */
export function toggleColumn<K extends string>(
  order: readonly K[],
  keys: readonly K[],
  key: K,
  on: boolean,
): K[] {
  return order.filter((k) => (k === key ? on : keys.includes(k)));
}

/** Whether two column choices hold the same columns, whatever their order. */
export function sameColumns(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && b.every((k) => a.includes(k));
}
