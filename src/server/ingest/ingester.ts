import type { Database, Statement } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { WORK_BLOCK_GAP_MS } from "../../shared/sections.ts";
import { readKv, writeKv } from "../db/kv.ts";
import { classifyUser } from "./classify.ts";
import { extractCommit } from "./commits.ts";
import { awaitOutcomes, type FileState, FileStateStore } from "./fileState.ts";
import { classifyPath, listFiles } from "./files.ts";
import { nextAutoTurn, storedUserKind, storedUserText } from "./interpret.ts";
import { LIMIT } from "./limits.ts";
import { pendingOutcomes } from "./outcomes.ts";
import {
  encodeDir,
  isTemporary,
  type ProjectRef,
  projectDir,
  type RemoteLookup,
  readGitRemote,
  repoOfPrUrl,
  resolveProject,
  scratchpadOwner,
  TEMP_PROJECT,
  worktreeName,
} from "./project.ts";
import { prUrlIn } from "./prs.ts";
import { type Line, readNewLines } from "./reader.ts";
import {
  clip,
  clipEnds,
  contentText,
  isRec,
  list,
  parseTs,
  type Rec,
  rec,
  str,
  toolResultText,
} from "./records.ts";
import { toSegments } from "./segments.ts";
import {
  type ActivityRow,
  type AggregateRow,
  prepareSessionSetters,
  prepareStatements,
  type SessionField,
  type SessionInfoRow,
  type Statements,
} from "./statements.ts";
import { usageCounts } from "./usage.ts";

/** Bump when the interpretation rules change. Files whose source logs still exist are then re-read. */
export const PARSER_VERSION = 10;
/**
 * Bump when the calculation of derived data that can be recomputed from the DB (aggregates, work blocks,
 * project assignment from the startup cwd) changes. All sessions are recomputed, even those whose logs are gone.
 */
export const DERIVED_VERSION = 6;
const FALLBACK_TITLE_CHARS = 120;
/** The kv key that holds the DERIVED_VERSION the stored derived data was computed with. */
const DERIVED_VERSION_KEY = "derived_version";

const RECAP_SUFFIX = /\s*\(disable recaps in \/config\)\s*$/;

/** Where a session belongs: its project row, and the secondary label shown beside the name. */
interface Place {
  id: number;
  label: string | null;
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
  private readonly fileStates: FileStateStore;

  constructor(
    private readonly db: Database,
    readonly projectsDir: string,
    private readonly gapMs = WORK_BLOCK_GAP_MS,
    /** How to read the git remote. Tests replace it with one that does not touch real directories. */
    private readonly lookupRemote: RemoteLookup = readGitRemote,
  ) {
    this.q = prepareStatements(db);
    this.setters = prepareSessionSetters(db);
    this.fileStates = new FileStateStore(this.q, PARSER_VERSION);
  }

  // ---------------------------------------------------------------- scanning

  /** Ingests every file under projects: main session files first, then subagents. */
  scan(onProgress?: (done: number, total: number) => void): ScanStats {
    const { files, stats, started } = this.startScan();
    files.forEach((path, i) => {
      this.scanFile(path, stats);
      onProgress?.(i + 1, files.length);
    });
    this.placeWaitingScratchpads();
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
    this.placeWaitingScratchpads();
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
    return listFiles(this.projectsDir);
  }

  // ---------------------------------------------------------------- one file

