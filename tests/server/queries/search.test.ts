import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { openDb } from "../../../src/server/db/index.ts";
import {
  conversationMessagesSql,
  excerpt,
  INDEXED_TERM_CHARS,
  likePattern,
  messageFilter,
  type SearchRow,
  type SearchTerm,
  searchBlocks,
  searchQuery,
  searchTerms,
  toSearchHit,
} from "../../../src/server/queries/search.ts";
import type { MessageKind } from "../../../src/shared/api.ts";

describe("searchTerms", () => {
  test.each<[string, string, SearchTerm[]]>([
    ["an empty query", "", []],
    ["blank space", "   \t ", []],
    ["one word, lowercased", "Login", [{ text: "login", file: false }]],
    [
      "words split on any whitespace",
      " fix\tthe\nbuild ",
      [
        { text: "fix", file: false },
        { text: "the", file: false },
        { text: "build", file: false },
      ],
    ],
    [
      "a file: term",
      "file:src/App.tsx login",
      [
        { text: "src/app.tsx", file: true },
        { text: "login", file: false },
      ],
    ],
    ["a bare file: is dropped", "file: login", [{ text: "login", file: false }]],
    [
      "at most five terms",
      "a b c d e f g",
      ["a", "b", "c", "d", "e"].map((text) => ({ text, file: false })),
    ],
  ])("%s", (_name, query, expected) => {
    expect(searchTerms(query)).toEqual(expected);
  });
});

describe("likePattern", () => {
  test.each<[string, string]>([
    ["login", "%login%"],
    ["100%", "%100\\%%"],
    ["snake_case", "%snake\\_case%"],
    ["a\\b", "%a\\\\b%"],
  ])("%p becomes %p", (term, pattern) => {
    expect(likePattern(term)).toBe(pattern);
  });

  test("matches its term literally under LIKE ... ESCAPE '\\'", () => {
    const db = new Database(":memory:");
    /** Whether `text` matches the pattern built from `term`. */
    const matches = (text: string, term: string) =>
      db
        .query<{ hit: number }, [string, string]>("SELECT ?1 LIKE ?2 ESCAPE '\\' AS hit")
        .get(text, likePattern(term))?.hit === 1;
    expect(matches("took 100% of it", "100%")).toBe(true);
    expect(matches("took 1000 of it", "100%")).toBe(false);
    expect(matches("snake_case", "e_c")).toBe(true);
    expect(matches("snakeXcase", "e_c")).toBe(false);
    expect(matches("C:\\dir", "c:\\d")).toBe(true);
  });
});

describe("searchQuery", () => {
  const plain: SearchTerm = { text: "login", file: false };
  const file: SearchTerm = { text: "app.tsx", file: true };

  test("binds each term as a numbered parameter, never inlining its text", () => {
    const sql = searchQuery([plain, { text: "o'brien", file: false }], 50, "1").sql;
    expect(sql).toContain("LIKE ?1");
    expect(sql).toContain("LIKE ?2");
    expect(sql).not.toContain("LIKE ?3");
    expect(sql).not.toContain("login");
    expect(sql).not.toContain("o'brien");
  });

  test("binds the index's MATCH expression after the LIKE patterns, never inlining it", () => {
    const { sql, params } = searchQuery([plain], 50, "1");
    expect(sql).toContain("MATCH ?2");
    expect(sql).not.toContain('"login"');
    expect(params).toEqual(["%login%", '"login"']);
    expect(searchQuery([{ text: "lo", file: false }], 50, "1").params).toEqual(["%lo%"]);
  });

  test("asks for one row past the limit, so the caller can tell there are more", () => {
    expect(searchQuery([plain], 50, "1").sql).toMatch(/LIMIT 51\s*$/);
  });

  test("scans edited files only when a file: term asks for them", () => {
    expect(searchQuery([plain], 50, "1").sql).not.toContain("'file', m.text");
    expect(searchQuery([plain, file], 50, "1").sql).toContain("'file', m.text");
  });

  test("matches file: terms against file paths only, and other terms against everything else", () => {
    const sql = searchQuery([plain, file], 50, "1").sql;
    expect(sql).toContain("src.field != 'file' AND lower(src.text) LIKE ?1");
    expect(sql).toContain("src.field = 'file' AND lower(src.text) LIKE ?2");
  });

  test("applies the visibility condition to the matched sessions", () => {
    expect(searchQuery([plain], 50, "s.cwd != '/x'").sql).toContain(
      "JOIN sessions s ON s.id = src.sid AND s.cwd != '/x'",
    );
  });
});

