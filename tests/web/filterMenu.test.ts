import { describe, expect, test } from "bun:test";
import { hasOutcome, NO_FILTER } from "../../src/web/src/lib/filter.ts";
import {
  branchOptions,
  conditionCounts,
  countBlocks,
  filterBadge,
  matchingProjectRows,
  projectRows,
} from "../../src/web/src/lib/filterMenu.ts";
import { project, session } from "./filterHelpers.ts";

describe("conditionCounts", () => {
  test("counts, per option, the blocks it alone would keep", () => {
    const s = session("a", {
      fields: { active: true },
      segments: [
        { headline: "x", activity: { commits: 1, subagents: 1 } },
        { headline: "y", activity: { commits: 2, merges: 1 } },
      ],
    });
    expect(conditionCounts([s])).toEqual({
      outcome: { commit: 2, pr: 0, merge: 1 },
      state: { active: 2, loop: 0, continued: 0, subagent: 1, snag: 0, open: 0 },
    });
  });
});

describe("projectRows", () => {
  const app = { ...project(1, "app"), repo: "me/app" };
  const blog = project(2, "blog");
  const docs = project(3, "Docs");
  const sessions = [
    session("a", { projectId: 2 }),
    session("b", { projectId: 2 }),
    session("c", { projectId: 1 }),
    session("d", { projectId: null }),
  ];

  test("used projects first, busiest first, then by name", () => {
    const rows = projectRows([docs, app, blog], sessions, "en");
    expect(rows.map((r) => [r.project.name, r.count])).toEqual([
      ["blog", 2],
      ["app", 1],
      ["Docs", 0],
    ]);
  });

  test("the typed text matches name, repository or path, ignoring case and spaces", () => {
    const rows = projectRows([docs, app, blog], sessions, "en");
    const names = (q: string) => matchingProjectRows(rows, q).map((r) => r.project.name);
    expect(names("")).toEqual(["blog", "app", "Docs"]);
    expect(names("  DOCS ")).toEqual(["Docs"]);
    expect(names("me/app")).toEqual(["app"]);
    expect(names("dev/blog")).toEqual(["blog"]);
    expect(names("nothing")).toEqual([]);
  });
});

describe("filterBadge", () => {
  test("counts the menu's conditions, hiding quick questions included, and hidden projects", () => {
    const projects = [project(1, "app", true), project(2, "blog", true), project(3, "docs")];
    const filter = { ...NO_FILTER, q: "login", states: ["loop" as const], hideBrief: true };
    expect(filterBadge(filter, projects)).toEqual({ conditions: 2, hidden: 2 });
    expect(filterBadge(NO_FILTER, [])).toEqual({ conditions: 0, hidden: 0 });
  });
});

describe("menu counts", () => {
  const busy = session("busy", {
    fields: { branch: "feature/login", scheduledRuns: 2 },
    segments: [
      { headline: "Merge", activity: { merges: 1, subagents: 1 }, minutes: 90 },
      { headline: "Commit", activity: { commits: 1, toolErrors: 1 }, minutes: 20 },
    ],
  });
  const quiet = session("quiet", {
    fields: { active: true, continued: true },
    segments: [{ headline: "Read", activity: { interrupts: 1 }, minutes: 40 }],
  });

  test("counts blocks per option and lists branches busiest first", () => {
    expect(countBlocks([busy, quiet], (_, g) => hasOutcome(g, ["commit"]))).toBe(1);
    const other = session("other", { fields: { branch: "main" } });
    expect(branchOptions([busy, quiet, other], null)).toEqual([
      { name: "feature/login", blocks: 2 },
      { name: "main", blocks: 1 },
    ]);
    // The chosen branch stays listed in a period without it
    expect(branchOptions([quiet], "fix/header")).toEqual([{ name: "fix/header", blocks: 0 }]);
  });
});