  /** Ingests what was appended to a file and returns IDs of sessions whose display may change (empty if none). */
  ingestFile(path: string): string[] {
    const file = classifyPath(this.projectsDir, path);
    if (!file || !existsSync(path)) return [];
    if (file.kind === "subagent-meta")
      return this.ingestSubagentMeta(path, file.sessionId, file.agentId);
    const agentId = file.kind === "subagent" ? file.agentId : null;

    const saved = this.fileStates.load(path);
    const read = readNewLines(path, saved?.offset ?? 0, saved?.ino ?? null);
    if (saved && !read.restarted && read.lines.length === 0) return [];

    return this.db.transaction(() => {
      this.q.ensureSession.run(file.sessionId);
      const owner = { sessionId: file.sessionId, agentId };
      const { fileId, state } = this.fileStates.resume(path, owner, saved, read);
      const ctx = this.newCtx(file.sessionId, agentId, fileId, state);
      const prsBefore = this.prCount(fileId);
      this.handleLines(ctx, read.lines);
      this.fileStates.save(fileId, read, ctx.state);
      this.replaceAfterPr(file.sessionId, prsBefore, fileId);
      if (agentId !== null) return [file.sessionId];
      return this.refreshWithContinuation(file.sessionId);
    })();
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
      if (isRec(r)) this.handle(ctx, r, lineSeq(line.offset));
    }
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
    const classified = classifyUser(r);
    ctx.state.autoTurn = nextAutoTurn(ctx.state.autoTurn, classified);
    const kind = storedUserKind(classified, ctx.agentId !== null);
    if (kind === null) return;
    const id = recordId(r, ctx.fileId, seq);
    if (kind === "tool_result") {
      this.handleToolResults(ctx, r, id, ts, seq);
      return;
    }
    const text = storedUserText(kind, r, contentText(rec(r.message)?.content));
    this.insert(ctx, id, seq, ts, kind, text, { note: kind === "compact_summary" });
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
      // Runners and errors print their totals and the reason last, so keep the end as well
      this.insert(
        ctx,
        `${id}:${i}`,
        seq + i,
        ts,
        "tool_result",
        clipEnds(output, LIMIT.toolResult),
        {
          toolUseId,
          isError,
        },
      );
      if (!toolUseId) return;
      const failed = isError || interrupted;
      this.attachPrTitle(ctx, toolUseId, result, output, failed, ts);
      this.attachCommit(ctx, toolUseId, output, failed, ts);
      this.attachMerge(ctx, toolUseId, result, failed, ts);
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
    const pending = ctx.state.pendingMerges;
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
    const id = recordId(r, ctx.fileId, seq);
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
    if (toolUseId)
      awaitOutcomes(ctx.state, toolUseId, pendingOutcomes(name, str(input.command) ?? ""));
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

  /** Stores compactions, turn durations and away summaries (recaps); other system records are ignored. */
  private handleSystem(ctx: Ctx, r: Rec, ts: number | null, seq: number): void {
    const id = recordId(r, ctx.fileId, seq);
    if (r.subtype === "compact_boundary") {
      const meta = rec(r.compactMetadata);
      this.insert(ctx, id, seq, ts, "compact", "Conversation compacted", {
        meta: meta ? JSON.stringify(meta) : null,
      });
    } else if (r.subtype === "turn_duration" && ctx.agentId === null) {
      if (ts !== null && typeof r.durationMs === "number")
        this.q.insertTurn.run(ctx.sessionId, id, ctx.fileId, ts, r.durationMs);
    } else if (r.subtype === "away_summary" && ctx.agentId === null) {
      const text = str(r.content)?.replace(RECAP_SUFFIX, "");
      this.set(ctx, "away_summary", text);
      // Every recap, not just the last, says where the work stood at that moment
      if (text)
        this.insert(ctx, id, seq, ts, "away_summary", clip(text, LIMIT.short), { note: true });
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
      /** A note about the session, never part of an automatic run's turn. */
      note?: boolean;
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
      ctx.state.autoTurn && !opt.note ? 1 : 0,
      opt.meta ?? null,
    );
  }

  /** Writes a session column from a meta record; empty values leave it unchanged. */
  private set(ctx: Ctx, col: SessionField, value: string | undefined): void {
    if (value) this.setters[col].run(value, ctx.sessionId);
  }

  /** Records the startup cwd and assigns the session to the project it resolves to. */
  private setLaunch(ctx: Ctx, cwd: string): void {
    const place = this.placeOf(cwd, this.lookupRemote(projectDir(cwd)));
    this.q.setLaunch.run(cwd, place.id, place.label, ctx.sessionId);
    ctx.launchKnown = true;
  }

  /**
   * Where sessions launched in `cwd` belong: the project row and secondary label. `remote` is the
   * directory's git remote as `lookupRemote` reads it (undefined when the directory is gone). The
   * first rule that places it wins, in order: the git remote, the repository of its PRs, the
   * scratchpad's owner, the shared temporary project, and the directory itself.
   */
  private placeOf(
    cwd: string,
    remote: string | null | undefined,
    dirs = this.launchDirProjects(),
  ): Place {
    const own = resolveProject(cwd, () => remote);
    const temp = isTemporary(cwd);
    return (
      this.byRemote(own) ??
      this.byPrRepo(cwd, remote, own, temp) ??
      byScratchpadOwner(cwd, dirs) ??
      this.byTemporaryDir(cwd, temp) ??
      this.placeByDir(own)
    );
  }

