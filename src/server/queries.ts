import type { Database } from "bun:sqlite";
import type {
  Activity,
  Artifact,
  CalendarSession,
  MessageKind,
  MessagesResponse,
  Project,
  ProjectUpdate,
  Recap,
  SearchField,
  SearchHit,
  Section,
  SessionDetail,
  Span,
  Subagent,
  Usage,
} from "../shared/api.ts";
import { ARTIFACT_GRACE_MS } from "../shared/constants.ts";
import { isSummarizable } from "../shared/sections.ts";
import { costOf } from "./pricing.ts";
import { loadRecapInput, type RecapTarget, recapHash } from "./summarize/recap.ts";

/** Within this long after the last activity, a session counts as in progress. */
export const ACTIVE_WINDOW_MS = 5 * 60_000;
/** Messages returned per page when the request gives no `limit`. */
export const MESSAGES_DEFAULT_LIMIT = 200;
/** Upper bound on a requested `limit`, so one request cannot pull a whole long session. */
export const MESSAGES_MAX_LIMIT = 1000;
/** Sections returned per search; `more` tells the UI that further ones matched. */
export const SEARCH_LIMIT = 50;
/** Extra terms add little and each one is another scan condition. */
const SEARCH_MAX_TERMS = 5;
/** Search fields, most telling first. A hit reports the first of these that matched. */
const SEARCH_FIELDS: SearchField[] = [
  "headline",
  "summary",
  "pr",
  "commit",
  "title",
  "branch",
  "prompt",
  "reply",
];
const SNIPPET_CHARS = 120;

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

interface UsageRow {
  model: string;
  speed: string | null;
  input: number;
  output: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
}

/** Combines per-model, per-speed totals into one and converts them to cost. */
function toUsage(rows: UsageRow[]): Usage | null {
  if (rows.length === 0) return null;
  const u: Usage = {
    tokens: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    costUsd: 0,
    unpriced: false,
    model: null,
  };
  const outputByModel = new Map<string, number>();
  for (const r of rows) {
    const cacheWrite = r.cache_write_5m + r.cache_write_1h;
    u.input += r.input;
    u.output += r.output;
    u.cacheRead += r.cache_read;
    u.cacheWrite += cacheWrite;
    u.tokens += r.input + r.output + r.cache_read + cacheWrite;
    const cost = costOf(
      r.model,
      {
        input: r.input,
        output: r.output,
        cacheRead: r.cache_read,
        cacheWrite5m: r.cache_write_5m,
        cacheWrite1h: r.cache_write_1h,
      },
      r.speed,
    );
    if (cost === null) u.unpriced = true;
    else u.costUsd += cost;
    outputByModel.set(r.model, (outputByModel.get(r.model) ?? 0) + r.output);
  }
  u.model = [...outputByModel].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return u.tokens > 0 ? u : null;
}

/** The part of `Activity` counted from messages. */
type MessageCounts = Omit<Activity, "commits" | "prs" | "claudeMs" | "effort">;

/** Tools that modify files. The tool_use text (input summary) is the file path. */
const EDIT_TOOLS = "'Edit', 'Write', 'MultiEdit', 'NotebookEdit'";

/** Title: `/rename` name > agent name > Claude Code's automatic title > first line of the first prompt. */
function title(r: {
  custom_title: string | null;
  agent_name: string | null;
  ai_title: string | null;
  first_prompt: string | null;
}): string {
  const first = r.first_prompt?.trim().split("\n")[0]?.slice(0, 120);
  return r.custom_title || r.agent_name || r.ai_title || first || "(Untitled session)";
}

/** A section's headline: its summary's, else the block's own title, else the session's. */
function sectionHeadline(
  g: { headline: string | null; fallback_title: string | null },
  sessionTitle: string,
): string {
  return g.headline ?? g.fallback_title ?? sessionTitle;
}

