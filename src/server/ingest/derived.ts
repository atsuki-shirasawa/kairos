// Data derived from stored rows rather than read from the logs: copy marks of continued sessions,
// session aggregates and work blocks. It can be recomputed from the DB at any time, which is how
// a DERIVED_VERSION bump reaches sessions whose logs are gone.
import type { Database } from "bun:sqlite";
import { readKv, writeKv } from "../db/kv.ts";
import { RUN_KINDS, type RunKind } from "../runKinds.ts";
import type { ProjectPlacer } from "./placement.ts";
import { type BlockOutput, blockRefs } from "./prRefs.ts";
import { runKindOf } from "./runKinds.ts";
import {
  type BlockTitler,
  carryIds,
  fallbackTitle,
  replyTitle,
  type StoredBlock,
  unchanged,
  workBlocks,
} from "./segments.ts";
import type { ActivityRow, AggregateRow, HeadlessRunRow, Statements } from "./statements.ts";
import type { PrMark } from "./topics.ts";
import { type TurnRow, turnSpans, type WaitRow } from "./turnSpans.ts";

/** The kv key that holds the DERIVED_VERSION the stored derived data was computed with. */
const DERIVED_VERSION_KEY = "derived_version";

/** What `DerivedData` computes with. */
export interface DerivedOptions {
  /** The longest pause inside one work block. */
  gapMs: number;
  /** The current DERIVED_VERSION; stored data computed with another is recomputed. */
  version: number;
}

/** The kind `classifyRuns` gave a session's runs (null for a person's), and the others it changed. */
interface RunsClassified {
  kind: RunKind | null;
  changed: string[];
}

/**
 * How a session's blocks are titled until summarized: an automation run's request is the loop's
 * fixed instruction, shared by all its runs, so its blocks take their last reply instead.
 */
function blockTitler(kind: RunKind | null): BlockTitler {
  return kind === RUN_KINDS.automation ? replyTitle : fallbackTitle;
}

/** Recomputes a session's derived data from its stored rows. */
export class DerivedData {
  constructor(
    private readonly db: Database,
    private readonly q: Statements,
    private readonly placer: ProjectPlacer,
    private readonly opts: DerivedOptions,
  ) {}

  /**
   * Recomputes aggregates and work blocks from messages. Returns the IDs whose blocks changed: the
   * session, then any other run of its directory whose kind it changed (see `retitleRuns`).
   */
  refreshSession(sessionId: string): string[] {
    if (this.q.hasPredecessor.get(sessionId)) this.markCopies(sessionId);
    this.updateAggregates(sessionId);
    const runs = this.classifyRuns(sessionId);
    this.retitleRuns(runs);
    const activity = this.activityOf(sessionId);
    this.rebuildBlocks(sessionId, activity, blockTitler(runs.kind));
    this.linkRefs(sessionId, activity);
    this.rebuildTurnSpans(sessionId);
    return [sessionId, ...runs.changed];
  }

  /** Refreshes a main session and the session continuing it, returning the IDs refreshed. */
  refreshWithContinuation(sessionId: string): string[] {
    const refreshed = this.refreshSession(sessionId);
    // If the continued session was ingested first, this is where we learn which part is a copy
    const next = this.q.continuedIn.get(sessionId) as { id: string } | null;
    if (!next) return refreshed;
    return [...new Set([...refreshed, ...this.refreshSession(next.id)])];
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
    this.q.updateAggregate.run({ ...agg, firstPrompt: first?.text ?? null, id: sessionId });
  }

  /**
   * Sets the run kind of the session and of every other headless run launched where it was (see
   * `runKindOf`): one more run, on a new day or with a PR, can turn its directory's earlier trial
   * runs into automation. A person's session has none, and refreshing one touches no run. Runs
   * after `updateAggregates`, which decides whether the session is headless, and after its
   * artifacts are stored.
   */
  private classifyRuns(sessionId: string): RunsClassified {
    this.q.clearRunKind.run(sessionId);
    const runs = this.q.headlessRunsBeside.all(sessionId) as HeadlessRunRow[];
    // A person's session changes no run's kind, so the directory's runs are left as they are
    if (!runs.some((r) => r.id === sessionId)) return { kind: null, changed: [] };
    const kind = runKindOf(runs.map((r) => ({ startedAt: r.startedAt, made: r.made === 1 })));
    const changed = runs.filter((r) => this.q.setRunKind.run(kind, r.id).changes > 0);
    return { kind, changed: changed.map((r) => r.id).filter((id) => id !== sessionId) };
  }

