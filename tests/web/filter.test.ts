import { describe, expect, test } from "bun:test";
import type { Activity, CalendarSession, Project } from "../../src/shared/api.ts";
import {
  branchOptions,
  conditionCount,
  countBlocks,
  type Filter,
  hasOutcome,
  hiddenReason,
  hideSessions,
  hitKey,
  isBrief,
  isFocused,
  NO_FILTER,
  narrowSessions,
  readFilter,
  searchQuery,
  segmentMatcher,
  withoutConditions,
  withProjects,
  writeFilter,
} from "../../src/web/src/lib/filter.ts";

const NONE: Activity = {
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
};

function session(
  id: string,
  opts: {
    projectId?: number | null;
    label?: string | null;
    promptCount?: number;
    segments?: { headline: string; activity?: Partial<Activity>; minutes?: number }[];
    /** Session-wide fields the conditions read (branch, active, ...). */
    fields?: Partial<CalendarSession>;
  } = {},
): CalendarSession {
  const segments = (opts.segments ?? [{ headline: id }]).map((g, i) => ({
    start: i * HOUR * 3,
    end: i * HOUR * 3 + (g.minutes ?? 1) * 60_000,
    headline: g.headline,
    summarized: true,
    body: null,
    prs: [],
    commits: [],
    promptCount: 1,
    usage: null,
    activity: { ...NONE, ...g.activity },
  }));
  return {
    id,
    projectId: opts.projectId === undefined ? 1 : opts.projectId,
    label: opts.label ?? null,
    branch: null,
    scheduledRuns: 0,
    continued: false,
    title: `${id} title`,
    startedAt: 0,
    endedAt: segments.length * 1000,
    promptCount: opts.promptCount ?? 5,
    active: false,
    segments,
    ...opts.fields,
  };
}

const HOUR = 60 * 60_000;

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

  test("outcomes keep only blocks with a commit or PR", () => {
    expect(match({ outcomes: ["commit", "pr"] })).toEqual(["Fix the login screen"]);
    expect(match({ outcomes: ["merge"] })).toEqual([]);
  });

  test("blocks the server found for the keyword match even when their headline doesn't", () => {
    const readme = s.segments[1];
    const hits = new Set([hitKey(s.id, readme?.start ?? 0)]);
    const m = segmentMatcher({ ...NO_FILTER, q: "pull/42" }, projects, hits);
    expect(s.segments.filter((g) => m(s, g)).map((g) => g.headline)).toEqual(["Update the README"]);
    // The outcome condition still applies to them
    const both = segmentMatcher(
      { ...NO_FILTER, q: "pull/42", outcomes: ["commit"] },
      projects,
      hits,
    );
    expect(s.segments.filter((g) => both(s, g))).toEqual([]);
  });
});

