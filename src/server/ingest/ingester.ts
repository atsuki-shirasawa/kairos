import type { Database, Statement } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { classifyUser, commandText } from "./classify.ts";
import { extractCommit, GIT_COMMIT_RE } from "./commits.ts";
import { resolveProject, worktreeName } from "./project.ts";
import { readNewLines } from "./reader.ts";
import {
  clip,
  contentText,
  isRec,
  list,
  parseTs,
  type Rec,
  rec,
  str,
  toolResultText,
} from "./records.ts";
import { DEFAULT_GAP_MS, toSegments } from "./segments.ts";

/** 解釈ルールを変えたら上げる。上がると、元ログが残っているファイルは読み直される。 */
export const PARSER_VERSION = 2;
/**
 * messages から計算する派生データ（集計・作業ブロック）の計算方法を変えたら上げる。
 * 上がると全セッションを計算し直す。元ログが消えたセッションも DB の messages から作り直せる。
 */
export const DERIVED_VERSION = 2;
const FALLBACK_TITLE_CHARS = 120;

const LIMIT = { text: 20_000, toolInput: 4_000, toolResult: 4_000, short: 2_000 };
const RECAP_SUFFIX = /\s*\(disable recaps in \/config\)\s*$/;

export type LogFile =
  | { kind: "session"; sessionId: string }
  | { kind: "subagent"; sessionId: string; agentId: string }
  | { kind: "subagent-meta"; sessionId: string; agentId: string };

/** projects ディレクトリからの相対位置で、ファイルの種類を判定する。 */
export function classifyPath(projectsDir: string, path: string): LogFile | null {
  const parts = relative(projectsDir, path).split(sep);
  if (parts.length === 2 && parts[1]?.endsWith(".jsonl")) {
    return { kind: "session", sessionId: parts[1].slice(0, -".jsonl".length) };
  }
  if (parts.length === 4 && parts[2] === "subagents" && parts[1]) {
    const m = /^agent-(.+?)(\.jsonl|\.meta\.json)$/.exec(parts[3] ?? "");
    if (m?.[1]) {
      const kind = m[2] === ".jsonl" ? "subagent" : "subagent-meta";
      return { kind, sessionId: parts[1], agentId: m[1] };
    }
  }
  return null;
}

/** ファイルをまたいで引き継ぐ解釈の状態。ingest_state.state に JSON で保存する。 */
interface FileState {
  /** 自動実行（/loop・cron）が起こしたターンの最中か。 */
  autoTurn: boolean;
  /** 結果待ちの git commit。tool_use id → コマンド。 */
  pendingCommits: Record<string, string>;
}

interface Ctx {
  sessionId: string;
  agentId: string | null;
  fileId: number;
  state: FileState;
  launchKnown: boolean;
  branchKnown: boolean;
}

interface ActivityRow {
  ts: number;
  is_scheduled: number;
  kind: string;
  text: string | null;
}

interface StateRow {
  id: number;
  offset: number;
  ino: number | null;
  parser_version: number;
  state: string;
}

export interface ScanStats {
  files: number;
  changed: number;
  sessions: Set<string>;
  ms: number;
}

export class Ingester {
  private readonly q: ReturnType<typeof prepareStatements>;
  private readonly setters: Record<SessionField, Statement>;

  constructor(
    private readonly db: Database,
    readonly projectsDir: string,
    private readonly gapMs = DEFAULT_GAP_MS,
  ) {
    this.q = prepareStatements(db);
    this.setters = Object.fromEntries(
      SESSION_FIELDS.map((col) => [col, db.prepare(`UPDATE sessions SET ${col} = ? WHERE id = ?`)]),
    ) as Record<SessionField, Statement>;
  }

  // ---------------------------------------------------------------- 走査

  /** projects 配下の全ファイルを取り込む。セッション本体 → サブエージェントの順に処理する。 */
  scan(onProgress?: (done: number, total: number) => void): ScanStats {
    const started = performance.now();
    this.refreshAllIfOutdated();
    const files = this.listFiles();
    const sessions = new Set<string>();
    let changed = 0;
    files.forEach((path, i) => {
      const touched = this.ingestFile(path);
      for (const sid of touched) sessions.add(sid);
      if (touched.length) changed += 1;
      onProgress?.(i + 1, files.length);
    });
    return { files: files.length, changed, sessions, ms: performance.now() - started };
  }

