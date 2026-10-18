// Reports how recomputing work blocks with the current code (`workBlocks`) would change the stored
// ones, without writing anything: how many blocks split, join, move or go, what happens to their
// summaries and open items, and examples to read. Run it against the everyday DB (opened read-only)
// before a change to the block rules ships with a DERIVED_VERSION bump. Usage:
//   bun scripts/blocks-diff.ts [--db <path>] [--examples 10]
import { Database } from "bun:sqlite";
import { parseArgs } from "node:util";
import {
  type BlockChanges,
  carryIds,
  type StoredBlock,
  unchanged,
  type WorkBlock,
  workBlocks,
} from "../src/server/ingest/segments.ts";
import type { ActivityRow } from "../src/server/ingest/statements.ts";
import { prepareStatements } from "../src/server/ingest/statements.ts";
import type { PrMark } from "../src/server/ingest/topics.ts";
import { DEFAULT_DB_PATH } from "../src/server/paths.ts";
import { MINUTE } from "../src/shared/dates.ts";
import { printableLine } from "../src/shared/text.ts";

/** Duration buckets the report counts blocks in, by upper bound. */
const BUCKETS: [label: string, upTo: number][] = [
  ["< 10 min", 10 * MINUTE],
  ["10–60 min", 60 * MINUTE],
  ["1–3 h", 180 * MINUTE],
  ["> 3 h", Number.POSITIVE_INFINITY],
];

/** One session's stored blocks and what recomputing them gives. */
interface SessionDiff {
  sessionId: string;
  stored: StoredBlock[];
  recomputed: WorkBlock[];
  changes: BlockChanges;
}

/** Counts of blocks by duration bucket, and the most prompts in one block. */
function distribution(blocks: { start: number; end: number; prompts: number }[]): string {
  const counts = BUCKETS.map(([label, upTo], i) => {
    const from = BUCKETS[i - 1]?.[1] ?? 0;
    const n = blocks.filter((b) => b.end - b.start >= from && b.end - b.start < upTo).length;
    return `${label}: ${n}`;
  });
  const most = Math.max(0, ...blocks.map((b) => b.prompts));
  return `${blocks.length} blocks (${counts.join(", ")}; most prompts ${most})`;
}

/** Recomputes one session's blocks, without storing them. */
function recomputeSession(q: ReturnType<typeof prepareStatements>, sessionId: string): SessionDiff {
  const activity = q.activity.all(sessionId) as ActivityRow[];
  const prs = q.prsOpened.all(sessionId) as PrMark[];
  const stored = q.storedBlocks.all(sessionId) as StoredBlock[];
  const recomputed = workBlocks(activity, prs);
  return { sessionId, stored, recomputed, changes: carryIds(stored, recomputed) };
}

/** Block ids → how many of a row refer to them (summaries, open items). */
function countByBlock(db: Database, sql: string): Map<number, number> {
  const rows = db.query(sql).all() as { id: number; n: number }[];
  return new Map(rows.map((r) => [r.id, r.n]));
}

/** "10/14 09:30–11:05 (95 min, 12 prompts) title" for an example line. */
function describe(b: {
  start: number;
  end: number;
  prompts: number;
  fallbackTitle: string | null;
}) {
  const day = new Date(b.start).toLocaleDateString("en-CA", { month: "2-digit", day: "2-digit" });
  const time = (t: number) => new Date(t).toTimeString().slice(0, 5);
  const minutes = Math.round((b.end - b.start) / MINUTE);
  const title = printableLine(b.fallbackTitle ?? "").slice(0, 70);
  return `${day} ${time(b.start)}–${time(b.end)} (${minutes} min, ${b.prompts} prompts) ${title}`;
}

/** The recomputed blocks that overlap a stored one. */
function partsOf(stored: StoredBlock, recomputed: WorkBlock[]): WorkBlock[] {
  return recomputed.filter((b) => b.start <= stored.end && b.end >= stored.start);
}