  /** Placement by the directory's git remote, or null when it has none. */
  private byRemote(own: ProjectRef): Place | null {
    return own.repo ? this.placeByDir(own) : null;
  }

  /**
   * Placement for a directory gone from this machine (a container's checkout) or a temporary one
   * (`temp`): the repository of the PRs opened from it, when they all point to one. Null otherwise.
   */
  private byPrRepo(
    cwd: string,
    remote: string | null | undefined,
    own: ProjectRef,
    temp: boolean,
  ): Place | null {
    // `/tmp` itself is the shared project's path, which a repository must never take over
    const eligible = (remote === undefined || temp) && own.path !== TEMP_PROJECT.path;
    const repo = eligible ? this.prRepoOf(cwd) : null;
    if (!repo) return null;
    // Resolved as if the PRs' repository were the directory's remote, so it merges the same way
    return this.placeByDir(resolveProject(cwd, () => `https://${repo}`));
  }

  /** Placement of a temporary directory (`temp`) in the shared `TEMP_PROJECT`, or null for any other. */
  private byTemporaryDir(cwd: string, temp: boolean): Place | null {
    if (!temp) return null;
    return {
      id: this.projectId({ ...TEMP_PROJECT, label: null, repo: null }),
      label: runLabel(cwd),
    };
  }

  /**
   * `placeOf` for sessions already assigned, or null to leave them where they are. A directory that
   * is gone can't have its remote read any more, so only the rules that don't need it (PRs,
   * scratchpad, temporary) may move it, and never away from a repository it was already placed in.
   */
  private replaceOf(
    cwd: string,
    remote: string | null | undefined,
    dirs = this.launchDirProjects(),
  ): Place | null {
    if (remote !== undefined) return this.placeOf(cwd, remote, dirs);
    if (this.q.repoOfCwd.get(cwd)) return null;
    if (!isTemporary(cwd) && !scratchpadOwner(cwd) && !this.prRepoOf(cwd)) return null;
    return this.placeOf(cwd, remote, dirs);
  }

  /** The project row of a resolved directory, with its label. */
  private placeByDir(p: ProjectRef): Place {
    return { id: this.projectId(p), label: p.label };
  }

  /**
   * The repository (`host/owner/repo`) of every PR opened from sessions launched in `cwd`, or null
   * when there are none or they point to more than one: a shared path like `/work/clone` may hold
   * different repositories over time, and then the PRs can't say which. A URL of another shape
   * says nothing either way and is skipped.
   */
  private prRepoOf(cwd: string): string | null {
    const urls = this.q.prUrlsOfCwd.all(cwd) as { ref: string }[];
    const repos = new Set(urls.flatMap((r) => repoOfPrUrl(r.ref)?.key ?? []));
    const [only] = repos;
    return repos.size === 1 && only ? only : null;
  }

  /**
   * The project of each launch directory, keyed by the name Claude Code encodes it to (see
   * `encodeDir`), for placing scratchpads. Temporary directories are left out, so a scratchpad
   * never claims another.
   */
  private launchDirProjects(): Map<string, number> {
    const rows = this.q.launchDirs.all() as { cwd: string; projectId: number }[];
    return new Map(
      rows.filter((r) => !isTemporary(r.cwd)).map((r) => [encodeDir(r.cwd), r.projectId]),
    );
  }

  /**
   * Re-places the sessions launched where `sessionId` was when this read of its file added a PR:
   * a PR can be what tells which repository a gone or temporary directory holds.
   */
  private replaceAfterPr(sessionId: string, prsBefore: number, fileId: number): void {
    if (this.prCount(fileId) <= prsBefore) return;
    const cwd = (this.q.sessionInfo.get(sessionId) as SessionInfoRow | null)?.launch_cwd;
    if (!cwd) return;
    const remote = this.lookupRemote(projectDir(cwd));
    // Only these directories take a PR's repository; skip the usual case of a live checkout
    if (remote !== undefined && !isTemporary(cwd)) return;
    const place = this.replaceOf(cwd, remote);
    if (!place) return;
    this.q.reassignProject.run(place.id, place.label, cwd);
    this.q.deleteOrphanProjects.run();
  }