  /**
   * scan と同じだが、一定時間ごとに処理を手放してサーバーの応答を止めない。
   * 起動直後の初回取り込み（数秒かかる）をバックグラウンドで進めるのに使う。
   */
  async scanAsync(
    onProgress?: (done: number, total: number) => void,
    sliceMs = 30,
  ): Promise<ScanStats> {
    const started = performance.now();
    this.refreshAllIfOutdated();
    const files = this.listFiles();
    const sessions = new Set<string>();
    let changed = 0;
    let sliceStart = performance.now();
    for (const [i, path] of files.entries()) {
      const touched = this.ingestFile(path);
      for (const sid of touched) sessions.add(sid);
      if (touched.length) changed += 1;
      if (performance.now() - sliceStart > sliceMs) {
        onProgress?.(i + 1, files.length);
        await Bun.sleep(0);
        sliceStart = performance.now();
      }
    }
    onProgress?.(files.length, files.length);
    return { files: files.length, changed, sessions, ms: performance.now() - started };
  }

  listFiles(): string[] {
    if (!existsSync(this.projectsDir)) return [];
    const main: string[] = [];
    const sub: string[] = [];
    for (const proj of readdirSync(this.projectsDir, { withFileTypes: true })) {
      if (!proj.isDirectory()) continue;
      const projDir = join(this.projectsDir, proj.name);
      for (const entry of readdirSync(projDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".jsonl")) main.push(join(projDir, entry.name));
        if (!entry.isDirectory()) continue;
        const subDir = join(projDir, entry.name, "subagents");
        if (!existsSync(subDir)) continue;
        for (const f of readdirSync(subDir)) {
          if (f.endsWith(".jsonl") || f.endsWith(".meta.json")) sub.push(join(subDir, f));
        }
      }
    }
    return [...main.sort(), ...sub.sort()];
  }

  // ---------------------------------------------------------------- 1 ファイル

  /** ファイルの追記分を取り込み、表示が変わりうるセッションの ID を返す（変化がなければ空）。 */
  ingestFile(path: string): string[] {
    const file = classifyPath(this.projectsDir, path);
    if (!file || !existsSync(path)) return [];
    if (file.kind === "subagent-meta")
      return this.ingestSubagentMeta(path, file.sessionId, file.agentId);
    const agentId = file.kind === "subagent" ? file.agentId : null;

    let st = this.q.getState.get(path) as StateRow | null;
    if (st && st.parser_version !== PARSER_VERSION) {
      this.q.deleteState.run(st.id); // messages・artifacts も消える（ON DELETE CASCADE）
      st = null;
    }
    const res = readNewLines(path, st?.offset ?? 0, st?.ino ?? null);
    if (st && !res.restarted && res.lines.length === 0) return [];

    const touched = [file.sessionId];
    this.db.transaction(() => {
      this.q.ensureSession.run(file.sessionId);
      let fileId: number;
      let state: FileState = { autoTurn: false, pendingCommits: {} };
      if (st) {
        fileId = st.id;
        if (res.restarted) {
          this.q.clearFile.run(fileId);
          this.q.clearFileArtifacts.run(fileId);
        } else {
          state = { ...state, ...(JSON.parse(st.state) as Partial<FileState>) };
        }
      } else {
        const row = this.q.insertState.get(path, file.sessionId, agentId, PARSER_VERSION) as {
          id: number;
        };
        fileId = row.id;
      }
      const info = this.q.sessionInfo.get(file.sessionId) as {
        launch_cwd: string | null;
        branch: string | null;
      };
      const ctx: Ctx = {
        sessionId: file.sessionId,
        agentId,
        fileId,
        state,
        launchKnown: agentId !== null || info.launch_cwd !== null,
        branchKnown: agentId !== null || info.branch !== null,
      };
      for (const line of res.lines) {
        let r: unknown;
        try {
          r = JSON.parse(line.text);
        } catch {
          continue; // 完全な行で壊れているものは読み飛ばす
        }
        if (isRec(r)) this.handle(ctx, r, line.offset * 16);
      }
      this.q.saveState.run(
        res.nextOffset,
        res.size,
        res.ino,
        PARSER_VERSION,
        JSON.stringify(ctx.state),
        fileId,
      );
      if (agentId !== null) return;
      this.refreshSession(file.sessionId);
      // 続きのセッションが先に取り込まれていたら、どこまでがコピーかがここで分かる
      const next = this.q.continuedIn.get(file.sessionId) as { id: string } | null;
      if (next) {
        this.refreshSession(next.id);
        touched.push(next.id);
      }
    })();
    return touched;
  }

  private ingestSubagentMeta(path: string, sessionId: string, agentId: string): string[] {
    let meta: unknown;
    try {
      meta = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return [];
    }
    const m = rec(meta) ?? {};
    this.q.ensureSession.run(sessionId);
    this.q.upsertSubagent.run(
      agentId,
      sessionId,
      str(m.agentType) ?? null,
      str(m.description) ?? null,
      str(m.toolUseId) ?? null,
    );
    return []; // カレンダーの表示は変わらないので、更新扱いにしない
  }

  // ---------------------------------------------------------------- レコード

  private handle(ctx: Ctx, r: Rec, seq: number): void {
    const sid = str(r.sessionId);
    if (sid && sid !== ctx.sessionId) return; // 別セッションのレコード（念のため。現行の形式では現れない）
    const ts = parseTs(r.timestamp);
    const main = ctx.agentId === null;

    if (main && !ctx.launchKnown && str(r.cwd)) this.setLaunch(ctx, str(r.cwd) ?? "");
    if (main && !ctx.branchKnown && str(r.gitBranch)) {
      this.q.setBranch.run(str(r.gitBranch) ?? null, ctx.sessionId);
      ctx.branchKnown = true;
    }

    switch (r.type) {
      case "user":
        this.handleUser(ctx, r, ts, seq);
        return;
      case "assistant":
        this.handleAssistant(ctx, r, ts, seq);
        return;
      case "system":
        this.handleSystem(ctx, r, ts, seq);
        return;
    }
    if (!main) return;
    switch (r.type) {
      case "ai-title":
        this.set(ctx, "ai_title", str(r.aiTitle));
        return;
      case "agent-name":
        this.set(ctx, "agent_name", str(r.agentName));
        return;
      case "custom-title":
        this.set(ctx, "custom_title", str(r.customTitle));
        return;
      case "continued-in":
        this.set(ctx, "continued_in", str(r.continuedInSessionId));
        return;
      case "worktree-state":
        this.set(ctx, "label", str(rec(r.worktreeSession)?.worktreeName));
        return;
      case "relocated":
        this.set(ctx, "label", worktreeName(str(r.relocatedCwd) ?? "") ?? undefined);
        return;
      case "pr-link": {
        const url = str(r.prUrl);
        if (!url) return;
        const num = typeof r.prNumber === "number" ? `#${r.prNumber}` : null;
        const title = [num, str(r.prRepository)].filter(Boolean).join(" ") || null;
        this.q.insertArtifact.run(ctx.sessionId, "pr", url, title, ts, ctx.fileId);
        return;
      }
    }
  }

  private handleUser(ctx: Ctx, r: Rec, ts: number | null, seq: number): void {
    let kind = classifyUser(r);
    if (kind === "scheduled") ctx.state.autoTurn = true;
    else if (kind === "prompt" || kind === "command") ctx.state.autoTurn = false;
    // サブエージェントへの指示は origin を持たないので、ここで「指示」として扱う
    if (ctx.agentId !== null && kind === "meta") kind = "prompt";

    const id = str(r.uuid) ?? `${ctx.fileId}:${seq}`;
    const content = rec(r.message)?.content;
    const text = contentText(content);
    switch (kind) {
      case "prompt":
        this.insert(ctx, id, seq, ts, kind, clip(text.trim(), LIMIT.text));
        return;
      case "command":
        this.insert(ctx, id, seq, ts, kind, commandText(text));
        return;
      case "scheduled":
      case "interrupt":
      case "notification":
        this.insert(ctx, id, seq, ts, kind, clip(text.trim(), LIMIT.short));
        return;
      case "peer":
        this.insert(ctx, id, seq, ts, kind, clip(str(rec(r.origin)?.body) ?? text, LIMIT.short));
        return;
      case "tool_result":
        this.handleToolResults(ctx, r, id, ts, seq);
        return;
      // compact_summary・meta は保存しない
    }
  }

  private handleToolResults(ctx: Ctx, r: Rec, id: string, ts: number | null, seq: number): void {
    const result = rec(r.toolUseResult);
    const interrupted = result?.interrupted === true;
    list(rec(r.message)?.content).forEach((b, i) => {
      const block = rec(b);
      if (block?.type !== "tool_result") return;
      const toolUseId = str(block.tool_use_id) ?? null;
      const isError = block.is_error === true;
      const output = toolResultText(block.content);
      this.insert(ctx, `${id}:${i}`, seq + i, ts, "tool_result", clip(output, LIMIT.toolResult), {
        toolUseId,
        isError,
      });
      const command = toolUseId ? ctx.state.pendingCommits[toolUseId] : undefined;
      if (!toolUseId || command === undefined) return;
      delete ctx.state.pendingCommits[toolUseId];
      const commit = isError || interrupted ? null : extractCommit(command, output);
      if (!commit) return;
      // SHA が分からないときは件名で識別する（同じ件名の重複は 1 件にまとまる）
      const ref = commit.sha ?? `subject:${commit.subject}`;
      this.q.insertArtifact.run(ctx.sessionId, "commit", ref, commit.subject, ts, ctx.fileId);
    });
  }

  private handleAssistant(ctx: Ctx, r: Rec, ts: number | null, seq: number): void {
    const msg = rec(r.message) ?? {};
    const id = str(r.uuid) ?? `${ctx.fileId}:${seq}`;
    if (msg.model === "<synthetic>" || r.isApiErrorMessage) {
      this.insert(ctx, id, seq, ts, "error", clip(contentText(msg.content), LIMIT.short));
      return;
    }
    list(msg.content).forEach((b, i) => {
      const block = rec(b);
      if (!block) return;
      if (block.type === "text") {
        const text = (str(block.text) ?? "").trim();
        if (text) this.insert(ctx, `${id}:${i}`, seq + i, ts, "assistant", clip(text, LIMIT.text));
      } else if (block.type === "tool_use") {
        const name = str(block.name) ?? "";
        const input = rec(block.input) ?? {};
        const toolUseId = str(block.id) ?? null;
        this.insert(ctx, `${id}:${i}`, seq + i, ts, "tool_use", inputSummary(input), {
          toolName: name,
          toolUseId,
          meta: clip(JSON.stringify(input, null, 2), LIMIT.toolInput),
        });
        const command = str(input.command) ?? "";
        if (name === "Bash" && toolUseId && GIT_COMMIT_RE.test(command)) {
          ctx.state.pendingCommits[toolUseId] = command.slice(0, LIMIT.short);
        }
      }
      // thinking は保存しない
    });
  }

  private handleSystem(ctx: Ctx, r: Rec, ts: number | null, seq: number): void {
    const id = str(r.uuid) ?? `${ctx.fileId}:${seq}`;
    if (r.subtype === "compact_boundary") {
      const meta = rec(r.compactMetadata);
      this.insert(ctx, id, seq, ts, "compact", "Conversation compacted", {
        meta: meta ? JSON.stringify(meta) : null,
      });
    } else if (r.subtype === "away_summary" && ctx.agentId === null) {
      this.set(ctx, "away_summary", str(r.content)?.replace(RECAP_SUFFIX, ""));
    }
  }

  // ---------------------------------------------------------------- 書き込み

  private insert(
    ctx: Ctx,
    id: string,
    seq: number,
    ts: number | null,
    kind: string,
    text: string | null,
    opt: {
      toolName?: string;
      toolUseId?: string | null;
      isError?: boolean;
      meta?: string | null;
    } = {},
  ): void {
    this.q.insertMessage.run(
      id,
      ctx.sessionId,
      ctx.agentId,
      ctx.fileId,
      seq,
      ts,
      kind,
      text,
      opt.toolName ?? null,
      opt.toolUseId ?? null,
      opt.isError ? 1 : 0,
      ctx.state.autoTurn ? 1 : 0,
      opt.meta ?? null,
    );
  }

  private set(ctx: Ctx, col: SessionField, value: string | undefined): void {
    if (value) this.setters[col].run(value, ctx.sessionId);
  }

  private setLaunch(ctx: Ctx, cwd: string): void {
    const project = resolveProject(cwd);
    const row = this.q.upsertProject.get(project.path, project.name) as { id: number };
    this.q.setLaunch.run(cwd, row.id, project.label, ctx.sessionId);
    ctx.launchKnown = true;
  }

  /** 集計値と作業ブロックを messages から計算し直す。 */
  refreshSession(sessionId: string): void {
    if (this.q.hasPredecessor.get(sessionId)) {
      this.q.markCopiedMessages.run(sessionId);
      this.q.markCopiedArtifacts.run(sessionId);
    }
    const agg = this.q.aggregate.get(sessionId) as {
      started: number | null;
      ended: number | null;
      prompts: number;
      scheduled: number;
    };
    const first = this.q.firstPrompt.get(sessionId) as { text: string } | null;
    this.q.updateAggregate.run(
      agg.started,
      agg.ended,
      agg.prompts,
      agg.scheduled,
      first?.text ?? null,
      sessionId,
    );

    const rows = this.q.activity.all(sessionId) as ActivityRow[];
    // 自動実行のターンは描かない。自動実行しかないセッションは見えなくならないよう全体を使う。
    const human = rows.filter((r) => r.is_scheduled === 0);
    const used = human.length ? human : rows;
    this.q.clearSegments.run(sessionId);
    for (const [start, end] of toSegments(
      used.map((r) => r.ts),
      this.gapMs,
    )) {
      const inside = used.filter((r) => r.ts >= start && r.ts <= end);
      const prompts = inside.filter((r) => r.kind === "prompt" || r.kind === "command");
      const firstPrompt = prompts.find((r) => r.kind === "prompt") ?? prompts[0];
      const lastReply = inside.findLast((r) => r.kind === "assistant");
      const title =
        (firstPrompt ?? lastReply)?.text?.trim().split("\n")[0]?.slice(0, FALLBACK_TITLE_CHARS) ??
        null;
      this.q.insertSegment.run(sessionId, start, end, prompts.length, title);
    }
  }

  /** 派生データの計算方法が変わっていたら、全セッションを計算し直す。 */
  refreshAllIfOutdated(): boolean {
    const row = this.db
      .query<{ value: string }, []>("SELECT value FROM kv WHERE key = 'derived_version'")
      .get();
    if (row && Number(row.value) === DERIVED_VERSION) return false;
    this.db.transaction(() => {
      for (const { id } of this.db.query<{ id: string }, []>("SELECT id FROM sessions").all())
        this.refreshSession(id);
      this.db
        .query(
          "INSERT INTO kv (key, value) VALUES ('derived_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .run(String(DERIVED_VERSION));
    })();
    return true;
  }
}

