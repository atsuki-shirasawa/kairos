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
import { GH_PR_CREATE_RE, prMergeOf, prTitleOf, prUrlIn } from "./prs.ts";
import { type Line, type ReadResult, readNewLines } from "./reader.ts";
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
import {
  type ActivityRow,
  type AggregateRow,
  prepareSessionSetters,
  prepareStatements,
  type SessionField,
  type SessionInfoRow,
  type Statements,
  type StateRow,
} from "./statements.ts";
import { usageCounts } from "./usage.ts";

/** Bump when the interpretation rules change. Files whose source logs still exist are then re-read. */
export const PARSER_VERSION = 7;
/**
 * Bump when the calculation of derived data that can be recomputed from the DB (aggregates, work blocks,
 * project assignment from the startup cwd) changes. All sessions are recomputed, even those whose logs are gone.
 */
export const DERIVED_VERSION = 4;
const FALLBACK_TITLE_CHARS = 120;

const LIMIT = { text: 20_000, toolInput: 4_000, toolResult: 4_000, short: 2_000 };
const RECAP_SUFFIX = /\s*\(disable recaps in \/config\)\s*$/;

/** Kind of a file under the projects directory, with the IDs its path encodes. */
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
  /**
   * gh pr merge calls awaiting their result: tool_use id → PR number (null when not named).
   * Optional because states saved before merges were tracked don't have it.
   */
  pendingMerges?: Record<string, number | null>;
}

interface Ctx {
  sessionId: string;
  agentId: string | null;
  fileId: number;
  state: FileState;
  launchKnown: boolean;
  branchKnown: boolean;
}

/** Outcome of one scan: files seen, files that changed, touched session IDs, and elapsed ms. */
export interface ScanStats {
  files: number;
  changed: number;
  sessions: Set<string>;
  ms: number;
}

/**
 * Incrementally ingests the logs under `projectsDir` into the DB, resuming each file from its
 * saved offset. Never writes to the logs themselves.
 */
export class Ingester {
  private readonly q: Statements;
  private readonly setters: Record<SessionField, Statement>;

  constructor(
    private readonly db: Database,
    readonly projectsDir: string,
    private readonly gapMs = DEFAULT_GAP_MS,
    /** How to read the git remote. Tests replace it with one that does not touch real directories. */
    private readonly lookupRemote: RemoteLookup = readGitRemote,
  ) {
    this.q = prepareStatements(db);
    this.setters = prepareSessionSetters(db);
  }

  // ---------------------------------------------------------------- scanning

  /** Ingests every file under projects: main session files first, then subagents. */
  scan(onProgress?: (done: number, total: number) => void): ScanStats {
    const { files, stats, started } = this.startScan();
    files.forEach((path, i) => {
      this.scanFile(path, stats);
      onProgress?.(i + 1, files.length);
    });
    return finishScan(stats, started);
  }

  /**
   * Same as scan, but yields periodically so the server keeps responding.
   * Used to run the first ingest after startup (which takes a few seconds) in the background.
   */
  async scanAsync(
    onProgress?: (done: number, total: number) => void,
    sliceMs = 30,
  ): Promise<ScanStats> {
    const { files, stats, started } = this.startScan();
    let sliceStart = performance.now();
    for (const [i, path] of files.entries()) {
      this.scanFile(path, stats);
      if (performance.now() - sliceStart > sliceMs) {
        onProgress?.(i + 1, files.length);
        await Bun.sleep(0);
        sliceStart = performance.now();
      }
    }
    onProgress?.(files.length, files.length);
    return finishScan(stats, started);
  }

  /** Brings derived data up to date and lists the files a scan will ingest, with empty stats. */
  private startScan(): { files: string[]; stats: ScanStats; started: number } {
    const started = performance.now();
    this.refreshAllIfOutdated();
    const files = this.listFiles();
    const stats: ScanStats = { files: files.length, changed: 0, sessions: new Set(), ms: 0 };
    return { files, stats, started };
  }

  /** Ingests one file of a scan and adds what it touched to the stats. */
  private scanFile(path: string, stats: ScanStats): void {
    const touched = this.ingestFile(path);
    for (const sid of touched) stats.sessions.add(sid);
    if (touched.length) stats.changed += 1;
  }

  /** Log files to ingest: main session files first, then subagent logs and their meta files. */
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

    const saved = this.savedState(path);
    const read = readNewLines(path, saved?.offset ?? 0, saved?.ino ?? null);
    if (saved && !read.restarted && read.lines.length === 0) return [];

