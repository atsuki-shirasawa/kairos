import { describe, expect, test } from "bun:test";
import type {
  CalendarSegment,
  CalendarSession,
  LedgerEntry,
  Project,
} from "../../src/shared/api.ts";
import { buildReport, type ReportLabels, renderReport } from "../../src/shared/report.ts";

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
const day = (d: number) => at(d, 0);

const projects = new Map<number, Project>([
  [1, { id: 1, path: "/r/kairos", name: "kairos", repo: null, color: null, hidden: false }],
  [2, { id: 2, path: "/r/secret", name: "secret", repo: null, color: null, hidden: true }],
]);

function segment(start: number, end: number, headline: string, extra = {}): CalendarSegment {
  return {
    start,
    end,
    headline,
    short: null,
    summarized: true,
    turns: [],
    body: null,
    prs: [],
    commits: [],
    promptCount: 1,
    usage: null,
    activity: {
      commits: 0,
      prs: 0,
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
    ...extra,
  };
}

function session(
  id: string,
  projectId: number | null,
  segments: CalendarSegment[],
  extra = {},
): CalendarSession {
  return {
    id,
    projectId,
    label: null,
    branch: null,
    title: id,
    startedAt: segments[0]?.start ?? 0,
    endedAt: segments.at(-1)?.end ?? 0,
    promptCount: 1,
    scheduledRuns: 0,
    headless: false,
    unit: null,
    continued: false,
    active: false,
    segments,
    ...extra,
  };
}

function item(id: number, projectId: number | null, text: string, extra = {}): LedgerEntry {
  return {
    id,
    projectId,
    kind: "todo",
    text,
    sessionId: "s1",
    start: at(12, 9),
    openedAt: at(12, 10),
    closedAt: null,
    closedBy: null,
    closedSessionId: null,
    closedStart: null,
    closedNote: null,
    ...extra,
  };
}

const sessions = [
  session("s1", 1, [
    segment(at(12, 9), at(12, 10), "Add the CLI", {
      prs: [{ kind: "pr", ref: "https://github.com/o/r/pull/7", title: null, ts: null }],
      body: "- Goal: a CLI\n- Done: wrote it",
    }),
    // Runs past midnight: listed on the day it started only
    segment(at(12, 23), at(13, 1), "Late fix"),
  ]),
  session("s2", null, [segment(at(13, 8), at(13, 9), "Loose script")]),
  session("hidden", 2, [segment(at(12, 11), at(12, 12), "Hidden work")]),
];

test("the report lists blocks per day and project, with open items of those projects only", () => {
  // Hidden projects' sessions are passed in too: buildReport leaves them out itself
  const report = buildReport({
    from: day(12),
    to: day(14),
    sessions,
    projects,
    openItems: [
      item(1, 1, "Write docs"),
      item(2, 1, "Already done", { closedAt: at(13, 5) }),
      item(3, 2, "Hidden item"),
    ],
  });
  expect(report.days.map((d) => d.projects.map((p) => [p.name, p.blocks.length]))).toEqual([
    [["kairos", 2]],
    [[null, 1]],
  ]);
  expect(report.openItems.map((i) => i.text)).toEqual(["Write docs"]);

  const text = renderReport(report);
  expect(text).toStartWith("# Work report: 2026-10-12 – 2026-10-13\n\n## 2026-10-12 (Mon)");
  expect(text).toContain("- 09:00–10:00 Add the CLI ([#7](https://github.com/o/r/pull/7))");
  expect(text).toContain("- 23:00–01:00 Late fix");
  expect(text).toContain("## 2026-10-13 (Tue)\n\n### (no project)\n\n- 08:00–09:00 Loose script");
  expect(text).toContain("## Open items\n\n### kairos\n\n- [todo] Write docs");
  expect(text).not.toContain("Goal");
  expect(renderReport(report, { full: true })).toContain(
    "Add the CLI ([#7](https://github.com/o/r/pull/7))\n  - Goal: a CLI",
  );
});

test("a report for one day is titled with that day, and an empty one says so", () => {
  const one = buildReport({ from: day(13), to: day(14), sessions, projects });
  expect(renderReport(one)).toStartWith("# Work report: 2026-10-13\n");
  expect(renderReport(buildReport({ from: day(20), to: day(21), sessions, projects }))).toBe(
    "No work in this period.",
  );
});

describe("recaps", () => {
  test("come first under a summary heading, only for projects in the report, blank ones skipped", () => {
    const report = buildReport({
      from: day(12),
      to: day(13),
      sessions,
      projects,
      recaps: [
        { projectId: 1, body: " Built the CLI.\n\n- Added report " },
        { projectId: 2, body: "Hidden recap" },
        { projectId: 3, body: "Not in the report" },
      ],
    });
    expect(renderReport(report)).toStartWith(
      "# Work report: 2026-10-12\n\n## Summary\n\n### kairos\n\nBuilt the CLI.\n\n- Added report\n\n## 2026-10-12 (Mon)",
    );
  });

  test("leave no summary heading when none is written", () => {
    const report = buildReport({
      from: day(12),
      to: day(13),
      sessions,
      projects,
      recaps: [{ projectId: 1, body: null }],
    });
    expect(renderReport(report)).not.toContain("## Summary");
  });
});

test("the labels follow the reader's language; the work does not change", () => {
  const report = buildReport({ from: day(13), to: day(14), sessions, projects });
  const labels = {
    title: (first: number) => `作業レポート ${first === day(13)}`,
    day: () => "10/13（火）",
    summary: "まとめ",
    openItems: "残課題",
    noProject: "プロジェクトなし",
    noWork: "なし",
  } satisfies ReportLabels;
  const text = renderReport(report, { labels });
  expect(text).toBe(
    "# 作業レポート true\n\n## 10/13（火）\n\n### プロジェクトなし\n\n- 08:00–09:00 Loose script",
  );
});
