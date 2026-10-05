import type { Database } from "bun:sqlite";
import type {
  Artifact,
  CalendarSession,
  MessageKind,
  MessagesResponse,
  Project,
  ProjectUpdate,
  SessionDetail,
  Subagent,
  Summary,
} from "../shared/api.ts";

/** 最後の活動からこの時間以内なら「作業中」とみなす。 */
export const ACTIVE_WINDOW_MS = 5 * 60_000;
export const MESSAGES_DEFAULT_LIMIT = 200;
export const MESSAGES_MAX_LIMIT = 1000;

interface ProjectRow {
  id: number;
  path: string;
  name: string;
  color: string | null;
  hidden: number;
}

const toProject = (r: ProjectRow): Project => ({ ...r, hidden: r.hidden === 1 });

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
  ) {}

  projects(): Project[] {
    return this.db
      .query<ProjectRow, []>(
        "SELECT id, path, name, color, hidden FROM projects ORDER BY name, path",
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
        "SELECT id, path, name, color, hidden FROM projects WHERE id = ?",
      )
      .get(id);
    return row ? toProject(row) : null;
  }

  /** 作業ブロックが [from, to) と重なる、人の発言があるセッション。 */
  calendar(from: number, to: number): CalendarSession[] {
    const rows = this.db
      .query<
        {
          id: string;
          project_id: number | null;
          label: string | null;
          custom_title: string | null;
          agent_name: string | null;
          ai_title: string | null;
          first_prompt: string | null;
          headline: string | null;
          started_at: number;
          ended_at: number;
          prompt_count: number;
        },
        [number, number]
      >(
        `SELECT s.id, s.project_id, s.label, s.custom_title, s.agent_name, s.ai_title, s.first_prompt,
                sm.headline, s.started_at, s.ended_at, s.prompt_count
         FROM sessions s LEFT JOIN summaries sm ON sm.session_id = s.id
         WHERE s.prompt_count > 0
           AND EXISTS (SELECT 1 FROM segments g WHERE g.session_id = s.id AND g.start < ?2 AND g.end >= ?1)
         ORDER BY s.started_at`,
      )
      .all(from, to);
    if (rows.length === 0) return [];

    const segments = new Map<string, [number, number][]>();
    const segQuery = this.db.query<{ start: number; end: number }, [string, number, number]>(
      "SELECT start, end FROM segments WHERE session_id = ?1 AND start < ?3 AND end >= ?2 ORDER BY start",
    );
    for (const r of rows) {
      segments.set(
        r.id,
        segQuery.all(r.id, from, to).map((g) => [g.start, g.end]),
      );
    }
    const now = this.now();
    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      label: r.label,
      title: title(r),
      headline: r.headline,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      promptCount: r.prompt_count,
      active: now - r.ended_at < ACTIVE_WINDOW_MS,
      segments: segments.get(r.id) ?? [],
    }));
  }

  session(id: string): SessionDetail | null {
    const s = this.db
      .query<
        {
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
        },
        [string]
      >("SELECT * FROM sessions WHERE id = ?")
      .get(id);
    if (!s) return null;

    const project = s.project_id
      ? this.db
          .query<ProjectRow, [number]>(
            "SELECT id, path, name, color, hidden FROM projects WHERE id = ?",
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
        `SELECT id, agent_type AS agentType, description, tool_use_id AS toolUseId
         FROM subagents WHERE session_id = ? ORDER BY rowid`,
      )
      .all(id);
    const prev = this.db
      .query<{ id: string }, [string]>("SELECT id FROM sessions WHERE continued_in = ? LIMIT 1")
      .get(id);

    return {
      id: s.id,
      project: project ? toProject(project) : null,
      launchCwd: s.launch_cwd,
      label: s.label,
      branch: s.branch,
      title: title(s),
      summary: this.summary(id, s.ended_at),
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
    };
  }

  private summary(id: string, endedAt: number | null): Summary | null {
    const r = this.db
      .query<
        {
          headline: string;
          body: string;
          model: string;
          covered_until: number | null;
          created_at: number;
        },
        [string]
      >(
        "SELECT headline, body, model, covered_until, created_at FROM summaries WHERE session_id = ?",
      )
      .get(id);
    if (!r) return null;
    return {
      headline: r.headline,
      body: r.body,
      model: r.model,
      coveredUntil: r.covered_until,
      createdAt: r.created_at,
      stale: endedAt !== null && (r.covered_until ?? 0) < endedAt,
    };
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
