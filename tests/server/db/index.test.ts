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
  expect(indexes(db, "sessions")).toContain("sessions_ended");
  expect(indexes(db, "block_refs")).toContain("block_refs_ref");
  expect(indexes(db, "sessions")).toContain("sessions_branch");
});

test("migration 22 gives sessions a unit of work, null until derived data is recomputed", () => {
  const path = join(tmpdir(), `kairos-run-unit-${crypto.randomUUID()}.db`);
  const old = new Database(path, { create: true });
  for (const [i, sql] of MIGRATIONS.slice(0, 21).entries()) {
    old.run(sql);
    old.run(`PRAGMA user_version = ${i + 1}`);
  }
  old.run("INSERT INTO sessions (id, run_kind) VALUES ('s', 'automation')");
  old.close();

  const db = openDb(path);
  expect(db.query("SELECT id, run_kind, run_unit, run_unit_ref FROM sessions").all()).toEqual([
    { id: "s", run_kind: "automation", run_unit: null, run_unit_ref: null },
  ]);
  expect(indexes(db, "sessions")).toContain("sessions_run_unit");
  db.close();
});

test("migration 20 gives subagents a name, null until their meta file is read again", () => {
  const path = join(tmpdir(), `kairos-subagent-name-${crypto.randomUUID()}.db`);
  const old = new Database(path, { create: true });
  for (const [i, sql] of MIGRATIONS.slice(0, 19).entries()) {
    old.run(sql);
    old.run(`PRAGMA user_version = ${i + 1}`);
  }
  old.run("INSERT INTO sessions (id) VALUES ('s')");
  old.run("INSERT INTO subagents (id, session_id, agent_type) VALUES ('a', 's', 'Explore')");
  old.close();

  const db = openDb(path);
  expect(db.query("SELECT id, agent_type, name FROM subagents").all()).toEqual([
    { id: "a", agent_type: "Explore", name: null },
  ]);
  db.close();
});

test("migration 18 indexes sessions by project and branch, keeping an existing DB's sessions", () => {
  const path = join(tmpdir(), `kairos-sessions-branch-${crypto.randomUUID()}.db`);
  const old = new Database(path, { create: true });
  for (const [i, sql] of MIGRATIONS.slice(0, 17).entries()) {
    old.run(sql);
    old.run(`PRAGMA user_version = ${i + 1}`);
  }
  old.run("INSERT INTO sessions (id, branch) VALUES ('s', 'fix/login')");
  old.close();

  const db = openDb(path);
  expect(db.query("SELECT id, branch FROM sessions").all()).toEqual([
    { id: "s", branch: "fix/login" },
  ]);
  expect(indexes(db, "sessions")).toContain("sessions_branch");
  db.close();
});

