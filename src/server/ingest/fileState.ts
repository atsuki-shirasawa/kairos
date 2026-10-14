import type { PendingOutcomes } from "./outcomes.ts";
import type { ReadResult } from "./reader.ts";
import type { Statements, StateRow } from "./statements.ts";

/** Interpretation state carried across reads of one file. Saved as JSON in ingest_state.state. */
export interface FileState {
  /** Whether we are inside a turn triggered by an automatic run (/loop, cron). */
  autoTurn: boolean;
  /** git commits awaiting their result: tool_use id → command. */
  pendingCommits: Record<string, string>;
  /** gh pr create calls awaiting their result: tool_use id → title. */
  pendingPrs: Record<string, string>;
  /**
   * gh pr merge calls awaiting their result: tool_use id → PR number (null when not named).
   * States saved before merges were tracked lack it; `parseState` fills it in from a fresh state.
   */
  pendingMerges: Record<string, number | null>;
}

/** The state a file starts from when it is read from the beginning. */
export function freshState(): FileState {
  return { autoTurn: false, pendingCommits: {}, pendingPrs: {}, pendingMerges: {} };
}

/**
 * A saved state, laid over a fresh one so fields added since it was saved get their initial value.
 */
export function parseState(json: string): FileState {
  return { ...freshState(), ...(JSON.parse(json) as Partial<FileState>) };
}

/** Remembers what a tool call awaits under its ID, until its result arrives. */
export function awaitOutcomes(
  state: FileState,
  toolUseId: string,
  outcomes: PendingOutcomes,
): void {
  if (outcomes.commit !== undefined) state.pendingCommits[toolUseId] = outcomes.commit;
  if (outcomes.prTitle !== undefined) state.pendingPrs[toolUseId] = outcomes.prTitle;
  if (outcomes.merge) state.pendingMerges[toolUseId] = outcomes.merge.number;
}

/** A file's row ID and the interpretation state to continue reading it with. */
export interface ResumedFile {
  fileId: number;
  state: FileState;
}

/** Which session (and subagent, if any) a log file belongs to. */
export interface FileOwner {
  sessionId: string;
  agentId: string | null;
}

/**
 * Loads and saves each file's resume point and interpretation state (ingest_state), written with
 * `parserVersion` so a state left by other interpretation rules is discarded rather than resumed.
 */
export class FileStateStore {
  constructor(
    private readonly q: Statements,
    private readonly parserVersion: number,
  ) {}

  /** The file's saved ingest state, or null if there is none or a different parser version wrote it. */
  load(path: string): StateRow | null {
    const st = this.q.getState.get(path) as StateRow | null;
    if (st && st.parser_version !== this.parserVersion) {
      this.q.deleteState.run(st.id); // messages and artifacts go too (ON DELETE CASCADE)
      return null;
    }
    return st;
  }

  /**
   * Returns the file's ID and the state to continue from: a new row for an unseen file, a fresh
   * state with the file's rows cleared for a restarted one, or the saved state otherwise.
   */
  resume(path: string, owner: FileOwner, saved: StateRow | null, read: ReadResult): ResumedFile {
    if (!saved) {
      const row = this.q.insertState.get(
        path,
        owner.sessionId,
        owner.agentId,
        this.parserVersion,
      ) as { id: number };
      return { fileId: row.id, state: freshState() };
    }
    if (read.restarted) {
      this.clearRows(saved.id);
      return { fileId: saved.id, state: freshState() };
    }
    return { fileId: saved.id, state: parseState(saved.state) };
  }

  /** Saves where to resume reading and the interpretation state carried to the next read. */
  save(fileId: number, read: ReadResult, state: FileState): void {
    this.q.saveState.run(
      read.nextOffset,
      read.size,
      read.ino,
      this.parserVersion,
      JSON.stringify(state),
      fileId,
    );
  }

  /** Deletes everything ingested from a file, so it can be read again from the start. */
  private clearRows(fileId: number): void {
    this.q.clearFile.run(fileId);
    this.q.clearFileArtifacts.run(fileId);
    this.q.clearFileUsage.run(fileId);
    this.q.clearFileTurns.run(fileId);
  }
}
