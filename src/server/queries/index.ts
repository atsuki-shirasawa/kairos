import type { Database } from "bun:sqlite";
import type {
  Activity,
  Artifact,
  CalendarSession,
  LedgerEntry,
  MessageKind,
  MessagesResponse,
  OpenItemUpdate,
  Project,
  ProjectUpdate,
  Recap,
  SearchHit,
  Section,
  SessionDetail,
  Span,
  Subagent,
  Usage,
} from "../../shared/api.ts";
import { ARTIFACT_GRACE_MS } from "../../shared/constants.ts";
import { MINUTE } from "../../shared/dates.ts";
import { isSummarizable } from "../../shared/sections.ts";
import { notNote } from "../db/notes.ts";
import { openItemsIn, sessionCloses, type UpdateRefusal, updateOpenItem } from "../openItems.ts";
import { storedShowHeadless } from "../settings.ts";
import { loadRecapInput, type RecapTarget, recapHash } from "../summarize/recap.ts";
import { DEFAULT_HIDDEN_CWDS, visibleSessionSql } from "../visibility.ts";
import { EDIT_TOOLS } from "./editTools.ts";
import {
  likePattern,
  SEARCH_LIMIT,
  type SearchRow,
  searchSql,
  searchTerms,
  toSearchHit,
} from "./search.ts";
import { displayBranch, sectionHeadline, summaryBody, title } from "./titles.ts";
import { sessionUsage } from "./usage.ts";

/** Within this long after the last activity, a session counts as in progress. */
export const ACTIVE_WINDOW_MS = 5 * MINUTE;
/** Messages returned per page when the request gives no `limit`. */
export const MESSAGES_DEFAULT_LIMIT = 200;
/** Upper bound on a requested `limit`, so one request cannot pull a whole long session. */
export const MESSAGES_MAX_LIMIT = 1000;

interface ProjectRow {
  id: number;
  path: string;
  name: string;
  repo: string | null;
  color: string | null;
  hidden: number;
}

const toProject = (r: ProjectRow): Project => ({ ...r, hidden: r.hidden === 1 });

/**
 * Summary progress that the read queries report alongside stored summaries. Implemented by
 * the Summarizer; without one, nothing is ever pending or failed.
 */
export interface SummaryState {
  isPending(sessionId: string, start: number): boolean;
  errorOf(sessionId: string, start: number): string | null;
  isRecapPending(target: RecapTarget): boolean;
  recapErrorOf(target: RecapTarget): string | null;
}

const NO_SUMMARIES: SummaryState = {
  isPending: () => false,
  errorOf: () => null,
  isRecapPending: () => false,
  recapErrorOf: () => null,
};

interface SessionRow {
  id: string;
  project_id: number | null;
  launch_cwd: string | null;
  label: string | null;
  branch: string | null;
  custom_title: string | null;
  agent_name: string | null;
  ai_title: string | null;
  first_prompt: string | null;
  away_summary: string | null;
  continued_in: string | null;
  started_at: number | null;
  ended_at: number | null;
  prompt_count: number;
  scheduled_runs: number;
}

interface SectionRow {
  start: number;
  end: number;
  prompt_count: number;
  fallback_title: string | null;
  headline: string | null;
  body: string | null;
  model: string | null;
  covered_until: number | null;
  created_at: number | null;
}

/** A section and its summary, if any. */
const SECTION_SELECT = `SELECT g.start, g.end, g.prompt_count, g.fallback_title,
         sm.headline, sm.body, sm.model, sm.covered_until, sm.created_at
  FROM segments g LEFT JOIN summaries sm ON sm.session_id = g.session_id AND sm.start = g.start`;

/** The part of `Activity` counted from artifacts. */
type ArtifactCounts = Pick<Activity, "commits" | "prs" | "merges">;
/** The part of `Activity` counted from messages. */
type MessageCounts = Omit<Activity, keyof ArtifactCounts | "claudeMs" | "effort">;

/** Whether a session that last did something at `endedAt` still counts as in progress. */
function isActive(endedAt: number | null, now: number): boolean {
  return endedAt !== null && now - endedAt < ACTIVE_WINDOW_MS;
}

/** Read queries behind the API, plus the few writes the UI can make (project settings). */
export class Queries {
  constructor(
    private readonly db: Database,
    private readonly now: () => number = Date.now,
    /** Summary progress (answered by the Summarizer). */
    private readonly summaries: SummaryState = NO_SUMMARIES,
    /** Launch directories whose sessions are never shown (see `SessionVisibility`). */
    private readonly hiddenCwds: readonly string[] = DEFAULT_HIDDEN_CWDS,
  ) {}

