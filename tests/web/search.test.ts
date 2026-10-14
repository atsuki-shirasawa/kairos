import { describe, expect, test } from "bun:test";
import { highlightTerms, splitHighlights, visibleHits } from "../../src/web/src/lib/search.ts";

describe("visibleHits", () => {
  test("drops hits of hidden projects and keeps those without a project", () => {
    const projects = new Map([
      [1, { hidden: false }],
      [2, { hidden: true }],
    ]);
    const hits = [{ projectId: 1 }, { projectId: 2 }, { projectId: null }, { projectId: 3 }];
    expect(visibleHits(hits, projects)).toEqual([
      { projectId: 1 },
      { projectId: null },
      { projectId: 3 },
    ]);
  });
});

describe("highlightTerms", () => {
  test("splits the query into words and takes the file: prefix off", () => {
    expect(highlightTerms("fix FILE:src/app.ts")).toEqual(["fix", "src/app.ts"]);
  });
});

describe("splitHighlights", () => {
  const marked = (text: string, terms: string[]) =>
    splitHighlights(text, terms)
      .filter((p) => p.match)
      .map((p) => p.text);

  test("marks every occurrence, ignoring case, keeping the text's own case", () => {
    expect(splitHighlights("Fix the fix", ["fix"])).toEqual([
      { text: "", match: false },
      { text: "Fix", match: true },
      { text: " the ", match: false },
      { text: "fix", match: true },
      { text: "", match: false },
    ]);
  });

  test("marks any of several terms", () => {
    expect(marked("build and test the app", ["test", "build"])).toEqual(["build", "test"]);
  });

  test("treats regex characters in a term as plain text", () => {
    expect(marked("call f(x) or fx", ["f(x)"])).toEqual(["f(x)"]);
    expect(marked("a.b and acb", ["a.b"])).toEqual(["a.b"]);
  });

  test("returns the text as one piece without terms", () => {
    expect(splitHighlights("text", [])).toEqual([{ text: "text", match: false }]);
    expect(splitHighlights("text", [""])).toEqual([{ text: "text", match: false }]);
  });

  test("puts the pieces back together into the text", () => {
    const parts = splitHighlights("Search the search box", ["search", "box"]);
    expect(parts.map((p) => p.text).join("")).toBe("Search the search box");
  });
});