    return this.db.transaction(() => {
      this.q.ensureSession.run(file.sessionId);
      const { fileId, state } = this.resumeFile(path, file.sessionId, agentId, saved, read);
      const ctx = this.newCtx(file.sessionId, agentId, fileId, state);
      this.handleLines(ctx, read.lines);
      this.saveState(ctx, read);
      if (agentId !== null) return [file.sessionId];
      return this.refreshWithContinuation(file.sessionId);
    })();
  }

  /** The file's saved ingest state, or null if there is none or a different parser version wrote it. */
  private savedState(path: string): StateRow | null {
    const st = this.q.getState.get(path) as StateRow | null;
    if (st && st.parser_version !== PARSER_VERSION) {
      this.q.deleteState.run(st.id); // messages and artifacts go too (ON DELETE CASCADE)
      return null;
    }
    return st;
  }

  /**
   * Returns the file's ID and the state to continue from: a new row for an unseen file, a fresh
   * state with the file's rows cleared for a restarted one, or the saved state otherwise.
   */
  private resumeFile(
    path: string,
    sessionId: string,
    agentId: string | null,
    saved: StateRow | null,
    read: ReadResult,
  ): { fileId: number; state: FileState } {
    const fresh: FileState = {
      autoTurn: false,
      pendingCommits: {},
      pendingPrs: {},
      pendingMerges: {},
    };
    if (!saved) {
      const row = this.q.insertState.get(path, sessionId, agentId, PARSER_VERSION) as {
        id: number;
      };
      return { fileId: row.id, state: fresh };
    }
    if (read.restarted) {
      this.clearFileRows(saved.id);
      return { fileId: saved.id, state: fresh };
    }
    return {
      fileId: saved.id,
      state: { ...fresh, ...(JSON.parse(saved.state) as Partial<FileState>) },
    };
  }

  /** Deletes everything ingested from a file, so it can be read again from the start. */
  private clearFileRows(fileId: number): void {
    this.q.clearFile.run(fileId);
    this.q.clearFileArtifacts.run(fileId);
    this.q.clearFileUsage.run(fileId);
    this.q.clearFileTurns.run(fileId);
  }

  /** Builds the per-file context, noting which once-per-session facts are already recorded. */
  private newCtx(sessionId: string, agentId: string | null, fileId: number, state: FileState): Ctx {
    const info = this.q.sessionInfo.get(sessionId) as SessionInfoRow;
    return {
      sessionId,
      agentId,
      fileId,
      state,
      launchKnown: agentId !== null || info.launch_cwd !== null,
      branchKnown: agentId !== null || info.branch !== null,
    };
  }

  /** Parses and handles each new line. */
  private handleLines(ctx: Ctx, lines: Line[]): void {
    for (const line of lines) {
      let r: unknown;
      try {
        r = JSON.parse(line.text);
      } catch {
        continue; // Skip complete lines that are malformed
      }
      if (isRec(r)) this.handle(ctx, r, line.offset * 16);
    }
  }

  /** Saves where to resume reading and the interpretation state carried to the next read. */
  private saveState(ctx: Ctx, read: ReadResult): void {
    this.q.saveState.run(
      read.nextOffset,
      read.size,
      read.ino,
      PARSER_VERSION,
      JSON.stringify(ctx.state),
      ctx.fileId,
    );
  }

  /** Refreshes a main session and the session continuing it, returning the IDs refreshed. */
  private refreshWithContinuation(sessionId: string): string[] {
    this.refreshSession(sessionId);
    // If the continued session was ingested first, this is where we learn which part is a copy
    const next = this.q.continuedIn.get(sessionId) as { id: string } | null;
    if (!next) return [sessionId];
    this.refreshSession(next.id);
    return [sessionId, next.id];
  }

  /** Records a subagent's type and description from its meta file. */
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

  /** Dispatches one record by type. */
  private handle(ctx: Ctx, r: Rec, seq: number): void {
    const sid = str(r.sessionId);
    if (sid && sid !== ctx.sessionId) return; // Record from another session (defensive; does not occur in the current format)
    const ts = parseTs(r.timestamp);
    const main = ctx.agentId === null;

    if (main) this.noteStartup(ctx, r);
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
    if (main) this.handleSessionMeta(ctx, r, ts);
  }

  /** Records the session's startup cwd and branch from the first main-thread record that has them. */
  private noteStartup(ctx: Ctx, r: Rec): void {
    if (!ctx.launchKnown && str(r.cwd)) this.setLaunch(ctx, str(r.cwd) ?? "");
    if (!ctx.branchKnown && str(r.gitBranch)) {
      this.q.setBranch.run(str(r.gitBranch) ?? null, ctx.sessionId);
      ctx.branchKnown = true;
    }
  }

  /** Handles main-thread records that describe the session rather than the conversation. */
  private handleSessionMeta(ctx: Ctx, r: Rec, ts: number | null): void {
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
      case "pr-link":
        this.handlePrLink(ctx, r, ts);
        return;
    }
  }

  /** Stores the PR a pr-link record points at, titled "#<number> <repository>". */
  private handlePrLink(ctx: Ctx, r: Rec, ts: number | null): void {
    const url = str(r.prUrl);
    if (!url) return;
    const num = typeof r.prNumber === "number" ? `#${r.prNumber}` : null;
    const title = [num, str(r.prRepository)].filter(Boolean).join(" ") || null;
    this.q.insertArtifact.run(ctx.sessionId, "pr", url, title, ts, ctx.fileId);
  }

  /** Stores a user record according to its classified kind, tracking automatic-run turns. */
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

  /** Stores each tool_result block and resolves the commit or PR its tool_use was waiting for. */
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
      if (!toolUseId) return;
      this.attachPrTitle(ctx, toolUseId, result, output, isError || interrupted, ts);
      this.attachCommit(ctx, toolUseId, output, isError || interrupted, ts);
      this.attachMerge(ctx, toolUseId, result, isError || interrupted, ts);
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

  /** Stores the commit a pending git commit made, read from its result. */
  private attachCommit(
    ctx: Ctx,
    toolUseId: string,
    output: string,
    failed: boolean,
    ts: number | null,
  ): void {
    const command = ctx.state.pendingCommits[toolUseId];
    if (command === undefined) return;
    delete ctx.state.pendingCommits[toolUseId];
    const commit = failed ? null : extractCommit(command, output);
    if (!commit) return;
    // Without a SHA, identify by subject (duplicates with the same subject collapse into one)
    const ref = commit.sha ?? `subject:${commit.subject}`;
    this.q.insertArtifact.run(ctx.sessionId, "commit", ref, commit.subject, ts, ctx.fileId);
  }

  /**
   * Stores the PR merge a pending gh pr merge made. gitOperation, when present, names the PR even
   * if the command didn't. A merge whose PR is unknown is kept under its call, so it still counts.
   */
  private attachMerge(
    ctx: Ctx,
    toolUseId: string,
    result: Rec | undefined,
    failed: boolean,
    ts: number | null,
  ): void {
    const pending = ctx.state.pendingMerges ?? {};
    const pr = rec(rec(result?.gitOperation)?.pr);
    const reported = pr?.action === "merged" && typeof pr.number === "number" ? pr.number : null;
    if (!(toolUseId in pending) && reported === null) return;
    const number = reported ?? pending[toolUseId] ?? null;
    delete pending[toolUseId];
    if (failed) return;
    const ref = number !== null ? `#${number}` : `call:${toolUseId}`;
    this.q.insertArtifact.run(ctx.sessionId, "merge", ref, null, ts, ctx.fileId);
  }

  /** Stores an assistant response: its usage, text blocks and tool calls (or an API error). */
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
        this.handleToolUse(ctx, block, `${id}:${i}`, seq + i, ts);
      }
      // thinking is not stored
    });
  }

  /** Stores a tool_use block and remembers a git commit, gh pr create or gh pr merge until its result arrives. */
  private handleToolUse(ctx: Ctx, block: Rec, id: string, seq: number, ts: number | null): void {
    const name = str(block.name) ?? "";
    const input = rec(block.input) ?? {};
    const toolUseId = str(block.id) ?? null;
    this.insert(ctx, id, seq, ts, "tool_use", inputSummary(input), {
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
    const merge = name === "Bash" ? prMergeOf(command) : undefined;
    if (toolUseId && merge) {
      ctx.state.pendingMerges ??= {};
      ctx.state.pendingMerges[toolUseId] = merge.number;
    }
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
    const c = usageCounts(u);
    this.q.upsertUsage.run(
      ctx.sessionId,
      messageId,
      ctx.agentId,
      ctx.fileId,
      ts,
      model,
      str(u.speed) ?? null,
      effort,
      c.input,
      c.output,
      c.cacheRead,
      c.cacheWrite5m,
      c.cacheWrite1h,
    );
  }

  /** Stores compactions, turn durations and away summaries; other system records are ignored. */
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

  /** Inserts one message row (ignored if its ID was already stored). */
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

  /** Writes a session column from a meta record; empty values leave it unchanged. */
  private set(ctx: Ctx, col: SessionField, value: string | undefined): void {
    if (value) this.setters[col].run(value, ctx.sessionId);
  }

  /** Records the startup cwd and assigns the session to the project it resolves to. */
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

  // ---------------------------------------------------------------- derived data

  /** Recomputes aggregates and work blocks from messages. */
  refreshSession(sessionId: string): void {
    if (this.q.hasPredecessor.get(sessionId)) this.markCopies(sessionId);
    this.updateAggregates(sessionId);
    this.rebuildSegments(sessionId);
  }

  /** Marks the rows of a continued session that were copied from the session it continues. */
  private markCopies(sessionId: string): void {
    this.q.markCopiedMessages.run(sessionId);
    this.q.markCopiedArtifacts.run(sessionId);
    this.q.markCopiedUsage.run(sessionId);
    this.q.markCopiedTurns.run(sessionId);
  }

  /** Recomputes the session's time range, prompt counts and first prompt. */
  private updateAggregates(sessionId: string): void {
    const agg = this.q.aggregate.get(sessionId) as AggregateRow;
    const first = this.q.firstPrompt.get(sessionId) as { text: string } | null;
    this.q.updateAggregate.run(
      agg.started,
      agg.ended,
      agg.prompts,
      agg.scheduled,
      first?.text ?? null,
      sessionId,
    );
  }

  /** Replaces the session's work blocks with ones recomputed from its activity. */
  private rebuildSegments(sessionId: string): void {
    const used = drawnActivity(this.q.activity.all(sessionId) as ActivityRow[]);
    this.q.clearSegments.run(sessionId);
    for (const [start, end] of toSegments(
      used.map((r) => r.ts),
      this.gapMs,
    )) {
      const inside = used.filter((r) => r.ts >= start && r.ts <= end);
      if (!isWork(inside)) continue;
      const prompts = inside.filter(isPrompt).length;
      this.q.insertSegment.run(sessionId, start, end, prompts, fallbackTitle(inside));
    }
  }

  /** Recomputes all sessions if the derived-data calculation has changed. */
  refreshAllIfOutdated(): boolean {
    if (this.storedDerivedVersion() === DERIVED_VERSION) return false;
    this.db.transaction(() => {
      this.reassignProjects();
      for (const { id } of this.db.query<{ id: string }, []>("SELECT id FROM sessions").all())
        this.refreshSession(id);
      this.storeDerivedVersion();
    })();
    return true;
  }

  /** The DERIVED_VERSION the stored derived data was computed with, or null if never computed. */
  private storedDerivedVersion(): number | null {
    const row = this.db
      .query<{ value: string }, []>("SELECT value FROM kv WHERE key = 'derived_version'")
      .get();
    return row ? Number(row.value) : null;
  }

  /** Records that derived data is now computed with the current DERIVED_VERSION. */
  private storeDerivedVersion(): void {
    this.db
      .query(
        "INSERT INTO kv (key, value) VALUES ('derived_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(String(DERIVED_VERSION));
  }
}

/** Fills in the elapsed time of a scan started at `started`. */
function finishScan(stats: ScanStats, started: number): ScanStats {
  stats.ms = performance.now() - started;
  return stats;
}

/**
 * Activity that work blocks are drawn from. Automatic-run turns are not drawn, but a session with
 * only automatic runs uses everything, so it stays visible.
 */
function drawnActivity(rows: ActivityRow[]): ActivityRow[] {
  const human = rows.filter((r) => r.is_scheduled === 0);
  return human.length ? human : rows;
}

/**
 * Whether a block of activity is worth drawing. A block with neither a request (a prompt, a command
 * or a `/loop` tick) nor a tool call is a fragment after a break: a compaction, an API error, or a
 * short reply to a notification. Prompt-less blocks with tool calls stay, since that is Claude
 * acting on a notification on its own, often with commits.
 */
function isWork(inside: ActivityRow[]): boolean {
  return inside.some((r) => isPrompt(r) || r.kind === "scheduled" || r.kind === "tool_use");
}

/** Whether a row is something the user asked for (a prompt or a slash command). */
function isPrompt(r: ActivityRow): boolean {
  return r.kind === "prompt" || r.kind === "command";
}

/**
 * Title for a work block until a summary exists: the first line of its first prompt (a typed
 * prompt preferred over a command), else of its last reply.
 */
function fallbackTitle(inside: ActivityRow[]): string | null {
  const prompts = inside.filter(isPrompt);
  const firstPrompt = prompts.find((r) => r.kind === "prompt") ?? prompts[0];
  const lastReply = inside.findLast((r) => r.kind === "assistant");
  return (
    (firstPrompt ?? lastReply)?.text?.trim().split("\n")[0]?.slice(0, FALLBACK_TITLE_CHARS) ?? null
  );
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