  /**
   * Condition keeping the sessions the calendar shows, on the sessions table aliased `alias`.
   * Read per query, so turning headless sessions on or off applies to the next request.
   */
  private visible(alias = "s"): string {
    return visibleSessionSql(
      { headless: storedShowHeadless(this.db), hiddenCwds: this.hiddenCwds },
      alias,
    );
  }

  /**
   * Project list. Only projects with visible sessions (projects with only headless sessions, e.g.
   * from testing a hook, don't show on the calendar unless those are shown, so they are left out of
   * the filter too).
   */
  projects(): Project[] {
    return this.db
      .query<ProjectRow, []>(
        `SELECT id, path, name, repo, color, hidden FROM projects p
         WHERE EXISTS (SELECT 1 FROM sessions s WHERE s.project_id = p.id AND ${this.visible()})
         ORDER BY name, path`,
      )
      .all()
      .map(toProject);
  }

  /** Applies the given color and visibility changes. Returns the result, or null if absent. */
  updateProject(id: number, update: ProjectUpdate): Project | null {
    if (update.color !== undefined) {
      this.db.query("UPDATE projects SET color = ? WHERE id = ?").run(update.color, id);
    }
    if (update.hidden !== undefined) {
      this.db.query("UPDATE projects SET hidden = ? WHERE id = ?").run(update.hidden ? 1 : 0, id);
    }
    return this.project(id);
  }

  /** One project by id, or null if absent. */
  private project(id: number): Project | null {
    const row = this.db
      .query<ProjectRow, [number]>(
        "SELECT id, path, name, repo, color, hidden FROM projects WHERE id = ?",
      )
      .get(id);
    return row ? toProject(row) : null;
  }

  /** Starts of the nearest work blocks before and after [from, to) (from visible sessions). */
  neighbors(from: number, to: number): { prev: number | null; next: number | null } {
    const one = (sql: string, t: number) =>
      this.db.query<{ t: number | null }, [number]>(sql).get(t)?.t ?? null;
    const base = `FROM segments g JOIN sessions s ON s.id = g.session_id WHERE ${this.visible()}`;
    return {
      prev: one(`SELECT MAX(g.start) AS t ${base} AND g.end < ?`, from),
      next: one(`SELECT MIN(g.start) AS t ${base} AND g.start >= ?`, to),
    };
  }

  /** Times of work blocks overlapping [from, to). Overlap is decided the same way as in `calendar`. */
  spans(from: number, to: number): Span[] {
    return this.db
      .query<Span, [number, number]>(
        `SELECT g.start, g.end, s.project_id AS projectId
         FROM segments g JOIN sessions s ON s.id = g.session_id
         WHERE ${this.visible()} AND g.start < ?2 AND g.end >= ?1
         ORDER BY g.start, g.end`,
      )
      .all(from, to);
  }

  /**
   * Recaps for projects with work starting in [from, to), including ones not written yet. Each is
   * compared with the work as it is now, so one written before more work came in shows as stale.
   */
  recaps(from: number, to: number): Recap[] {
    // Recaps tell what you did, so like loadRecapInput they leave headless sessions out
    const ids = this.db
      .query<{ id: number }, [number, number]>(
        `SELECT DISTINCT s.project_id AS id FROM segments g JOIN sessions s ON s.id = g.session_id
         WHERE s.prompt_count > 0 AND s.project_id IS NOT NULL AND g.start >= ? AND g.start < ?
         ORDER BY s.project_id`,
      )
      .all(from, to);
    const stored = this.db.query<
      { body: string; model: string; input_hash: string; created_at: number },
      [number, number, number]
    >(
      `SELECT body, model, input_hash, created_at FROM recaps
       WHERE project_id = ? AND period_from = ? AND period_to = ?`,
    );
    return ids.flatMap(({ id }) => {
      const target = { projectId: id, from, to };
      const input = loadRecapInput(this.db, target);
      if (!input) return [];
      const row = stored.get(id, from, to);
      return [
        {
          ...target,
          body: row?.body ?? null,
          model: row?.model ?? null,
          createdAt: row?.created_at ?? null,
          stale: row ? row.input_hash !== recapHash(input) : false,
          pending: this.summaries.isRecapPending(target),
          error: this.summaries.recapErrorOf(target),
        },
      ];
    });
  }

  /** Open items of human work that were open at some point in [from, to), oldest first. */
  openItems(from: number, to: number): LedgerEntry[] {
    return openItemsIn(this.db, from, to);
  }

