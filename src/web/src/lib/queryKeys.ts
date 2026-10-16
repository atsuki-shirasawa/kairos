// The React Query keys the app caches under, and the reading of a key back into what it holds, so
// deciding what an update makes stale (lib/invalidation.ts) never parses keys on its own.

/**
 * React Query keys. Everything nested under "calendar" is about the shown periods' work, so a
 * mutation that changes it (a project setting, an open item) can refetch it all at once. The
 * `all*` entries are prefixes, for invalidating every period (or every page) of a kind.
 */
export const keys = {
  allCalendar: ["calendar"] as const,
  calendar: (from: number, to: number) => ["calendar", from, to] as const,
  // Nested under "calendar" so a new project, or a renamed or hidden one, refreshes it
  projects: ["calendar", "projects"] as const,
  spans: (from: number, to: number) => ["calendar", "spans", from, to] as const,
  allSessions: ["session"] as const,
  session: (id: string) => ["session", id] as const,
  // Every agent's pages of a session's conversation
  allMessages: (id: string) => ["messages", id] as const,
  messages: (id: string, agent: string | null) => ["messages", id, agent] as const,
  search: (q: string) => ["calendar", "search", q] as const,
  settings: ["settings"] as const,
  // Not under "calendar": running sessions change on their own (live.updated) as well as with the log
  live: ["live"] as const,
  allRecaps: ["calendar", "recaps"] as const,
  recaps: (from: number, to: number) => ["calendar", "recaps", from, to] as const,
  allOpenItems: ["calendar", "open-items"] as const,
  openItems: (from: number, to: number) => ["calendar", "open-items", from, to] as const,
};

/** The kinds of cached data that cover a period [from, to), keyed as `keys.<kind>(from, to)`. */
const PERIOD_KINDS = ["calendar", "spans", "recaps", "open-items"] as const;

/** A kind of cached data that covers a period. */
export type PeriodKind = (typeof PERIOD_KINDS)[number];

/** The period kinds nested under "calendar" by name (the calendar itself is under it directly). */
const NAMED_PERIOD_KINDS = PERIOD_KINDS.filter((k) => k !== "calendar");

/**
 * Every kind nested under "calendar": what the work in a period and its summaries feed into, so a
 * new summary refetches them all.
 */
export const CALENDAR_KINDS: readonly CachedQuery["kind"][] = [
  ...PERIOD_KINDS,
  "projects",
  "search",
];

/** What a cached query holds, read back from its key. */
export type CachedQuery =
  | { kind: PeriodKind; from: number; to: number }
  | { kind: "projects" | "search" | "settings" | "live" }
  | { kind: "session" | "messages"; sessionId: string };

/** What the query under this key holds, or null for a key `keys` doesn't build. */
export function readKey(key: readonly unknown[]): CachedQuery | null {
  const [head, second, third, fourth] = key;
  if (head === "settings" || head === "live") return { kind: head };
  if ((head === "session" || head === "messages") && typeof second === "string")
    return { kind: head, sessionId: second };
  if (head !== "calendar") return null;
  if (typeof second === "number" && typeof third === "number")
    return { kind: "calendar", from: second, to: third };
  if (second === "projects" || second === "search") return { kind: second };
  const named = NAMED_PERIOD_KINDS.find((k) => k === second);
  if (named && typeof third === "number" && typeof fourth === "number")
    return { kind: named, from: third, to: fourth };
  return null;
}
