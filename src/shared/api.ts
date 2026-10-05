// API types shared by the server and the web app. All times are milliseconds since the Unix epoch.

export interface HealthResponse {
  ok: true;
  name: "kairos";
  version: string;
}

export interface Project {
  id: number;
  /** Path that identifies the project (worktrees are grouped under their parent repository). */
  path: string;
  /** Repository name if there is a git remote, otherwise the directory name. */
  name: string;
  /** `host/owner/repo` taken from the remote. Directories with the same value are grouped into one project. */
  repo: string | null;
  /** Palette key (`p0`–`p7`). When unset, the web app assigns one from the ID. */
  color: string | null;
  hidden: boolean;
}

export interface ProjectUpdate {
  color?: string | null;
  hidden?: boolean;
}

/** Token usage, including subagents. */
export interface Usage {
  /** Sum of input, output, and cache reads and writes. */
  tokens: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Amount in USD at API list prices. An estimate; it does not match what a subscription actually costs. */
  costUsd: number;
  /** Includes usage by models with unknown prices, which is left out of costUsd. */
  unpriced: boolean;
  /** Model with the most output tokens. */
  model: string | null;
}

/** What was done within a work block, including subagents. */
export interface Activity {
  commits: number;
  prs: number;
  /** Number of files changed with Edit / Write etc. (each file counted once). */
  filesEdited: number;
  toolCalls: number;
  /** Number of subagents launched. */
  subagents: number;
  /** Failed tool calls. */
  toolErrors: number;
  /** Times the user interrupted. */
  interrupts: number;
  /** API errors (overload, limits, etc.). */
  apiErrors: number;
  /** Number of compactions. */
  compactions: number;
  /** Total time Claude spent working on turns (ms). null for logs from older versions that do not record it. */
  claudeMs: number | null;
  /** Effort level with the most output tokens. */
  effort: string | null;
}

/** One block (section) drawn on the calendar. */
export interface CalendarSegment {
  start: number;
  end: number;
  /** AI summary headline; otherwise the first line of the first prompt (or of Claude's last reply). */
  headline: string;
  summarized: boolean;
  /** Number of user prompts (prompts and slash commands). */
  promptCount: number;
  /** Token usage within this time; null if none was recorded. */
  usage: Usage | null;
  activity: Activity;
}

/** One session drawn on the calendar. */
export interface CalendarSession {
  id: string;
  projectId: number | null;
  /** Secondary label such as the worktree name. */
  label: string | null;
  title: string;
  startedAt: number;
  endedAt: number;
  promptCount: number;
  /** Shortly after the last activity (likely still in progress). */
  active: boolean;
  segments: CalendarSegment[];
}

export interface CalendarResponse {
  from: number;
  to: number;
  sessions: CalendarSession[];
  projects: Project[];
  /** Start of the nearest work block before the range, so an empty range can jump to it. */
  prev: number | null;
  /** Start of the nearest work block after the range. */
  next: number | null;
}

/** Just the times of work blocks. Used by the date picker to mark days that have activity. */
export interface Span {
  start: number;
  end: number;
  projectId: number | null;
}

/**
 * Times of work blocks overlapping the range (from sessions with user prompts).
 * Days are assigned in the browser's local time, so the server returns them without grouping by day.
 */
export interface SpansResponse {
  spans: Span[];
}

export interface Artifact {
  kind: "commit" | "pr";
  /** SHA for a commit, URL for a PR. */
  ref: string;
  title: string | null;
  ts: number | null;
}

export interface Subagent {
  id: string;
  agentType: string | null;
  description: string | null;
  toolUseId: string | null;
  /** Times of the first and last messages. */
  startedAt: number | null;
  endedAt: number | null;
}

/** One section within a session (one block on the calendar). */
export interface Section {
  start: number;
  end: number;
  promptCount: number;
  /** AI summary headline; otherwise the first line of the first prompt (or of Claude's last reply). */
  headline: string;
  /** AI summary body (Markdown); null if not generated yet. */
  body: string | null;
  model: string | null;
  createdAt: number | null;
  /** The section continued after the summary was made. */
  stale: boolean;
  /** Whether the section is summarized by the LLM (short sections are not). */
  summarizable: boolean;
  /** A summary is being generated. */
  pending: boolean;
  /** Why the latest summary attempt failed. */
  error: string | null;
  /** Token usage within this time; null if none was recorded. */
  usage: Usage | null;
  activity: Activity;
}

export interface SessionDetail {
  id: string;
  project: Project | null;
  launchCwd: string | null;
  label: string | null;
  branch: string | null;
  title: string;
  /** Sections in time order. */
  sections: Section[];
  /** Recap written by Claude Code. Shown until the AI summary is ready. */
  awaySummary: string | null;
  startedAt: number | null;
  endedAt: number | null;
  active: boolean;
  promptCount: number;
  scheduledRuns: number;
  continuedFrom: string | null;
  continuedIn: string | null;
  commits: Artifact[];
  prs: Artifact[];
  subagents: Subagent[];
  /** Token usage for the whole session (including automatic runs outside work blocks). */
  usage: Usage | null;
}

export type MessageKind =
  | "prompt"
  | "command"
  | "assistant"
  | "tool_use"
  | "tool_result"
  | "scheduled"
  | "interrupt"
  | "notification"
  | "peer"
  | "compact"
  | "error";

export interface Message {
  id: string;
  ts: number | null;
  kind: MessageKind;
  text: string | null;
  toolName: string | null;
  toolUseId: string | null;
  /** tool_use input (JSON), or compact metadata (JSON). */
  detail: string | null;
  isError: boolean;
  isScheduled: boolean;
  /** Copy of the previous session's conversation inside a continued session. */
  isCopy: boolean;
}

export interface MessagesResponse {
  messages: Message[];
  /** Value to pass as `cursor` to fetch more; null once everything has been fetched. */
  nextCursor: string | null;
}

/** Events delivered on `/api/events` (Server-Sent Events). */
export type ServerEvent =
  | { type: "sessions.updated"; ids: string[] }
  | { type: "summary.updated"; sessionId: string; start: number }
  | { type: "ingest.progress"; done: number; total: number };
