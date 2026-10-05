// API types shared by the server and the web app. All times are milliseconds since the Unix epoch.

/** `GET /api/health`. `name` lets `kairos ensure` tell Kairos from another app on the port. */
export interface HealthResponse {
  ok: true;
  name: "kairos";
  version: string;
}

/** A project: one repository (worktrees included) or directory sessions ran in. */
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

/** `PATCH /api/projects/:id` body. Omitted fields are left as they are; a null color clears it. */
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
  /** AI summary body (Markdown), shown inside wide blocks of the day view. null if not generated yet. */
  body: string | null;
  /** PRs opened within this time, for the day view and the copied report. */
  prs: Artifact[];
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

/** `GET /api/calendar`: sessions with work blocks in [from, to), plus the projects to filter by. */
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

/** Where a search hit was found, most telling first. */
export type SearchField =
  | "headline"
  | "summary"
  | "title"
  | "branch"
  | "pr"
  | "commit"
  | "prompt"
  | "reply";

/** One work block (section) matching a search, across every period. */
export interface SearchHit {
  sessionId: string;
  projectId: number | null;
  /** Worktree name etc. */
  label: string | null;
  /** The section's start and end. */
  start: number;
  end: number;
  headline: string;
  field: SearchField;
  /** A short excerpt around the match (plain text). Empty when the headline itself matched. */
  snippet: string;
}

/** `GET /api/search`: matching sections, newest first, capped at `SEARCH_LIMIT`. */
export interface SearchResponse {
  hits: SearchHit[];
  /** More sections matched than were returned. */
  more: boolean;
}

/** A commit or PR made during a session. */
export interface Artifact {
  kind: "commit" | "pr";
  /** SHA for a commit, URL for a PR. */
  ref: string;
  title: string | null;
  ts: number | null;
}

/** A subagent launched from a session. */
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

/** `GET /api/sessions/:id`: everything the session drawer shows. */
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

/** What a stored message is, as shown in the conversation view. */
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

/** One message of a session's conversation (main thread or a subagent). */
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

/** `GET /api/sessions/:id/messages`: one page of the conversation, in log order. */
export interface MessagesResponse {
  messages: Message[];
  /** Value to pass as `cursor` to fetch more; null once everything has been fetched. */
  nextCursor: string | null;
}

/**
 * What was done on one project during a shown period (a week or a day), written by the LLM from
 * the period's section summaries. Only written on request.
 */
export interface Recap {
  projectId: number;
  from: number;
  to: number;
  /** Markdown; null until one is written. */
  body: string | null;
  model: string | null;
  createdAt: number | null;
  /** The project's work in the period changed after the recap was written. */
  stale: boolean;
  pending: boolean;
  /** Why the latest attempt failed. */
  error: string | null;
}

/** Recaps for every project with work starting in the period, written or not. */
export interface RecapsResponse {
  recaps: Recap[];
}

/** `POST /api/recaps` body: the project and period [from, to) to write a recap for. */
export interface RecapRequest {
  projectId: number;
  from: number;
  to: number;
}

/** Server settings the UI can change. */
export interface Settings {
  /** Language new summaries and recaps are written in. Follows the UI language. */
  summaryLang: "en" | "ja";
  /** Fixed with `kairos serve --summary-lang`; the UI's language doesn't change it. */
  summaryLangFixed: boolean;
}

/** `PATCH /api/settings` body. */
export interface SettingsUpdate {
  summaryLang: "en" | "ja";
}

/** Events delivered on `/api/events` (Server-Sent Events). */
export type ServerEvent =
  | { type: "sessions.updated"; ids: string[] }
  | { type: "summary.updated"; sessionId: string; start: number }
  | { type: "recap.updated"; projectId: number; from: number; to: number }
  | { type: "ingest.progress"; done: number; total: number };
