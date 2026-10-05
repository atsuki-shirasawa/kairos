import { describe, expect, test } from "bun:test";
import type { Activity, CalendarSession, Project } from "../../src/shared/api.ts";
import {
  hideSessions,
  isBrief,
  NO_FILTER,
  narrowSessions,
  segmentMatcher,
} from "../../src/web/src/lib/filter.ts";

const NONE: Activity = {
  commits: 0,
  prs: 0,
  filesEdited: 0,
  toolCalls: 0,
  subagents: 0,
  toolErrors: 0,
  interrupts: 0,
  apiErrors: 0,
  compactions: 0,
  claudeMs: null,
  effort: null,
};

function session(
  id: string,
  opts: {
    projectId?: number | null;
    label?: string | null;
    promptCount?: number;
    segments?: { headline: string; activity?: Partial<Activity> }[];
  } = {},
): CalendarSession {
  const segments = (opts.segments ?? [{ headline: id }]).map((g, i) => ({
    start: i * 1000,
    end: i * 1000 + 500,
    headline: g.headline,
    summarized: true,
    promptCount: 1,
    usage: null,
    activity: { ...NONE, ...g.activity },
  }));
  return {
    id,
    projectId: opts.projectId === undefined ? 1 : opts.projectId,
    label: opts.label ?? null,
    title: `${id} title`,
    startedAt: 0,
    endedAt: segments.length * 1000,
    promptCount: opts.promptCount ?? 5,
    active: false,
    segments,
  };
}

const project = (id: number, name: string, hidden = false): Project => ({
  id,
  path: `/Users/me/dev/${name}`,
  name,
  repo: null,
  color: null,
  hidden,
});
const projects = new Map([
  [1, project(1, "app")],
  [2, project(2, "blog", true)],
]);

describe("isBrief", () => {
  test("a session with few prompts, no edits and no outcome is a quick question", () => {
    expect(isBrief(session("a", { promptCount: 2 }))).toBe(true);
  });

  test("few prompts but file edits: kept", () => {
    const s = session("a", {
      promptCount: 1,
      segments: [{ headline: "x" }, { headline: "y", activity: { filesEdited: 3 } }],
    });
    expect(isBrief(s)).toBe(false);
  });

  test("many prompts: kept even without edits", () => {
    expect(isBrief(session("a", { promptCount: 3 }))).toBe(false);
  });
});

describe("hideSessions", () => {
  const list = [
    session("app"),
    session("blog", { projectId: 2 }),
    session("unknown", { projectId: null }),
    session("brief", { promptCount: 1 }),
  ];

  test("always drops hidden projects and keeps sessions with no project", () => {
    expect(hideSessions(list, projects, NO_FILTER).map((s) => s.id)).toEqual([
      "app",
      "unknown",
      "brief",
    ]);
  });

  test("drops quick questions only when hiding them", () => {
    const shown = hideSessions(list, projects, { ...NO_FILTER, hideBrief: true });
    expect(shown.map((s) => s.id)).toEqual(["app", "unknown"]);
  });
});

describe("segmentMatcher", () => {
  const s = session("a", {
    label: "fix-login",
    segments: [
      { headline: "Fix the login screen", activity: { commits: 1 } },
      { headline: "Update the README" },
    ],
  });
  const match = (filter: Partial<typeof NO_FILTER>) => {
    const m = segmentMatcher({ ...NO_FILTER, ...filter }, projects);
    return s.segments.filter((g) => m(s, g)).map((g) => g.headline);
  };

  test("everything matches without conditions", () => {
    expect(match({})).toHaveLength(2);
  });

  test("keywords match headlines case-insensitively", () => {
    expect(match({ q: "readme" })).toEqual(["Update the README"]);
  });

  test("space-separated words must all match", () => {
    expect(match({ q: "screen login" })).toEqual(["Fix the login screen"]);
    expect(match({ q: "screen README" })).toEqual([]);
  });

  test("also matches title, worktree name and project name", () => {
    expect(match({ q: "title" })).toHaveLength(2);
    expect(match({ q: "fix-login" })).toHaveLength(2);
    expect(match({ q: "APP" })).toHaveLength(2);
  });

  test("outcome keeps only blocks with a commit or PR", () => {
    expect(match({ outcome: true })).toEqual(["Fix the login screen"]);
  });
});

describe("narrowSessions", () => {
  test("keeps only matching blocks and drops sessions with none", () => {
    const list = [
      session("a", { segments: [{ headline: "Add tests" }, { headline: "Release" }] }),
      session("b", { segments: [{ headline: "Investigate" }] }),
    ];
    const m = segmentMatcher({ ...NO_FILTER, q: "tests" }, projects);
    const out = narrowSessions(list, m);
    expect(out.map((s) => s.id)).toEqual(["a"]);
    expect(out[0]?.segments.map((g) => g.headline)).toEqual(["Add tests"]);
  });

  test("returns fully matching sessions as-is (no extra re-renders)", () => {
    const list = [session("a")];
    expect(narrowSessions(list, () => true)[0]).toBe(list[0]);
  });
});
