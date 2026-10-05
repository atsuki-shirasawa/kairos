import type { Database } from "bun:sqlite";
import type {
  Activity,
  Artifact,
  CalendarSession,
  MessageKind,
  MessagesResponse,
  Project,
  ProjectUpdate,
  Section,
  SessionDetail,
  Span,
  Subagent,
  Usage,
} from "../shared/api.ts";
import { ARTIFACT_GRACE_MS } from "../shared/constants.ts";
import { isSummarizable } from "../shared/sections.ts";
import { costOf } from "./pricing.ts";

/** 最後の活動からこの時間以内なら「作業中」とみなす。 */
export const ACTIVE_WINDOW_MS = 5 * 60_000;
export const MESSAGES_DEFAULT_LIMIT = 200;
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

export interface SummaryState {
  isPending(sessionId: string, start: number): boolean;
  errorOf(sessionId: string, start: number): string | null;
}

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

/** セクションと、あればその要約。 */
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

/** モデル・速度ごとの合計を 1 つにまとめ、料金を換算する。 */
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

/** ファイルを書き換えるツール。tool_use の text（入力の要約）がファイルパスになる。 */
const EDIT_TOOLS = "'Edit', 'Write', 'MultiEdit', 'NotebookEdit'";

/** タイトル: `/rename` の名前 > エージェント名 > Claude Code の自動タイトル > 最初の発言の 1 行目。 */
function title(r: {
  custom_title: string | null;
  agent_name: string | null;
  ai_title: string | null;
  first_prompt: string | null;
}): string {
  const first = r.first_prompt?.trim().split("\n")[0]?.slice(0, 120);
  return r.custom_title || r.agent_name || r.ai_title || first || "（無題のセッション）";
}

export class Queries {
  constructor(
    private readonly db: Database,
    private readonly now: () => number = Date.now,
    /** 要約の進み具合（Summarizer が答える）。 */
    private readonly summaries: SummaryState = { isPending: () => false, errorOf: () => null },
  ) {}

  /**
   * プロジェクト一覧。人の発言があるセッションを持つものだけ（hook の動作確認などで
   * headless のセッションしかないプロジェクトは、カレンダーに出ないので絞り込みにも出さない）。
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

  updateProject(id: number, update: ProjectUpdate): Project | null {
    if (update.color !== undefined) {
      this.db.query("UPDATE projects SET color = ? WHERE id = ?").run(update.color, id);
    }
    if (update.hidden !== undefined) {
      this.db.query("UPDATE projects SET hidden = ? WHERE id = ?").run(update.hidden ? 1 : 0, id);
    }
    const row = this.db
      .query<ProjectRow, [number]>(
        "SELECT id, path, name, repo, color, hidden FROM projects WHERE id = ?",
      )
      .get(id);
    return row ? toProject(row) : null;
  }

  /** [from, to) の前後で、いちばん近い作業ブロックの開始（人の発言があるセッションのもの）。 */
  neighbors(from: number, to: number): { prev: number | null; next: number | null } {
    const one = (sql: string, t: number) =>
      this.db.query<{ t: number | null }, [number]>(sql).get(t)?.t ?? null;
    const base = "FROM segments g JOIN sessions s ON s.id = g.session_id WHERE s.prompt_count > 0";
    return {
      prev: one(`SELECT MAX(g.start) AS t ${base} AND g.end < ?`, from),
      next: one(`SELECT MIN(g.start) AS t ${base} AND g.start >= ?`, to),
    };
  }

  /** [from, to) と重なる作業ブロックの時刻。重なりの判定は `calendar` と同じにする。 */
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