describe("messageFilter", () => {
  const term = (text: string, file = false): SearchTerm => ({ text, file });

  test("terms of three characters or more go through the index, each a quoted phrase", () => {
    expect(messageFilter([term("login"), term('say "hi"')])).toEqual({
      kind: "match",
      match: '"login" OR "say ""hi"""',
    });
    expect(messageFilter([term("検索す")])).toEqual({ kind: "match", match: '"検索す"' });
  });

  test("a shorter term, such as a two-character Japanese word, scans the index's text instead", () => {
    expect(messageFilter([term("login"), term("検索")])).toEqual({ kind: "like" });
    const at = "あ".repeat(INDEXED_TERM_CHARS);
    expect(messageFilter([term(at)]).kind).toBe("match");
    expect(messageFilter([term(at.slice(1))]).kind).toBe("like");
  });

  test("file: terms alone never look at prompts or replies", () => {
    expect(messageFilter([term("app.tsx", true)])).toEqual({ kind: "none" });
    expect(messageFilter([term("ab"), term("app.tsx", true)])).toEqual({ kind: "like" });
  });
});

describe("the search index and search agree on which messages they hold", () => {
  // Every kind, so a new one can't be left out of this check
  const KINDS = Object.keys({
    prompt: 1,
    command: 1,
    sdk_prompt: 1,
    assistant: 1,
    tool_use: 1,
    tool_result: 1,
    scheduled: 1,
    interrupt: 1,
    notification: 1,
    peer: 1,
    compact: 1,
    error: 1,
  } satisfies Record<MessageKind, 1>);

  test("migration 16's triggers index exactly the messages search reads as prompts and replies", () => {
    const db = openDb(":memory:");
    db.run(
      "INSERT INTO ingest_state (id, path, session_id, parser_version) VALUES (1, 'f', 's', 1)",
    );
    db.run("INSERT INTO sessions (id) VALUES ('s')");
    let seq = 0;
    for (const kind of KINDS)
      for (const agent of [null, "agent-1"])
        for (const text of ["some text", ""])
          db.run(
            "INSERT INTO messages (id, session_id, agent_id, file_id, seq, ts, kind, text) VALUES (?, 's', ?, 1, ?, 1, ?, ?)",
            [`m${seq}`, agent, seq++, kind, text],
          );
    const rowids = (sql: string) =>
      db
        .query<{ rowid: number }, []>(sql)
        .all()
        .map((r) => r.rowid);
    expect(rowids("SELECT rowid FROM message_text ORDER BY rowid")).toEqual(
      rowids(
        `SELECT rowid FROM messages m WHERE ${conversationMessagesSql("m")} AND m.text != '' ORDER BY rowid`,
      ),
    );
  });
});