/** メタレコードから書き込むセッションの列。 */
const SESSION_FIELDS = [
  "ai_title",
  "agent_name",
  "custom_title",
  "away_summary",
  "continued_in",
  "label",
] as const;
type SessionField = (typeof SESSION_FIELDS)[number];

function prepareStatements(db: Database) {
  const p = (sql: string) => db.prepare(sql);
  return {
    getState: p("SELECT id, offset, ino, parser_version, state FROM ingest_state WHERE path = ?"),
    insertState: p(
      "INSERT INTO ingest_state (path, session_id, agent_id, parser_version) VALUES (?, ?, ?, ?) RETURNING id",
    ),
    saveState: p(
      "UPDATE ingest_state SET offset = ?, size = ?, ino = ?, parser_version = ?, state = ? WHERE id = ?",
    ),
    deleteState: p("DELETE FROM ingest_state WHERE id = ?"),
    clearFile: p("DELETE FROM messages WHERE file_id = ?"),
    clearFileArtifacts: p("DELETE FROM artifacts WHERE file_id = ?"),
    ensureSession: p("INSERT OR IGNORE INTO sessions (id) VALUES (?)"),
    sessionInfo: p("SELECT launch_cwd, branch FROM sessions WHERE id = ?"),
    upsertProject: p(
      "INSERT INTO projects (path, name) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET name = name RETURNING id",
    ),
    setLaunch: p(
      "UPDATE sessions SET launch_cwd = ?, project_id = ?, label = COALESCE(label, ?) WHERE id = ? AND launch_cwd IS NULL",
    ),
    setBranch: p("UPDATE sessions SET branch = ? WHERE id = ? AND branch IS NULL"),
    insertMessage: p(
      `INSERT OR IGNORE INTO messages
         (id, session_id, agent_id, file_id, seq, ts, kind, text, tool_name, tool_use_id, is_error, is_scheduled, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertArtifact: p(
      "INSERT OR IGNORE INTO artifacts (session_id, kind, ref, title, ts, file_id) VALUES (?, ?, ?, ?, ?, ?)",
    ),
    upsertSubagent: p(
      `INSERT INTO subagents (id, session_id, agent_type, description, tool_use_id) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET agent_type = excluded.agent_type, description = excluded.description,
           tool_use_id = excluded.tool_use_id`,
    ),
    // 続きのセッション（?1）にある、前のセッションと同じ uuid の記録をコピーとして印を付ける
    markCopiedMessages: p(
      `UPDATE messages SET is_copy = EXISTS (
         SELECT 1 FROM messages m JOIN sessions prev ON prev.id = m.session_id
         WHERE prev.continued_in = ?1 AND m.id = messages.id)
       WHERE session_id = ?1`,
    ),
    markCopiedArtifacts: p(
      `UPDATE artifacts SET is_copy = EXISTS (
         SELECT 1 FROM artifacts a JOIN sessions prev ON prev.id = a.session_id
         WHERE prev.continued_in = ?1 AND a.kind = artifacts.kind AND a.ref = artifacts.ref)
       WHERE session_id = ?1`,
    ),
    hasPredecessor: p("SELECT 1 FROM sessions WHERE continued_in = ? LIMIT 1"),
    // 続き先のセッションが DB にあれば、その ID
    continuedIn: p(
      "SELECT s.continued_in AS id FROM sessions s JOIN sessions next ON next.id = s.continued_in WHERE s.id = ?",
    ),
    aggregate: p(
      `SELECT MIN(ts) AS started, MAX(ts) AS ended,
                COALESCE(SUM(kind IN ('prompt', 'command')), 0) AS prompts,
                COALESCE(SUM(kind = 'scheduled'), 0) AS scheduled
         FROM messages WHERE session_id = ? AND agent_id IS NULL AND is_copy = 0`,
    ),
    firstPrompt: p(
      "SELECT text FROM messages WHERE session_id = ? AND agent_id IS NULL AND is_copy = 0 AND kind = 'prompt' ORDER BY file_id, seq LIMIT 1",
    ),
    updateAggregate: p(
      "UPDATE sessions SET started_at = ?, ended_at = ?, prompt_count = ?, scheduled_runs = ?, first_prompt = ? WHERE id = ?",
    ),
    // 作業ブロックの計算に使う活動。見出し用に、発言と返答だけは本文の先頭も取る
    activity: p(
      `SELECT ts, is_scheduled, kind,
              CASE WHEN kind IN ('prompt', 'command', 'assistant') THEN substr(text, 1, 400) END AS text
       FROM messages WHERE session_id = ? AND agent_id IS NULL AND is_copy = 0 AND ts IS NOT NULL ORDER BY ts, file_id, seq`,
    ),
    clearSegments: p("DELETE FROM segments WHERE session_id = ?"),
    insertSegment: p(
      "INSERT OR IGNORE INTO segments (session_id, start, end, prompt_count, fallback_title) VALUES (?, ?, ?, ?, ?)",
    ),
  };
}

/** ツール入力の 1 行要約（コマンド、ファイルパス、検索語など）。 */
function inputSummary(input: Rec): string {
  for (const key of [
    "command",
    "file_path",
    "pattern",
    "url",
    "description",
    "prompt",
    "query",
    "name",
  ]) {
    const v = str(input[key]);
    if (v) return (v.split("\n")[0] ?? "").slice(0, 200);
  }
  return "";
}
