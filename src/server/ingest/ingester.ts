import type { Database, Statement } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { classifyUser, commandText } from "./classify.ts";
import { extractCommit, GIT_COMMIT_RE } from "./commits.ts";
import {
  type ProjectRef,
  projectDir,
  type RemoteLookup,
  readGitRemote,
  resolveProject,
  worktreeName,
} from "./project.ts";
import { GH_PR_CREATE_RE, prTitleOf, prUrlIn } from "./prs.ts";
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

/** Bump when the interpretation rules change. Files whose source logs still exist are then re-read. */
export const PARSER_VERSION = 5;
/**
 * Bump when the calculation of derived data that can be recomputed from the DB (aggregates, work blocks,
 * project assignment from the startup cwd) changes. All sessions are recomputed, even those whose logs are gone.
 */
export const DERIVED_VERSION = 3;
const FALLBACK_TITLE_CHARS = 120;

const LIMIT = { text: 20_000, toolInput: 4_000, toolResult: 4_000, short: 2_000 };
const RECAP_SUFFIX = /\s*\(disable recaps in \/config\)\s*$/;

export type LogFile =
  | { kind: "session"; sessionId: string }
  | { kind: "subagent"; sessionId: string; agentId: string }
  | { kind: "subagent-meta"; sessionId: string; agentId: string };

/** Determines the file kind from its path relative to the projects directory. */
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