test("migration 15 indexes sessions by when they ended, keeping an existing DB's sessions", () => {
  const path = join(tmpdir(), `kairos-sessions-ended-${crypto.randomUUID()}.db`);
  const old = new Database(path, { create: true });
  for (const [i, sql] of MIGRATIONS.slice(0, 14).entries()) {
    old.run(sql);
    old.run(`PRAGMA user_version = ${i + 1}`);
  }
  old.run("INSERT INTO sessions (id, ended_at) VALUES ('s', 200)");
  old.close();

  const db = openDb(path);
  expect(db.query("SELECT id, ended_at FROM sessions").all()).toEqual([{ id: "s", ended_at: 200 }]);
  expect(indexes(db, "sessions")).toContain("sessions_ended");
  db.close();
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

test("migration 13 keeps a block's own summary over one that moved onto it, and the best close", () => {
  const path = join(tmpdir(), `kairos-block-ids-${crypto.randomUUID()}.db`);
  const old = new Database(path, { create: true });
  for (const [i, sql] of MIGRATIONS.slice(0, 12).entries()) {
    old.run(sql);
    old.run(`PRAGMA user_version = ${i + 1}`);
  }
  old.run("INSERT INTO sessions (id) VALUES ('s')");
  old.run(
    "INSERT INTO segments (session_id, start, end) VALUES ('s', 100, 200), ('s', 300, 400), ('s', 500, 600)",
  );
  // 'moved' overlaps both 100–200 and 300–400, more of the second; 'own' starts at 300
  old.run(`INSERT INTO summaries VALUES ('s', 150, 'moved', 'b', 'm', 390, 1),
    ('s', 300, 'own', 'b', 'm', 400, 2)`);
  // Closed by a summary written at 450, between blocks: the block before it closed the item
  old.run(`INSERT INTO open_items (id, session_id, start, opened_at, text, closed_at,
      closed_session_id, closed_start, closed_by)
    VALUES (7, 's', 150, 390, 'item', 450, 's', 450, 'model')`);
  old.close();

  const db = openDb(path);
  expect(
    db
      .query("SELECT g.start, sm.headline FROM summaries sm JOIN segments g ON g.id = sm.block_id")
      .all(),
  ).toEqual([{ start: 300, headline: "own" }]);
  expect(
    db
      .query(
        `SELECT g.start, c.start AS closed_start FROM open_items i
         JOIN segments g ON g.id = i.block_id LEFT JOIN segments c ON c.id = i.closed_block_id`,
      )
      .all(),
  ).toEqual([{ start: 300, closed_start: 300 }]);
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

/** The rowids the search index holds, in order. */
function indexed(db: Database): number[] {
  return db
    .query<{ rowid: number }, []>("SELECT rowid FROM message_text ORDER BY rowid")
    .all()
    .map((r) => r.rowid);
}

/** Adds a message and returns its rowid. */
function addMessage(
  db: Database,
  id: string,
  kind: string,
  text: string,
  agent: string | null = null,
) {
  db.run(
    "INSERT INTO messages (id, session_id, agent_id, file_id, seq, ts, kind, text) VALUES (?, 's', ?, 1, 0, 5, ?, ?)",
    [id, agent, kind, text],
  );
  return db.query<{ r: number }, [string]>("SELECT rowid AS r FROM messages WHERE id = ?").get(id)
    ?.r;
}

test("migration 16 indexes the main conversation's prompts and replies already ingested", () => {
  const path = join(tmpdir(), `kairos-message-text-${crypto.randomUUID()}.db`);
  const old = new Database(path, { create: true });
  for (const [i, sql] of MIGRATIONS.slice(0, 15).entries()) {
    old.run(sql);
    old.run(`PRAGMA user_version = ${i + 1}`);
  }
  old.run(
    "INSERT INTO ingest_state (id, path, session_id, parser_version) VALUES (1, 'f', 's', 1)",
  );
  old.run("INSERT INTO sessions (id) VALUES ('s')");
  const prompt = addMessage(old, "p", "prompt", "fix the login form");
  addMessage(old, "a", "assistant", "a subagent's reply", "agent-1");
  addMessage(old, "t", "tool_result", "tool output");
  addMessage(old, "e", "assistant", "");
  old.close();

  const db = openDb(path);
  expect(indexed(db)).toEqual([prompt ?? -1]);
  expect(
    db.query("SELECT rowid FROM message_text WHERE message_text MATCH '\"LOGIN\"'").all(),
  ).toEqual([{ rowid: prompt }]);
  db.close();
});

test("the search index follows messages as ingest adds them and clears them", () => {
  const db = openDb(":memory:");
  db.run("INSERT INTO ingest_state (id, path, session_id, parser_version) VALUES (1, 'f', 's', 1)");
  db.run("INSERT INTO sessions (id) VALUES ('s')");
  const reply = addMessage(db, "r", "assistant", "done");
  const sdk = addMessage(db, "q", "sdk_prompt", "summarize this");
  addMessage(db, "u", "tool_use", "Edit app.tsx");
  addMessage(db, "x", "prompt", "for a subagent", "agent-1");
  expect(indexed(db)).toEqual([reply ?? -1, sdk ?? -1]);

  // A continued session's repeat of the earlier one is marked a copy after insert, and leaves
  db.run("UPDATE messages SET is_copy = 1 WHERE id = 'q'");
  expect(indexed(db)).toEqual([reply ?? -1]);
  db.run("UPDATE messages SET is_copy = 0 WHERE id = 'q'");
  expect(indexed(db)).toEqual([reply ?? -1, sdk ?? -1]);
  // Text changed in place is indexed as it is now
  db.run("UPDATE messages SET text = 'finished' WHERE id = 'r'");
  expect(
    db.query("SELECT rowid FROM message_text WHERE message_text MATCH '\"finish\"'").all(),
  ).toEqual([{ rowid: reply }]);

  // A file read again is cleared first, and a session's rows go with it (a cascade, which fires triggers too)
  db.run("DELETE FROM messages WHERE id = 'r'");
  expect(indexed(db)).toEqual([sdk ?? -1]);
  db.run("DELETE FROM ingest_state WHERE id = 1");
  expect(indexed(db)).toEqual([]);
});