  /** 作業ブロックが [from, to) と重なる、人の発言があるセッション。 */
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
        active: r.ended_at !== null && now - r.ended_at < ACTIVE_WINDOW_MS,
        segments: segQuery.all(r.id, from, to).map((g) => ({
          start: g.start,
          end: g.end,
          headline: g.headline ?? g.fallback_title ?? fallback,
          summarized: g.headline !== null,
          promptCount: g.prompt_count,
          usage: this.usage(r.id, g.start, g.end),
          activity: this.activity(r.id, g.start, g.end),
        })),
      };
    });
  }

  session(id: string): SessionDetail | null {
    const s = this.db.query<SessionRow, [string]>("SELECT * FROM sessions WHERE id = ?").get(id);
    if (!s) return null;

    const project = s.project_id
      ? this.db
          .query<ProjectRow, [number]>(
            "SELECT id, path, name, repo, color, hidden FROM projects WHERE id = ?",
          )
          .get(s.project_id)
      : null;
    const artifacts = this.db
      .query<Artifact, [string]>(
        "SELECT kind, ref, title, ts FROM artifacts WHERE session_id = ? AND is_copy = 0 ORDER BY ts",
      )
      .all(id);
    const subagents = this.db
      .query<Subagent, [string]>(
        `SELECT a.id, a.agent_type AS agentType, a.description, a.tool_use_id AS toolUseId,
                MIN(m.ts) AS startedAt, MAX(m.ts) AS endedAt
         FROM subagents a LEFT JOIN messages m ON m.session_id = a.session_id AND m.agent_id = a.id
         WHERE a.session_id = ? GROUP BY a.id ORDER BY startedAt`,
      )
      .all(id);
    const prev = this.db
      .query<{ id: string }, [string]>("SELECT id FROM sessions WHERE continued_in = ? LIMIT 1")
      .get(id);
    const fallback = title(s);
    const sections = this.db
      .query<SectionRow, [string]>(`${SECTION_SELECT} WHERE g.session_id = ? ORDER BY g.start`)
      .all(id)
      .map(
        (g): Section => ({
          start: g.start,
          end: g.end,
          promptCount: g.prompt_count,
          headline: g.headline ?? g.fallback_title ?? fallback,
          // 見出しだけを作ったセクションは本文が空。要約はまだないものとして扱う
          body: g.body || null,
          model: g.model,
          createdAt: g.created_at,
          stale: g.covered_until !== null && g.covered_until < g.end,
          summarizable: isSummarizable({ start: g.start, end: g.end, promptCount: g.prompt_count }),
          pending: this.summaries.isPending(id, g.start),
          error: this.summaries.errorOf(id, g.start),
          usage: this.usage(id, g.start, g.end),
          activity: this.activity(id, g.start, g.end),
        }),
      );

    return {
      id: s.id,
      project: project ? toProject(project) : null,
      launchCwd: s.launch_cwd,
      label: s.label,
      branch: s.branch,
      title: fallback,
      sections,
      awaySummary: s.away_summary,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      active: s.ended_at !== null && this.now() - s.ended_at < ACTIVE_WINDOW_MS,
      promptCount: s.prompt_count,
      scheduledRuns: s.scheduled_runs,
      continuedFrom: prev?.id ?? null,
      continuedIn: s.continued_in,
      commits: artifacts.filter((a) => a.kind === "commit"),
      prs: artifacts.filter((a) => a.kind === "pr"),
      subagents,
      usage: this.usage(id),
    };
  }

  /** 作業ブロックの中でしたこと（サブエージェントの分を含み、続きのセッションのコピーは除く）。 */
  private activity(sessionId: string, from: number, to: number): Activity {
    const m = this.db
      .query<Omit<Activity, "commits" | "prs" | "claudeMs" | "effort">, [string, number, number]>(
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
    const artifacts = this.db
      .query<{ commits: number; prs: number }, [string, number, number]>(
        `SELECT COALESCE(SUM(kind = 'commit'), 0) AS commits, COALESCE(SUM(kind = 'pr'), 0) AS prs
         FROM artifacts WHERE session_id = ? AND is_copy = 0 AND ts BETWEEN ? AND ?`,
      )
      .get(sessionId, from, to + ARTIFACT_GRACE_MS);
    // ターンの終わりがこのブロックの中にあるもの。ターンはブロックの中で始まって終わる
    const turns = this.db
      .query<{ ms: number | null }, [string, number, number]>(
        "SELECT SUM(duration_ms) AS ms FROM turns WHERE session_id = ? AND is_copy = 0 AND ts BETWEEN ? AND ?",
      )
      .get(sessionId, from, to);
    const effort = this.db
      .query<{ effort: string }, [string, number, number]>(
        `SELECT effort FROM usage WHERE session_id = ? AND is_copy = 0 AND effort IS NOT NULL AND ts BETWEEN ? AND ?
         GROUP BY effort ORDER BY SUM(output) DESC LIMIT 1`,
      )
      .get(sessionId, from, to);
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
      claudeMs: turns?.ms ?? null,
      effort: effort?.effort ?? null,
    };
  }

  /**
   * トークン使用量（サブエージェントを含み、続きのセッションのコピーは除く）。
   * 期間を指定すると、その時間内の応答だけ。自動実行のターンは作業ブロックの外なので、ブロックの分には入らない。
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
   * 会話をファイル内の順に返す。`agent` を指定するとそのサブエージェントの会話。
   * 前のセッションからのコピーは `copies` を真にしたときだけ含める。
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

function parseCursor(cursor: string | null | undefined): [number, number] {
  const m = /^(\d+):(\d+)$/.exec(cursor ?? "");
  return m ? [Number(m[1]), Number(m[2])] : [-1, -1];
}