/** Prints the totals: blocks before and after, and how the stored ones change. */
function printTotals(
  diffs: SessionDiff[],
  summaries: Map<number, number>,
  items: Map<number, number>,
) {
  const stored = diffs.flatMap((s) => s.stored);
  const recomputed = diffs.flatMap((s) => s.recomputed);
  console.log(`Before: ${distribution(stored)}`);
  console.log(`After:  ${distribution(recomputed)}`);
  const byId = new Map(stored.map((b) => [b.id, b]));
  const kept = diffs.flatMap((s) => s.changes.kept);
  const same = kept.filter(({ id, block }) => unchanged(byId.get(id), block));
  const moved = kept.filter(({ id, block }) => !unchanged(byId.get(id), block));
  const merged = diffs.flatMap((s) => s.changes.merged.map((m) => m.id));
  const dropped = diffs.flatMap((s) => s.changes.dropped);
  const added = diffs.reduce((n, s) => n + s.changes.added.length, 0);
  const has = (ids: number[], m: Map<number, number>) =>
    ids.reduce((n, id) => n + (m.get(id) ?? 0), 0);
  const rows: [string, number[]][] = [
    ["unchanged", same.map((k) => k.id)],
    ["moved (start, end or prompts change)", moved.map((k) => k.id)],
    ["merged into another", merged],
    ["dropped", dropped],
  ];
  console.log("\nStored blocks:");
  for (const [label, ids] of rows) {
    console.log(
      `  ${label}: ${ids.length} (summaries ${has(ids, summaries)}, open items ${has(ids, items)})`,
    );
  }
  console.log(`  new blocks split off: ${added}`);
}

/** Prints the stored blocks that split into the most parts, with the parts. */
function printSplits(diffs: SessionDiff[], limit: number) {
  const splits = diffs
    .flatMap((s) => s.stored.map((b) => ({ b, parts: partsOf(b, s.recomputed) })))
    .filter((x) => x.parts.length > 1)
    .sort((x, y) => y.parts.length - x.parts.length || y.b.end - y.b.start - (x.b.end - x.b.start));
  console.log(
    `\nSplit: ${splits.length} stored blocks. The ${Math.min(limit, splits.length)} most split:`,
  );
  for (const { b, parts } of splits.slice(0, limit)) {
    console.log(`\n  ${describe(b)}`);
    for (const p of parts) console.log(`    → ${describe(p)}`);
  }
}

/** Prints recomputed blocks that join several stored ones. */
function printJoins(diffs: SessionDiff[], limit: number) {
  const joins = diffs
    .flatMap((s) =>
      s.recomputed.map((r) => ({
        r,
        from: s.stored.filter((b) => b.start >= r.start && b.end <= r.end),
      })),
    )
    .filter((x) => x.from.length > 1);
  console.log(
    `\nJoined: ${joins.length} blocks from ${joins.reduce((n, j) => n + j.from.length, 0)} stored. Examples:`,
  );
  for (const { r, from } of joins.slice(0, limit)) {
    console.log(`\n  ${describe(r)}`);
    for (const b of from) console.log(`    ← ${describe(b)}`);
  }
}

const { values } = parseArgs({
  options: { db: { type: "string" }, examples: { type: "string", default: "10" } },
});
const db = new Database(values.db ?? DEFAULT_DB_PATH, { readonly: true });
const q = prepareStatements(db);
const sessions = q.sessionIds.all() as { id: string }[];
const diffs = sessions.map(({ id }) => recomputeSession(q, id));
const summaries = countByBlock(db, "SELECT block_id AS id, 1 AS n FROM summaries");
const items = countByBlock(
  db,
  "SELECT block_id AS id, COUNT(*) AS n FROM open_items GROUP BY block_id",
);
const limit = Number(values.examples);
if (!Number.isInteger(limit) || limit < 0) throw new Error("--examples takes a whole number");
printTotals(diffs, summaries, items);
printSplits(diffs, limit);
printJoins(diffs, limit);