  /** PRs recorded from a file so far. */
  private prCount(fileId: number): number {
    return (this.q.filePrCount.get(fileId) as { n: number }).n;
  }

  /**
   * Re-places scratchpad runs that went to `TEMP_PROJECT` because their owner's log hadn't been
   * read yet: log folders are read in name order, and the owner's may come later.
   */
  private placeWaitingScratchpads(): void {
    const waiting = (this.q.tempLaunchDirs.all(TEMP_PROJECT.path) as { cwd: string }[]).filter(
      (r) => scratchpadOwner(r.cwd),
    );
    if (waiting.length === 0) return;
    const dirs = this.launchDirProjects();
    for (const { cwd } of waiting) {
      const place = byScratchpadOwner(cwd, dirs);
      if (place) this.q.reassignProject.run(place.id, place.label, cwd);
    }
    this.q.deleteOrphanProjects.run();
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
   * Sessions whose directory is gone stay as they are unless a rule other than the git remote
   * places them (see `replaceOf`); projects left without sessions are deleted.
   */
  private reassignProjects(): void {
    const cwds = this.db
      .query<{ cwd: string }, []>(
        "SELECT DISTINCT launch_cwd AS cwd FROM sessions WHERE launch_cwd IS NOT NULL",
      )
      .all();
    const dirs = this.launchDirProjects();
    for (const { cwd } of cwds) {
      const place = this.replaceOf(cwd, this.lookupRemote(projectDir(cwd)), dirs);
      if (place) this.q.reassignProject.run(place.id, place.label, cwd);
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
      agg.sdk,
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
    const value = readKv(this.db, DERIVED_VERSION_KEY);
    return value === undefined ? null : Number(value);
  }

  /** Records that derived data is now computed with the current DERIVED_VERSION. */
  private storeDerivedVersion(): void {
    writeKv(this.db, DERIVED_VERSION_KEY, String(DERIVED_VERSION));
  }
}

/**
 * Placement of a Claude Code scratchpad with the project of the session that made it (`dirs` from
 * `launchDirProjects`), or null when it isn't one or its owner isn't placed yet.
 */
function byScratchpadOwner(cwd: string, dirs: Map<string, number>): Place | null {
  const owner = scratchpadOwner(cwd);
  const parent = owner ? dirs.get(owner) : undefined;
  return parent !== undefined ? { id: parent, label: runLabel(cwd) } : null;
}

/**
 * Secondary label of a run in a temporary directory or scratchpad: the directory's name, which
 * often says what the run was for (`loop-deny-probe`, `permtest`). A scratchpad's own root says
 * nothing, so it gets none.
 */
function runLabel(cwd: string): string | null {
  const name = basename(cwd);
  return name === "scratchpad" ? null : name;
}

/**
 * Room each line leaves in `seq` for the blocks of its record: a line's rows are numbered from
 * its byte offset times this, plus the block index, so rows sort in file order (see the schema).
 */
const SEQ_PER_LINE = 16;

/** The `seq` of a line's first row, from the line's byte offset in the file. */
function lineSeq(offset: number): number {
  return offset * SEQ_PER_LINE;
}

/** A record's message ID: its uuid, or the file and position when it has none. */
function recordId(r: Rec, fileId: number, seq: number): string {
  return str(r.uuid) ?? `${fileId}:${seq}`;
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
  return inside.some(
    (r) =>
      isPrompt(r) || r.kind === "sdk_prompt" || r.kind === "scheduled" || r.kind === "tool_use",
  );
}

/** Whether a row is something the user asked for (a prompt or a slash command). */
function isPrompt(r: ActivityRow): boolean {
  return r.kind === "prompt" || r.kind === "command";
}

/**
 * Title for a work block until a summary exists: the first line of its first prompt (a typed
 * prompt preferred over a command, then the SDK input of a headless session), else of its last reply.
 */
function fallbackTitle(inside: ActivityRow[]): string | null {
  const prompts = inside.filter(isPrompt);
  const firstPrompt =
    prompts.find((r) => r.kind === "prompt") ??
    prompts[0] ??
    inside.find((r) => r.kind === "sdk_prompt");
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
