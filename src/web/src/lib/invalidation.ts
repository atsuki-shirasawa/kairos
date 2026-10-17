// What each server event makes stale in the cache. Kept apart from the hook that listens, so the
// rules are a table-tested function: while Claude works, sessions.updated arrives every few
// seconds, and refetching every period on it re-ran the heaviest query over and over.
import type { CalendarResponse, ServerEvent, SessionsChange } from "@shared/api.ts";
import { overlaps } from "./dayBlocks.ts";
import { CALENDAR_KINDS, type CachedQuery, readKey } from "./queryKeys.ts";

/** The events that change data (import progress only reports how far an import has got). */
export type UpdateEvent = Exclude<ServerEvent, { type: "ingest.progress" }>;

/**
 * Whether the query cached under `key`, holding `data`, is stale after the event. A key `keys`
 * doesn't build is refetched, so a new kind of query is never left stale by mistake.
 */
export function isStaleAfter(event: UpdateEvent, key: readonly unknown[], data: unknown): boolean {
  const query = readKey(key);
  if (!query) return true;
  switch (event.type) {
    // The registry changed (a session started, ended, or finished a turn); the log didn't
    case "live.updated":
      return query.kind === "live";
    case "recap.updated":
      return query.kind === "recaps";
    // A new summary can close open items of other sessions (by its word or the log's refs), and
    // every drawer lists its sections' items with their state
    case "summary.updated":
      return CALENDAR_KINDS.includes(query.kind) || query.kind === "session";
    case "sessions.updated":
      return isStaleAfterChange(event, query, data);
  }
}

/** Whether a change to sessions' logs makes the query stale. */
function isStaleAfterChange(change: SessionsChange, query: CachedQuery, data: unknown): boolean {
  switch (query.kind) {
    case "calendar":
      return touches(change, query) || neighborsMayMove(change, query, data as CalendarResponse);
    case "spans":
    case "recaps":
    case "open-items":
      return touches(change, query);
    case "session":
    case "messages":
      return change.ids.includes(query.sessionId);
    // A new session may bring a new project; the tool in flight, tasks and tests come from the log
    // Pick up reads when each session and project last moved, which the log moves; its query reads
    // only the last week through an index, so it is cheap to refetch
    case "projects":
    case "live":
    case "pick-up":
      return true;
    // Search covers every period, so it would refetch on every change; a new keyword searches again
    case "search":
    case "settings":
      return false;
  }
}

/** Whether the change's time meets the period, by the calendar's own overlap test. */
function touches(change: SessionsChange, period: { from: number; to: number }): boolean {
  return overlaps({ start: change.from, end: change.to }, period.from, period.to);
}

/**
 * Whether the change can move the calendar's nearest blocks outside its period (`prev` / `next`,
 * which an empty period jumps to). Every block of the change lies within its time, so a change
 * only after the period can't touch `prev`, and one already beyond `next` can't touch `next`.
 */
function neighborsMayMove(
  change: SessionsChange,
  period: { from: number; to: number },
  data: CalendarResponse | undefined,
): boolean {
  if (!data) return true;
  const prev = change.from < period.from && (data.prev === null || data.prev <= change.to);
  const next = change.to >= period.to && (data.next === null || data.next >= change.from);
  return prev || next;
}
