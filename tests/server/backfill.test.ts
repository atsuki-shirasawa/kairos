import type { Database } from "bun:sqlite";
import { beforeEach, expect, test } from "bun:test";
import {
  type BackfillProgress,
  backfill,
  MAX_CONSECUTIVE_FAILURES,
} from "../../src/server/summarize/backfill.ts";
import { findTargets } from "../../src/server/summarize/store.ts";
import { Summarizer } from "../../src/server/summarize/summarizer.ts";
import { SID } from "../fixtures/ids.ts";
import { min, setup } from "./ingest/helpers.ts";

let db: Database;
let reply: () => Promise<string>;
// Well past the 7-day automatic window, so only a backfill reaches these sections
const now = min(0) + 30 * 24 * 60 * 60_000;
let summarizer: Summarizer;

beforeEach(() => {
  const s = setup();
  s.ingester.scan();
  db = s.db;
  reply = async () => "# A headline\n\n- Done: something";
  summarizer = new Summarizer(db, () => reply(), { now: () => now, model: "test-model" });
});

const summarized = () =>
  db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM summaries").get()?.n ?? 0;

test("finds old sections the automatic loop skips, newest first, with the automatic modes", () => {
  expect(summarizer.next()).toBeNull();
  const targets = findTargets(db, now);
  expect(targets.length).toBeGreaterThan(2);
  const ends = targets.map((t) =>
    db
      .query<{ end: number }, [string, number]>(
        "SELECT end FROM segments WHERE session_id = ? AND start = ?",
      )
      .get(t.sessionId, t.start),
  );
  const endTimes = ends.map((e) => e?.end ?? 0);
  expect(endTimes).toEqual([...endTimes].sort((a, b) => b - a));
  expect(targets).toContainEqual(
    expect.objectContaining({ sessionId: SID.basic, start: min(0), mode: "title" }),
  );
  expect(targets).toContainEqual(
    expect.objectContaining({ sessionId: SID.basic, start: min(45), mode: "summary" }),
  );
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