/** Interpretation state carried across files. Saved as JSON in ingest_state.state. */
interface FileState {
  /** Whether we are inside a turn triggered by an automatic run (/loop, cron). */
  autoTurn: boolean;
  /** git commits awaiting their result: tool_use id → command. */
  pendingCommits: Record<string, string>;
  /** gh pr create calls awaiting their result: tool_use id → title. */
  pendingPrs: Record<string, string>;
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
    /** How to read the git remote. Tests replace it with one that does not touch real directories. */
    private readonly lookupRemote: RemoteLookup = readGitRemote,
  ) {
    this.q = prepareStatements(db);
    this.setters = Object.fromEntries(
      SESSION_FIELDS.map((col) => [col, db.prepare(`UPDATE sessions SET ${col} = ? WHERE id = ?`)]),
    ) as Record<SessionField, Statement>;
  }

  // ---------------------------------------------------------------- scanning

  /** Ingests every file under projects: main session files first, then subagents. */
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
   * Same as scan, but yields periodically so the server keeps responding.
   * Used to run the first ingest after startup (which takes a few seconds) in the background.
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

  // ---------------------------------------------------------------- one file

  /** Ingests what was appended to a file and returns IDs of sessions whose display may change (empty if none). */
  ingestFile(path: string): string[] {
    const file = classifyPath(this.projectsDir, path);
    if (!file || !existsSync(path)) return [];
    if (file.kind === "subagent-meta")
      return this.ingestSubagentMeta(path, file.sessionId, file.agentId);
    const agentId = file.kind === "subagent" ? file.agentId : null;

    let st = this.q.getState.get(path) as StateRow | null;
    if (st && st.parser_version !== PARSER_VERSION) {
      this.q.deleteState.run(st.id); // messages and artifacts go too (ON DELETE CASCADE)
      st = null;
    }
    const res = readNewLines(path, st?.offset ?? 0, st?.ino ?? null);
    if (st && !res.restarted && res.lines.length === 0) return [];

    const touched = [file.sessionId];
    this.db.transaction(() => {
      this.q.ensureSession.run(file.sessionId);
      let fileId: number;
      let state: FileState = { autoTurn: false, pendingCommits: {}, pendingPrs: {} };
      if (st) {
        fileId = st.id;
        if (res.restarted) {
          this.q.clearFile.run(fileId);
          this.q.clearFileArtifacts.run(fileId);
          this.q.clearFileUsage.run(fileId);
          this.q.clearFileTurns.run(fileId);
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
          continue; // Skip complete lines that are malformed
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
      // If the continued session was ingested first, this is where we learn which part is a copy
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
    return []; // The calendar does not change, so do not report an update
  }

  // ---------------------------------------------------------------- records

  private handle(ctx: Ctx, r: Rec, seq: number): void {
    const sid = str(r.sessionId);
    if (sid && sid !== ctx.sessionId) return; // Record from another session (defensive; does not occur in the current format)
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
    // Instructions to a subagent have no origin, so treat them as the prompt here
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
      // compact_summary and meta are not stored
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
      if (toolUseId) this.attachPrTitle(ctx, toolUseId, result, output, isError || interrupted, ts);
      const command = toolUseId ? ctx.state.pendingCommits[toolUseId] : undefined;
      if (!toolUseId || command === undefined) return;
      delete ctx.state.pendingCommits[toolUseId];
      const commit = isError || interrupted ? null : extractCommit(command, output);
      if (!commit) return;
      // Without a SHA, identify by subject (duplicates with the same subject collapse into one)
      const ref = commit.sha ?? `subject:${commit.subject}`;
      this.q.insertArtifact.run(ctx.sessionId, "commit", ref, commit.subject, ts, ctx.fileId);
    });
  }

  /**
   * Learns the created PR's URL from the gh pr create result and attaches the remembered title.
   * If pr-link came first, only the title is rewritten; a later pr-link does not overwrite it.
   */
  private attachPrTitle(
    ctx: Ctx,
    toolUseId: string,
    result: Rec | undefined,
    output: string,
    failed: boolean,
    ts: number | null,
  ): void {
    const title = ctx.state.pendingPrs[toolUseId];
    if (title === undefined) return;
    delete ctx.state.pendingPrs[toolUseId];
    if (failed) return;
    const pr = rec(rec(result?.gitOperation)?.pr);
    const url = pr ? (pr.action === "created" ? str(pr.url) : undefined) : prUrlIn(output);
    if (url) this.q.upsertPrTitle.run(ctx.sessionId, url, title, ts, ctx.fileId);
  }

  private handleAssistant(ctx: Ctx, r: Rec, ts: number | null, seq: number): void {
    const msg = rec(r.message) ?? {};
    const id = str(r.uuid) ?? `${ctx.fileId}:${seq}`;
    if (msg.model === "<synthetic>" || r.isApiErrorMessage) {
      this.insert(ctx, id, seq, ts, "error", clip(contentText(msg.content), LIMIT.short));
      return;
    }
    this.recordUsage(ctx, msg, str(r.effort) ?? null, ts);
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
        const prTitle = name === "Bash" && GH_PR_CREATE_RE.test(command) && prTitleOf(command);
        if (toolUseId && prTitle) ctx.state.pendingPrs[toolUseId] = prTitle.slice(0, LIMIT.short);
      }
      // thinking is not stored
    });
  }

  /**
   * Token usage of a response. One response is split into a record per block sharing one message.id,
   * and only output_tokens grows in later records, so keep the maximum.
   */
  private recordUsage(ctx: Ctx, msg: Rec, effort: string | null, ts: number | null): void {
    const u = rec(msg.usage);
    const messageId = str(msg.id);
    const model = str(msg.model);
    if (!u || !messageId || !model) return;
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const breakdown = rec(u.cache_creation);
    const write1h = n(breakdown?.ephemeral_1h_input_tokens);
    // Without a breakdown, assume the default 5-minute cache write
    const write5m = breakdown
      ? n(breakdown.ephemeral_5m_input_tokens)
      : n(u.cache_creation_input_tokens);
    this.q.upsertUsage.run(
      ctx.sessionId,
      messageId,
      ctx.agentId,
      ctx.fileId,
      ts,
      model,
      str(u.speed) ?? null,
      effort,
      n(u.input_tokens),
      n(u.output_tokens),
      n(u.cache_read_input_tokens),
      write5m,
      write1h,
    );
  }

  private handleSystem(ctx: Ctx, r: Rec, ts: number | null, seq: number): void {
    const id = str(r.uuid) ?? `${ctx.fileId}:${seq}`;
    if (r.subtype === "compact_boundary") {
      const meta = rec(r.compactMetadata);
      this.insert(ctx, id, seq, ts, "compact", "Conversation compacted", {
        meta: meta ? JSON.stringify(meta) : null,
      });
    } else if (r.subtype === "turn_duration" && ctx.agentId === null) {
      if (ts !== null && typeof r.durationMs === "number")
        this.q.insertTurn.run(ctx.sessionId, id, ctx.fileId, ts, r.durationMs);
    } else if (r.subtype === "away_summary" && ctx.agentId === null) {
      this.set(ctx, "away_summary", str(r.content)?.replace(RECAP_SUFFIX, ""));
    }
  }

  // ---------------------------------------------------------------- writing

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
    const project = resolveProject(cwd, this.lookupRemote);
    this.q.setLaunch.run(cwd, this.projectId(project), project.label, ctx.sessionId);
    ctx.launchKnown = true;
  }

  /** Returns the project row (creating it if needed). With a remote, rows of the same repository are merged. */
  private projectId(p: ProjectRef): number {
    if (p.repo) {
      const byRepo = this.q.projectByRepo.get(p.repo) as { id: number } | null;
      if (byRepo) return byRepo.id;
      // If a row was created before the remote was known, take it over, keeping its color and hidden setting
      const byPath = this.q.projectByPath.get(p.path) as { id: number } | null;
      if (byPath) {
        this.q.adoptRepo.run(p.repo, p.name, byPath.id);
        return byPath.id;
      }
    }
    return (this.q.upsertProject.get(p.path, p.name, p.repo) as { id: number }).id;
  }

  /**
   * Reassigns every session's project from its startup cwd (for when the assignment rules change).
   * Sessions whose directory is gone stay as they are; projects left without sessions are deleted.
   */
  private reassignProjects(): void {
    const cwds = this.db
      .query<{ cwd: string }, []>(
        "SELECT DISTINCT launch_cwd AS cwd FROM sessions WHERE launch_cwd IS NOT NULL",
      )
      .all();
    for (const { cwd } of cwds) {
      if (this.lookupRemote(projectDir(cwd)) === undefined) continue;
      const project = resolveProject(cwd, this.lookupRemote);
      this.q.reassignProject.run(this.projectId(project), project.label, cwd);
    }
    this.q.deleteOrphanProjects.run();
  }

  /** Recomputes aggregates and work blocks from messages. */
  refreshSession(sessionId: string): void {
    if (this.q.hasPredecessor.get(sessionId)) {
      this.q.markCopiedMessages.run(sessionId);
      this.q.markCopiedArtifacts.run(sessionId);
      this.q.markCopiedUsage.run(sessionId);
      this.q.markCopiedTurns.run(sessionId);
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
    // Automatic-run turns are not drawn. A session with only automatic runs uses everything, so it stays visible.
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

  /** Recomputes all sessions if the derived-data calculation has changed. */
  refreshAllIfOutdated(): boolean {
    const row = this.db
      .query<{ value: string }, []>("SELECT value FROM kv WHERE key = 'derived_version'")
      .get();
    if (row && Number(row.value) === DERIVED_VERSION) return false;
    this.db.transaction(() => {
      this.reassignProjects();
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

/** Session columns written from meta records. */
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
    clearFileUsage: p("DELETE FROM usage WHERE file_id = ?"),
    clearFileTurns: p("DELETE FROM turns WHERE file_id = ?"),
    ensureSession: p("INSERT OR IGNORE INTO sessions (id) VALUES (?)"),
    sessionInfo: p("SELECT launch_cwd, branch FROM sessions WHERE id = ?"),
    upsertProject: p(
      "INSERT INTO projects (path, name, repo) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET name = name RETURNING id",
    ),
    projectByRepo: p("SELECT id FROM projects WHERE repo = ?"),
    projectByPath: p("SELECT id FROM projects WHERE path = ?"),
    adoptRepo: p("UPDATE projects SET repo = ?, name = ? WHERE id = ?"),
    reassignProject: p(
      "UPDATE sessions SET project_id = ?, label = COALESCE(label, ?) WHERE launch_cwd = ?",
    ),
    deleteOrphanProjects: p(
      "DELETE FROM projects WHERE id NOT IN (SELECT project_id FROM sessions WHERE project_id IS NOT NULL)",
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
    upsertPrTitle: p(
      `INSERT INTO artifacts (session_id, kind, ref, title, ts, file_id) VALUES (?, 'pr', ?, ?, ?, ?)
       ON CONFLICT(session_id, kind, ref) DO UPDATE SET title = excluded.title`,
    ),
    insertArtifact: p(
      "INSERT OR IGNORE INTO artifacts (session_id, kind, ref, title, ts, file_id) VALUES (?, ?, ?, ?, ?, ?)",
    ),
    upsertUsage: p(
      `INSERT INTO usage (session_id, message_id, agent_id, file_id, ts, model, speed, effort,
                          input, output, cache_read, cache_write_5m, cache_write_1h)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, message_id) DO UPDATE SET output = MAX(output, excluded.output)`,
    ),
    upsertSubagent: p(
      `INSERT INTO subagents (id, session_id, agent_type, description, tool_use_id) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET agent_type = excluded.agent_type, description = excluded.description,
           tool_use_id = excluded.tool_use_id`,
    ),
    // Mark records in the continued session (?1) that share a uuid with the previous session as copies
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
    markCopiedUsage: p(
      `UPDATE usage SET is_copy = EXISTS (
         SELECT 1 FROM usage u JOIN sessions prev ON prev.id = u.session_id
         WHERE prev.continued_in = ?1 AND u.message_id = usage.message_id)
       WHERE session_id = ?1`,
    ),
    insertTurn: p(
      "INSERT OR IGNORE INTO turns (session_id, id, file_id, ts, duration_ms) VALUES (?, ?, ?, ?, ?)",
    ),
    markCopiedTurns: p(
      `UPDATE turns SET is_copy = EXISTS (
         SELECT 1 FROM turns t JOIN sessions prev ON prev.id = t.session_id
         WHERE prev.continued_in = ?1 AND t.id = turns.id)
       WHERE session_id = ?1`,
    ),
    hasPredecessor: p("SELECT 1 FROM sessions WHERE continued_in = ? LIMIT 1"),
    // ID of the continuing session, if it is in the DB
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
    // Activity used to compute work blocks. For headlines, also take the start of prompt and reply text
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

/** One-line summary of a tool input (command, file path, search term, etc.). */
function inputSummary(input: Rec): string {
  for (const key of [
    "command",
    "file_path",
    "notebook_path",
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