/** A section's summary body, or null when it has none yet. */
function summaryBody(g: { body: string | null }): string | null {
  // A headline-only section has an empty body; treat it as not summarized yet
  return g.body || null;
}

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
  ) {}

  /**
   * Project list. Only projects with sessions that have user prompts (projects with only headless
   * sessions, e.g. from testing a hook, never show on the calendar, so they are left out of the filter too).
   */
  projects(): Project[] {
    return this.db
      .query<ProjectRow, []>(
        `SELECT id, path, name, repo, color, hidden FROM projects p
         WHERE EXISTS (SELECT 1 FROM sessions s WHERE s.project_id = p.id AND s.prompt_count > 0)
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

  /** Starts of the nearest work blocks before and after [from, to) (from sessions with user prompts). */
  neighbors(from: number, to: number): { prev: number | null; next: number | null } {
    const one = (sql: string, t: number) =>
      this.db.query<{ t: number | null }, [number]>(sql).get(t)?.t ?? null;
    const base = "FROM segments g JOIN sessions s ON s.id = g.session_id WHERE s.prompt_count > 0";
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
         WHERE s.prompt_count > 0 AND g.start < ?2 AND g.end >= ?1
         ORDER BY g.start, g.end`,
      )
      .all(from, to);
  }

  /**
   * Recaps for projects with work starting in [from, to), including ones not written yet. Each is
   * compared with the work as it is now, so one written before more work came in shows as stale.
   */
  recaps(from: number, to: number): Recap[] {
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

  /** Whether the project has work starting in [from, to) to recap. */
  hasRecapWork(target: RecapTarget): boolean {
    return loadRecapInput(this.db, target) !== null;
  }

  /** Sessions with user prompts whose work blocks overlap [from, to). */
  calendar(from: number, to: number): CalendarSession[] {
    const rows = this.db
      .query<SessionRow, [number, number]>(
        `SELECT s.* FROM sessions s
         WHERE s.prompt_count > 0
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
        title: fallback,
        startedAt: r.started_at ?? 0,
        endedAt: r.ended_at ?? 0,
        promptCount: r.prompt_count,
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
        "SELECT kind, ref, title, ts FROM artifacts WHERE session_id = ? AND is_copy = 0 ORDER BY ts",
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
   * Each term may match a different place; the hit reports the most telling place the first term matched.
   * A plain LIKE scan: on a year of real logs this takes tens of milliseconds, so no FTS index is needed.
   */
  search(query: string, limit = SEARCH_LIMIT): { hits: SearchHit[]; more: boolean } {
    const terms = searchTerms(query);
    if (terms.length === 0) return { hits: [], more: false };
    const rows = this.db
      .query<SearchRow, string[]>(searchSql(terms.length, limit))
      .all(...terms.map(likePattern));
    const first = terms[0] ?? "";
    return {
      hits: rows.slice(0, limit).map((r) => toSearchHit(r, first)),
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

  /** Commits and PRs within a work block, allowing for ones recorded just after it ends. */
  private artifactCounts(
    sessionId: string,
    from: number,
    to: number,
  ): { commits: number; prs: number } | null {
    return this.db
      .query<{ commits: number; prs: number }, [string, number, number]>(
        `SELECT COALESCE(SUM(kind = 'commit'), 0) AS commits, COALESCE(SUM(kind = 'pr'), 0) AS prs
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
    return toUsage(
      this.db
        .query<UsageRow, [string, number, number]>(
          `SELECT model, speed, SUM(input) AS input, SUM(output) AS output, SUM(cache_read) AS cache_read,
                  SUM(cache_write_5m) AS cache_write_5m, SUM(cache_write_1h) AS cache_write_1h
           FROM usage WHERE session_id = ? AND is_copy = 0 AND COALESCE(ts, 0) BETWEEN ? AND ?
           GROUP BY model, speed`,
        )
        .all(sessionId, from, to),
    );
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
         WHERE session_id = ?1 AND agent_id IS ?2 AND (is_copy = 0 OR ?5 = 1)
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

/** About SNIPPET_CHARS of `text` around the first occurrence of `term`, on one line. */
export function excerpt(text: string, term: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const at = Math.max(0, flat.toLowerCase().indexOf(term));
  const from = Math.max(0, at - Math.floor(SNIPPET_CHARS / 3));
  const to = Math.min(flat.length, from + SNIPPET_CHARS);
  return `${from > 0 ? "…" : ""}${flat.slice(from, to)}${to < flat.length ? "…" : ""}`;
}

/** Splits a `fileId:seq` cursor; a missing or malformed one starts from the beginning. */
function parseCursor(cursor: string | null | undefined): [number, number] {
  const m = /^(\d+):(\d+)$/.exec(cursor ?? "");
  return m ? [Number(m[1]), Number(m[2])] : [-1, -1];
}

/** Every place a section can match, as (session, section start, field, text) rows. */
const SEARCH_SOURCES = `
      SELECT g.session_id AS sid, g.start, 'headline' AS field, COALESCE(sm.headline, g.fallback_title) AS text
        FROM segments g LEFT JOIN summaries sm ON sm.session_id = g.session_id AND sm.start = g.start
      UNION ALL
      SELECT session_id, start, 'summary', body FROM summaries WHERE body != ''
      UNION ALL
      SELECT g.session_id, g.start, 'title',
             COALESCE(s.custom_title, '') || char(10) || COALESCE(s.agent_name, '') || char(10) ||
             COALESCE(s.ai_title, '') || char(10) || COALESCE(s.label, '')
        FROM segments g JOIN sessions s ON s.id = g.session_id
      UNION ALL
      SELECT g.session_id, g.start, 'branch', s.branch
        FROM segments g JOIN sessions s ON s.id = g.session_id WHERE s.branch != 'HEAD'
      UNION ALL
      SELECT g.session_id, g.start, a.kind, COALESCE(a.title, '') || char(10) || a.ref
        FROM artifacts a JOIN segments g ON g.session_id = a.session_id
         AND a.ts BETWEEN g.start AND g.end + ${ARTIFACT_GRACE_MS}
       WHERE a.is_copy = 0
      UNION ALL
      SELECT g.session_id, g.start, CASE m.kind WHEN 'prompt' THEN 'prompt' ELSE 'reply' END, m.text
        FROM messages m JOIN segments g ON g.session_id = m.session_id AND m.ts BETWEEN g.start AND g.end
       WHERE m.kind IN ('prompt', 'assistant') AND m.agent_id IS NULL AND m.is_copy = 0`;

/** CASE arms ordering fields by `SEARCH_FIELDS`, so the most telling match comes first. */
const SEARCH_FIELD_RANK = SEARCH_FIELDS.map((f, i) => `WHEN '${f}' THEN ${i}`).join(" ");

/** A matching section with the session fields its headline falls back to. */
interface SearchRow {
  sid: string;
  start: number;
  end: number;
  project_id: number | null;
  label: string | null;
  headline: string | null;
  fallback_title: string | null;
  custom_title: string | null;
  agent_name: string | null;
  ai_title: string | null;
  first_prompt: string | null;
  field: SearchField;
  text: string;
}

/** The query's lowercased, space-separated terms, up to `SEARCH_MAX_TERMS`. */
function searchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, SEARCH_MAX_TERMS);
}

/** A LIKE pattern matching `term` anywhere, with LIKE's wildcards and escape character escaped. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Search SQL for `termCount` terms bound as ?1..?n (from `likePattern`). Only the term count and
 * the internal `limit` shape the SQL; the terms themselves are always bound parameters.
 */
function searchSql(termCount: number, limit: number): string {
  const conds = Array.from(
    { length: termCount },
    (_, i) => `MAX(lower(src.text) LIKE ?${i + 1} ESCAPE '\\')`,
  ).join(" AND ");
  return `WITH src AS (${SEARCH_SOURCES}),
         matched AS (
           SELECT src.sid, src.start FROM src
           JOIN sessions s ON s.id = src.sid AND s.prompt_count > 0
           GROUP BY src.sid, src.start HAVING ${conds}
         ),
         best AS (
           SELECT src.sid, src.start, src.field, src.text,
                  ROW_NUMBER() OVER (PARTITION BY src.sid, src.start
                                     ORDER BY CASE src.field ${SEARCH_FIELD_RANK} END) AS n
           FROM src JOIN matched USING (sid, start)
           WHERE lower(src.text) LIKE ?1 ESCAPE '\\'
         )
         SELECT b.sid, b.start, g.end, s.project_id, s.label, sm.headline, g.fallback_title,
                s.custom_title, s.agent_name, s.ai_title, s.first_prompt, b.field, b.text
         FROM best b
         JOIN segments g ON g.session_id = b.sid AND g.start = b.start
         JOIN sessions s ON s.id = b.sid
         LEFT JOIN summaries sm ON sm.session_id = b.sid AND sm.start = b.start
         WHERE b.n = 1
         ORDER BY b.start DESC
         LIMIT ${limit + 1}`;
}

/** A search row as the API reports it, with a snippet around `firstTerm` unless the headline matched. */
function toSearchHit(r: SearchRow, firstTerm: string): SearchHit {
  return {
    sessionId: r.sid,
    projectId: r.project_id,
    label: r.label,
    start: r.start,
    end: r.end,
    headline: sectionHeadline(r, title(r)),
    field: r.field,
    snippet: r.field === "headline" ? "" : excerpt(r.text, firstTerm),
  };
}
