import type { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { openDb } from "../../../src/server/db/index.ts";
import { blocksActivity, blocksArtifacts } from "../../../src/server/queries/activity.ts";
import type { BlockSet } from "../../../src/server/queries/sql.ts";
import { ARTIFACT_GRACE_MS } from "../../../src/shared/constants.ts";

let db: Database;
let seq = 0;

/** Two blocks of session `a` ([100, 200] and [1_000_000, 2_000_000], further apart than the grace for late artifacts) and one of session `b` ([100, 200]). */
const ALL: BlockSet = { sql: "SELECT session_id, start, end FROM segments", params: [] };

function message(session: string, ts: number, over: Record<string, string | number | null> = {}) {
  const row = {
    kind: "tool_use",
    tool_name: "Bash",
    text: "",
    is_error: 0,
    is_copy: 0,
    agent_id: null,
    ...over,
  };
  db.query(
    `INSERT INTO messages (id, session_id, agent_id, file_id, seq, ts, kind, text, tool_name, is_error, is_copy)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `m${++seq}`,
    session,
    row.agent_id,
    seq,
    ts,
    row.kind,
    row.text,
    row.tool_name,
    row.is_error,
    row.is_copy,
  );
}

function artifact(session: string, kind: string, ref: string, ts: number, isCopy = 0) {
  db.query(
    "INSERT INTO artifacts (session_id, kind, ref, title, ts, file_id, is_copy) VALUES (?, ?, ?, NULL, ?, 1, ?)",
  ).run(session, kind, ref, ts, isCopy);
}

beforeEach(() => {
  db = openDb(":memory:");
  db.run("INSERT INTO ingest_state (id, path, session_id, parser_version) VALUES (1, 'f', 'a', 1)");
  db.run("INSERT INTO sessions (id) VALUES ('a'), ('b')");
  db.run(
    "INSERT INTO segments (session_id, start, end) VALUES ('a', 100, 200), ('a', 1000000, 2000000), ('b', 100, 200)",
  );
});

describe("blocksActivity", () => {
  test("counts each block of the set on its own, from one session's own rows", () => {
    message("a", 150);
    message("a", 150, { kind: "tool_result", is_error: 1 });
    message("a", 1_500_000, { tool_name: "Edit", text: "x.ts" });
    message("a", 1_600_000, { tool_name: "Write", text: "x.ts" });
    message("a", 1_700_000, { tool_name: "Edit", text: "y.ts" });
    message("a", 1_800_000, { is_copy: 1 });
    message("b", 150, { kind: "interrupt" });
    const activity = blocksActivity(db, ALL);
    expect(activity("a", 100)).toMatchObject({
      toolCalls: 1,
      toolErrors: 1,
      filesEdited: 0,
    });
    expect(activity("a", 1_000_000)).toMatchObject({
      toolCalls: 3,
      filesEdited: 2,
    });
    expect(activity("b", 100)).toMatchObject({ toolCalls: 0, interrupts: 1 });
  });

  test("a block with nothing recorded reads as no activity", () => {
    expect(blocksActivity(db, ALL)("a", 100)).toMatchObject({
      toolCalls: 0,
      commits: 0,
      claudeMs: null,
    });
  });

  test("runs over only the blocks the set yields, binding its parameters", () => {
    message("a", 150);
    message("b", 150);
    const one: BlockSet = {
      sql: "SELECT session_id, start, end FROM segments WHERE session_id = ?1",
      params: ["b"],
    };
    const activity = blocksActivity(db, one);
    expect(activity("b", 100).toolCalls).toBe(1);
    expect(activity("a", 100).toolCalls).toBe(0);
  });
});

describe("blocksArtifacts", () => {
  test("lists each block's PRs and commits in time order, allowing for late records", () => {
    artifact("a", "commit", "c2", 1_900_000);
    artifact("a", "commit", "c1", 1_100_000);
    artifact("a", "pr", "#1", 2_000_000 + ARTIFACT_GRACE_MS);
    artifact("a", "pr", "#2", 2_000_001 + ARTIFACT_GRACE_MS);
    artifact("a", "commit", "copy", 1_500_000, 1);
    artifact("a", "merge", "m", 1_500_000);
    const of = blocksArtifacts(db, ALL);
    expect(of("a", 1_000_000).commits.map((c) => c.ref)).toEqual(["c1", "c2"]);
    expect(of("a", 1_000_000).prs.map((p) => p.ref)).toEqual(["#1"]);
    expect(of("a", 100)).toEqual({ prs: [], commits: [] });
  });
});
