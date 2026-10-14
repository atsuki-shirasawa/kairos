import { describe, expect, test } from "bun:test";
import { NO_FILTER } from "../../src/web/src/lib/filter.ts";
import {
  hiddenReason,
  hideSessions,
  inShownProjects,
  isBrief,
  withProjects,
} from "../../src/web/src/lib/projectVisibility.ts";
import { project, projects, session } from "./filterHelpers.ts";

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

  test("inShownProjects drops only hidden projects, keeping quick questions", () => {
    expect(inShownProjects(list, projects).map((s) => s.id)).toEqual(["app", "unknown", "brief"]);
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
