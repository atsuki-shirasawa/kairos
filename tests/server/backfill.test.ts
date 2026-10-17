import type { Database } from "bun:sqlite";
import { beforeEach, expect, test } from "bun:test";
import {
  type BackfillProgress,
  backfill,
  MAX_CONSECUTIVE_FAILURES,
} from "../../src/server/summarize/backfill.ts";
import { findOldFormat, findTargets } from "../../src/server/summarize/store.ts";
import { Summarizer } from "../../src/server/summarize/summarizer.ts";
import { SID } from "../fixtures/ids.ts";
import { markdownRunner } from "./answers.ts";
import { min, setup } from "./ingest/helpers.ts";
import { putSummary } from "./summaryRows.ts";

let db: Database;
let reply: () => Promise<string>;
// Well past the 7-day automatic window, so only a backfill reaches these sections
const now = min(0) + 30 * 24 * 60 * 60_000;
let summarizer: Summarizer;

beforeEach(() => {
  const s = setup();
  s.ingester.scan();
  db = s.db;
  reply = async () => "# A headline\n\n- Goal: something\n- Done: something";
  summarizer = new Summarizer(
    db,
    markdownRunner(() => reply()),
    { now: () => now, model: "test-model" },
  );
});

const summarized = () =>
  db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM summaries").get()?.n ?? 0;

test("finds old sections the automatic loop skips, newest sessions first, with the automatic modes", () => {
  expect(summarizer.nextJob()).toBeNull();
  const targets = findTargets(db, now);
  expect(targets.length).toBeGreaterThan(2);
  const lastEnd = (sessionId: string) =>
    db
      .query<{ end: number }, [string]>("SELECT MAX(end) AS end FROM segments WHERE session_id = ?")
      .get(sessionId)?.end ?? 0;
  const sessionEnds = targets.map((t) => lastEnd(t.sessionId));
  expect(sessionEnds).toEqual([...sessionEnds].sort((a, b) => b - a));
  // Within a session, its sections come in order, so the ledger sees what earlier ones left open
  const basic = targets.filter((t) => t.sessionId === SID.basic).map((t) => t.start);
  expect(basic).toEqual([min(0), min(45)]);
  expect(targets).toContainEqual(
    expect.objectContaining({ sessionId: SID.basic, start: min(0), mode: "title" }),
  );
  expect(targets).toContainEqual(
    expect.objectContaining({ sessionId: SID.basic, start: min(45), mode: "summary" }),
  );
});

test("includes headless sessions, but never Kairos's own summary runs", () => {
  const ids = findTargets(db, now, {
    hiddenCwds: ["/Users/me/tmp/scratch/kairos-data/summarizer"],
  }).map((t) => t.sessionId);
  expect(ids).toContain(SID.headless);
  expect(ids).toContain(SID.sdkCommand);
  expect(ids).not.toContain(SID.summarizerRun);
});

test("leaves out sections with no conversation, which would otherwise come back on every run", () => {
  const section = findTargets(db, now).find((t) => t.mode === "summary");
  if (!section) throw new Error("fixture has no full-summary section");
  // As if the section held only scheduled runs
  db.run("UPDATE messages SET is_scheduled = 1 WHERE session_id = ? AND ts >= ?", [
    section.sessionId,
    section.start,
  ]);
  expect(findTargets(db, now)).not.toContainEqual(
    expect.objectContaining({ sessionId: section.sessionId, start: section.start }),
  );
});

test("--since / --until / --limit narrow the targets", () => {
  const all = findTargets(db, now);
  expect(findTargets(db, now, { startFrom: min(45), startBefore: min(46) })).toEqual(
    all.filter((t) => t.start === min(45)),
  );
  expect(findTargets(db, now, { limit: 2 })).toEqual(all.slice(0, 2));
  // What a running server summarizes itself is left out
  expect(findTargets(db, now, { endedBefore: min(46) })).toEqual(
    all.filter((t) => t.start < min(45)),
  );
});

