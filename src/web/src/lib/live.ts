// How running sessions are shown: which ones want you, in what order, and for the tab title.
import type { LiveAgent, LiveSession, LiveUsage, Project } from "@shared/api.ts";
import { isProjectShown } from "@shared/projects.ts";
import { WORK_BLOCK_GAP_MS } from "@shared/sections.ts";
import { formatMessages } from "@/i18n/messages/format.ts";
import { liveMessages } from "@/i18n/messages/live.ts";
import { elapsedLabel } from "./dates.ts";

/**
 * After this long waiting for a prompt, a session is idle: left open rather than waiting on you.
 * The same gap that splits work blocks, so an idle session's next prompt starts a new block.
 */
export const IDLE_AFTER_MS = WORK_BLOCK_GAP_MS;

/** A running session's state as shown: the server's, with long waits turned idle. */
export type LiveDisplay = "asking" | "waiting" | "working" | "idle";

/** The page's columns: what wants an answer, what is running, and what was left open. */
export type LiveColumn = "attention" | "working" | "idle";

/** The page's columns, left to right. */
export const LIVE_COLUMNS: readonly LiveColumn[] = ["attention", "working", "idle"];

/** The column a state belongs in. */
export function columnOf(display: LiveDisplay): LiveColumn {
  return display === "asking" || display === "waiting" ? "attention" : display;
}

/** A session placed in its column, with the state it was placed by. */
export interface LiveEntry {
  session: LiveSession;
  display: LiveDisplay;
}

/**
 * The sessions in their columns, keeping their order within each. Every column is present, empty
 * or not. The state is worked out once per session, so the column and the card's form agree at
 * the idle boundary.
 */
export function groupByColumn(
  sessions: readonly LiveSession[],
  now: number,
): Map<LiveColumn, LiveEntry[]> {
  const byColumn = new Map<LiveColumn, LiveEntry[]>(LIVE_COLUMNS.map((c) => [c, []]));
  for (const session of sessions) {
    const display = liveDisplay(session, now);
    byColumn.get(columnOf(display))?.push({ session, display });
  }
  return byColumn;
}

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
    .filter((s) => isProjectShown(projects, s.projectId))
    .map((s) => ({ s, d: liveDisplay(s, now) }))
    .sort((a, b) => ORDER[a.d] - ORDER[b.d] || b.s.since - a.s.since)
    .map(({ s }) => s);
}

/** How many sessions want your answer: asking, or done with a turn and not idle yet. */
export function attentionCount(sessions: readonly LiveSession[], now: number): number {
  return sessions.filter((s) => columnOf(liveDisplay(s, now)) === "attention").length;
}

/** The tab title, led by the number of sessions that want you so it shows in a background tab. */
export function documentTitle(attention: number): string {
  return attention > 0 ? `(${attention}) Kairos` : "Kairos";
}

/** Last path segment of a directory, to name a session Kairos hasn't ingested yet. */
export function dirName(cwd: string): string {
  return cwd.replace(/\/+$/, "").split("/").at(-1) || cwd;
}

/**
 * Where a session runs, as one line: the project (or the directory's name before Kairos knows
 * the project), its worktree label, and its branch.
 */
export function livePlace(
  s: Pick<LiveSession, "cwd" | "label" | "branch">,
  project: Pick<Project, "name"> | undefined,
): string {
  const f = formatMessages();
  return [
    project?.name ?? dirName(s.cwd),
    s.label ? f.sessionLabel(s.label) : "",
    s.branch ? `${f.separator}${s.branch}` : "",
  ].join("");
}

/**
 * A tool's name as shown: an MCP tool's `mcp__<server>__<tool>` becomes "server › tool", since the
 * raw name is an identifier rather than something to read. Other names are left as they are.
 */
export function toolLabel(name: string): string {
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  return m ? `${m[1]} › ${m[2]}` : name;
}

/**
 * From this share of the window on, the context gauge of a session waiting on you turns `warn`:
 * each request now rereads most of a full window, and Claude Code compacts it before long.
 */