  /** Closes an open item by hand, or reopens one closed by hand (see `updateOpenItem`). */
  updateOpenItem(id: number, update: OpenItemUpdate): LedgerEntry | UpdateRefusal {
    return updateOpenItem(this.db, id, update, this.now());
  }

  /** Whether the project has work starting in [from, to) to recap. */
  hasRecapWork(target: RecapTarget): boolean {
    return loadRecapInput(this.db, target) !== null;
  }

  /** Visible sessions whose work blocks overlap [from, to). */
  calendar(from: number, to: number): CalendarSession[] {
    const rows = this.db
      .query<SessionRow, [number, number]>(
        `SELECT s.* FROM sessions s
         WHERE ${this.visible()}
           AND EXISTS (SELECT 1 FROM segments g WHERE g.session_id = s.id AND g.start < ?2 AND g.end >= ?1)
         ORDER BY s.started_at`,
      )
      .all(from, to);
    if (rows.length === 0) return [];

    const segQuery = this.db.query<SectionRow, [string, number, number]>(
      `${SECTION_SELECT} WHERE g.session_id = ?1 AND g.start < ?3 AND g.end >= ?2 ORDER BY g.start`,
    );
    const now = this.now();
    return rows.map((r) => {
      const fallback = title(r);
      return {
        id: r.id,
        projectId: r.project_id,
        label: r.label,
        branch: displayBranch(r.branch),
        title: fallback,
        startedAt: r.started_at ?? 0,
        endedAt: r.ended_at ?? 0,
        promptCount: r.prompt_count,
        scheduledRuns: r.scheduled_runs,
        headless: r.prompt_count === 0,
        continued: r.continued_in !== null || this.predecessorOf(r.id) !== null,
        active: isActive(r.ended_at, now),
        segments: segQuery.all(r.id, from, to).map((g) => ({
          start: g.start,
          end: g.end,
          headline: sectionHeadline(g, fallback),
          summarized: g.headline !== null,
          body: summaryBody(g),
          prs: this.blockArtifacts(r.id, "pr", g.start, g.end),
          commits: this.blockArtifacts(r.id, "commit", g.start, g.end),
          promptCount: g.prompt_count,
          usage: this.usage(r.id, g.start, g.end),
          activity: this.activity(r.id, g.start, g.end),
        })),
      };
    });
  }

  /** What the session drawer shows (sections, artifacts, subagents, usage); null if absent. */
  session(id: string): SessionDetail | null {
    const s = this.db.query<SessionRow, [string]>("SELECT * FROM sessions WHERE id = ?").get(id);
    if (!s) return null;

    const project = s.project_id ? this.project(s.project_id) : null;
    const artifacts = this.artifacts(id);
    const subagents = this.subagents(id);
    const continuedFrom = this.predecessorOf(id);
    const fallback = title(s);
    const sections = this.sections(id, fallback);

    return {
      id: s.id,
      project,
      launchCwd: s.launch_cwd,
      label: s.label,
      branch: s.branch,
      title: fallback,
      sections,
      awaySummary: s.away_summary,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      active: isActive(s.ended_at, this.now()),
      promptCount: s.prompt_count,
      scheduledRuns: s.scheduled_runs,
      headless: s.prompt_count === 0,
      continuedFrom,
      continuedIn: s.continued_in,
      commits: artifacts.filter((a) => a.kind === "commit"),
      prs: artifacts.filter((a) => a.kind === "pr"),
      subagents,
      usage: this.usage(id),
    };
  }

  /** The session's commits and PRs in time order, excluding copies from the previous session. */
  private artifacts(sessionId: string): Artifact[] {
    return this.db
      .query<Artifact, [string]>(
        `SELECT kind, ref, title, ts FROM artifacts
         WHERE session_id = ? AND kind IN ('pr', 'commit') AND is_copy = 0 ORDER BY ts`,
      )
      .all(sessionId);
  }

  /** The session's subagents, with the span of their messages, in start order. */
  private subagents(sessionId: string): Subagent[] {
    return this.db
      .query<Subagent, [string]>(
        `SELECT a.id, a.agent_type AS agentType, a.description, a.tool_use_id AS toolUseId,
                MIN(m.ts) AS startedAt, MAX(m.ts) AS endedAt
         FROM subagents a LEFT JOIN messages m ON m.session_id = a.session_id AND m.agent_id = a.id
         WHERE a.session_id = ? GROUP BY a.id ORDER BY startedAt`,
      )
      .all(sessionId);
  }

  /** The session this one was continued from, or null. */
  private predecessorOf(sessionId: string): string | null {
    return (
      this.db
        .query<{ id: string }, [string]>("SELECT id FROM sessions WHERE continued_in = ? LIMIT 1")
        .get(sessionId)?.id ?? null
    );
  }

