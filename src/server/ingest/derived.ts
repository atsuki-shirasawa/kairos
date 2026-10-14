// Data derived from stored rows rather than read from the logs: copy marks of continued sessions,
// session aggregates and work blocks. It can be recomputed from the DB at any time, which is how
// a DERIVED_VERSION bump reaches sessions whose logs are gone.
import type { Database } from "bun:sqlite";
import { readKv, writeKv } from "../db/kv.ts";
import type { ProjectPlacer } from "./placement.ts";
import { workBlocks } from "./segments.ts";
import type { ActivityRow, AggregateRow, Statements } from "./statements.ts";

/** The kv key that holds the DERIVED_VERSION the stored derived data was computed with. */
const DERIVED_VERSION_KEY = "derived_version";

/** What `DerivedData` computes with. */
export interface DerivedOptions {
  /** The longest pause inside one work block. */
  gapMs: number;
  /** The current DERIVED_VERSION; stored data computed with another is recomputed. */
  version: number;
}

/** Recomputes a session's derived data from its stored rows. */
export class DerivedData {
  constructor(
    private readonly db: Database,
    private readonly q: Statements,
    private readonly placer: ProjectPlacer,
    private readonly opts: DerivedOptions,
  ) {}

  /** Recomputes aggregates and work blocks from messages. */
  refreshSession(sessionId: string): void {
    if (this.q.hasPredecessor.get(sessionId)) this.markCopies(sessionId);
    this.updateAggregates(sessionId);
    this.rebuildSegments(sessionId);
  }

  /** Refreshes a main session and the session continuing it, returning the IDs refreshed. */
  refreshWithContinuation(sessionId: string): string[] {
    this.refreshSession(sessionId);
    // If the continued session was ingested first, this is where we learn which part is a copy
    const next = this.q.continuedIn.get(sessionId) as { id: string } | null;
    if (!next) return [sessionId];
    this.refreshSession(next.id);
    return [sessionId, next.id];
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

  /** Replaces the session's work blocks with ones recomputed from its activity. */
  private rebuildSegments(sessionId: string): void {
    const blocks = workBlocks(this.q.activity.all(sessionId) as ActivityRow[], this.opts.gapMs);
    this.q.clearSegments.run(sessionId);
    for (const b of blocks)
      this.q.insertSegment.run(sessionId, b.start, b.end, b.prompts, b.fallbackTitle);
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