export const CONTEXT_FULL_SHARE = 0.8;

/**
 * With this share of its TTL left on the cache of a session waiting on you, its countdown turns
 * `warn`: an answer now costs a cache read, one later rewrites the whole context. A share rather
 * than a time, so a 5-minute cache isn't in `warn` from the start (10 minutes of a 1-hour one).
 */
export const CACHE_WARN_SHARE = 1 / 6;

/** Share of the window the context fills, from 0 to 1. */
export function contextShare(tokens: number, window: number): number {
  return Math.min(Math.max(tokens / Math.max(window, 1), 0), 1);
}

/**
 * The main thread's prompt cache at `now`: how long it stays warm and whether that is nearly up
 * (`CACHE_WARN_SHARE` of its TTL), or expired. null when the session never wrote one.
 */
export function cacheState(
  usage: Pick<LiveUsage, "cacheExpiresAt" | "cacheTtlMs">,
  now: number,
): { warm: true; leftMs: number; soon: boolean } | { warm: false } | null {
  if (usage.cacheExpiresAt === null) return null;
  const leftMs = usage.cacheExpiresAt - now;
  if (leftMs <= 0) return { warm: false };
  return { warm: true, leftMs, soon: leftMs < (usage.cacheTtlMs ?? 0) * CACHE_WARN_SHARE };
}

/** What a running session's card shows about it, worked out once for its parts. */
export interface LiveCardView {
  session: LiveSession;
  display: LiveDisplay;
  /** The title: the summary's, the session's name, or its directory before Kairos has either. */
  name: string;
  /** How long it has been in its state. */
  duration: string;
  /** The state and how long it has lasted, said after the title. */
  description: string;
  /** Where it runs (`livePlace`). */
  place: string;
  /** A one-line row rather than a full card. */
  compact: boolean;
}

/** How a page lists running sessions beyond the card every one gets by default. */
export interface LiveCardOptions {
  /**
   * Show the session as a one-line row whatever its state. By default only an idle session is a
   * row; a page listing what runs only in passing (the home page's Working) asks for rows.
   */
  row?: boolean;
}

/** The card view of a running session in `display` state at `now`. */
export function liveCardView(
  session: LiveSession,
  display: LiveDisplay,
  project: Pick<Project, "name"> | undefined,
  now: number,
  { row = false }: LiveCardOptions = {},
): LiveCardView {
  const m = liveMessages();
  const duration = elapsedLabel(now - session.since);
  return {
    session,
    display,
    name: session.title ?? session.name ?? dirName(session.cwd),
    duration,
    description: m.status(m.state[display], duration),
    place: livePlace(session, project),
    compact: row || display === "idle",
  };
}

/** How many subagents a card lists before folding the rest into "+n". */
export const AGENT_ROWS = 3;

/** One subagent as its row on a card shows it. */
export interface LiveAgentRow {
  agent: LiveAgent;
  /** Its type, or a generic name when its meta file hasn't been read. */
  name: string;
  /** How long it has run, or that it is done. */
  status: string;
}

/**
 * The subagent rows of a card: the first `AGENT_ROWS` (the server lists running ones first), and
 * how many more were left out.
 */
export function agentRows(
  agents: readonly LiveAgent[],
  now: number,
): { rows: LiveAgentRow[]; more: number } {
  const m = liveMessages();
  return {
    rows: agents.slice(0, AGENT_ROWS).map((agent) => ({
      agent,
      name: agent.agentType ?? m.subagent,
      status: agent.running ? elapsedLabel(now - agent.startedAt) : m.agentDone,
    })),
    more: Math.max(0, agents.length - AGENT_ROWS),
  };
}

/** How many of the subagents still run. */
export function runningAgents(agents: readonly LiveAgent[]): number {
  return agents.filter((a) => a.running).length;
}

/** What the toolbar knows of the running sessions. */
export interface LiveSummary {
  running: number;
  /** Sessions asking or waiting for the next prompt. */
  attention: number;
  /** Whether any session is running a turn. */
  working: boolean;
}