describe("searchBlocks over messages", () => {
  /** A DB with one block holding `messages` as [kind, text, agent?, copy?]. */
  function dbWith(messages: [string, string, (string | null)?, number?][]) {
    const db = openDb(":memory:");
    db.run(
      "INSERT INTO ingest_state (id, path, session_id, parser_version) VALUES (1, 'f', 's', 1)",
    );
    db.run("INSERT INTO sessions (id) VALUES ('s')");
    db.run(
      "INSERT INTO segments (session_id, start, end, fallback_title) VALUES ('s', 0, 100, 'block')",
    );
    messages.forEach(([kind, text, agent, copy], i) => {
      db.run(
        "INSERT INTO messages (id, session_id, agent_id, file_id, seq, ts, kind, text, is_copy) VALUES (?, 's', ?, 1, ?, 10, ?, ?, ?)",
        [`m${i}`, agent ?? null, i, kind, text, copy ?? 0],
      );
    });
    return db;
  }
  const found = (db: ReturnType<typeof dbWith>, query: string) =>
    searchBlocks(db, query, "1").hits.map((h) => `${h.field}:${h.snippet}`);

  test("finds a prompt or reply through the index and through the short-term scan alike", () => {
    const db = dbWith([
      ["prompt", "ログイン画面を直す"],
      ["assistant", "Fixed the LOGIN form"],
    ]);
    expect(found(db, "login")).toEqual(["reply:Fixed the LOGIN form"]);
    expect(found(db, "画面を")).toEqual(["prompt:ログイン画面を直す"]);
    expect(found(db, "画面")).toEqual(["prompt:ログイン画面を直す"]);
    expect(found(db, "ログイン fixed")).toEqual(["prompt:ログイン画面を直す"]);
  });

  test("finds a message by its key, even after its rowid changed (a rebuilt file may renumber them)", () => {
    const db = dbWith([["prompt", "rename the config flag"]]);
    db.run("UPDATE messages SET rowid = rowid + 1000");
    expect(found(db, "config")).toEqual(["prompt:rename the config flag"]);
  });

  test("leaves out subagents' messages, copies and tool output, as before the index", () => {
    const db = dbWith([
      ["assistant", "secret plan", "agent-1"],
      ["prompt", "secret copy", null, 1],
      ["tool_result", "secret output"],
    ]);
    expect(found(db, "secret")).toEqual([]);
    expect(found(db, "se")).toEqual([]);
  });
});

describe("excerpt", () => {
  test.each<[string, string, string, string]>([
    ["short text, whole and on one line", "fix the\n  login   form", "login", "fix the login form"],
    ["a missing term, from the start", "abc def", "zzz", "abc def"],
    [
      "a match near the start, no leading ellipsis",
      `login ${"x".repeat(200)}`,
      "login",
      `login ${"x".repeat(114)}…`,
    ],
    [
      "a match deep in the text, cut on both sides",
      `${"a".repeat(100)}login${"b".repeat(100)}`,
      "login",
      `…${"a".repeat(40)}login${"b".repeat(75)}…`,
    ],
    [
      "a match at the end, no trailing ellipsis",
      `${"a".repeat(200)}login`,
      "login",
      `…${"a".repeat(40)}login`,
    ],
  ])("%s", (_name, text, term, expected) => {
    expect(excerpt(text, term)).toBe(expected);
  });

  test("finds the term case-insensitively (terms arrive lowercased)", () => {
    const text = `${"a".repeat(100)}LOGIN${"b".repeat(100)}`;
    expect(excerpt(text, "login").startsWith(`…${"a".repeat(40)}LOGIN`)).toBe(true);
  });
});

describe("toSearchHit", () => {
  const row: SearchRow = {
    sid: "s1",
    start: 1000,
    end: 2000,
    project_id: 7,
    label: "work",
    headline: null,
    fallback_title: null,
    custom_title: null,
    agent_name: null,
    ai_title: null,
    first_prompt: null,
    field: "prompt",
    text: "please fix the login form",
  };

  test("maps the row and adds a snippet around the first term", () => {
    expect(toSearchHit(row, "login", "Fix login")).toEqual({
      sessionId: "s1",
      projectId: 7,
      label: "work",
      start: 1000,
      end: 2000,
      headline: "Fix login",
      field: "prompt",
      snippet: "please fix the login form",
    });
  });

  test("leaves the snippet empty when the headline itself matched", () => {
    expect(toSearchHit({ ...row, field: "headline" }, "login", "Fix login").snippet).toBe("");
  });
});