  /** Every section of the session with its summary state, usage and activity, in order. */
  private sections(sessionId: string, sessionTitle: string): Section[] {
    const closes = sessionCloses(this.db, sessionId);
    return this.db
      .query<SectionRow, [string]>(`${SECTION_SELECT} WHERE g.session_id = ? ORDER BY g.start`)
      .all(sessionId)
      .map(
        (g): Section => ({
          start: g.start,
          end: g.end,
          promptCount: g.prompt_count,
          headline: sectionHeadline(g, sessionTitle),
          body: summaryBody(g),
          model: g.model,
          createdAt: g.created_at,
          stale: g.covered_until !== null && g.covered_until < g.end,
          summarizable: isSummarizable({ start: g.start, end: g.end, promptCount: g.prompt_count }),
          pending: this.summaries.isPending(sessionId, g.start),
          error: this.summaries.errorOf(sessionId, g.start),
          usage: this.usage(sessionId, g.start, g.end),
          activity: this.activity(sessionId, g.start, g.end),
          closes: closes.get(g.start) ?? [],
        }),
      );
  }

  /** Commits or PRs made within a work block (counted the same way as `activity()`). */
  private blockArtifacts(
    sessionId: string,
    kind: Artifact["kind"],
    from: number,
    to: number,
  ): Artifact[] {
    return this.db
      .query<Artifact, [string, string, number, number]>(
        `SELECT kind, ref, title, ts FROM artifacts
         WHERE session_id = ? AND kind = ? AND is_copy = 0 AND ts BETWEEN ? AND ? ORDER BY ts`,
      )
      .all(sessionId, kind, from, to + ARTIFACT_GRACE_MS);
  }

  /**
   * Work blocks matching every space-separated term, across all periods, newest first.
   * Looks at what a person would remember a piece of work by: the summary, the session title and
   * branch, PR and commit titles, and the prompts and replies of the main conversation.
   * `file:<path>` terms match the paths of files edited in the block instead (and only them).
   * Each term may match a different place; the hit reports the most telling place the first term matched.
   * A plain LIKE scan: on a year of real logs this takes tens of milliseconds, so no FTS index is needed.
   */
  search(query: string, limit = SEARCH_LIMIT): { hits: SearchHit[]; more: boolean } {
    const terms = searchTerms(query);
    if (terms.length === 0) return { hits: [], more: false };
    const rows = this.db
      .query<SearchRow, string[]>(searchSql(terms, limit, this.visible()))
      .all(...terms.map((t) => likePattern(t.text)));
    const first = terms[0]?.text ?? "";
    return {
      hits: rows.slice(0, limit).map((r) => toSearchHit(r, first, sectionHeadline(r, title(r)))),
      more: rows.length > limit,
    };
  }

  /** What was done within a work block (including subagents, excluding copies in continued sessions). */
  private activity(sessionId: string, from: number, to: number): Activity {
    const m = this.messageCounts(sessionId, from, to);
    const artifacts = this.artifactCounts(sessionId, from, to);
    return {
      commits: artifacts?.commits ?? 0,
      prs: artifacts?.prs ?? 0,
      merges: artifacts?.merges ?? 0,
      filesEdited: m?.filesEdited ?? 0,
      toolCalls: m?.toolCalls ?? 0,
      subagents: m?.subagents ?? 0,
      toolErrors: m?.toolErrors ?? 0,
      interrupts: m?.interrupts ?? 0,
      apiErrors: m?.apiErrors ?? 0,
      compactions: m?.compactions ?? 0,
      claudeMs: this.claudeMs(sessionId, from, to),
      effort: this.dominantEffort(sessionId, from, to),
    };
  }

  /** The `activity` counts that come from messages (tool calls, edits, errors, ...). */
  private messageCounts(sessionId: string, from: number, to: number): MessageCounts | null {
    return this.db
      .query<MessageCounts, [string, number, number]>(
        `SELECT COALESCE(SUM(kind = 'tool_use'), 0) AS toolCalls,
                COUNT(DISTINCT CASE WHEN kind = 'tool_use' AND tool_name IN (${EDIT_TOOLS}) AND text != ''
                                    THEN text END) AS filesEdited,
                COALESCE(SUM(kind = 'tool_use' AND agent_id IS NULL AND tool_name IN ('Agent', 'Task')), 0) AS subagents,
                COALESCE(SUM(kind = 'tool_result' AND is_error = 1), 0) AS toolErrors,
                COALESCE(SUM(kind = 'interrupt'), 0) AS interrupts,
                COALESCE(SUM(kind = 'error'), 0) AS apiErrors,
                COALESCE(SUM(kind = 'compact'), 0) AS compactions
         FROM messages WHERE session_id = ? AND is_copy = 0 AND ts BETWEEN ? AND ?`,
      )
      .get(sessionId, from, to);
  }