  /**
   * Rebuilds the blocks of the other runs whose kind just changed, which all took the session's
   * kind: an automation run's blocks are titled by what it reported (see `blockTitler`).
   */
  private retitleRuns({ kind, changed }: RunsClassified): void {
    for (const id of changed) this.rebuildBlocks(id, this.activityOf(id), blockTitler(kind));
  }

  /** The session's main-thread activity that blocks and refs are drawn from. */
  private activityOf(sessionId: string): ActivityRow[] {
    return this.q.activity.all(sessionId) as ActivityRow[];
  }

  /**
   * Replaces the session's work blocks with ones recomputed from its activity, carrying each
   * stored block's id to the new block it overlaps most (see `carryIds`).
   */
  private rebuildBlocks(sessionId: string, activity: ActivityRow[], titleOf: BlockTitler): void {
    const prs = this.q.prsOpened.all(sessionId) as PrMark[];
    const blocks = workBlocks(activity, prs, this.opts.gapMs, titleOf);
    const stored = this.q.storedBlocks.all(sessionId) as StoredBlock[];
    const changes = carryIds(stored, blocks);
    for (const { id, into } of changes.merged) this.mergeBlock(id, into);
    for (const id of changes.dropped) this.dropBlock(id);
    const byId = new Map(stored.map((s) => [s.id, s]));
    const changed = changes.kept.filter(({ id, block }) => !unchanged(byId.get(id), block));
    for (const { id, block } of changed)
      if (byId.get(id)?.start !== block.start) this.q.parkBlock.run(id);
    for (const { id, block } of changed) this.q.updateBlock.run({ ...block, id });
    for (const block of changes.added) this.q.insertBlock.run({ ...block, sessionId });
  }

  /**
   * Replaces the issue / PR numbers the session's blocks touched (see `blockRefs`). Run again for a
   * session that moved to another project, since its numbers belong to that project's repository.
   */
  linkRefs(sessionId: string, activity = this.activityOf(sessionId)): void {
    const repo = this.placer.sessionRepo(sessionId);
    const blocks = (this.q.storedBlocks.all(sessionId) as StoredBlock[]).sort(
      (a, b) => a.start - b.start,
    );
    const outputs = this.q.blockOutputs.all(sessionId) as BlockOutput[];
    this.q.clearBlockRefs.run(sessionId);
    for (const ref of blockRefs(blocks, activity, outputs, repo)) this.q.insertBlockRef.run(ref);
  }

  /** Replaces the session's spans of whose turn it was (see `turnSpans`). */
  private rebuildTurnSpans(sessionId: string): void {
    const times = (rows: unknown) => (rows as { ts: number }[]).map((r) => r.ts);
    const spans = turnSpans(
      {
        turns: this.q.ownTurns.all(sessionId) as TurnRow[],
        waits: this.q.askWaits.all(sessionId) as WaitRow[],
        prompts: times(this.q.promptTimes.all(sessionId)),
        interrupts: times(this.q.interruptTimes.all(sessionId)),
      },
      this.opts.gapMs,
    );
    this.q.clearTurnSpans.run(sessionId);
    for (const span of spans) this.q.insertTurnSpan.run({ ...span, sessionId });
  }

  /** Folds a stored block into the one it merged with, moving what references it, then drops it. */
  private mergeBlock(id: number, into: number): void {
    this.q.moveBlockItems.run(into, id);
    this.q.moveBlockClosures.run(into, id);
    this.q.moveBlockSummary.run(into, id);
    this.q.deleteBlock.run(id);
  }

  /** Deletes a stored block nothing recomputed overlaps, reopening what its summary closed. */
  private dropBlock(id: number): void {
    this.q.reopenClosedIn.run(id);
    this.q.deleteBlock.run(id);
  }

  /**
   * Recomputes all sessions, project assignment included, if the derived-data calculation has
   * changed since it was last stored. Returns whether it did.
   */
  refreshAllIfOutdated(): boolean {
    if (this.storedVersion() === this.opts.version) return false;
    this.db.transaction(() => {
      this.placer.reassignProjects();
      for (const { id } of this.q.sessionIds.all() as { id: string }[]) this.refreshSession(id);
      this.storeVersion();
    })();
    return true;
  }

  /** The DERIVED_VERSION the stored derived data was computed with, or null if never computed. */
  private storedVersion(): number | null {
    const value = readKv(this.db, DERIVED_VERSION_KEY);
    return value === undefined ? null : Number(value);
  }

  /** Records that derived data is now computed with the current DERIVED_VERSION. */
  private storeVersion(): void {
    writeKv(this.db, DERIVED_VERSION_KEY, String(this.opts.version));
  }
}
