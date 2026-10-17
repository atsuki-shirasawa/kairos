import { afterEach, describe, expect, test } from "bun:test";
import type { Artifact, CalendarSession, Project } from "../../src/shared/api.ts";
import { buildReport, renderReport } from "../../src/shared/report.ts";
import { setLocale } from "../../src/web/src/i18n/index.ts";
import { reportText, standupRange } from "../../src/web/src/lib/report.ts";

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
    branch: null,
    scheduledRuns: 0,
    headless: false,
    continued: false,
    title: id,
    startedAt: segments[0]?.start ?? 0,
    endedAt: segments.at(-1)?.end ?? 0,
    promptCount: 1,
    active: false,
    segments: segments.map((g) => ({
      ...g,
      short: null,
      summarized: true,
      body: null,
      prs: g.prs ?? [],
      commits: [],
      promptCount: 1,
      usage: null,
      activity: {
        commits: 0,
        prs: g.prs?.length ?? 0,
        merges: 0,
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

const sessions = [
  session("a", 1, { start: at(9), end: at(10, 30), headline: "Add login", prs: [pr(42)] }),
  session("b", 2, { start: at(11), end: at(12), headline: "Write a post" }),
];
const input = {
  from: DAY0,
  to: DAY1,
  sessions,
  projects,
  recaps: [{ projectId: 1, body: "Built the login." }],
};

describe("reportText", () => {
  test("in English is exactly what kairos report prints for the same range", () => {
    expect(reportText(input)).toBe(renderReport(buildReport(input)));
  });

  test("follows the UI language for its labels, not for the work", () => {
    setLocale("ja");
    const text = reportText(input) ?? "";
    expect(text).toStartWith(
      "# 作業レポート: 2026-10-05\n\n## まとめ\n\n### app\n\nBuilt the login.",
    );
    expect(text).toContain("## 2026-10-05（月）\n\n### app\n\n- 09:00–10:30 Add login");
  });

  test("is null for a period without work, so nothing is copied", () => {
    expect(reportText({ ...input, from: DAY1, to: DAY1 + 86_400_000 })).toBeNull();
  });
});

describe("standupRange", () => {
  const now = at(15);

  test("today and this week run from local midnight, the week from Sunday as on the calendar", () => {
    expect(standupRange("today", now, null)).toEqual({ from: DAY0, to: DAY1 });
    expect(standupRange("week", now, null)).toEqual({
      from: new Date(2026, 9, 4).getTime(),
      to: new Date(2026, 9, 11).getTime(),
    });
  });

  test("the last workday is the day found from the work, or nothing while unknown", () => {
    const friday = new Date(2026, 9, 2).getTime();
    expect(standupRange("lastWorkday", now, friday)).toEqual({
      from: friday,
      to: new Date(2026, 9, 3).getTime(),
    });
    expect(standupRange("lastWorkday", now, null)).toBeNull();
  });
});
