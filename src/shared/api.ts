// API types shared by the server and the web app. All times are milliseconds since the Unix epoch.
import type { OpenKind } from "./summaryBody.ts";
import type { SummaryLang } from "./summaryLang.ts";

/** `GET /api/health`. `name` lets `kairos ensure` tell Kairos from another app on the port. */
export interface HealthResponse {
  ok: true;
  name: "kairos";
  version: string;
  /**
   * Whether the server summarizes recent sections on its own. `kairos summarize` leaves those to
   * it, so the two don't run `claude -p` for the same section at once.
   */
  autoSummary: boolean;
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
  /** PRs merged with `gh pr merge` (counted from the call, so PRs from any repository). */
  merges: number;
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
  /** The summary's short title for narrow blocks; null without one (older summaries, none yet). */
  short: string | null;
  summarized: boolean;
  /** AI summary body (Markdown), shown inside wide blocks of the day view. null if not generated yet. */
  body: string | null;
  /** PRs opened within this time, for the day view and the copied report. */
  prs: Artifact[];
  /** Commits made within this time, marked on the block at the moment they were made. */
  commits: Artifact[];
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
  /** Git branch the session started on; null outside a repository or on a detached HEAD. */
  branch: string | null;
  title: string;
  startedAt: number;
  endedAt: number;
  promptCount: number;
  /** Turns started by `/loop` or a scheduled task. */
  scheduledRuns: number;
  /**
   * An automatic run: no user prompt, started through the SDK (e.g. `claude -p`). Only returned
   * while `Settings.showHeadless` is on.
   */
  headless: boolean;
  /** Continued from an earlier session, or continued into a later one. */
  continued: boolean;
  /** Shortly after the last activity (likely still in progress). */
  active: boolean;
  segments: CalendarSegment[];
}

/**
 * `GET /api/calendar`: sessions with work blocks in [from, to). The projects they belong to come
 * from `GET /api/projects`, which every page reads.
 */
