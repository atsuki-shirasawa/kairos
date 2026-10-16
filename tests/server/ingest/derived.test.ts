import type { Database } from "bun:sqlite";
import { beforeEach, expect, test } from "bun:test";
import { Ingester } from "../../../src/server/ingest/ingester.ts";
import { SID } from "../../fixtures/ids.ts";
import { putSummary } from "../summaryRows.ts";
import { min, setup } from "./helpers.ts";

let db: Database;
let projectsDir: string;

beforeEach(() => {
  const fresh = setup();
  fresh.ingester.scan();
  ({ db, projectsDir } = fresh);
});

/** The basic session's blocks with the summary and open items each one holds. */
const blocks = () =>
  db
    .query<
      { id: number; start: number; headline: string | null; stale: number | null; items: number },
      [string]
    >(
      `SELECT g.id, g.start, sm.headline,
              sm.covered_from != g.start OR sm.covered_until < g.end AS stale,
              (SELECT COUNT(*) FROM open_items i WHERE i.block_id = g.id) AS items
       FROM segments g LEFT JOIN summaries sm ON sm.block_id = g.id
       WHERE g.session_id = ? ORDER BY g.start`,
    )
    .all(SID.basic);

/** Recomputes every session's derived data with the given longest pause inside a block. */
const recompute = (gapMs?: number) => {
  db.query("DELETE FROM kv WHERE key = 'derived_version'").run();
  new Ingester(db, projectsDir, gapMs === undefined ? {} : { gapMs }).refreshAllIfOutdated();
};

/** An open item left by the basic session's block starting at `start`. */
const openItem = (start: number) =>
  db
    .query(
      `INSERT INTO open_items (block_id, opened_at, text)
       SELECT id, end, 'Check the login redirect' FROM segments WHERE session_id = ? AND start = ?`,
    )
    .run(SID.basic, start);

test("a summary stays with its block when the block's start moves, and turns stale", () => {
  putSummary(db, SID.basic, min(45), { headline: "Login screen" });
  const [, before] = blocks();
  // The block's first prompt gone (as if the log were rewritten): it now starts later
  db.query("DELETE FROM messages WHERE session_id = ? AND ts = ?").run(SID.basic, min(45));
  recompute();
  const [, after] = blocks();
  expect(after).toMatchObject({ id: before?.id, headline: "Login screen", stale: 1 });
  expect(after?.start).toBeGreaterThan(min(45));
});

test("a merge keeps the oldest block, which takes the other's summary and open items", () => {
  putSummary(db, SID.basic, min(45), { headline: "Login screen" });
  openItem(min(45));
  const [first] = blocks();
  recompute(60 * 60_000);
  expect(blocks()).toEqual([
    { id: first?.id ?? -1, start: min(0), headline: "Login screen", stale: 1, items: 1 },
  ]);
});

test("ids and summaries survive recomputing with unchanged rules", () => {
  putSummary(db, SID.basic, min(0), { headline: "Login form", coveredUntil: min(5) });
  openItem(min(0));
  const before = blocks();
  recompute();
  expect(blocks()).toEqual(before);
  expect(before[0]).toMatchObject({ headline: "Login form", stale: 0, items: 1 });
});

test("a split keeps the summary on the larger part", () => {
  recompute(60 * 60_000);
  putSummary(db, SID.basic, min(0), { headline: "Login screen" });
  const [merged] = blocks();
  recompute();
  // 45–50.2 min is the longer of the two parts (0–5 min)
  expect(blocks()).toMatchObject([
    { start: min(0), headline: null },
    { id: merged?.id, start: min(45), headline: "Login screen", stale: 1 },
  ]);
});

test("a merge of two summarized blocks keeps the summary that covers more", () => {
  putSummary(db, SID.basic, min(0), { headline: "Short one", coveredUntil: min(1) });
  putSummary(db, SID.basic, min(45), { headline: "Long one", coveredUntil: min(50.2) });
  recompute(60 * 60_000);
  expect(blocks()).toMatchObject([{ start: min(0), headline: "Long one" }]);
});

test("a block that is gone takes back what its summary closed, but not the log's closes", () => {
  openItem(min(0));
  const [first, second] = blocks();
  db.query(
    `INSERT INTO open_items (block_id, opened_at, text, closed_at, closed_block_id, closed_by)
     VALUES (?1, 1, 'by the summary', 2, ?2, 'model'), (?1, 1, 'by the log', 2, ?2, 'ref')`,
  ).run(first?.id ?? -1, second?.id ?? -1);
  // Every message of the second block gone: no recomputed block overlaps it
  db.query("DELETE FROM messages WHERE session_id = ? AND ts >= ?").run(SID.basic, min(40));
  recompute();
  expect(
    db
      .query("SELECT text, closed_by, closed_block_id FROM open_items WHERE text LIKE 'by %'")
      .all(),
  ).toEqual([
    { text: "by the summary", closed_by: null, closed_block_id: null },
    { text: "by the log", closed_by: "ref", closed_block_id: null },
  ]);
});
