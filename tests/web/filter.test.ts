import { describe, expect, test } from "bun:test";
import type { CalendarSegment, CalendarSession } from "../../src/shared/api.ts";
import {
  type BlockState,
  conditionCount,
  type Filter,
  hitKey,
  inState,
  isFocused,
  meetsConditions,
  NO_FILTER,
  narrowSessions,
  searchQuery,
  segmentMatcher,
  withoutConditions,
} from "../../src/web/src/lib/filter.ts";
import { projects, session } from "./filterHelpers.ts";

/** A summary body with one item left open. */
const OPEN_BODY = "- Goal: a\n- Done: b\n- Open:\n  - [waiting] CI";

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

  test("left open: a summary with open items, not an older body that mentions leftovers", () => {
    const summaries = session("summaries", {
      segments: [
        { headline: "Open", body: "- Goal: a\n- Done: b\n- Open:\n  - [waiting] CI" },
        { headline: "Closed", body: "- Goal: a\n- Done: b\n- Resolved: merged" },
        { headline: "Older", body: "- Goal: a\n- Done: b\n- Outcome: left: month view" },
      ],
    });
    const m = segmentMatcher({ ...NO_FILTER, states: ["open"] }, projects);
    expect(summaries.segments.filter((g) => m(summaries, g)).map((g) => g.headline)).toEqual([
      "Open",
    ]);
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

/** The only block of a one-block session, with the session it belongs to. */
function onlyBlock(s: CalendarSession): [CalendarSession, CalendarSegment] {
  const g = s.segments[0];
  if (!g) throw new Error("no segment");
  return [s, g];
}

describe("inState", () => {
  const plain = onlyBlock(session("plain"));
  const cases: [BlockState, [CalendarSession, CalendarSegment]][] = [
    ["active", onlyBlock(session("a", { fields: { active: true } }))],
    ["loop", onlyBlock(session("a", { fields: { scheduledRuns: 1 } }))],
    ["continued", onlyBlock(session("a", { fields: { continued: true } }))],
    [
      "subagent",
      onlyBlock(session("a", { segments: [{ headline: "x", activity: { subagents: 1 } }] })),
    ],
    ["open", onlyBlock(session("a", { segments: [{ headline: "x", body: OPEN_BODY }] }))],
  ];

  for (const [state, [s, g]] of cases) {
    test(`${state}: in it when the block or session says so, not otherwise`, () => {
      expect(inState(s, g, state)).toBe(true);
      expect(inState(plain[0], plain[1], state)).toBe(false);
    });
  }

  test("snag: any tool error, interrupt or API error", () => {
    for (const activity of [{ toolErrors: 1 }, { interrupts: 1 }, { apiErrors: 1 }]) {
      const [s, g] = onlyBlock(session("a", { segments: [{ headline: "x", activity }] }));
      expect(inState(s, g, "snag")).toBe(true);
    }
    expect(inState(plain[0], plain[1], "snag")).toBe(false);
  });

  test("open: a summary without open items isn't", () => {
    const body = "- Goal: a\n- Done: b\n- Resolved: merged";
    const [s, g] = onlyBlock(session("a", { segments: [{ headline: "x", body }] }));
    expect(inState(s, g, "open")).toBe(false);
  });
});

describe("meetsConditions", () => {
  const [s, g] = onlyBlock(
    session("a", {
      fields: { branch: "main", active: true },
      segments: [{ headline: "x", activity: { commits: 1 }, minutes: 45 }],
    }),
  );
  const meets = (filter: Partial<Filter>) => meetsConditions({ ...NO_FILTER, ...filter }, s, g);

  test("passes with no conditions, and ignores the keyword", () => {
    expect(meets({})).toBe(true);
    expect(meets({ q: "nothing like it" })).toBe(true);
  });

  test("checks each group", () => {
    expect(meets({ outcomes: ["pr", "commit"] })).toBe(true);
    expect(meets({ outcomes: ["merge"] })).toBe(false);
    expect(meets({ states: ["active"] })).toBe(true);
    expect(meets({ states: ["active", "loop"] })).toBe(false);
    expect(meets({ minMinutes: 30 })).toBe(true);
    expect(meets({ minMinutes: 60 })).toBe(false);
    expect(meets({ branch: "main" })).toBe(true);
    expect(meets({ branch: "feature/x" })).toBe(false);
  });

  test("a block exactly the minimum length passes", () => {
    expect(meets({ minMinutes: 45 })).toBe(true);
  });
});
