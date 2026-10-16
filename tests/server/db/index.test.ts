import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MIGRATIONS, openDb, SCHEMA_VERSION } from "../../../src/server/db/index.ts";

/** Names of the indexes on a table. */
function indexes(db: Database, table: string): string[] {
  return db
    .query<{ name: string }, []>(`PRAGMA index_list(${table})`)
    .all()
    .map((r) => r.name);
}

test("a fresh DB has every migration applied", () => {
  const db = openDb(":memory:");
  expect(db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version).toBe(
    SCHEMA_VERSION,
  );
  expect(indexes(db, "messages")).toContain("messages_block");
  expect(indexes(db, "messages")).not.toContain("messages_time");
});

test("migration 12 swaps messages_time for messages_block, keeping an existing DB's messages", () => {
  const path = join(tmpdir(), `kairos-messages-block-${crypto.randomUUID()}.db`);
  const old = new Database(path, { create: true });
  for (const [i, sql] of MIGRATIONS.slice(0, 11).entries()) {
    old.run(sql);
    old.run(`PRAGMA user_version = ${i + 1}`);
  }
  old.run(
    "INSERT INTO ingest_state (id, path, session_id, parser_version) VALUES (1, 'f', 's', 1)",
  );
  old.run("INSERT INTO sessions (id) VALUES ('s')");
  old.run(
    "INSERT INTO messages (id, session_id, file_id, seq, ts, kind) VALUES ('m', 's', 1, 0, 5, 'tool_use')",
  );
  old.close();
  const upgraded = openDb(path);
  expect(upgraded.query("SELECT id, kind FROM messages").get()).toEqual({
    id: "m",
    kind: "tool_use",
  });
  expect(indexes(upgraded, "messages")).toContain("messages_block");
  expect(indexes(upgraded, "messages")).not.toContain("messages_time");
  upgraded.close();
});

test("migration 13 gives blocks ids and keys summaries and open items by them", () => {
  const path = join(tmpdir(), `kairos-block-ids-${crypto.randomUUID()}.db`);
  const old = new Database(path, { create: true });
  for (const [i, sql] of MIGRATIONS.slice(0, 12).entries()) {
    old.run(sql);
    old.run(`PRAGMA user_version = ${i + 1}`);
  }
  old.run("INSERT INTO sessions (id) VALUES ('s')");
  old.run("INSERT INTO segments (session_id, start, end) VALUES ('s', 100, 200), ('s', 300, 400)");
  // One summary at its block's start, one written when its block started at 310 (it now starts at
  // 300), and one overlapping no block at all
  old.run(`INSERT INTO summaries VALUES ('s', 100, 'first', 'b', 'm', 200, 1),
    ('s', 310, 'moved', 'b', 'm', 390, 2), ('s', 900, 'gone', 'b', 'm', 900, 3)`);
  old.run(`INSERT INTO open_items (id, session_id, start, opened_at, text, closed_at,
      closed_session_id, closed_start, closed_by)
    VALUES (5, 's', 100, 200, 'left open', 350, 's', 300, 'model'),
           (6, 's', 900, 900, 'orphan', NULL, NULL, NULL, NULL)`);
  old.close();

  const db = openDb(path);
  expect(
    db
      .query(
        `SELECT g.start, sm.headline, sm.covered_from
         FROM summaries sm JOIN segments g ON g.id = sm.block_id ORDER BY g.start`,
      )
      .all(),
  ).toEqual([
    { start: 100, headline: "first", covered_from: 100 },
    // Kept on the block it overlaps, and stale there, since it was written at another start
    { start: 300, headline: "moved", covered_from: 310 },
  ]);
  expect(
    db
      .query(
        `SELECT i.id, g.start, c.start AS closed_start FROM open_items i
         JOIN segments g ON g.id = i.block_id LEFT JOIN segments c ON c.id = i.closed_block_id`,
      )
      .all(),
  ).toEqual([{ id: 5, start: 100, closed_start: 300 }]);
  expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
  db.close();
});

test("migration 14 adds how a summary was written, null for the summaries before it", () => {
  const path = join(tmpdir(), `kairos-summary-runs-${crypto.randomUUID()}.db`);
  const old = new Database(path, { create: true });
  for (const [i, sql] of MIGRATIONS.slice(0, 13).entries()) {
    old.run(sql);
    old.run(`PRAGMA user_version = ${i + 1}`);
  }
  old.run("INSERT INTO sessions (id) VALUES ('s')");
  old.run("INSERT INTO segments (id, session_id, start, end) VALUES (1, 's', 100, 200)");
  old.run("INSERT INTO summaries VALUES (1, 'Login form', '- Goal: g', 'haiku', 100, 200, 5)");
  old.close();

  const db = openDb(path);
  expect(db.query("SELECT * FROM summaries").all()).toEqual([
    {
      block_id: 1,
      headline: "Login form",
      body: "- Goal: g",
      model: "haiku",
      covered_from: 100,
      covered_until: 200,
      created_at: 5,
      short: null,
      prompt_version: null,
      input_hash: null,
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
      latency_ms: null,
    },
  ]);
  db.close();
});
