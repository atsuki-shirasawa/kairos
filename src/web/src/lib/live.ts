// How running sessions are shown: which ones want you, in what order, and for the tab title.
import type { LiveSession, Project } from "@shared/api.ts";

/**
 * After this long waiting for a prompt, a session is idle: left open rather than waiting on you.
 * The same gap that splits work blocks, so an idle session's next prompt starts a new block.
 */
export const IDLE_AFTER_MS = 15 * 60_000;

/** A running session's state as shown: the server's, with long waits turned idle. */
export type LiveDisplay = "asking" | "waiting" | "working" | "idle";

/** Display order: what wants an answer first, idle sessions last. */
const ORDER: Record<LiveDisplay, number> = { asking: 0, waiting: 1, working: 2, idle: 3 };

/** The session's state at `now`. */
export function liveDisplay(s: Pick<LiveSession, "state" | "since">, now: number): LiveDisplay {
  return s.state === "waiting" && now - s.since >= IDLE_AFTER_MS ? "idle" : s.state;
}

/**
 * Sessions to show, in display order (most recently changed first within a state), without those
 * of hidden projects, like the calendar.
 */
export function visibleLive(
  sessions: readonly LiveSession[],
  projects: ReadonlyMap<number, Project>,
  now: number,
): LiveSession[] {
  return sessions
    .filter((s) => s.projectId === null || !projects.get(s.projectId)?.hidden)
    .map((s) => ({ s, d: liveDisplay(s, now) }))
    .sort((a, b) => ORDER[a.d] - ORDER[b.d] || b.s.since - a.s.since)
    .map(({ s }) => s);
}

/** How many sessions want your answer: asking, or done with a turn and not idle yet. */
export function attentionCount(sessions: readonly LiveSession[], now: number): number {
  return sessions.filter((s) => {
    const d = liveDisplay(s, now);
    return d === "asking" || d === "waiting";
  }).length;
}

/** The tab title, led by the number of sessions that want you so it shows in a background tab. */
export function documentTitle(attention: number): string {
  return attention > 0 ? `(${attention}) Kairos` : "Kairos";
}

/** Last path segment of a directory, to name a session Kairos hasn't ingested yet. */
export function dirName(cwd: string): string {
  return cwd.replace(/\/+$/, "").split("/").at(-1) || cwd;
}