  /** Commits, PRs and merges within a work block, allowing for ones recorded just after it ends. */
  private artifactCounts(sessionId: string, from: number, to: number): ArtifactCounts | null {
    return this.db
      .query<ArtifactCounts, [string, number, number]>(
        `SELECT COALESCE(SUM(kind = 'commit'), 0) AS commits, COALESCE(SUM(kind = 'pr'), 0) AS prs,
                COALESCE(SUM(kind = 'merge'), 0) AS merges
         FROM artifacts WHERE session_id = ? AND is_copy = 0 AND ts BETWEEN ? AND ?`,
      )
      .get(sessionId, from, to + ARTIFACT_GRACE_MS);
  }

  /** Time Claude spent on turns ending inside a work block, or null if none were timed. */
  private claudeMs(sessionId: string, from: number, to: number): number | null {
    // A turn starts and ends within one block, so its end places it
    return (
      this.db
        .query<{ ms: number | null }, [string, number, number]>(
          "SELECT SUM(duration_ms) AS ms FROM turns WHERE session_id = ? AND is_copy = 0 AND ts BETWEEN ? AND ?",
        )
        .get(sessionId, from, to)?.ms ?? null
    );
  }

  /** The effort level behind most of the output in a work block, or null if none was recorded. */
  private dominantEffort(sessionId: string, from: number, to: number): string | null {
    return (
      this.db
        .query<{ effort: string }, [string, number, number]>(
          `SELECT effort FROM usage WHERE session_id = ? AND is_copy = 0 AND effort IS NOT NULL AND ts BETWEEN ? AND ?
         GROUP BY effort ORDER BY SUM(output) DESC LIMIT 1`,
        )
        .get(sessionId, from, to)?.effort ?? null
    );
  }

  /**
   * Token usage (including subagents, excluding copies in continued sessions).
   * With a range, only responses within it. Automatic-run turns are outside work blocks, so blocks never include them.
   */
  private usage(sessionId: string, from = 0, to = Number.MAX_SAFE_INTEGER): Usage | null {
    return sessionUsage(this.db, sessionId, from, to);
  }

  /**
   * Returns the conversation in file order. With `agent`, that subagent's conversation.
   * Copies from the previous session are included only when `copies` is true.
   */
  messages(
    sessionId: string,
    opts: { agent?: string | null; cursor?: string | null; limit?: number; copies?: boolean } = {},
  ): MessagesResponse {
    const limit = Math.min(Math.max(opts.limit ?? MESSAGES_DEFAULT_LIMIT, 1), MESSAGES_MAX_LIMIT);
    const [fileId, seq] = parseCursor(opts.cursor);
    const rows = this.db
      .query<
        {
          id: string;
          file_id: number;
          seq: number;
          ts: number | null;
          kind: MessageKind;
          text: string | null;
          tool_name: string | null;
          tool_use_id: string | null;
          meta: string | null;
          is_error: number;
          is_scheduled: number;
          is_copy: number;
        },
        [string, string | null, number, number, number, number]
      >(
        `SELECT id, file_id, seq, ts, kind, text, tool_name, tool_use_id, meta, is_error, is_scheduled, is_copy
         FROM messages
         WHERE session_id = ?1 AND agent_id IS ?2 AND (is_copy = 0 OR ?5 = 1) AND ${notNote()}
           AND (file_id > ?3 OR (file_id = ?3 AND seq > ?4))
         ORDER BY file_id, seq
         LIMIT ?6`,
      )
      .all(sessionId, opts.agent ?? null, fileId, seq, opts.copies ? 1 : 0, limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      messages: page.map((r) => ({
        id: r.id,
        ts: r.ts,
        kind: r.kind,
        text: r.text,
        toolName: r.tool_name,
        toolUseId: r.tool_use_id,
        detail: r.meta,
        isError: r.is_error === 1,
        isScheduled: r.is_scheduled === 1,
        isCopy: r.is_copy === 1,
      })),
      nextCursor: rows.length > limit && last ? `${last.file_id}:${last.seq}` : null,
    };
  }
}

/** Splits a `fileId:seq` cursor; a missing or malformed one starts from the beginning. */
function parseCursor(cursor: string | null | undefined): [number, number] {
  const m = /^(\d+):(\d+)$/.exec(cursor ?? "");
  return m ? [Number(m[1]), Number(m[2])] : [-1, -1];
}