describe("conditions", () => {
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
  const kept = (filter: Partial<Filter>) => {
    const m = segmentMatcher({ ...NO_FILTER, ...filter }, projects);
    return [busy, quiet].flatMap((s) => s.segments.filter((g) => m(s, g)).map((g) => g.headline));
  };

  test("outcomes combine as any of them", () => {
    expect(kept({ outcomes: ["merge"] })).toEqual(["Merge"]);
    expect(kept({ outcomes: ["merge", "commit"] })).toEqual(["Merge", "Commit"]);
  });

  test("states combine as all of them, per block or per session", () => {
    expect(kept({ states: ["loop"] })).toEqual(["Merge", "Commit"]);
    expect(kept({ states: ["snag"] })).toEqual(["Commit", "Read"]);
    expect(kept({ states: ["loop", "snag"] })).toEqual(["Commit"]);
    expect(kept({ states: ["active", "continued"] })).toEqual(["Read"]);
    expect(kept({ states: ["subagent"] })).toEqual(["Merge"]);
  });

  test("length keeps blocks at least that long", () => {
    expect(kept({ minMinutes: 30 })).toEqual(["Merge", "Read"]);
    expect(kept({ minMinutes: 60 })).toEqual(["Merge"]);
  });

  test("branch keeps the sessions on it", () => {
    expect(kept({ branch: "feature/login" })).toEqual(["Merge", "Commit"]);
    expect(kept({ branch: "main" })).toEqual([]);
  });

  test("groups combine with each other as all of them", () => {
    expect(kept({ outcomes: ["commit", "merge"], minMinutes: 30 })).toEqual(["Merge"]);
  });

  test("counts conditions per group for outcomes and per item for states", () => {
    const f = { ...NO_FILTER, outcomes: ["commit", "pr"], states: ["loop", "snag"] } as Filter;
    expect(conditionCount(f)).toBe(3);
    expect(isFocused(f)).toBe(true);
    expect(isFocused({ ...NO_FILTER, hideBrief: true })).toBe(false);
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

describe("file button", () => {
  test("searches every word as a file: term, leaving ones already written that way", () => {
    const f = { ...NO_FILTER, q: "src/api  File:queries.ts", qFiles: true };
    expect(searchQuery(f)).toBe("file:src/api File:queries.ts");
    expect(searchQuery({ ...f, qFiles: false })).toBe(f.q);
  });

  test("blocks match only through the server's hits, not the calendar's own text", () => {
    const s = session("a", { segments: [{ headline: "Touch src/api" }] });
    const f = { ...NO_FILTER, q: "src/api", qFiles: true };
    const g = s.segments[0];
    if (!g) throw new Error("no segment");
    expect(segmentMatcher(f, projects)(s, g)).toBe(false);
    expect(segmentMatcher(f, projects, new Set([hitKey(s.id, g.start)]))(s, g)).toBe(true);
  });

  test("clearing the conditions keeps it, like the keyword", () => {
    expect(withoutConditions({ ...NO_FILTER, qFiles: true, minMinutes: 30 }).qFiles).toBe(true);
  });
});

describe("URL parameters", () => {
  const read = (search: string) => readFilter(new URLSearchParams(search));
  const write = (f: Filter) => {
    const q = new URLSearchParams();
    writeFilter(f, q);
    return q.toString();
  };

  test("round-trips every condition, in a fixed order", () => {
    const f: Filter = {
      q: "login",
      qFiles: true,
      outcomes: ["merge", "commit"],
      states: ["snag", "active"],
      minMinutes: 60,
      branch: "feature/login",
      hideBrief: true,
    };
    const search = write(f);
    expect(search).toBe(
      "q=login&in=files&outcome=commit%2Cmerge&state=active%2Csnag&len=60&branch=feature%2Flogin&brief=hide",
    );
    expect(read(search)).toEqual({
      ...f,
      outcomes: ["commit", "merge"],
      states: ["active", "snag"],
    });
  });

  test("no conditions write nothing", () => {
    expect(write(NO_FILTER)).toBe("");
    expect(read("")).toEqual(NO_FILTER);
  });

  test("the old outcome=1 switch means a commit or PR", () => {
    expect(read("outcome=1").outcomes).toEqual(["commit", "pr"]);
  });

  test("unknown values are dropped", () => {
    expect(read("outcome=deploy,pr&state=bogus&len=45")).toMatchObject({
      outcomes: ["pr"],
      states: [],
      minMinutes: 0,
    });
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

describe("hiddenReason", () => {
  test("no sessions at all: nothing was hidden", () => {
    expect(hiddenReason([], projects)).toBeNull();
  });

  test("every session in a hidden project: the project hid them", () => {
    expect(hiddenReason([session("a", { projectId: 2 })], projects)).toBe("project");
  });

  test("some sessions outside hidden projects: hiding quick questions hid them", () => {
    const sessions = [session("a", { projectId: 2 }), session("b", { promptCount: 1 })];
    expect(hiddenReason(sessions, projects)).toBe("brief");
  });
});

describe("withProjects", () => {
  test("adds unknown projects and keeps the known ones as they are", () => {
    const stale = project(1, "renamed", true);
    const all = withProjects(projects, [stale, project(3, "docs", true)]);
    expect(all.get(1)?.name).toBe("app");
    expect(all.get(3)?.hidden).toBe(true);
    expect(all.size).toBe(3);
  });

  test("leaves the original map untouched", () => {
    withProjects(projects, [project(3, "docs")]);
    expect(projects.has(3)).toBe(false);
  });
});
