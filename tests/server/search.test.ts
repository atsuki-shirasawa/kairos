import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  excerpt,
  likePattern,
  type SearchRow,
  type SearchTerm,
  searchSql,
  searchTerms,
  toSearchHit,
} from "../../src/server/search.ts";

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

describe("searchSql", () => {
  const plain: SearchTerm = { text: "login", file: false };
  const file: SearchTerm = { text: "app.tsx", file: true };

  test("binds each term as a numbered parameter, never inlining its text", () => {
    const sql = searchSql([plain, { text: "o'brien", file: false }], 50, "1");
    expect(sql).toContain("LIKE ?1");
    expect(sql).toContain("LIKE ?2");
    expect(sql).not.toContain("LIKE ?3");
    expect(sql).not.toContain("login");
    expect(sql).not.toContain("o'brien");
  });

  test("asks for one row past the limit, so the caller can tell there are more", () => {
    expect(searchSql([plain], 50, "1")).toMatch(/LIMIT 51\s*$/);
  });

  test("scans edited files only when a file: term asks for them", () => {
    expect(searchSql([plain], 50, "1")).not.toContain("'file', m.text");
    expect(searchSql([plain, file], 50, "1")).toContain("'file', m.text");
  });

  test("matches file: terms against file paths only, and other terms against everything else", () => {
    const sql = searchSql([plain, file], 50, "1");
    expect(sql).toContain("src.field != 'file' AND lower(src.text) LIKE ?1");
    expect(sql).toContain("src.field = 'file' AND lower(src.text) LIKE ?2");
  });

  test("applies the visibility condition to the matched sessions", () => {
    expect(searchSql([plain], 50, "s.cwd != '/x'")).toContain(
      "JOIN sessions s ON s.id = src.sid AND s.cwd != '/x'",
    );
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
