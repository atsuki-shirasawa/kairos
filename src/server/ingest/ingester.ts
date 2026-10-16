import type { Database, Statement } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { WORK_BLOCK_GAP_MS } from "../../shared/sections.ts";
import { classifyUser } from "./classify.ts";
import { extractCommit } from "./commits.ts";
import { DerivedData } from "./derived.ts";
import { awaitOutcomes, type FileState, FileStateStore } from "./fileState.ts";
import { classifyPath, listFiles } from "./files.ts";
import { nextAutoTurn, storedUserKind, storedUserText } from "./interpret.ts";
import { LIMIT } from "./limits.ts";
import { pendingOutcomes } from "./outcomes.ts";
import { ProjectPlacer } from "./placement.ts";
import { type RemoteLookup, readGitRemote, worktreeName } from "./project.ts";
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
import {
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

const RECAP_SUFFIX = /\s*\(disable recaps in \/config\)\s*$/;

interface Ctx {
  sessionId: string;
  agentId: string | null;
  fileId: number;
  state: FileState;
  launchKnown: boolean;
  branchKnown: boolean;
}

/** A message a record handler stores; the file being read supplies its session, agent and file. */
interface NewMessage {
  id: string;
  seq: number;
  ts: number | null;
  kind: string;
  text: string | null;
  toolName?: string;
  toolUseId?: string | null;
  isError?: boolean;
  meta?: string | null;
  /** A note about the session, never part of an automatic run's turn. */
  note?: boolean;
}

/** Outcome of one scan: files seen, files that changed, touched session IDs, and elapsed ms. */
export interface ScanStats {
  files: number;
  changed: number;
  sessions: Set<string>;
  ms: number;
}

/** Optional settings of an Ingester; the defaults are what the server and CLI use. */
export interface IngesterOptions {
  /** The longest pause inside one work block (default `WORK_BLOCK_GAP_MS`). */
  gapMs?: number;
  /** How to read the git remote. Tests replace it with one that does not touch real directories. */
  lookupRemote?: RemoteLookup;
}

/**
 * Incrementally ingests the logs under `projectsDir` into the DB, resuming each file from its
 * saved offset. Never writes to the logs themselves.
 */
export class Ingester {
  private readonly q: Statements;
  private readonly setters: Record<SessionField, Statement>;
  private readonly fileStates: FileStateStore;
  private readonly placer: ProjectPlacer;
  private readonly derived: DerivedData;

  constructor(
    private readonly db: Database,
    readonly projectsDir: string,
    { gapMs = WORK_BLOCK_GAP_MS, lookupRemote = readGitRemote }: IngesterOptions = {},
  ) {
    this.q = prepareStatements(db);
    this.setters = prepareSessionSetters(db);
    this.fileStates = new FileStateStore(this.q, PARSER_VERSION);
    this.placer = new ProjectPlacer(this.q, lookupRemote);
    this.derived = new DerivedData(db, this.q, this.placer, { gapMs, version: DERIVED_VERSION });
  }

  // ---------------------------------------------------------------- scanning

  /** Ingests every file under projects: main session files first, then subagents. */
  scan(onProgress?: (done: number, total: number) => void): ScanStats {
    const { files, stats, started } = this.startScan();
    files.forEach((path, i) => {
      this.scanFile(path, stats);
      onProgress?.(i + 1, files.length);
    });
    for (const sid of this.placer.placeWaitingScratchpads()) stats.sessions.add(sid);
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
    for (const sid of this.placer.placeWaitingScratchpads()) stats.sessions.add(sid);
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
      const prsBefore = this.placer.prCount(fileId);
      this.handleLines(ctx, read.lines);
      this.fileStates.save(fileId, read, ctx.state);
      const moved = this.placer.replaceAfterPr(file.sessionId, prsBefore, fileId);
      const refreshed =
        agentId !== null ? [file.sessionId] : this.derived.refreshWithContinuation(file.sessionId);
      return [...new Set([...refreshed, ...moved])];
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
    this.insert(ctx, { id, seq, ts, kind, text, note: kind === "compact_summary" });
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
      this.insert(ctx, {
        id: `${id}:${i}`,
        seq: seq + i,
        ts,
        kind: "tool_result",
        text: clipEnds(output, LIMIT.toolResult),
        toolUseId,
        isError,
      });
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
      this.insert(ctx, {
        id,
        seq,
        ts,
        kind: "error",
        text: clip(contentText(msg.content), LIMIT.short),
      });
      return;
    }
    this.recordUsage(ctx, msg, str(r.effort) ?? null, ts);
    list(msg.content).forEach((b, i) => {
      const block = rec(b);
      if (!block) return;
      if (block.type === "text") {
        const text = (str(block.text) ?? "").trim();
        if (!text) return;
        this.insert(ctx, {
          id: `${id}:${i}`,
          seq: seq + i,
          ts,
          kind: "assistant",
          text: clip(text, LIMIT.text),
        });
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
    this.insert(ctx, {
      id,
      seq,
      ts,
      kind: "tool_use",
      text: inputSummary(input),
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
    this.q.upsertUsage.run({
      sessionId: ctx.sessionId,
      messageId,
      agentId: ctx.agentId,
      fileId: ctx.fileId,
      ts,
      model,
      speed: str(u.speed) ?? null,
      effort,
      ...c,
    });
  }

  /** Stores compactions, turn durations and away summaries (recaps); other system records are ignored. */
  private handleSystem(ctx: Ctx, r: Rec, ts: number | null, seq: number): void {
    const id = recordId(r, ctx.fileId, seq);
    if (r.subtype === "compact_boundary") {
      const meta = rec(r.compactMetadata);
      this.insert(ctx, {
        id,
        seq,
        ts,
        kind: "compact",
        text: "Conversation compacted",
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
        this.insert(ctx, {
          id,
          seq,
          ts,
          kind: "away_summary",
          text: clip(text, LIMIT.short),
          note: true,
        });
    }
  }

  // ---------------------------------------------------------------- writing

  /** Inserts one message row (ignored if its ID was already stored). */
  private insert(ctx: Ctx, m: NewMessage): void {
    this.q.insertMessage.run({
      id: m.id,
      sessionId: ctx.sessionId,
      agentId: ctx.agentId,
      fileId: ctx.fileId,
      seq: m.seq,
      ts: m.ts,
      kind: m.kind,
      text: m.text,
      toolName: m.toolName ?? null,
      toolUseId: m.toolUseId ?? null,
      isError: m.isError ? 1 : 0,
      isScheduled: ctx.state.autoTurn && !m.note ? 1 : 0,
      meta: m.meta ?? null,
    });
  }

  /** Writes a session column from a meta record; empty values leave it unchanged. */
  private set(ctx: Ctx, col: SessionField, value: string | undefined): void {
    if (value) this.setters[col].run(value, ctx.sessionId);
  }

  /** Records the startup cwd and assigns the session to the project it resolves to. */
  private setLaunch(ctx: Ctx, cwd: string): void {
    const place = this.placer.placeLaunch(cwd);
    this.q.setLaunch.run(cwd, place.id, place.label, ctx.sessionId);
    ctx.launchKnown = true;
  }

  // ---------------------------------------------------------------- derived data

  /** Recomputes aggregates and work blocks from messages. */
  refreshSession(sessionId: string): void {
    this.derived.refreshSession(sessionId);
  }

  /** Recomputes all sessions if the derived-data calculation has changed. */
  refreshAllIfOutdated(): boolean {
    return this.derived.refreshAllIfOutdated();
  }
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
