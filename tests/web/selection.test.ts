import { describe, expect, test } from "bun:test";
import type { CalendarSession } from "../../src/shared/api.ts";
import { setLocale } from "../../src/web/src/i18n/index.ts";
import { blocksOfDay } from "../../src/web/src/lib/dayBlocks.ts";
import { layoutDay } from "../../src/web/src/lib/layout.ts";
import {
  groupLead,
  groupMatches,
  isDim,
  isGroupSelected,
  isSelected,
  isSelectedSection,
  isWorking,
  isWorkingHere,
  projectLabel,
  projectName,
  projectOf,
  reachesSegmentEnd,
} from "../../src/web/src/lib/selection.ts";
import { session as sessionOf } from "./helpers.ts";

const DAY0 = new Date(2026, 9, 5).getTime();
const H = 3_600_000;

function session(active: boolean): CalendarSession {
  const segment = (start: number, end: number) => ({
    start,
    end,
    headline: "x",
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
  });
  return {
    id: "s",
    projectId: 1,
    label: null,
    branch: null,
    scheduledRuns: 0,
    headless: false,
    continued: false,
    title: "s",
    startedAt: DAY0 + 9 * H,
    endedAt: DAY0 + 12 * H,
    promptCount: 2,
    active,
    segments: [segment(DAY0 + 9 * H, DAY0 + 10 * H), segment(DAY0 + 11 * H, DAY0 + 12 * H)],
  };
}

describe("isSelected", () => {
  const [first, second] = blocksOfDay([session(false)], DAY0);

  test("matches the section, or every section when no start is given", () => {
    if (!first || !second) throw new Error("expected two blocks");
    expect(isSelected(first, "s", first.segment.start)).toBe(true);
    expect(isSelected(second, "s", first.segment.start)).toBe(false);
    expect(isSelected(second, "s", null)).toBe(true);
    expect(isSelected(first, "other", null)).toBe(false);
  });
});

describe("isWorking", () => {
  test("only the latest section of a running session", () => {
    const [first, second] = blocksOfDay([session(true)], DAY0);
    expect(first && isWorking(first)).toBe(false);
    expect(second && isWorking(second)).toBe(true);
    const [, ended] = blocksOfDay([session(false)], DAY0);
    expect(ended && isWorking(ended)).toBe(false);
  });
});

describe("projectOf", () => {
  test("finds the project by id, and none without an id or for an unknown one", () => {
    const projects = new Map([[1, { name: "app" }]]);
    expect(projectOf(projects, 1)).toEqual({ name: "app" });
    expect(projectOf(projects, 2)).toBeUndefined();
    expect(projectOf(projects, null)).toBeUndefined();
  });
});

describe("projectLabel / projectName", () => {
  test("names the project, or says it is unknown in the UI language", () => {
    const projects = new Map([[1, { name: "app" }]]);
    expect(projectName(projects, 1)).toBe("app");
    expect(projectLabel(undefined)).toBe("Unknown project");
    setLocale("ja");
    expect(projectName(projects, null)).toBe("プロジェクト不明");
    expect(projectName(projects, 9)).toBe("プロジェクト不明");
    setLocale("en");
  });
});

describe("isDim", () => {
  /** A session whose sections are all still waiting for a summary. */
  const unsummarized = (active: boolean): CalendarSession => {
    const s = session(active);
    return { ...s, segments: s.segments.map((g) => ({ ...g, summarized: false })) };
  };

  test("tones down unsummarized work, but not the section still being worked on", () => {
    const [older, latest] = blocksOfDay([unsummarized(true)], DAY0);
    expect(older && isDim(older)).toBe(true);
    expect(latest && isDim(latest)).toBe(false);
  });

  test("tones down every unsummarized section once the session has ended", () => {
    const blocks = blocksOfDay([unsummarized(false)], DAY0);
    expect(blocks.map(isDim)).toEqual([true, true]);
  });

  test("keeps both days' pieces of a running section that crosses midnight", () => {
    const s = unsummarized(true);
    const [early, late] = s.segments;
    const crossing: CalendarSession = {
      ...s,
      segments: [
        { ...(early ?? late), start: DAY0 + 9 * H, end: DAY0 + 10 * H },
        { ...(late ?? early), start: DAY0 + 23 * H, end: DAY0 + 25 * H },
      ] as CalendarSession["segments"],
    };
    const [, before] = blocksOfDay([crossing], DAY0);
    const [after] = blocksOfDay([crossing], DAY0 + 24 * H);
    expect(before && isDim(before)).toBe(false);
    expect(after && isDim(after)).toBe(false);
  });

  test("never tones down summarized work", () => {
    expect(blocksOfDay([session(true)], DAY0).map(isDim)).toEqual([false, false]);
  });
});

test("isSelectedSection matches the selected section, or any of the session's without a start", () => {
  const section = { sessionId: "a", start: 100 };
  expect(isSelectedSection(section, "a", 100)).toBe(true);
  expect(isSelectedSection(section, "a", 200)).toBe(false);
  expect(isSelectedSection(section, "a", null)).toBe(true);
  expect(isSelectedSection(section, "b", 100)).toBe(false);
  expect(isSelectedSection(section, null, null)).toBe(false);
});

describe("reachesSegmentEnd / isWorkingHere", () => {
  const DAY1 = new Date(2026, 9, 6).getTime();
  const spanning = (active: boolean): CalendarSession => ({
    ...sessionOf("s", [DAY0 + 9 * H, DAY0 + 10 * H], [DAY0 + 23 * H, DAY1 + H]),
    active,
  });

  test("only the day's piece that holds the section's end", () => {
    const s = spanning(false);
    const [first, before] = layoutDay([s], DAY0);
    const [after] = layoutDay([s], DAY1);
    expect(first && reachesSegmentEnd(first)).toBe(true);
    expect(before && reachesSegmentEnd(before)).toBe(false);
    expect(after && reachesSegmentEnd(after)).toBe(true);
  });

  test("a running section crossing midnight shows as in progress on the later day only", () => {
    const s = spanning(true);
    const [, before] = layoutDay([s], DAY0);
    const [after] = layoutDay([s], DAY1);
    expect(before && isWorkingHere(before)).toBe(false);
    expect(after && isWorkingHere(after)).toBe(true);
  });
});

describe("group rules", () => {
  const runs = blocksOfDay(
    [sessionOf("a", [DAY0 + 1000, DAY0 + 2000]), sessionOf("b", [DAY0 + 3000, DAY0 + 4000])],
    DAY0,
  );
  const onlyB = (s: CalendarSession) => s.id === "b";

  test("the lead is the first run that matches the filter, else the first", () => {
    expect(groupLead(runs, (s) => onlyB(s))?.session.id).toBe("b");
    expect(groupLead(runs, () => false)?.session.id).toBe("a");
  });

  test("a group is selected or matching when any of its runs is", () => {
    expect(isGroupSelected(runs, "b", null)).toBe(true);
    expect(isGroupSelected(runs, "c", null)).toBe(false);
    expect(groupMatches(runs, (s) => onlyB(s))).toBe(true);
    expect(groupMatches(runs, () => false)).toBe(false);
  });
});