export interface CalendarResponse {
  from: number;
  to: number;
  sessions: CalendarSession[];
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
  | "reply"
  | "file";

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

/**
 * How a work block touched a PR (or the issue that shares its number): it opened or merged the PR,
 * worked on it (a `gh pr` command or the PR's URL), or only mentioned the number (#12).
 */
export const PR_TOUCHES = ["opened", "merged", "worked", "mentioned"] as const;
/** One of `PR_TOUCHES`. */
export type PrTouch = (typeof PR_TOUCHES)[number];

/**
 * A PR by its repository (`host/owner/name`, as projects key it) and number. Issues share the
 * number space, so it names an issue too. A type alias, so it binds by name to bun:sqlite.
 */
export type PrRef = {
  repo: string;
  number: number;
};

/** A work block that touched a PR, as `GET /api/prs` lists it. */
export interface PrBlock {
  sessionId: string;
  projectId: number | null;
  /** Worktree name etc. */
  label: string | null;
  start: number;
  end: number;
  headline: string;
  /** Every way the block touched the PR, in `PrTouch` order. */
  how: PrTouch[];
}

/** `GET /api/prs?repo&number`: one PR's work across sessions. */
export interface PrHistory extends PrRef {
  url: string;
  /** The title given to `gh pr create`; null when the logs don't show it. */
  title: string | null;
  openedAt: number | null;
  mergedAt: number | null;
  /** The blocks that touched it, oldest first, from visible sessions. */
  blocks: PrBlock[];
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
  /**
   * The last moment whose commits and PRs the section owns: a grace period after its end, cut
   * where the session's next section starts.
   */
  outputsUntil: number;
  promptCount: number;
  /** AI summary headline; otherwise the first line of the first prompt (or of Claude's last reply). */
  headline: string;
  /** The summary's short title for narrow blocks; null without one (older summaries, none yet). */
  short: string | null;
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
  /** Items earlier work left open that this section settled, as the log or its summary showed. */
  closes: LedgerEntry[];
  /**
   * Items this section's summary left open, as the ledger tracks them now (open, or how they were
   * closed since). Empty for a summary written before the ledger, whose Open item is only text.
   */
  opens: LedgerEntry[];
}

/**
 * How an open item was closed: the log showed its issue closed, PR merged or task completed
 * (`ref`), a later section's summary said it was settled (`model`), or by hand: done (`user`), not
 * to be done (`dismissed`), or never open in the first place, a summary's mistake (`mistaken`).
 */
export type ClosedBy = "ref" | "model" | "user" | "dismissed" | "mistaken";

/** An item a section summary left open, tracked across sections and sessions until it closes. */
export interface LedgerEntry {
  id: number;
  projectId: number | null;
  kind: OpenKind | null;
  /** Markdown, as the summary wrote it. */
  text: string;
  /** The block that left it open. */
  sessionId: string;
  start: number;
  /** End of that block. */
  openedAt: number;
  closedAt: number | null;
  closedBy: ClosedBy | null;
  /** The block that closed it; null when closed by hand or outside any block. */
  closedSessionId: string | null;
  closedStart: number | null;
  /**
   * How it was closed: for a `ref` close, fixed English phrases ("closed #21", "merged PR #5",
   * "task #3 completed") joined by "; ", which the UI puts into words; for a `model` close, the
   * summary's evidence. null when not said.
   */
  closedNote: string | null;
}

/**
 * `GET /api/open-items?from&to`: items of human work that were open at some point in the period:
 * left open before its end, and not closed before its start.
 */
export interface OpenItemsResponse {
  items: LedgerEntry[];
}

/**
 * `PATCH /api/open-items/:id` body. `done`, `dismissed` and `mistaken` close an open item by hand
 * (see `HAND_CLOSES` in `openItems.ts`); `open` reopens one closed by hand. Items the log or a
 * summary closed can't be reopened, since the next check would close them again.
 */
export interface OpenItemUpdate {
  state: HandClose | "open";
}

/** How an open item can be closed by hand: finished, not to be done, or never open at all. */
export type HandClose = "done" | "dismissed" | "mistaken";

/** An open item with the refs it names: Pick up ranks by them, and the summarizer closes by them. */
export interface PickUpItem extends LedgerEntry {
  /** Issue / PR numbers, Jira keys and task IDs the item names (see `server/refs.ts`). */
  refs: string[];
}

/**
 * A session with work left to pick up: what its latest summary left open and still is, and the step
 * it said was about to happen. Earlier summaries' items stay in the ledger and the summary view; the
 * latest one says where the session stands.
 */
export interface PickUpSession {
  sessionId: string;
  projectId: number | null;
  /** Where it was launched, for the command that resumes it. */
  launchCwd: string | null;
  /** The latest summarized block, which left the items open. */
  start: number;
  end: number;
  headline: string;
  /** The step that summary said was about to happen; null when it named none. */
  next: string | null;
  /** The session's last activity. */
  lastActive: number;
  /** The last activity of any session of the project in the window; null without a project. */
  projectMovedAt: number | null;
  /** In the order the summary listed them (the most important first). */
  items: PickUpItem[];
}

/**
 * `GET /api/pick-up`: human sessions active in the last `PICK_UP_IDLE_DAYS` whose latest summary
 * left items that are still open. The page ranks and caps them (`lib/pickUp.ts`), so freshness
 * follows the clock without a refetch.
 */
export interface PickUpResponse {
  sessions: PickUpSession[];
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
  /** An automatic run (see `CalendarSession.headless`). */
  headless: boolean;
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
  /** The request given to `claude -p` or the Agent SDK. */
  | "sdk_prompt"
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
  summaryLang: SummaryLang;
  /** Fixed with `kairos serve --summary-lang`; the UI's language doesn't change it. */
  summaryLangFixed: boolean;
  /** Also show automatic runs (headless sessions) on the calendar, in search and in navigation. */
  showHeadless: boolean;
}

/** `PATCH /api/settings` body: the settings to change (at least one). */
export interface SettingsUpdate {
  summaryLang?: SummaryLang;
  showHeadless?: boolean;
}

/**
 * Sessions whose logs changed, and the time [from, to] (epoch ms, inclusive) they and the sessions
 * they continue span. Their blocks, and any block that moved or went with the change, lie within
 * it, so a view of a period outside it needs no refetch (see `lib/invalidation.ts` in the web).
 */
export interface SessionsChange {
  ids: string[];
  from: number;
  to: number;
}

/** Events delivered on `/api/events` (Server-Sent Events). */
export type ServerEvent =
  | ({ type: "sessions.updated" } & SessionsChange)
  | { type: "summary.updated"; sessionId: string; start: number }
  | { type: "recap.updated"; projectId: number; from: number; to: number }
  | { type: "ingest.progress"; done: number; total: number }
  | { type: "live.updated" };

/**
 * What a running session is doing, as far as the logs and Claude Code's session registry tell
 * without hooks: running a turn, asking a question (AskUserQuestion / ExitPlanMode left
 * unanswered), or done with its turn and waiting for the next prompt.
 */
export type LiveState = "working" | "asking" | "waiting";

/** The last test or check run of a live session's current block. */
export interface LiveTest {
  /** The command, cut to one line. */
  command: string;
  /** false when it failed; null when a pipe or `|| true` hides its exit status. */
  passed: boolean | null;
  at: number;
}

/** Progress of the session's task list (TaskCreate / TaskUpdate). */
export interface LiveTasks {
  done: number;
  total: number;
  /** Subject of the task in progress, if any. */
  current: string | null;
}

/** One Claude Code process running now, joined with what Kairos has ingested of its session. */
export interface LiveSession {
  id: string;
  pid: number;
  /** Claude Code's own name for the session (shown in its session list). */
  name: string | null;
  /** A background session (`claude --bg` and the like) rather than one in a terminal. */
  background: boolean;
  cwd: string;
  /** null until the session's log has been ingested (the first seconds of a new session). */
  projectId: number | null;
  label: string | null;
  branch: string | null;
  title: string | null;
  state: LiveState;
  /** When the state last changed. */
  since: number;
  startedAt: number;
  /** Start of the latest work block, to open it in the drawer. */
  section: number | null;
  /** The tool call being run while working. */
  tool: LiveTool | null;
  /** The question being asked while asking. */
  question: string | null;
  /** Context size of the latest main-thread response (input + cache reads and writes). */
  contextTokens: number | null;
  /** The model, its context window, its prompt cache and what it costs; null before any response. */
  usage: LiveUsage | null;
  tasks: LiveTasks | null;
  test: LiveTest | null;
  /** Claude Code's latest recap of the session (`away_summary`). */
  recap: string | null;
  /** Its subagents running now or just finished, running ones first. */
  agents: LiveAgent[];
}

/** A tool call that hasn't returned yet. `text` is its one-line summary (a command, a path). */
export interface LiveTool {
  name: string;
  text: string;
  since: number;
}

/**
 * A subagent of a running session. Done ones stay listed for a couple of minutes after they finish,
 * so a quick one is seen at all.
 */
export interface LiveAgent {
  id: string;
  /** Its type (`Explore`, a custom agent); null when its meta file hasn't been read. */
  agentType: string | null;
  /** What it was asked to do, as the caller described it. */
  description: string | null;
  running: boolean;
  /** Launched to run on its own: the session's turn doesn't wait for it. */
  background: boolean;
  /** The call it is running; null while it thinks, and once done. */
  tool: LiveTool | null;
  startedAt: number;
  /** Its latest message: when it finished, once done. */
  lastAt: number;
  /** Tokens it has used so far. */
  tokens: number;
}

/**
 * A running session's model and what its next request costs. Amounts are estimates at API list
 * prices, like `Usage.costUsd`: a gauge of usage rather than the bill.
 */
export interface LiveUsage {
  /** Model of the latest main-thread response. */
  model: string;
  /** The latest response ran in fast mode. */
  fast: boolean;
  /**
   * Context window in tokens. Logs don't record it, so it is the model's default in Claude Code,
   * or 1M once a response went past 200k.
   */
  contextWindow: number;
  /**
   * When the main thread's prompt cache lapses unless another request reads it: the latest
   * response plus the TTL its cache writes used (1 hour or 5 minutes). null with no cache writes.
   */
  cacheExpiresAt: number | null;
  /** That TTL in milliseconds; null with no cache writes. */
  cacheTtlMs: number | null;
  /** Tokens of the current work block so far, including subagents. */
  blockTokens: number;
  /** Tokens over the last `LIVE_RATE_WINDOW_MS`, as tokens per hour. */
  perHourTokens: number;
}

/**
 * Tokens across visible sessions, running or not, for the band above the live page's columns.
 * Tokens count every token column, cache reads included, as `Usage.tokens` does.
 */
export interface LiveTokens {
  /** Since local midnight. */
  today: number;
  /** Over the last `LIVE_RATE_WINDOW_MS`, as tokens per hour. */
  perHour: number;
  /**
   * Start of the first bucket: local midnight, on a whole `TOKEN_BUCKET_MS`. Buckets are that long,
   * oldest first, up to now; the last is in progress.
   */
  from: number;
  /** When the figures were taken: the end of the last bucket so far. */
  to: number;
  /** Each bucket's tokens by project (null for sessions without one), largest first. */
  buckets: { projectId: number | null; tokens: number }[][];
}

/** `GET /api/live`. `available` is false when Claude Code's session registry can't be read. */
export interface LiveResponse {
  available: boolean;
  sessions: LiveSession[];
  tokens: LiveTokens;
}