test("summarizes every target, reports each, and leaves nothing behind", async () => {
  const targets = findTargets(db, now);
  const progress: BackfillProgress[] = [];
  const result = await backfill(db, summarizer, targets, { onProgress: (p) => progress.push(p) });
  expect(progress.map((p) => p.index)).toEqual(targets.map((_, i) => i + 1));
  const done = result.counts.summary + result.counts.title;
  expect(done + result.counts.skipped).toBe(targets.length);
  expect(result).toMatchObject({ abortedBy: null, counts: { failed: 0 } });
  expect(progress.find((p) => p.status === "summary")?.detail).toBe("A headline");
  expect(summarized()).toBe(done);
  // Sections with no conversation are never targets, so nothing comes back on the next run
  expect(result.counts.skipped).toBe(0);
  expect(findTargets(db, now)).toEqual([]);
});

test("stops after repeated failures instead of failing every section", async () => {
  reply = async () => {
    throw new Error("Not logged in");
  };
  const targets = findTargets(db, now);
  expect(targets.length).toBeGreaterThan(MAX_CONSECUTIVE_FAILURES);
  const result = await backfill(db, summarizer, targets);
  expect(result.counts.failed).toBe(MAX_CONSECUTIVE_FAILURES);
  expect(result.abortedBy).toBe("Not logged in");
  expect(summarized()).toBe(0);
});

/** Makes a fixture section long enough for a full summary (the ledger scenario's are short). */
function lengthen(sessionId: string, start: number): void {
  db.run(
    "UPDATE segments SET end = start + 20 * 60000, prompt_count = 3 WHERE session_id = ? AND start = ?",
    [sessionId, start],
  );
}

test("finds full summaries in the old format oldest first, and regenerating them leaves none", async () => {
  lengthen(SID.ledgerOpen, min(1700));
  lengthen(SID.ledgerClose, min(1800));
  // Old format: written before prompt versions, as putSummary stores them
  putSummary(db, SID.ledgerClose, min(1800));
  putSummary(db, SID.basic, min(45));
  putSummary(db, SID.ledgerOpen, min(1700));
  // A headline-only section has no open items to recover, and a headless run none to track
  putSummary(db, SID.basic, min(0), { body: "" });
  putSummary(db, SID.headless, headlessStart());
  const old = findOldFormat(db, now);
  expect(old.map((t) => [t.sessionId, t.start, t.mode])).toEqual([
    [SID.basic, min(45), "summary"],
    [SID.ledgerOpen, min(1700), "summary"],
    [SID.ledgerClose, min(1800), "summary"],
  ]);
  expect(findOldFormat(db, now, { startFrom: min(1000), limit: 1 }).map((t) => t.start)).toEqual([
    min(1700),
  ]);

  const result = await backfill(db, summarizer, old);
  expect(result.counts.summary).toBe(3);
  expect(findOldFormat(db, now)).toEqual([]);
});

test("also regenerates the full summaries after an old-format one in its session, which couldn't settle it", async () => {
  lengthen(SID.ledgerOpen, min(1700));
  lengthen(SID.ledgerOpen, min(1740));
  await summarizer.summarize({ sessionId: SID.ledgerOpen, start: min(1740), mode: "summary" });
  expect(findOldFormat(db, now)).toEqual([]);

  putSummary(db, SID.ledgerOpen, min(1700));
  expect(findOldFormat(db, now).map((t) => [t.start, t.oldFormat])).toEqual([
    [min(1700), true],
    [min(1740), false],
  ]);
});

test("leaves out a section still in progress", () => {
  lengthen(SID.ledgerClose, min(1800));
  putSummary(db, SID.ledgerClose, min(1800));
  const end = db
    .query<{ end: number }, [string]>("SELECT MAX(end) AS end FROM segments WHERE session_id = ?")
    .get(SID.ledgerClose)?.end;
  expect(findOldFormat(db, end ?? 0)).toEqual([]);
});

/** The start of the headless fixture session's first section. */
function headlessStart(): number {
  return (
    db
      .query<{ start: number }, [string]>(
        "SELECT MIN(start) AS start FROM segments WHERE session_id = ?",
      )
      .get(SID.headless)?.start ?? 0
  );
}
