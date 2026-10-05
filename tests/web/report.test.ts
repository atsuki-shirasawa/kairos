import { afterEach, describe, expect, test } from "bun:test";
import type { Artifact, CalendarSession, Project } from "../../src/shared/api.ts";
import { setLocale } from "../../src/web/src/i18n/index.ts";
import { buildReport } from "../../src/web/src/lib/report.ts";

const DAY0 = new Date(2026, 9, 5).getTime(); // 2026-10-05 (Mon) 00:00
const DAY1 = new Date(2026, 9, 6).getTime();
const at = (h: number, m = 0) => DAY0 + h * 3_600_000 + m * 60_000;

const pr = (n: number): Artifact => ({
  kind: "pr",
  ref: `https://github.com/me/app/pull/${n}`,
  title: `PR ${n}`,
  ts: null,
});

function session(
  id: string,
  projectId: number | null,
  ...segments: { start: number; end: number; headline: string; prs?: Artifact[] }[]
): CalendarSession {
  return {
    id,
    projectId,
    label: null,
    title: id,
    startedAt: segments[0]?.start ?? 0,
    endedAt: segments.at(-1)?.end ?? 0,
    promptCount: 1,
    active: false,
    segments: segments.map((g) => ({
      ...g,
      summarized: true,
      body: null,
      prs: g.prs ?? [],
      promptCount: 1,
      usage: null,
      activity: {
        commits: 0,
        prs: g.prs?.length ?? 0,
        filesEdited: 0,
        toolCalls: 0,
        subagents: 0,
        toolErrors: 0,
        interrupts: 0,
        apiErrors: 0,
        compactions: 0,
        claudeMs: null,
        effort: null,
      },
    })),
  };
}

const project = (id: number, name: string): Project => ({
  id,
  path: `/p/${name}`,
  name,
  repo: null,
  color: null,
  hidden: false,
});
const projects = new Map([
  [1, project(1, "app")],
  [2, project(2, "blog")],
]);

afterEach(() => setLocale("en"));

describe("buildReport", () => {
  test("groups by day, then project in the order work started, with PR links", () => {
    const sessions = [
      session("a", 1, { start: at(9), end: at(10, 30), headline: "Add login", prs: [pr(42)] }),
      session("b", 2, { start: at(11), end: at(12), headline: "Write a post" }),
      session("c", 1, { start: at(14), end: at(15), headline: "Fix\n  the build" }),
    ];
    expect(buildReport([DAY0, DAY1], sessions, projects)).toBe(
      [
        "## Mon, Oct 5",
        "",
        "### app",
        "",
        "- 9:00–10:30 Add login ([#42](https://github.com/me/app/pull/42))",
        "- 14:00–15:00 Fix the build",
        "",
        "### blog",
        "",
        "- 11:00–12:00 Write a post",
      ].join("\n"),
    );
  });

  test("lists work crossing midnight only on the day it started", () => {
    const sessions = [session("a", 1, { start: at(23), end: at(25), headline: "Late fix" })];
    const report = buildReport([DAY0, DAY1], sessions, projects);
    expect(report).toContain("- 23:00–1:00 Late fix");
    expect(report).not.toContain("Tue");
  });

  test("is empty when there is no work", () => {
    expect(buildReport([DAY0], [], projects)).toBe("");
  });

  test("follows the UI language for dates", () => {
    setLocale("ja");
    const sessions = [session("a", null, { start: at(9), end: at(10), headline: "調査" })];
    expect(buildReport([DAY0], sessions, projects)).toMatch(/^## 10\/5 月\n/);
  });
});
